/**
 * DGP-004 · Reference Module — Dominio "Elemento de Referencia".
 * Aggregate PURO (sin dependencias de infraestructura): estados, transiciones
 * e invariantes. Este dominio es deliberadamente neutro: NO representa ningún
 * concepto de negocio; es el molde oficial para los módulos futuros.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ------------------------------ Estados ---------------------------------- */

export const ESTADOS = ["BORRADOR", "ACTIVO", "ARCHIVADO"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Transiciones legales del aggregate — la única máquina de estados. */
const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  BORRADOR: ["ACTIVO", "ARCHIVADO"], // ARCHIVADO directo solo si la policy lo permite
  ACTIVO: ["ARCHIVADO"],
  ARCHIVADO: [],
};

/* ------------------------------ Aggregate -------------------------------- */

export interface ElementoReferencia {
  readonly id: string;
  readonly tenantId: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly estado: Estado;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioElemento {
  readonly elemento: ElementoReferencia;
  /** Evento de dominio que el cambio produce (lo emite la capa aplicación). */
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/* --------------------------- Eventos de dominio --------------------------- */

export const ELEMENTO_CREADO = "modulo.referencia.creado";
export const ELEMENTO_ACTUALIZADO = "modulo.referencia.actualizado";
export const ELEMENTO_ACTIVADO = "modulo.referencia.activado";
export const ELEMENTO_ARCHIVADO = "modulo.referencia.archivado";

export const EVENTOS_MODULO = [
  ELEMENTO_CREADO,
  ELEMENTO_ACTUALIZADO,
  ELEMENTO_ACTIVADO,
  ELEMENTO_ARCHIVADO,
] as const;

function eventoDe(e: ElementoReferencia, tipo: string, actorId: string) {
  // El payload es AUTOSUFICIENTE: la proyección y los efectos derivados se
  // construyen solo desde el evento (nunca releyendo el aggregate), para que
  // una reentrega tardía no proyecte un estado posterior bajo un evento viejo.
  return {
    tipo,
    payload: {
      tenantId: e.tenantId,
      id: e.id,
      entityRef: `ref:${e.id}`,
      nombre: e.nombre,
      descripcion: e.descripcion,
      estado: e.estado,
      version: e.version,
      createdBy: e.createdBy,
      actualizadoAt: e.updatedAt.toISOString(),
      actorId,
    },
  };
}

/* --------------------------- Comandos de dominio -------------------------- */

export function crearElemento(args: {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion: string;
  actorId: string;
  maxLongitudNombre: number;
  ahora: Date;
}): Result<CambioElemento, KernelError> {
  const nombre = args.nombre.trim();
  if (nombre.length === 0) {
    return fail(KernelErrors.validation("El nombre es obligatorio"));
  }
  if (nombre.length > args.maxLongitudNombre) {
    return fail(
      KernelErrors.validation(`El nombre excede ${args.maxLongitudNombre} caracteres`),
    );
  }
  const elemento: ElementoReferencia = {
    id: args.id,
    tenantId: args.tenantId,
    nombre,
    descripcion: args.descripcion.trim(),
    estado: "BORRADOR",
    version: 1,
    createdBy: args.actorId,
    createdAt: args.ahora,
    updatedAt: args.ahora,
  };
  return ok({ elemento, evento: eventoDe(elemento, ELEMENTO_CREADO, args.actorId) });
}

export function editarElemento(
  actual: ElementoReferencia,
  patch: { nombre?: string; descripcion?: string },
  actorId: string,
  maxLongitudNombre: number,
  ahora: Date,
): Result<CambioElemento, KernelError> {
  if (actual.estado === "ARCHIVADO") {
    return fail(KernelErrors.conflict("Un elemento ARCHIVADO es inmutable"));
  }
  const nombre = (patch.nombre ?? actual.nombre).trim();
  if (nombre.length === 0 || nombre.length > maxLongitudNombre) {
    return fail(KernelErrors.validation("Nombre inválido"));
  }
  const elemento: ElementoReferencia = {
    ...actual,
    nombre,
    descripcion: (patch.descripcion ?? actual.descripcion).trim(),
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ elemento, evento: eventoDe(elemento, ELEMENTO_ACTUALIZADO, actorId) });
}

function transicionar(
  actual: ElementoReferencia,
  destino: Estado,
  actorId: string,
  tipoEvento: string,
  ahora: Date,
): Result<CambioElemento, KernelError> {
  if (!TRANSICIONES[actual.estado].includes(destino)) {
    return fail(
      KernelErrors.conflict(`Transición ilegal: ${actual.estado} → ${destino}`),
    );
  }
  const elemento: ElementoReferencia = {
    ...actual,
    estado: destino,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ elemento, evento: eventoDe(elemento, tipoEvento, actorId) });
}

export function activarElemento(
  actual: ElementoReferencia,
  actorId: string,
  ahora: Date,
): Result<CambioElemento, KernelError> {
  return transicionar(actual, "ACTIVO", actorId, ELEMENTO_ACTIVADO, ahora);
}

export function archivarElemento(
  actual: ElementoReferencia,
  actorId: string,
  ahora: Date,
): Result<CambioElemento, KernelError> {
  return transicionar(actual, "ARCHIVADO", actorId, ELEMENTO_ARCHIVADO, ahora);
}

/* ------------------------------ Policies ---------------------------------- */
/**
 * Policies de dominio (Kernel PolicyEngine). Declarativas y puras: se
 * registran automáticamente al montar el módulo.
 */
export const POLICY_PUEDE_EDITAR = "modulo.referencia.puede-editar";
export const POLICY_PUEDE_ARCHIVAR = "modulo.referencia.puede-archivar";

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_EDITAR,
      evaluate(_ctx: unknown, subject: Record<string, unknown>) {
        return subject["estado"] === "ARCHIVADO"
          ? { allow: false, reason: "Un elemento ARCHIVADO es inmutable" }
          : { allow: true, reason: "editable" };
      },
    },
    {
      name: POLICY_PUEDE_ARCHIVAR,
      evaluate(_ctx: unknown, subject: Record<string, unknown>) {
        const estado = subject["estado"];
        if (estado === "ACTIVO") return { allow: true, reason: "activo" };
        if (estado === "BORRADOR" && subject["archivadoDirecto"] === true) {
          return { allow: true, reason: "archivado directo habilitado por configuración" };
        }
        return {
          allow: false,
          reason: "Solo se archiva un elemento ACTIVO (o BORRADOR con archivado directo)",
        };
      },
    },
  ];
}
