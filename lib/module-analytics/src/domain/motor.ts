/**
 * DGP-016 · MOTOR de evaluación PURO y DETERMINISTA.
 *
 * Interpreta una `ExpresionCalculo` sobre una serie de HECHOS (filas neutras)
 * provistas por los puertos read-only de fuentes. Aplica ventana temporal,
 * filtros, agrupadores, ratios y tasas genéricamente. MTBF/MTTR se CALCULAN aquí
 * desde datos crudos (tiempos operativos/reparación + marca de falla).
 *
 * Sin IO, sin fechas del sistema: el `ahora` de evaluación se inyecta siempre.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { aplicarFiltros, type Filtro, type Hecho } from "./filtros";
import type { ExpresionCalculo, VentanaTemporal } from "./expresion";

/** Resultado de evaluar una expresión: valor total + series por grupo (si aplica). */
export interface ResultadoEvaluacion {
  readonly valor: number;
  /** Muestras usadas (nº de hechos que entraron en el numerador). */
  readonly muestras: number;
  /** Series por grupo cuando hay agrupadores (clave de grupo → valor). */
  readonly grupos: readonly { clave: string; valor: number; muestras: number }[];
}

function dentroDeVentana(hecho: Hecho, ventana: VentanaTemporal, ahoraMs: number): boolean {
  const raw = hecho[ventana.campoFecha];
  if (raw == null) return false;
  const t = typeof raw === "number" ? raw : Date.parse(String(raw));
  if (Number.isNaN(t)) return false;
  if (ventana.ultimosDias != null) {
    const desde = ahoraMs - ventana.ultimosDias * 24 * 60 * 60 * 1000;
    return t >= desde && t <= ahoraMs;
  }
  if (ventana.desde != null) {
    const d = Date.parse(ventana.desde);
    if (!Number.isNaN(d) && t < d) return false;
  }
  if (ventana.hasta != null) {
    const h = Date.parse(ventana.hasta);
    if (!Number.isNaN(h) && t > h) return false;
  }
  return true;
}

function aplicarVentana(hechos: readonly Hecho[], ventana: VentanaTemporal | null | undefined, ahoraMs: number): Hecho[] {
  if (!ventana) return [...hechos];
  return hechos.filter((h) => dentroDeVentana(h, ventana, ahoraMs));
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

/** Agrega una serie de hechos según el tipo de expresión (sin agrupar). */
function agregar(exp: ExpresionCalculo, hechos: readonly Hecho[]): { valor: number; muestras: number } {
  const factor = exp.factor ?? 1;
  switch (exp.tipo) {
    case "conteo":
      return { valor: hechos.length * factor, muestras: hechos.length };
    case "suma": {
      const s = hechos.reduce((acc, h) => acc + num(h[exp.campo!]), 0);
      return { valor: s * factor, muestras: hechos.length };
    }
    case "promedio":
    case "duracion-promedio": {
      if (hechos.length === 0) return { valor: 0, muestras: 0 };
      const s = hechos.reduce((acc, h) => acc + num(h[exp.campo!]), 0);
      return { valor: (s / hechos.length) * factor, muestras: hechos.length };
    }
    case "mtbf": {
      // Tiempo operativo total / nº de fallas (desde datos crudos).
      const fallas = hechos.filter((h) => (exp.campoEsFalla ? Boolean(h[exp.campoEsFalla]) : true));
      const nFallas = fallas.length;
      const tOperativo = hechos.reduce((acc, h) => acc + num(h[exp.campoTiempoOperativo ?? "tiempoOperativoMin"]), 0);
      if (nFallas === 0) return { valor: 0, muestras: 0 };
      return { valor: (tOperativo / nFallas) * factor, muestras: nFallas };
    }
    case "mttr": {
      // Tiempo de reparación total / nº de reparaciones (desde datos crudos).
      const reparaciones = hechos.filter((h) => num(h[exp.campoTiempoReparacion ?? "tiempoReparacionMin"]) > 0);
      const n = reparaciones.length;
      if (n === 0) return { valor: 0, muestras: 0 };
      const total = reparaciones.reduce((acc, h) => acc + num(h[exp.campoTiempoReparacion ?? "tiempoReparacionMin"]), 0);
      return { valor: (total / n) * factor, muestras: n };
    }
    default:
      return { valor: 0, muestras: hechos.length };
  }
}

/** Evalúa ratio/tasa: numerador filtrado / denominador filtrado. */
function agregarRatio(
  exp: ExpresionCalculo,
  numerador: readonly Hecho[],
  universo: readonly Hecho[],
): { valor: number; muestras: number } {
  const factor = exp.factor ?? 1;
  const den = exp.filtrosDenominador && exp.filtrosDenominador.length > 0
    ? aplicarFiltros(universo, exp.filtrosDenominador)
    : universo;
  const numeradorValor = exp.campo ? numerador.reduce((a, h) => a + num(h[exp.campo!]), 0) : numerador.length;
  const denominadorValor = exp.campo ? den.reduce((a, h) => a + num(h[exp.campo!]), 0) : den.length;
  if (denominadorValor === 0) return { valor: 0, muestras: numerador.length };
  return { valor: (numeradorValor / denominadorValor) * factor, muestras: numerador.length };
}

function claveGrupo(hecho: Hecho, agrupadores: readonly string[]): string {
  return agrupadores.map((g) => String(hecho[g] ?? "∅")).join("|");
}

/**
 * Evalúa una expresión contra una serie de hechos. `ahoraISO` fija el instante de
 * evaluación (determinismo). Devuelve valor total y, si hay agrupadores, series.
 */
export function evaluarExpresion(
  exp: ExpresionCalculo,
  hechos: readonly Hecho[],
  ahoraISO: string,
): Result<ResultadoEvaluacion, KernelError> {
  const ahoraMs = Date.parse(ahoraISO);
  if (Number.isNaN(ahoraMs)) return fail(KernelErrors.validation(`Instante de evaluación inválido: "${ahoraISO}"`));

  // 1) Ventana temporal sobre el universo.
  const universo = aplicarVentana(hechos, exp.ventana, ahoraMs);
  // 2) Filtros del numerador.
  const numerador = aplicarFiltros(universo, exp.filtros);

  const esRatio = exp.tipo === "ratio" || exp.tipo === "tasa";

  // 3) Total.
  const total = esRatio ? agregarRatio(exp, numerador, universo) : agregar(exp, numerador);

  // 4) Agrupadores → series por grupo.
  const grupos: { clave: string; valor: number; muestras: number }[] = [];
  if (exp.agrupadores && exp.agrupadores.length > 0) {
    const buckets = new Map<string, Hecho[]>();
    for (const h of numerador) {
      const k = claveGrupo(h, exp.agrupadores);
      const arr = buckets.get(k) ?? [];
      arr.push(h);
      buckets.set(k, arr);
    }
    for (const [k, arr] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const universoGrupo = esRatio
        ? universo.filter((h) => claveGrupo(h, exp.agrupadores!) === k)
        : arr;
      const r = esRatio ? agregarRatio(exp, arr, universoGrupo) : agregar(exp, arr);
      grupos.push({ clave: k, valor: r.valor, muestras: r.muestras });
    }
  }

  return ok({ valor: total.valor, muestras: total.muestras, grupos });
}

/** Aplica filtros adicionales de ejecución (del widget/snapshot) a los hechos. */
export function componerFiltros(base: readonly Filtro[], extra: readonly Filtro[]): Filtro[] {
  return [...base, ...extra];
}
