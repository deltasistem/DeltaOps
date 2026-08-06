/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — MOTOR de FRECUENCIAS.
 *
 * Motor PURO y DETERMINISTA. NO usa reloj interno: la fecha de evaluación y las
 * lecturas de medidor SIEMPRE llegan como INPUT. Dado un `AnclajeFrecuencia`
 * (referencia del último cumplimiento) y un `ContextoEvaluacion` (ahora + estado
 * de medidores + eventos ocurridos), determina si una `Frecuencia` compuesta
 * está VENCIDA y calcula la próxima meta.
 *
 * Soporta simultáneamente reglas temporales (dias/semanas/meses/anios), de uso
 * (horas/horometro/odometro/ciclos/produccion/contador) y por eventos, y su
 * COMBINACIÓN por modo (`lo-que-ocurra-primero` / `todas` / `cualquiera`).
 */
import {
  TIPOS_TEMPORALES,
  TIPOS_USO,
  TIPO_EVENTOS,
  type Frecuencia,
  type ReglaFrecuencia,
} from "./value-objects";

/** Referencia del último cumplimiento (ancla desde donde se mide el próximo). */
export interface AnclajeFrecuencia {
  /** Fecha ISO del último cumplimiento (o del alta del plan). */
  readonly desde: string;
  /**
   * Lecturas de medidor en el momento del anclaje, por unidad
   * (p.ej. `{ horometro: 1200, odometro: 45000 }`).
   */
  readonly medidoresBase: Readonly<Record<string, number>>;
  /** Nº de eventos disparadores acumulados en el anclaje, por clave de evento. */
  readonly eventosBase?: Readonly<Record<string, number>>;
}

/** Contexto de evaluación (todo como input; jamás reloj interno). */
export interface ContextoEvaluacion {
  /** Instante ISO de evaluación ("ahora" provisto por el orquestador). */
  readonly ahora: string;
  /** Lecturas actuales de medidor, por unidad. */
  readonly medidores: Readonly<Record<string, number>>;
  /** Conteo actual de eventos disparadores, por clave de evento. */
  readonly eventos?: Readonly<Record<string, number>>;
}

/** Resultado de evaluar UNA regla. */
export interface EvaluacionRegla {
  readonly regla: ReglaFrecuencia;
  readonly vencida: boolean;
  /** Progreso 0..1 hacia el cumplimiento (para reglas medibles). */
  readonly progreso: number;
  /** Excedente sobre el umbral (unidades de la regla; negativo si falta). */
  readonly excedente: number;
  /** Próxima meta absoluta (fecha ISO para temporales, valor para uso/eventos). */
  readonly proximaMeta: string;
}

/** Resultado de evaluar una frecuencia compuesta. */
export interface EvaluacionFrecuencia {
  readonly vencida: boolean;
  readonly modo: string;
  readonly reglas: readonly EvaluacionRegla[];
  /** Regla que "gatilla" el vencimiento bajo `lo-que-ocurra-primero`. */
  readonly disparadora: EvaluacionRegla | null;
}

const MS_DIA = 86_400_000;

function addMeses(baseISO: string, meses: number): number {
  const d = new Date(baseISO);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return NaN;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const destino = new Date(Date.UTC(y, m + meses, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  // Ajuste de fin de mes (p.ej. 31 ene + 1 mes → 28/29 feb).
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(day, ultimoDia));
  return destino.getTime();
}

/** Próxima fecha objetivo (ms epoch) para una regla temporal desde el anclaje. */
function metaTemporal(regla: ReglaFrecuencia, desdeISO: string): number {
  const base = Date.parse(desdeISO);
  if (Number.isNaN(base)) return NaN;
  switch (regla.tipo) {
    case "dias":
      return base + regla.cada * MS_DIA;
    case "semanas":
      return base + regla.cada * 7 * MS_DIA;
    case "meses":
      return addMeses(desdeISO, Math.round(regla.cada));
    case "anios":
      return addMeses(desdeISO, Math.round(regla.cada) * 12);
    default:
      return NaN;
  }
}

function evaluarRegla(regla: ReglaFrecuencia, anclaje: AnclajeFrecuencia, ctx: ContextoEvaluacion): EvaluacionRegla {
  const esTemporal = (TIPOS_TEMPORALES as readonly string[]).includes(regla.tipo);
  const esUso = (TIPOS_USO as readonly string[]).includes(regla.tipo);
  const esEvento = regla.tipo === TIPO_EVENTOS;

  if (esTemporal) {
    const meta = metaTemporal(regla, anclaje.desde);
    const ahora = Date.parse(ctx.ahora);
    const desde = Date.parse(anclaje.desde);
    const transcurrido = ahora - desde;
    const total = meta - desde;
    const excedenteMs = ahora - meta;
    return {
      regla,
      vencida: Number.isFinite(meta) && ahora >= meta,
      progreso: total > 0 ? Math.max(0, Math.min(1, transcurrido / total)) : 1,
      excedente: Math.round(excedenteMs / MS_DIA),
      proximaMeta: new Date(meta).toISOString(),
    };
  }

  if (esUso) {
    const unidad = regla.unidad ?? regla.tipo;
    const base = anclaje.medidoresBase[unidad] ?? 0;
    const actual = ctx.medidores[unidad] ?? base;
    const meta = base + regla.cada;
    const avance = actual - base;
    const excedente = actual - meta;
    return {
      regla,
      vencida: actual >= meta,
      progreso: regla.cada > 0 ? Math.max(0, Math.min(1, avance / regla.cada)) : 1,
      excedente,
      proximaMeta: String(meta),
    };
  }

  if (esEvento) {
    const clave = regla.evento ?? "evento";
    const base = anclaje.eventosBase?.[clave] ?? 0;
    const actual = ctx.eventos?.[clave] ?? base;
    const meta = base + Math.max(1, Math.round(regla.cada));
    const avance = actual - base;
    const umbral = Math.max(1, Math.round(regla.cada));
    return {
      regla,
      vencida: actual >= meta,
      progreso: umbral > 0 ? Math.max(0, Math.min(1, avance / umbral)) : 1,
      excedente: actual - meta,
      proximaMeta: String(meta),
    };
  }

  // Tipo desconocido: nunca vence (defensivo; `crearFrecuencia` ya lo valida).
  return { regla, vencida: false, progreso: 0, excedente: 0, proximaMeta: ctx.ahora };
}

/**
 * Evalúa una frecuencia compuesta de forma determinista. Bajo
 * `lo-que-ocurra-primero`/`cualquiera` basta que UNA regla venza; bajo `todas`
 * deben vencer TODAS. La regla disparadora es la de mayor progreso entre las
 * vencidas (o la de mayor progreso global si ninguna vence).
 */
export function evaluarFrecuencia(
  frecuencia: Frecuencia,
  anclaje: AnclajeFrecuencia,
  ctx: ContextoEvaluacion,
): EvaluacionFrecuencia {
  const reglas = frecuencia.reglas.map((r) => evaluarRegla(r, anclaje, ctx));
  const vencidas = reglas.filter((r) => r.vencida);
  const modo = frecuencia.modo;
  const vencida = modo === "todas" ? reglas.every((r) => r.vencida) : vencidas.length > 0;

  const candidatas = vencida ? (modo === "todas" ? reglas : vencidas) : reglas;
  let disparadora: EvaluacionRegla | null = null;
  for (const r of candidatas) {
    if (!disparadora || r.progreso > disparadora.progreso) disparadora = r;
  }
  return { vencida, modo, reglas, disparadora };
}
