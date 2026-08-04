/**
 * DGP-008.2 · Módulo Activos — Relaciones inter-activo (dominio PURO).
 *
 * Catálogo declarativo de TIPOS de relación con su INVERSO. El grafo se modela
 * como aristas dirigidas `origen --tipo--> destino`; cada tipo declara:
 *   - `categoria`: familia semántica para agrupar en los read models
 *     (jerarquia / dependencia / componente / asociacion / sustitucion).
 *   - `inverso`: el tipo que representa el sentido contrario (par declarativo).
 *   - `jerarquico`: si forma un árbol y por tanto exige verificación ANTICICLO.
 *
 * NEUTRO: no hay código específico por clase de activo. La configuración por
 * tenant puede restringir qué tipos se habilitan, pero la semántica del par
 * inverso y del anticiclo es del dominio.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ------------------------------ Eventos ---------------------------------- */

export const RELACION_CREADA = "modulo.activos.relacion-creada";
export const RELACION_ELIMINADA = "modulo.activos.relacion-eliminada";

export const EVENTOS_RELACION = [RELACION_CREADA, RELACION_ELIMINADA] as const;

/* ------------------------------ Catálogo --------------------------------- */

export type CategoriaRelacion =
  | "jerarquia"
  | "dependencia"
  | "componente"
  | "asociacion"
  | "sustitucion";

export interface TipoRelacion {
  readonly tipo: string;
  readonly etiqueta: string;
  readonly categoria: CategoriaRelacion;
  readonly inverso: string;
  /** Forma árbol ⇒ exige verificación anticiclo al crear. */
  readonly jerarquico: boolean;
}

/**
 * Catálogo canónico de tipos de relación con pares inversos declarativos.
 * `padre-de`/`hijo-de` y `compuesto-por`/`componente-de` son jerárquicos.
 */
export const TIPOS_RELACION: readonly TipoRelacion[] = [
  { tipo: "padre-de", etiqueta: "Padre de", categoria: "jerarquia", inverso: "hijo-de", jerarquico: true },
  { tipo: "hijo-de", etiqueta: "Hijo de", categoria: "jerarquia", inverso: "padre-de", jerarquico: true },
  { tipo: "compuesto-por", etiqueta: "Compuesto por", categoria: "componente", inverso: "componente-de", jerarquico: true },
  { tipo: "componente-de", etiqueta: "Componente de", categoria: "componente", inverso: "compuesto-por", jerarquico: true },
  { tipo: "depende-de", etiqueta: "Depende de", categoria: "dependencia", inverso: "requerido-por", jerarquico: false },
  { tipo: "requerido-por", etiqueta: "Requerido por", categoria: "dependencia", inverso: "depende-de", jerarquico: false },
  { tipo: "reemplaza-a", etiqueta: "Reemplaza a", categoria: "sustitucion", inverso: "reemplazado-por", jerarquico: false },
  { tipo: "reemplazado-por", etiqueta: "Reemplazado por", categoria: "sustitucion", inverso: "reemplaza-a", jerarquico: false },
  { tipo: "relacionado-con", etiqueta: "Relacionado con", categoria: "asociacion", inverso: "relacionado-con", jerarquico: false },
] as const;

const PORTIPO = new Map<string, TipoRelacion>(TIPOS_RELACION.map((t) => [t.tipo, t]));

export const NOMBRES_TIPO_RELACION = TIPOS_RELACION.map((t) => t.tipo) as readonly string[];

export function tipoRelacion(tipo: string): TipoRelacion | undefined {
  return PORTIPO.get(tipo);
}

/**
 * Resuelve los tipos de relación HABILITADOS para un tenant a partir de las
 * claves configuradas en el catálogo `tiposRelacion` (Record Store):
 *   - lista VACÍA ⇒ los 8 tipos canónicos (comportamiento por defecto);
 *   - lista NO vacía ⇒ únicamente los tipos presentes y habilitados, con la
 *     regla de que su INVERSO también debe estar habilitado (pares declarados).
 * Devuelve error de validación si un tipo configurado es desconocido o si falta
 * su inverso en la configuración (coherente con el catálogo de estados).
 */
export function resolverTiposRelacion(
  configurados: readonly string[],
): Result<readonly TipoRelacion[], KernelError> {
  if (configurados.length === 0) return ok(TIPOS_RELACION);
  const habilitados = new Set(configurados);
  const resueltos: TipoRelacion[] = [];
  for (const clave of habilitados) {
    const def = PORTIPO.get(clave);
    if (!def) return fail(KernelErrors.validation(`Tipo de relación desconocido en el catálogo: "${clave}"`));
    // El inverso debe estar declarado (par inverso). Auto-inverso se admite.
    if (def.inverso !== def.tipo && !habilitados.has(def.inverso)) {
      return fail(
        KernelErrors.validation(
          `El tipo "${def.tipo}" exige declarar su inverso "${def.inverso}" en el catálogo tiposRelacion`,
        ),
      );
    }
    resueltos.push(def);
  }
  return ok(resueltos);
}

/* --------------------------- Payload de relación ------------------------- */

export interface DatosActivoRel {
  readonly id: string;
  readonly codigo: string | null;
  readonly nombre: string | null;
}

export interface RelacionCreada {
  readonly id: string;
  readonly tipo: string;
  readonly categoria: CategoriaRelacion;
  readonly origen: DatosActivoRel;
  readonly destino: DatosActivoRel;
}

export interface CambioRelacion {
  readonly relacion: RelacionCreada;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/**
 * Construye una relación validada. `existeArista(origen,destino,tipo)` verifica
 * duplicados; `alcanza(destino, origen)` implementa la detección ANTICICLO para
 * tipos jerárquicos (¿el destino ya alcanza al origen por el mismo tipo?).
 */
export async function crearRelacion(args: {
  readonly tenantId: string;
  readonly id: string;
  readonly tipo: string;
  readonly origen: DatosActivoRel;
  readonly destino: DatosActivoRel;
  readonly actorId: string;
  readonly ahora: Date;
  readonly existeArista: (origenId: string, destinoId: string, tipo: string) => Promise<Result<boolean, KernelError>>;
  readonly alcanza: (desdeId: string, hastaId: string, tipo: string) => Promise<Result<boolean, KernelError>>;
}): Promise<Result<CambioRelacion, KernelError>> {
  const def = PORTIPO.get(args.tipo);
  if (!def) return fail(KernelErrors.validation(`Tipo de relación desconocido: "${args.tipo}"`));
  if (args.origen.id === args.destino.id) {
    return fail(KernelErrors.validation("Un activo no puede relacionarse consigo mismo"));
  }

  const dup = await args.existeArista(args.origen.id, args.destino.id, args.tipo);
  if (!dup.ok) return dup;
  if (dup.value) {
    return fail(KernelErrors.conflict(`La relación "${args.tipo}" entre ${args.origen.id} y ${args.destino.id} ya existe`));
  }

  if (def.jerarquico) {
    // Anticiclo: si destino ya alcanza a origen por el mismo tipo, cerraríamos ciclo.
    const ciclo = await args.alcanza(args.destino.id, args.origen.id, args.tipo);
    if (!ciclo.ok) return ciclo;
    if (ciclo.value) {
      return fail(KernelErrors.conflict(`La relación jerárquica "${args.tipo}" cerraría un ciclo`));
    }
  }

  const relacion: RelacionCreada = {
    id: args.id,
    tipo: args.tipo,
    categoria: def.categoria,
    origen: args.origen,
    destino: args.destino,
  };
  return ok({
    relacion,
    evento: {
      tipo: RELACION_CREADA,
      payload: {
        tenantId: args.tenantId,
        id: relacion.id,
        tipo: relacion.tipo,
        categoria: relacion.categoria,
        inverso: def.inverso,
        origen: relacion.origen,
        destino: relacion.destino,
        actorId: args.actorId,
        actualizadoAt: args.ahora.toISOString(),
      },
    },
  });
}

/** Evento autosuficiente de eliminación de relación. */
export function eliminarRelacion(args: {
  readonly tenantId: string;
  readonly id: string;
  readonly tipo: string;
  readonly origenId: string;
  readonly destinoId: string;
  readonly actorId: string;
  readonly ahora: Date;
}): CambioRelacion["evento"] {
  return {
    tipo: RELACION_ELIMINADA,
    payload: {
      tenantId: args.tenantId,
      id: args.id,
      tipo: args.tipo,
      origen: { id: args.origenId },
      destino: { id: args.destinoId },
      actorId: args.actorId,
      actualizadoAt: args.ahora.toISOString(),
    },
  };
}
