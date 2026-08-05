/**
 * DGP-010 · Experiencia operacional del SLA (funciones PURAS, sin analítica).
 *
 * Deriva, a partir del vencimiento SLA que YA expone el read model de Órdenes
 * (`datos.sla`), el estado operativo del compromiso: tiempo restante/consumido,
 * nivel de riesgo, si está vencido y si procede escalar. No calcula métricas
 * agregadas ni tendencias (prohibido BI/analítica); sólo describe el estado
 * puntual de UNA orden para pintar alertas y prioridades en la consola.
 */
import type { OrdenRow } from "../ordenes/tipos";
import { vencimientoSla } from "../ordenes/componentes";

export type RiesgoSla = "sin-sla" | "vencido" | "critico" | "riesgo" | "en-plazo";

export interface EstadoSla {
  readonly riesgo: RiesgoSla;
  readonly vencimiento: string | null;
  /** Milisegundos restantes (negativo si vencido); null si no hay SLA. */
  readonly restanteMs: number | null;
  /** Texto humano del tiempo restante/consumido. */
  readonly etiqueta: string;
  /** ¿Debe escalarse? (vencido o crítico en órdenes no cerradas). */
  readonly escalar: boolean;
}

const H = 3600_000;

function humano(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * H));
  const h = Math.floor((abs % (24 * H)) / H);
  const m = Math.floor((abs % H) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CERRADAS = new Set(["CERRADA", "CANCELADA"]);

/**
 * Estado operativo del SLA de una orden.
 * @param ahoraMs epoch actual (inyectable para pruebas deterministas).
 * @param umbralCriticoH horas por debajo de las cuales el riesgo es "crítico".
 * @param umbralRiesgoH horas por debajo de las cuales el riesgo es "riesgo".
 */
export function estadoSla(
  orden: OrdenRow,
  ahoraMs: number,
  umbralCriticoH = 8,
  umbralRiesgoH = 48,
): EstadoSla {
  const vencimiento = vencimientoSla(orden);
  if (!vencimiento) {
    return { riesgo: "sin-sla", vencimiento: null, restanteMs: null, etiqueta: "Sin SLA", escalar: false };
  }
  const t = Date.parse(vencimiento);
  if (Number.isNaN(t)) {
    return { riesgo: "sin-sla", vencimiento, restanteMs: null, etiqueta: "Sin SLA", escalar: false };
  }
  const restanteMs = t - ahoraMs;
  const cerrada = CERRADAS.has(orden.estado);

  if (restanteMs < 0) {
    return {
      riesgo: "vencido",
      vencimiento,
      restanteMs,
      etiqueta: `Vencido hace ${humano(restanteMs)}`,
      escalar: !cerrada,
    };
  }
  const horas = restanteMs / H;
  const riesgo: RiesgoSla = horas <= umbralCriticoH ? "critico" : horas <= umbralRiesgoH ? "riesgo" : "en-plazo";
  return {
    riesgo,
    vencimiento,
    restanteMs,
    etiqueta: `Restan ${humano(restanteMs)}`,
    escalar: riesgo === "critico" && !cerrada,
  };
}

/** Tono del Design System asociado a cada nivel de riesgo (para Badge/Alert). */
export function tonoRiesgo(r: RiesgoSla): "neutro" | "info" | "advertencia" | "error" | "exito" {
  switch (r) {
    case "vencido": return "error";
    case "critico": return "error";
    case "riesgo": return "advertencia";
    case "en-plazo": return "exito";
    default: return "neutro";
  }
}
