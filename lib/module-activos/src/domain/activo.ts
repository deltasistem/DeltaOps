/**
 * DGP-008.1 · Módulo Activos Empresariales — Aggregate "Activo".
 *
 * Aggregate PURO (sin IO): reúne todos los campos mínimos de la especificación,
 * mantiene sus invariantes y produce eventos AUTOSUFICIENTES. Es NEUTRO por
 * diseño: cualquier clase de activo (maquinaria amarilla, vehículos, bandas,
 * tolvas, herramientas, infraestructura, …) se soporta por configuración /
 * catálogos, nunca con código específico por tipo.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  COMANDO_FUERA_SERVICIO,
  COMANDO_MANTENER,
  COMANDO_OPERAR,
  COMANDO_REGISTRAR,
  COMANDO_RETIRAR,
  maquinaActivo,
  type EstadoActivo,
} from "./maquina-estados";
import {
  esRetroceso,
  type Especificaciones,
  type Garantia,
  type IdentificacionTecnica,
  type Medicion,
  type Ubicacion,
} from "./value-objects";

/* --------------------------- Eventos de dominio -------------------------- */

export const ACTIVO_REGISTRADO = "modulo.activos.registrado";
export const ACTIVO_ACTUALIZADO = "modulo.activos.actualizado";
export const ACTIVO_OPERATIVO = "modulo.activos.operativo";
export const ACTIVO_EN_MANTENIMIENTO = "modulo.activos.en-mantenimiento";
export const ACTIVO_FUERA_SERVICIO = "modulo.activos.fuera-servicio";
export const ACTIVO_RETIRADO = "modulo.activos.retirado";
export const ACTIVO_UBICACION_ACTUALIZADA = "modulo.activos.ubicacion-actualizada";
export const ACTIVO_RESPONSABLE_ACTUALIZADO = "modulo.activos.responsable-actualizado";
export const ACTIVO_HOROMETRO_ACTUALIZADO = "modulo.activos.horometro-actualizado";
export const ACTIVO_ODOMETRO_ACTUALIZADO = "modulo.activos.odometro-actualizado";

export const EVENTOS_MODULO = [
  ACTIVO_REGISTRADO,
  ACTIVO_ACTUALIZADO,
  ACTIVO_OPERATIVO,
  ACTIVO_EN_MANTENIMIENTO,
  ACTIVO_FUERA_SERVICIO,
  ACTIVO_RETIRADO,
  ACTIVO_UBICACION_ACTUALIZADA,
  ACTIVO_RESPONSABLE_ACTUALIZADO,
  ACTIVO_HOROMETRO_ACTUALIZADO,
  ACTIVO_ODOMETRO_ACTUALIZADO,
] as const;

/* ------------------------------ Aggregate -------------------------------- */

export interface Activo {
  readonly id: string;
  readonly tenantId: string;
  readonly codigoEmpresarial: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly estado: EstadoActivo;

  // Clasificación (todas claves de catálogo, validadas en la aplicación)
  readonly tipo: string;
  readonly categoria: string;
  readonly familia: string;
  readonly subfamilia: string | null;

  // Identificación comercial
  readonly fabricante: string | null;
  readonly modelo: string | null;
  readonly serie: string | null;
  readonly anio: number | null;

  // Ciclo económico
  readonly fechaCompra: string | null;
  readonly fechaPuestaServicio: string | null;
  readonly vidaUtil: number | null;
  readonly valorAdquisicion: number | null;
  readonly valorResidual: number | null;
  readonly moneda: string | null;

  // Organización
  readonly centroCosto: string | null;
  readonly empresa: string | null;
  readonly proyecto: string | null;
  /** Clave del catálogo `proveedores` (validada en la aplicación). */
  readonly proveedor: string | null;
  readonly ubicacion: Ubicacion | null;
  readonly responsable: string | null;
  readonly supervisor: string | null;

  // Mediciones acumulativas (monótonas no decrecientes)
  readonly horometro: Medicion | null;
  readonly odometro: Medicion | null;

  // Otros
  readonly garantia: Garantia | null;
  readonly identificacion: IdentificacionTecnica | null;
  readonly especificaciones: Especificaciones | null;
  readonly criticidad: string | null;
  readonly prioridad: string | null;
  readonly observaciones: string;

  // Metadatos técnicos
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioActivo {
  readonly activo: Activo;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/* --------------------------- Evento autosuficiente ----------------------- */

function eventoDe(a: Activo, tipo: string, actorId: string): CambioActivo["evento"] {
  // Payload AUTOSUFICIENTE: contiene el estado completo del aggregate para que
  // ni la proyección ni los efectos derivados necesiten releerlo. Una
  // reentrega tardía nunca proyecta un estado posterior bajo un evento viejo
  // (el read model se protege con last_event_id + version).
  return {
    tipo,
    payload: {
      tenantId: a.tenantId,
      id: a.id,
      entityRef: `activo:${a.id}`,
      codigoEmpresarial: a.codigoEmpresarial,
      nombre: a.nombre,
      descripcion: a.descripcion,
      estado: a.estado,
      tipo: a.tipo,
      categoria: a.categoria,
      familia: a.familia,
      subfamilia: a.subfamilia,
      fabricante: a.fabricante,
      modelo: a.modelo,
      serie: a.serie,
      anio: a.anio,
      fechaCompra: a.fechaCompra,
      fechaPuestaServicio: a.fechaPuestaServicio,
      vidaUtil: a.vidaUtil,
      valorAdquisicion: a.valorAdquisicion,
      valorResidual: a.valorResidual,
      moneda: a.moneda,
      centroCosto: a.centroCosto,
      empresa: a.empresa,
      proyecto: a.proyecto,
      proveedor: a.proveedor,
      ubicacion: a.ubicacion,
      responsable: a.responsable,
      supervisor: a.supervisor,
      horometro: a.horometro,
      odometro: a.odometro,
      garantia: a.garantia,
      identificacion: a.identificacion,
      especificaciones: a.especificaciones,
      criticidad: a.criticidad,
      prioridad: a.prioridad,
      observaciones: a.observaciones,
      version: a.version,
      createdBy: a.createdBy,
      actualizadoAt: a.updatedAt.toISOString(),
      actorId,
    },
  };
}

/* --------------------------- Datos de creación --------------------------- */

export interface DatosNuevoActivo {
  readonly id: string;
  readonly tenantId: string;
  readonly codigoEmpresarial: string;
  readonly nombre: string;
  readonly descripcion?: string;
  readonly tipo: string;
  readonly categoria: string;
  readonly familia: string;
  readonly subfamilia?: string | null;
  readonly fabricante?: string | null;
  readonly modelo?: string | null;
  readonly serie?: string | null;
  readonly anio?: number | null;
  readonly fechaCompra?: string | null;
  readonly fechaPuestaServicio?: string | null;
  readonly vidaUtil?: number | null;
  readonly valorAdquisicion?: number | null;
  readonly valorResidual?: number | null;
  readonly moneda?: string | null;
  readonly centroCosto?: string | null;
  readonly empresa?: string | null;
  readonly proyecto?: string | null;
  readonly proveedor?: string | null;
  readonly ubicacion?: Ubicacion | null;
  readonly responsable?: string | null;
  readonly supervisor?: string | null;
  readonly horometro?: Medicion | null;
  readonly odometro?: Medicion | null;
  readonly garantia?: Garantia | null;
  readonly identificacion?: IdentificacionTecnica | null;
  readonly especificaciones?: Especificaciones | null;
  readonly criticidad?: string | null;
  readonly prioridad?: string | null;
  readonly observaciones?: string;
  readonly actorId: string;
  readonly maxLongitudNombre: number;
  readonly maxLongitudCodigo: number;
  readonly ahora: Date;
}

export function crearActivo(d: DatosNuevoActivo): Result<CambioActivo, KernelError> {
  const nombre = d.nombre.trim();
  const codigo = d.codigoEmpresarial.trim();
  if (codigo.length === 0) return fail(KernelErrors.validation("El código empresarial es obligatorio"));
  if (codigo.length > d.maxLongitudCodigo) {
    return fail(KernelErrors.validation(`El código excede ${d.maxLongitudCodigo} caracteres`));
  }
  if (nombre.length === 0) return fail(KernelErrors.validation("El nombre es obligatorio"));
  if (nombre.length > d.maxLongitudNombre) {
    return fail(KernelErrors.validation(`El nombre excede ${d.maxLongitudNombre} caracteres`));
  }
  if (!d.tipo || !d.categoria || !d.familia) {
    return fail(KernelErrors.validation("tipo, categoría y familia son obligatorios"));
  }
  const activo: Activo = {
    id: d.id,
    tenantId: d.tenantId,
    codigoEmpresarial: codigo,
    nombre,
    descripcion: (d.descripcion ?? "").trim(),
    estado: "BORRADOR",
    tipo: d.tipo,
    categoria: d.categoria,
    familia: d.familia,
    subfamilia: d.subfamilia ?? null,
    fabricante: d.fabricante ?? null,
    modelo: d.modelo ?? null,
    serie: d.serie ?? null,
    anio: d.anio ?? null,
    fechaCompra: d.fechaCompra ?? null,
    fechaPuestaServicio: d.fechaPuestaServicio ?? null,
    vidaUtil: d.vidaUtil ?? null,
    valorAdquisicion: d.valorAdquisicion ?? null,
    valorResidual: d.valorResidual ?? null,
    moneda: d.moneda ?? null,
    centroCosto: d.centroCosto ?? null,
    empresa: d.empresa ?? null,
    proyecto: d.proyecto ?? null,
    proveedor: d.proveedor ?? null,
    ubicacion: d.ubicacion ?? null,
    responsable: d.responsable ?? null,
    supervisor: d.supervisor ?? null,
    horometro: d.horometro ?? null,
    odometro: d.odometro ?? null,
    garantia: d.garantia ?? null,
    identificacion: d.identificacion ?? null,
    especificaciones: d.especificaciones ?? null,
    criticidad: d.criticidad ?? null,
    prioridad: d.prioridad ?? null,
    observaciones: (d.observaciones ?? "").trim(),
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_REGISTRADO, d.actorId) });
}

/* ------------------------------ Edición ---------------------------------- */

export type PatchActivo = Partial<
  Pick<
    Activo,
    | "nombre"
    | "descripcion"
    | "tipo"
    | "categoria"
    | "familia"
    | "subfamilia"
    | "fabricante"
    | "modelo"
    | "serie"
    | "anio"
    | "fechaCompra"
    | "fechaPuestaServicio"
    | "vidaUtil"
    | "valorAdquisicion"
    | "valorResidual"
    | "moneda"
    | "centroCosto"
    | "empresa"
    | "proyecto"
    | "proveedor"
    | "supervisor"
    | "garantia"
    | "identificacion"
    | "especificaciones"
    | "criticidad"
    | "prioridad"
    | "observaciones"
  >
>;

export function editarActivo(
  actual: Activo,
  patch: PatchActivo,
  actorId: string,
  maxLongitudNombre: number,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  if (actual.estado === "RETIRADO") {
    return fail(KernelErrors.conflict("Un activo RETIRADO es inmutable"));
  }
  const nombre = (patch.nombre ?? actual.nombre).trim();
  if (nombre.length === 0 || nombre.length > maxLongitudNombre) {
    return fail(KernelErrors.validation("Nombre inválido"));
  }
  const activo: Activo = {
    ...actual,
    ...patch,
    nombre,
    descripcion: (patch.descripcion ?? actual.descripcion).trim(),
    observaciones: (patch.observaciones ?? actual.observaciones).trim(),
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_ACTUALIZADO, actorId) });
}

/* ------------------------- Transiciones de estado ------------------------ */

function transicionar(
  actual: Activo,
  comando: string,
  tipoEvento: string,
  actorId: string,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  const r = maquinaActivo.evaluar(actual.estado, comando, { estado: actual.estado });
  if (!r.ok) return r;
  const activo: Activo = {
    ...actual,
    estado: r.value.estadoNuevo as EstadoActivo,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ activo, evento: eventoDe(activo, tipoEvento, actorId) });
}

export const registrarActivo = (a: Activo, actorId: string, ahora: Date) =>
  transicionar(a, COMANDO_REGISTRAR, ACTIVO_REGISTRADO, actorId, ahora);

export const operarActivo = (a: Activo, actorId: string, ahora: Date) =>
  transicionar(a, COMANDO_OPERAR, ACTIVO_OPERATIVO, actorId, ahora);

export const mantenerActivo = (a: Activo, actorId: string, ahora: Date) =>
  transicionar(a, COMANDO_MANTENER, ACTIVO_EN_MANTENIMIENTO, actorId, ahora);

export const fueraServicioActivo = (a: Activo, actorId: string, ahora: Date) =>
  transicionar(a, COMANDO_FUERA_SERVICIO, ACTIVO_FUERA_SERVICIO, actorId, ahora);

export const retirarActivo = (a: Activo, actorId: string, ahora: Date) =>
  transicionar(a, COMANDO_RETIRAR, ACTIVO_RETIRADO, actorId, ahora);

/* ------------------------- Mutaciones específicas ------------------------ */

export function cambiarUbicacion(
  actual: Activo,
  ubicacion: Ubicacion,
  actorId: string,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  if (actual.estado === "RETIRADO") {
    return fail(KernelErrors.conflict("No se cambia la ubicación de un activo RETIRADO"));
  }
  const activo: Activo = { ...actual, ubicacion, version: actual.version + 1, updatedAt: ahora };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_UBICACION_ACTUALIZADA, actorId) });
}

export function asignarResponsable(
  actual: Activo,
  responsable: string,
  actorId: string,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  if (actual.estado === "RETIRADO") {
    return fail(KernelErrors.conflict("No se asigna responsable a un activo RETIRADO"));
  }
  const activo: Activo = { ...actual, responsable, version: actual.version + 1, updatedAt: ahora };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_RESPONSABLE_ACTUALIZADO, actorId) });
}

/**
 * Actualiza el horómetro respetando la regla de monotonicidad. Cuando
 * `permiteRetroceso` es false (defecto de configuración) una lectura inferior
 * a la anterior se rechaza como conflicto de dominio.
 */
export function actualizarHorometro(
  actual: Activo,
  medicion: Medicion,
  permiteRetroceso: boolean,
  actorId: string,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  if (actual.estado === "RETIRADO") {
    return fail(KernelErrors.conflict("No se modifica el horómetro de un activo RETIRADO"));
  }
  if (!permiteRetroceso && esRetroceso(actual.horometro, medicion)) {
    return fail(KernelErrors.conflict("El horómetro no puede retroceder (regla de monotonicidad)"));
  }
  const activo: Activo = { ...actual, horometro: medicion, version: actual.version + 1, updatedAt: ahora };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_HOROMETRO_ACTUALIZADO, actorId) });
}

export function actualizarOdometro(
  actual: Activo,
  medicion: Medicion,
  permiteRetroceso: boolean,
  actorId: string,
  ahora: Date,
): Result<CambioActivo, KernelError> {
  if (actual.estado === "RETIRADO") {
    return fail(KernelErrors.conflict("No se modifica el odómetro de un activo RETIRADO"));
  }
  if (!permiteRetroceso && esRetroceso(actual.odometro, medicion)) {
    return fail(KernelErrors.conflict("El odómetro no puede retroceder (regla de monotonicidad)"));
  }
  const activo: Activo = { ...actual, odometro: medicion, version: actual.version + 1, updatedAt: ahora };
  return ok({ activo, evento: eventoDe(activo, ACTIVO_ODOMETRO_ACTUALIZADO, actorId) });
}

/* ------------------------------ Reconstrucción --------------------------- */

/** Reconstruye el payload de un evento para reproyección (replay). */
export function eventoActivo(a: Activo, tipo: string, actorId: string): CambioActivo["evento"] {
  return eventoDe(a, tipo, actorId);
}
