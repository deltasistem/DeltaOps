/**
 * DELTAOPS LITE-08 · Módulo Enterprise Maintenance Plans — ESTADO OPERACIONAL
 * de una RUTINA (derivación de PRESENTACIÓN, pura y determinista).
 *
 * Traduce el resultado del MOTOR de FRECUENCIAS (`evaluarFrecuencia`) en el
 * estado operacional que consume la experiencia (§3-5 de la directiva):
 *   - meta / actual / faltante / excedente por la regla DISPARADORA;
 *   - semáforo 🟢 próximo · 🟡 por vencer · 🔴 vencido (siempre con TEXTO);
 *   - unidad de la regla (h/km/ciclos/días) para mostrar "Faltan N h".
 *
 * NO calcula dominio nuevo: reutiliza EXCLUSIVAMENTE lo que ya produjo el motor
 * (`disparadora.excedente`, `disparadora.proximaMeta`, `progreso`, `vencida`).
 * NO usa reloj interno. Si no hay regla disparadora medible, devuelve
 * `sin-datos` (nunca inventa un faltante). El "umbral de proximidad" es
 * declarativo (fracción del intervalo o valor absoluto) — NO es un dato nuevo:
 * es la política de presentación de "cuándo avisar que se acerca".
 */
import type { EvaluacionFrecuencia, EvaluacionRegla } from "./frecuencia-engine";
import { TIPOS_USO, TIPOS_TEMPORALES, TIPO_EVENTOS } from "./value-objects";

/** Semáforo operacional de la rutina (color + texto, §3). */
export type SemaforoRutina = "verde" | "amarillo" | "rojo" | "sin-datos";

/** Estado operacional derivado de una evaluación de frecuencia. */
export interface EstadoRutina {
  /** ¿La rutina está vencida? (idéntico a `evaluacion.vencida`). */
  readonly vencida: boolean;
  /** Semáforo de presentación (siempre acompañado de `etiqueta`). */
  readonly semaforo: SemaforoRutina;
  /** Texto legible del estado ("Próximo", "Por vencer", "Vencido", "Sin datos"). */
  readonly etiqueta: string;
  /**
   * Faltante hacia la meta en unidades de la regla disparadora (negativo si ya
   * se excedió). `null` cuando no hay regla medible.
   */
  readonly faltante: number | null;
  /** Excedente sobre la meta (positivo si vencida). `null` si no aplica. */
  readonly excedente: number | null;
  /** Meta absoluta de la regla disparadora (valor de medidor o fecha ISO). */
  readonly meta: string | null;
  /** Unidad legible del faltante ("h", "km", "ciclos", "días", …). */
  readonly unidad: string | null;
  /** Naturaleza de la regla disparadora. */
  readonly dominio: "uso" | "temporal" | "eventos" | "desconocido";
  /** Progreso 0..1 hacia el cumplimiento (de la regla disparadora). */
  readonly progreso: number;
}

/** Política de proximidad (§3): cuándo pasar de 🟢 a 🟡. */
export interface UmbralProximidad {
  /**
   * Fracción del intervalo a partir de la cual se considera "por vencer"
   * (0..1). Por defecto 0.9 (90 % del intervalo consumido).
   */
  readonly fraccion?: number;
}

const DOMINIO_POR_TIPO = (tipo: string): EstadoRutina["dominio"] => {
  if ((TIPOS_USO as readonly string[]).includes(tipo)) return "uso";
  if ((TIPOS_TEMPORALES as readonly string[]).includes(tipo)) return "temporal";
  if (tipo === TIPO_EVENTOS) return "eventos";
  return "desconocido";
};

/** Unidad legible del faltante según la regla disparadora. */
function unidadDe(regla: EvaluacionRegla["regla"], dominio: EstadoRutina["dominio"]): string | null {
  if (dominio === "uso") return regla.unidad ?? regla.tipo;
  if (dominio === "temporal") return "días";
  if (dominio === "eventos") return "eventos";
  return null;
}

/**
 * Deriva el estado operacional de una rutina a partir de la evaluación del
 * motor. Determinista y pura. El faltante = -excedente (excedente negativo del
 * motor significa "aún falta"). El semáforo:
 *   - 🔴 rojo   : vencida;
 *   - 🟡 amarillo: no vencida pero progreso ≥ umbral (se acerca);
 *   - 🟢 verde  : no vencida y lejos de la meta;
 *   - sin-datos : no hay regla disparadora medible.
 */
export function estadoRutina(evaluacion: EvaluacionFrecuencia, umbral: UmbralProximidad = {}): EstadoRutina {
  const disp = evaluacion.disparadora;
  if (!disp) {
    return {
      vencida: evaluacion.vencida,
      semaforo: "sin-datos",
      etiqueta: "Sin datos suficientes",
      faltante: null,
      excedente: null,
      meta: null,
      unidad: null,
      dominio: "desconocido",
      progreso: 0,
    };
  }

  const dominio = DOMINIO_POR_TIPO(disp.regla.tipo);
  const unidad = unidadDe(disp.regla, dominio);
  // El motor entrega `excedente` en unidades de la regla (negativo = falta).
  const faltante = -disp.excedente;
  const fraccion = umbral.fraccion ?? 0.9;

  if (evaluacion.vencida) {
    return {
      vencida: true,
      semaforo: "rojo",
      etiqueta: "Mantenimiento vencido",
      faltante,
      excedente: disp.excedente,
      meta: disp.proximaMeta,
      unidad,
      dominio,
      progreso: disp.progreso,
    };
  }

  const cercano = disp.progreso >= fraccion;
  return {
    vencida: false,
    semaforo: cercano ? "amarillo" : "verde",
    etiqueta: cercano ? "Próximo mantenimiento" : "Al día",
    faltante,
    excedente: disp.excedente,
    meta: disp.proximaMeta,
    unidad,
    dominio,
    progreso: disp.progreso,
  };
}
