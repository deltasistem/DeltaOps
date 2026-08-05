/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregate `ConteoFisico`.
 *
 * Soporta conteos parcial, cíclico, general y reconteo (catálogo `tipos-conteo`).
 * Registra las líneas contadas, calcula DIFERENCIAS contra el sistema y, al
 * cerrarse, deja preparados los AJUSTES posteriores (movimientos `conteo`). Está
 * PREPARADO para gobernarse por workflow (contratos): el aggregate refleja el
 * estado neutro resultante, no decide la transición.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { CONTEO_FINALIZADO, CONTEO_INICIADO } from "./events";
import type { ReferenciaWorkflow } from "./workflow";

export const ESTADOS_CONTEO = ["abierto", "contado", "conciliado", "cerrado"] as const;
export type EstadoConteo = (typeof ESTADOS_CONTEO)[number];

export interface LineaConteo {
  readonly itemId: string;
  readonly inventarioId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
  /** Cantidad esperada por el sistema al abrir el conteo. */
  readonly esperado: number;
  /** Cantidad físicamente contada (null hasta que se registra). */
  readonly contado: number | null;
}

export interface Diferencia {
  readonly itemId: string;
  readonly inventarioId: string;
  readonly esperado: number;
  readonly contado: number;
  readonly diferencia: number;
}

export interface ConteoFisico {
  readonly id: string;
  readonly tenantId: string;
  /** Clave del catálogo `tipos-conteo`. */
  readonly tipo: string;
  /** Alcance del conteo (bodega/ubicación/item…), referencia opaca. */
  readonly alcance: { tipo: string; id: string } | null;
  readonly lineas: readonly LineaConteo[];
  readonly estado: EstadoConteo;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioConteo {
  readonly conteo: ConteoFisico;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(c: ConteoFisico, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioConteo["evento"] {
  return {
    tipo,
    payload: {
      tenantId: c.tenantId,
      id: c.id,
      entityRef: `inventario-conteo:${c.id}`,
      tipo: c.tipo,
      alcance: c.alcance,
      lineas: c.lineas,
      estado: c.estado,
      workflow: c.workflow,
      version: c.version,
      createdBy: c.createdBy,
      actualizadoAt: c.updatedAt.toISOString(),
      actorId,
      eventoTipo: tipo,
      ...extra,
    },
  };
}

export interface DatosNuevoConteo {
  readonly id: string;
  readonly tenantId: string;
  readonly tipo: string;
  readonly alcance?: { tipo: string; id: string } | null;
  readonly lineas: readonly Omit<LineaConteo, "contado">[];
  readonly workflow: ReferenciaWorkflow;
  readonly actorId: string;
  readonly ahora: Date;
}

export function iniciarConteo(d: DatosNuevoConteo): Result<CambioConteo, KernelError> {
  if (!d.tipo) return fail(KernelErrors.validation("El tipo de conteo es obligatorio"));
  if (d.lineas.length === 0) return fail(KernelErrors.validation("El conteo requiere al menos una línea"));
  const conteo: ConteoFisico = {
    id: d.id,
    tenantId: d.tenantId,
    tipo: d.tipo,
    alcance: d.alcance ?? null,
    lineas: Object.freeze(d.lineas.map((l) => ({ ...l, contado: null }))),
    estado: "abierto",
    workflow: d.workflow,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ conteo, evento: eventoDe(conteo, CONTEO_INICIADO, d.actorId) });
}

/** Registra las cantidades físicas contadas por inventarioId. */
export function registrarConteo(
  c: ConteoFisico,
  contados: ReadonlyMap<string, number>,
  actorId: string,
  ahora: Date,
): Result<CambioConteo, KernelError> {
  if (c.estado === "cerrado") return fail(KernelErrors.conflict("El conteo ya está cerrado"));
  const lineas = c.lineas.map((l) => {
    const v = contados.get(l.inventarioId);
    if (v === undefined) return l;
    if (!(v >= 0)) return l;
    return { ...l, contado: v };
  });
  const siguiente: ConteoFisico = { ...c, lineas: Object.freeze(lineas), estado: "contado", version: c.version + 1, updatedAt: ahora };
  return ok({ conteo: siguiente, evento: eventoDe(siguiente, CONTEO_INICIADO, actorId) });
}

/** Calcula las diferencias (sólo líneas ya contadas). */
export function diferenciasDeConteo(c: ConteoFisico): Diferencia[] {
  const out: Diferencia[] = [];
  for (const l of c.lineas) {
    if (l.contado === null) continue;
    const diferencia = l.contado - l.esperado;
    if (diferencia !== 0) {
      out.push({ itemId: l.itemId, inventarioId: l.inventarioId, esperado: l.esperado, contado: l.contado, diferencia });
    }
  }
  return out;
}

/**
 * Cierra el conteo (estado neutro `cerrado`), tras conciliación. Emite el evento
 * `ConteoFinalizado` con las diferencias, para que la aplicación aplique los
 * movimientos `conteo` a las existencias (ajustes posteriores).
 */
export function cerrarConteo(c: ConteoFisico, actorId: string, ahora: Date): Result<CambioConteo, KernelError> {
  if (c.estado === "cerrado") return fail(KernelErrors.conflict("El conteo ya está cerrado"));
  const pendientes = c.lineas.filter((l) => l.contado === null);
  if (pendientes.length > 0) {
    return fail(KernelErrors.conflict(`Quedan ${pendientes.length} líneas sin contar`));
  }
  const diferencias = diferenciasDeConteo(c);
  const siguiente: ConteoFisico = { ...c, estado: "cerrado", version: c.version + 1, updatedAt: ahora };
  return ok({ conteo: siguiente, evento: eventoDe(siguiente, CONTEO_FINALIZADO, actorId, { diferencias }) });
}
