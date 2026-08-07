/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Eventos hacia Activos.
 *
 * REGISTRO AUTOSUFICIENTE de eventos del historial de fallas del activo. El
 * módulo SÓLO REGISTRA los datos crudos (timestamps y duraciones); NO calcula
 * KPIs. Los indicadores (frecuencia de fallas, MTBF, MTTR) quedan PREPARADOS:
 * el evento transporta los insumos brutos (marca de tiempo de la falla, tiempos
 * entre fallas y de reparación en crudo) para que el motor de KPIs (fuera de
 * este módulo) los agregue. NINGÚN cálculo agregado ocurre aquí.
 *
 * REINCIDENCIA: se DETECTA (no se puntúa) cuando el mismo activo presenta el
 * mismo modo de falla dentro de una ventana temporal. La detección es PURA y
 * determinista; el registro del evento lo hace la capa de aplicación.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { EVENTO_ACTIVO_REGISTRADO } from "./events";

/** Tipos neutros de evento de historial de activo (registro, no cálculo). */
export const TIPOS_EVENTO_ACTIVO = [
  "falla-reportada",
  "falla-confirmada",
  "reparacion-iniciada",
  "reparacion-finalizada",
  "puesta-en-servicio",
] as const;
export type TipoEventoActivo = (typeof TIPOS_EVENTO_ACTIVO)[number];

/**
 * Insumos CRUDOS para KPIs (sin cálculo). Todos opcionales: se registra lo que se
 * conoce en el momento. Las duraciones van en minutos brutos.
 */
export interface InsumosKpi {
  /** Minutos transcurridos desde la falla anterior del activo (MTBF, crudo). */
  readonly tiempoEntreFallasMin?: number | null;
  /** Minutos de reparación de esta intervención (MTTR, crudo). */
  readonly tiempoReparacionMin?: number | null;
  /** Minutos de indisponibilidad (downtime crudo). */
  readonly tiempoIndisponibleMin?: number | null;
}

export interface EventoActivo {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly solicitudId: string | null;
  readonly ordenTrabajoId: string | null;
  readonly tipo: TipoEventoActivo;
  /** Clave del catálogo `modos-falla` (opcional). */
  readonly modoFalla: string | null;
  readonly ocurridoEn: string;
  readonly insumosKpi: InsumosKpi;
  readonly registradoPor: string;
}

export interface CrearEventoActivoInput {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly solicitudId?: string | null;
  readonly ordenTrabajoId?: string | null;
  readonly tipo: TipoEventoActivo;
  readonly modoFalla?: string | null;
  readonly ocurridoEn: string;
  readonly insumosKpi?: InsumosKpi;
  readonly registradoPor: string;
}

export interface CambioEventoActivo {
  readonly evento: EventoActivo;
  readonly eventoDominio: { tipo: string; payload: Record<string, unknown> };
}

export function crearEventoActivo(input: CrearEventoActivoInput): Result<CambioEventoActivo, KernelError> {
  if (input.activoId.trim() === "") return fail(KernelErrors.validation("Se requiere el activo"));
  if (Number.isNaN(Date.parse(input.ocurridoEn))) return fail(KernelErrors.validation("La fecha del evento no es ISO válida"));
  if (!TIPOS_EVENTO_ACTIVO.includes(input.tipo)) return fail(KernelErrors.validation(`Tipo de evento de activo inválido: "${input.tipo}"`));
  const e: EventoActivo = {
    id: input.id,
    tenantId: input.tenantId,
    activoId: input.activoId,
    solicitudId: input.solicitudId ?? null,
    ordenTrabajoId: input.ordenTrabajoId ?? null,
    tipo: input.tipo,
    modoFalla: input.modoFalla ?? null,
    ocurridoEn: input.ocurridoEn,
    insumosKpi: Object.freeze({
      tiempoEntreFallasMin: input.insumosKpi?.tiempoEntreFallasMin ?? null,
      tiempoReparacionMin: input.insumosKpi?.tiempoReparacionMin ?? null,
      tiempoIndisponibleMin: input.insumosKpi?.tiempoIndisponibleMin ?? null,
    }),
    registradoPor: input.registradoPor,
  };
  return ok({
    evento: Object.freeze(e),
    eventoDominio: {
      tipo: EVENTO_ACTIVO_REGISTRADO,
      payload: {
        tenantId: e.tenantId,
        id: e.id,
        entityRef: `activo:${e.activoId}`,
        activoId: e.activoId,
        tipo: e.tipo,
        modoFalla: e.modoFalla,
        ocurridoEn: e.ocurridoEn,
        insumosKpi: e.insumosKpi,
        actualizadoAt: e.ocurridoEn,
        actorId: e.registradoPor,
        eventoTipo: EVENTO_ACTIVO_REGISTRADO,
        snapshot: e,
      },
    },
  });
}

/* ------------------------------ Reincidencia ----------------------------- */

/** Evento previo mínimo para evaluar reincidencia (mismo activo). */
export interface EventoPrevio {
  readonly modoFalla: string | null;
  readonly ocurridoEn: string;
}

export interface DeteccionReincidencia {
  readonly reincidente: boolean;
  readonly modoFalla: string | null;
  /** Cantidad de eventos del MISMO modo dentro de la ventana (incluye el actual). */
  readonly ocurrenciasEnVentana: number;
  readonly ventanaDias: number;
}

/**
 * Detecta de forma PURA si el evento actual es REINCIDENTE: mismo `modoFalla` en
 * el mismo activo dentro de `ventanaDias`. No puntúa ni pondera; sólo cuenta y
 * marca. Con `modoFalla` nulo no hay reincidencia (no hay clave de comparación).
 */
export function detectarReincidencia(
  actual: { modoFalla: string | null; ocurridoEn: string },
  previos: readonly EventoPrevio[],
  ventanaDias: number,
): DeteccionReincidencia {
  const base = { reincidente: false, modoFalla: actual.modoFalla, ocurrenciasEnVentana: 1, ventanaDias };
  if (!actual.modoFalla || Number.isNaN(Date.parse(actual.ocurridoEn)) || ventanaDias <= 0) return base;
  const finMs = Date.parse(actual.ocurridoEn);
  const inicioMs = finMs - ventanaDias * 24 * 60 * 60 * 1000;
  let cuenta = 1; // el actual
  for (const p of previos) {
    if (p.modoFalla !== actual.modoFalla) continue;
    const t = Date.parse(p.ocurridoEn);
    if (Number.isNaN(t)) continue;
    if (t >= inicioMs && t <= finMs) cuenta += 1;
  }
  return { reincidente: cuenta > 1, modoFalla: actual.modoFalla, ocurrenciasEnVentana: cuenta, ventanaDias };
}
