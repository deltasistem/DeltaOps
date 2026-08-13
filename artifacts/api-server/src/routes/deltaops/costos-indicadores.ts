/**
 * DGP-021.4-B/C · INDICADORES ECONÓMICOS de mantenimiento (costo/hora, costo/km),
 * COMPARATIVA entre activos y TENDENCIAS (api-server, LECTURA).
 *
 * Aprobado por Dirección 2026-08-13 (Opción A del Descubrimiento DGP-021.4).
 *
 * ARQUITECTURA (§15): igual que la composición 021.3, esto es LECTURA que orquesta
 * EXCLUSIVAMENTE contratos públicos; jamás SQL cross-module ni tablas ajenas:
 *   - NUMERADOR (dinero, EXACTO): `componerActivo` (DGP-021.3) ⇒ totalesPorMoneda
 *     en cadenas numeric(18,6); se opera en micros BigInt (`aMicros`/`microsACadena`).
 *   - DENOMINADOR (magnitud física, EXACTO): serie pública `modulo.utilizacion.lecturas`
 *     con el campo ADITIVO `valorExacto` (cadena decimal EXACTA) y `esReinicio`
 *     (ancla de tramo) — extensión aditiva 021.4-A, permiso de LECTURA normal.
 *
 * PRECISIÓN (§26): CERO float en el cálculo económico. El `valorExacto` del medidor
 * se parsea como decimal exacto a enteros escalados (micros, escala 6, idéntica al
 * dinero). El ratio se computa en micros BigInt con redondeo HALF-UP documentado a
 * la escala canónica de 6 decimales. JAMÁS se divide por cero.
 *
 * TRAMOS/REINICIOS: el delta se suma por TRAMO (segmentado por `esReinicio`), sumando
 * sólo incrementos POSITIVOS intra-tramo; NUNCA cruza un reinicio (evita restar el
 * salto hacia abajo del contador). Lecturas anuladas/inconsistentes se excluyen.
 *
 * ESTADOS (§8): COMPLETO / PARCIAL / SIN_DATOS_SUFICIENTES / NO_APLICA. Ausencia ≠ 0.
 *   - Activo sin ODÓMETRO ⇒ costo/km NO_APLICA (no "0"): no se asume vehículo.
 *   - Sin lecturas suficientes para un delta > 0 ⇒ SIN_DATOS_SUFICIENTES.
 *   - Combustible NUNCA entra en el numerador (GAP-FUEL-MONEY). `costoReal` manual
 *     tampoco es fuente económica.
 */
import { KernelErrors, type KernelError, type Result } from "@workspace/kernel";
import { aMicros, microsACadena, FACTOR, RE_DINERO } from "@workspace/module-costos";
import { utilizacionRuntime, contextForUtilizacion } from "./utilizacion-runtime";
import { componerActivo, type RangoPeriodo, type Sesion } from "./costos-composicion";

/* ------------------------------- Tipos ----------------------------------- */

export type EstadoIndicador =
  | "COMPLETO"
  | "PARCIAL"
  | "SIN_DATOS_SUFICIENTES"
  | "NO_APLICA";

const TIPO_HOROMETRO = "horometro";
const TIPO_ODOMETRO = "odometro";
const UNIDAD_HORA = "h";
const UNIDAD_KM = "km";

/** Ratio económico por moneda (string-safe): [moneda] por unidad física. */
export interface RatioMoneda {
  readonly moneda: string;
  /** costo total (numeric 18,6) del período/moneda. */
  readonly costoTotal: string;
  /** valor del ratio (numeric 18,6): costoTotal / denominador. */
  readonly valor: string;
}

export interface IndicadorMedidor {
  readonly tipoMedidor: "horometro" | "odometro";
  readonly unidad: "h" | "km";
  readonly estado: EstadoIndicador;
  /** Denominador EXACTO (numeric 18,6): Σ deltas positivos por tramo. */
  readonly delta: string | null;
  /** Nº de tramos (reinicios + 1) considerados. */
  readonly tramos: number;
  /** Ratios por moneda (una serie por moneda; nunca se mezclan). */
  readonly porMoneda: readonly RatioMoneda[];
  readonly nota?: string;
}

/* ---------------------- Delta EXACTO de medidor por tramo ----------------- */

/** Lectura mínima consumida del contrato público (aditivo `valorExacto`/`esReinicio`). */
interface LecturaPub {
  readonly valorExacto: string;
  readonly esReinicio: boolean;
  readonly fechaHora: unknown;
  readonly estado?: string;
  readonly inconsistente?: boolean;
  readonly tipoMedidor?: string;
}

const tMs = (v: unknown): number => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : 0;
};

/**
 * Suma EXACTA (micros BigInt) del avance del medidor dentro del período, segmentando
 * por tramos (reinicios). Devuelve el delta en micros y el nº de tramos, o null si no
 * hay avance computable. Cada tramo empieza en una lectura `esReinicio` (o en la
 * primera lectura). Dentro de un tramo suma sólo incrementos POSITIVOS consecutivos;
 * jamás cruza el salto de un reinicio.
 */
function deltaMicrosPorTramo(
  lecturas: readonly LecturaPub[],
): Result<{ micros: bigint; tramos: number; lecturas: number } | null, KernelError> {
  // Sólo lecturas válidas (vigentes y consistentes), ordenadas por tiempo.
  const validas = lecturas
    .filter((l) => (l.estado ?? "vigente") === "vigente" && l.inconsistente !== true)
    .sort((a, b) => tMs(a.fechaHora) - tMs(b.fechaHora) || (a.valorExacto < b.valorExacto ? -1 : 1));
  if (validas.length === 0) return { ok: true, value: null };

  let total = 0n;
  let tramos = 0;
  let previa: bigint | null = null;
  for (const l of validas) {
    const m = aMicros(String(l.valorExacto));
    if (!m.ok) return m; // valorExacto malformado ⇒ falla segura (no inventa).
    if (l.esReinicio || previa === null) {
      // Nuevo tramo: el ancla no aporta delta; reinicia el acumulador de tramo.
      tramos += 1;
      previa = m.value;
      continue;
    }
    const paso = m.value - previa;
    if (paso > 0n) total += paso; // ignora retrocesos residuales (no cruza reinicio).
    previa = m.value;
  }
  return { ok: true, value: { micros: total, tramos, lecturas: validas.length } };
}

/**
 * Ratio EXACTO costo/denominador en micros BigInt con HALF-UP a escala canónica (6).
 * ratio_micros = round( costo_micros * FACTOR / denom_micros ). JAMÁS /0.
 */
function ratioMicros(costoMicros: bigint, denomMicros: bigint): bigint | null {
  if (denomMicros <= 0n) return null; // división por cero prohibida.
  const escalado = costoMicros * FACTOR; // costo(6) * 10^6 ⇒ para reescalar el cociente a 6 decimales
  const q = escalado / denomMicros;
  const r = escalado % denomMicros;
  return r * 2n >= denomMicros ? q + 1n : q; // half-up
}

/* ---------------------- Serie de lecturas (contrato público) -------------- */

async function serieLecturas(
  s: Sesion,
  activoId: string,
  tipoMedidor: string,
  rango: RangoPeriodo,
): Promise<Result<LecturaPub[], KernelError>> {
  const ctx = contextForUtilizacion(s.userId, s.rol, s.tenant);
  // Sólo VIGENTES (excluye anuladas en origen); inconsistentes se filtran también aquí.
  const r = await utilizacionRuntime().platform.kernel.queries.execute(ctx, "modulo.utilizacion.lecturas", {
    activoId,
    tipoMedidor,
    estado: "vigente",
    desde: rango.desde ?? undefined,
    hasta: rango.hasta ?? undefined,
    limit: 500,
  });
  if (!r.ok) return r as Result<never, KernelError>;
  const filas = (r.value as Record<string, unknown>[]) ?? [];
  return {
    ok: true,
    value: filas.map((f) => ({
      valorExacto: String(f["valorExacto"] ?? ""),
      esReinicio: f["esReinicio"] === true,
      fechaHora: f["fechaHora"],
      estado: f["estado"] == null ? undefined : String(f["estado"]),
      inconsistente: f["inconsistente"] === true,
      tipoMedidor: f["tipoMedidor"] == null ? undefined : String(f["tipoMedidor"]),
    })),
  };
}

/** ¿El activo REGISTRA odómetro? (para distinguir NO_APLICA de SIN_DATOS). */
async function tieneOdometro(s: Sesion, activoId: string): Promise<Result<boolean, KernelError>> {
  const ctx = contextForUtilizacion(s.userId, s.rol, s.tenant);
  const r = await utilizacionRuntime().platform.kernel.queries.execute(ctx, "modulo.utilizacion.ultima-lectura", {
    activoId,
    tipoMedidor: TIPO_ODOMETRO,
  });
  if (!r.ok) return r as Result<never, KernelError>;
  return { ok: true, value: r.value != null };
}

/* ---------------------- Indicador de un medidor -------------------------- */

interface TotalMonedaLike {
  readonly moneda: string;
  readonly total: string;
}

/** Extrae los totales por moneda (string-safe) del resultado de `componerActivo`. */
function totalesDe(compuesto: Record<string, unknown>): TotalMonedaLike[] {
  const arr = (compuesto["totalesPorMoneda"] as Record<string, unknown>[] | undefined) ?? [];
  return arr
    .map((t) => ({ moneda: String(t["moneda"] ?? ""), total: String(t["total"] ?? "") }))
    .filter((t) => t.moneda !== "" && RE_DINERO.test(t.total));
}

async function indicadorMedidor(
  s: Sesion,
  activoId: string,
  tipoMedidor: "horometro" | "odometro",
  rango: RangoPeriodo,
  totales: readonly TotalMonedaLike[],
): Promise<Result<IndicadorMedidor, KernelError>> {
  const unidad = tipoMedidor === TIPO_HOROMETRO ? UNIDAD_HORA : UNIDAD_KM;

  const serie = await serieLecturas(s, activoId, tipoMedidor, rango);
  if (!serie.ok) return serie;

  // NO_APLICA para km si el activo no registra odómetro (no se asume vehículo).
  if (tipoMedidor === TIPO_ODOMETRO && serie.value.length === 0) {
    const odo = await tieneOdometro(s, activoId);
    if (!odo.ok) return odo;
    if (!odo.value) {
      return { ok: true, value: {
        tipoMedidor, unidad, estado: "NO_APLICA", delta: null, tramos: 0, porMoneda: [],
        nota: "El activo no registra odómetro; costo/km no aplica.",
      } };
    }
  }

  const delta = deltaMicrosPorTramo(serie.value);
  if (!delta.ok) return delta;

  if (!delta.value || delta.value.micros <= 0n) {
    return { ok: true, value: {
      tipoMedidor, unidad, estado: "SIN_DATOS_SUFICIENTES", delta: null,
      tramos: delta.value?.tramos ?? 0, porMoneda: [],
      nota: `Sin avance de ${tipoMedidor} computable en el período (se requieren ≥2 lecturas válidas con incremento).`,
    } };
  }

  const denomMicros = delta.value.micros;
  const porMoneda: RatioMoneda[] = [];
  for (const t of totales) {
    const cm = aMicros(t.total);
    if (!cm.ok) return cm;
    // El costo puede ser negativo (netos con abonos > cargos). El ratio se calcula
    // igual (misma escala); se emite el signo tal cual.
    const neg = cm.value < 0n;
    const abs = neg ? -cm.value : cm.value;
    const rm = ratioMicros(abs, denomMicros);
    if (rm === null) continue; // guardado por el <=0 previo; defensa en profundidad.
    porMoneda.push({ moneda: t.moneda, costoTotal: t.total, valor: (neg ? "-" : "") + microsACadena(rm) });
  }

  // COMPLETO si hay denominador y al menos una moneda con costo; PARCIAL si hay
  // denominador pero ningún total económico (sin costos ⇒ ratio no calculable).
  const estado: EstadoIndicador = porMoneda.length > 0 ? "COMPLETO" : "SIN_DATOS_SUFICIENTES";
  return { ok: true, value: {
    tipoMedidor, unidad, estado, delta: microsACadena(denomMicros), tramos: delta.value.tramos, porMoneda,
    ...(estado === "SIN_DATOS_SUFICIENTES" ? { nota: "Hay avance de medidor pero no hay costos económicos en el período." } : {}),
  } };
}

/* ---------------------- API pública: indicadores por activo --------------- */

/**
 * Indicadores económicos de un activo/período: costo/hora y costo/km, POR MONEDA.
 * Reutiliza el NUMERADOR exacto de la composición 021.3 y el DENOMINADOR exacto de
 * Utilización. Devuelve además los totales por moneda para contexto.
 */
export async function indicadoresActivo(
  s: Sesion,
  activoId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const comp = await componerActivo(s, activoId, rango);
  if (!comp.ok) return comp;
  const totales = totalesDe(comp.value);

  const hora = await indicadorMedidor(s, activoId, TIPO_HOROMETRO, rango, totales);
  if (!hora.ok) return hora;
  const km = await indicadorMedidor(s, activoId, TIPO_ODOMETRO, rango, totales);
  if (!km.ok) return km;

  return { ok: true, value: {
    activo: activoId,
    periodo: rango.clave,
    rango: { desde: rango.desde, hasta: rango.hasta },
    totalesPorMoneda: totales,
    costoPorHora: hora.value,
    costoPorKm: km.value,
  } };
}

/**
 * Composición del activo (021.3) AMPLIADA con los indicadores económicos (021.4).
 * Mantiene la forma de `componerActivo` y SUSTITUYE los placeholders `costoPorHora`/
 * `costoPorKm` diferidos por los indicadores reales (aditivo hacia el consumidor).
 */
export async function componerActivoConIndicadores(
  s: Sesion,
  activoId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const comp = await componerActivo(s, activoId, rango);
  if (!comp.ok) return comp;
  const totales = totalesDe(comp.value);
  const hora = await indicadorMedidor(s, activoId, TIPO_HOROMETRO, rango, totales);
  if (!hora.ok) return hora;
  const km = await indicadorMedidor(s, activoId, TIPO_ODOMETRO, rango, totales);
  if (!km.ok) return km;
  return { ok: true, value: { ...comp.value, costoPorHora: hora.value, costoPorKm: km.value } };
}

/* ---------------------- API pública: comparativa (§13) -------------------- */

/**
 * Comparativa entre activos POR MONEDA (§13). NUNCA combina monedas en un ranking:
 * devuelve una serie por moneda con el costo total de cada activo, ordenada dentro
 * de cada moneda. Los ratios costo/hora-km se anexan por activo cuando existen.
 */
export async function comparativaActivos(
  s: Sesion,
  activoIds: readonly string[],
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const porMoneda = new Map<string, { activoId: string; total: string; costoPorHora: string | null; costoPorKm: string | null }[]>();
  const activos: Record<string, unknown>[] = [];

  for (const activoId of activoIds) {
    const ind = await indicadoresActivo(s, activoId, rango);
    if (!ind.ok) return ind;
    const v = ind.value;
    const totales = (v["totalesPorMoneda"] as TotalMonedaLike[]) ?? [];
    const cph = v["costoPorHora"] as IndicadorMedidor;
    const cpk = v["costoPorKm"] as IndicadorMedidor;
    const ratioDe = (ind2: IndicadorMedidor, moneda: string): string | null =>
      ind2.porMoneda.find((p) => p.moneda === moneda)?.valor ?? null;

    activos.push({ activo: activoId, totalesPorMoneda: totales, costoPorHora: cph, costoPorKm: cpk });
    for (const t of totales) {
      const lista = porMoneda.get(t.moneda) ?? [];
      lista.push({ activoId, total: t.total, costoPorHora: ratioDe(cph, t.moneda), costoPorKm: ratioDe(cpk, t.moneda) });
      porMoneda.set(t.moneda, lista);
    }
  }

  // Ordena DENTRO de cada moneda por costo total desc (comparación en micros, no float).
  const ranking = [...porMoneda.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([moneda, lista]) => ({
    moneda,
    activos: [...lista].sort((x, y) => {
      const mx = aMicros(x.total), my = aMicros(y.total);
      const vx = mx.ok ? mx.value : 0n, vy = my.ok ? my.value : 0n;
      return vy > vx ? 1 : vy < vx ? -1 : 0;
    }),
  }));

  return { ok: true, value: {
    periodo: rango.clave,
    rango: { desde: rango.desde, hasta: rango.hasta },
    // §13: series por moneda, sin ranking combinado entre monedas.
    rankingPorMoneda: ranking,
    activos,
  } };
}

/* ---------------------- API pública: tendencias (§14) --------------------- */

/** Genera los tramos mensuales [inicio,fin) que cubren [desde,hasta] (UTC). */
function mesesEntre(desdeIso: string, hastaIso: string): { clave: string; desde: string; hasta: string }[] {
  const out: { clave: string; desde: string; hasta: string }[] = [];
  const d = new Date(desdeIso);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const fin = new Date(hastaIso).getTime();
  // Límite duro de 60 meses para acotar el fan-out.
  for (let i = 0; i < 60; i++) {
    const ini = new Date(Date.UTC(y, m, 1));
    if (ini.getTime() > fin) break;
    const sig = new Date(Date.UTC(y, m + 1, 1));
    const clave = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.push({ clave, desde: ini.toISOString(), hasta: new Date(sig.getTime() - 1).toISOString() });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

/**
 * Tendencia mensual de un activo (§14): series de costo, horas, km, costo/hora y
 * costo/km por mes. Los meses SIN datos se emiten con estado `SIN_DATOS_SUFICIENTES`
 * y valores null — JAMÁS 0 artificial.
 */
export async function tendenciaActivo(
  s: Sesion,
  activoId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  // Resuelve la ventana: si el rango no acota, usa los últimos 12 meses hasta hasta|ahora
  // de forma DETERMINISTA a partir de las fechas del propio rango (sin `Date.now`).
  const hasta = rango.hasta ?? rango.desde ?? null;
  const desde = rango.desde ?? null;
  if (!desde || !hasta) {
    return { ok: false, error: KernelErrors.validation("La tendencia requiere un rango [desde,hasta] acotado.") };
  }
  const meses = mesesEntre(desde, hasta);
  const puntos: Record<string, unknown>[] = [];
  for (const mes of meses) {
    const rMes: RangoPeriodo = { clave: "rango", desde: mes.desde, hasta: mes.hasta };
    const ind = await indicadoresActivo(s, activoId, rMes);
    if (!ind.ok) return ind;
    const totales = (ind.value["totalesPorMoneda"] as TotalMonedaLike[]) ?? [];
    const cph = ind.value["costoPorHora"] as IndicadorMedidor;
    const cpk = ind.value["costoPorKm"] as IndicadorMedidor;
    const conDatos = totales.length > 0 || cph.estado === "COMPLETO" || cpk.estado === "COMPLETO";
    puntos.push({
      mes: mes.clave,
      estado: conDatos ? "COMPLETO" : "SIN_DATOS_SUFICIENTES",
      // Huecos ⇒ null (nunca 0). Series por moneda para costo; delta físico único.
      costoPorMoneda: totales.length > 0 ? totales : null,
      horas: cph.estado === "COMPLETO" ? cph.delta : null,
      km: cpk.estado === "COMPLETO" ? cpk.delta : null,
      costoPorHora: cph.estado === "COMPLETO" ? cph.porMoneda : null,
      costoPorKm: cpk.estado === "COMPLETO" ? cpk.porMoneda : null,
    });
  }
  return { ok: true, value: {
    activo: activoId,
    periodo: rango.clave,
    rango: { desde, hasta },
    puntos,
  } };
}
