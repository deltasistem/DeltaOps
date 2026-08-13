/**
 * DGP-021.3 · COMPOSICIÓN de costos de mantenimiento por OT y por Activo (api-server).
 *
 * §15 ARQUITECTURA: la composición es LECTURA y vive en el API Server (patrón
 * DGP-021.2). NO crea fuentes de verdad, NO ejecuta SQL cross-module, NO toca
 * tablas privadas ajenas. Orquesta EXCLUSIVAMENTE queries públicas:
 *   - `modulo.manodeobra.valoraciones`  → mano de obra (costo string por moneda).
 *   - `modulo.costos.hechos`            → materiales (MATERIAL) y otros (OTROS),
 *                                          con naturaleza CARGO/ABONO.
 *   - `modulo.utilizacion.tanqueos`     → combustible (CONTEXTUAL del activo; ver
 *                                          GAP-FUEL-OT/GAP-FUEL-MONEY en la auditoría).
 *   - `listarPendientes` (orquestación 021.2) → materiales PENDIENTES de materializar.
 *
 * RBAC/§16 + §17 multitenancy: se compone con el PRINCIPAL DE SESIÓN (userId, rol
 * canónico, identityId) y el TENANT DE SESIÓN. Cada módulo autoridad aplica su
 * propio RBAC y recorte (p.ej. técnico ⇒ sólo su mano de obra) y su RLS por tenant.
 * La composición NO fabrica principales de servicio ni salta permisos.
 *
 * §26 PRECISIÓN: el dinero económico (mano de obra + costos) es CADENA numeric(18,6);
 * las sumas se hacen en micros BigInt (`aMicros`/`microsACadena`). PROHIBIDO
 * parseFloat/Number para el total económico. El combustible es float en su módulo
 * de origen (congelado) ⇒ se presenta como CONTEXTUAL, separado y marcado, y NUNCA
 * entra en el total económico string-safe (§4 no inventar; §6 no mezclar).
 *
 * §4/§8 ESTADOS: jamás $0 para ausencia. Se distingue `$0 real` (hay hechos que
 * netean cero) de `SIN_DATOS_SUFICIENTES` (no hay hechos). PENDIENTE si hay
 * operaciones económicas pendientes de materialización.
 */
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { aMicros, microsACadena, RE_DINERO } from "@workspace/module-costos";
import { costosRuntime, contextForCostos } from "./costos-runtime";
import { manodeobraRuntime, contextForManodeobra } from "./manodeobra-runtime";
import { utilizacionRuntime, contextForUtilizacion } from "./utilizacion-runtime";
import { listarPendientes } from "./costos-orquestador";

/* ------------------------------- Tipos ----------------------------------- */

export type EstadoComponente =
  | "COMPLETO"
  | "PARCIAL"
  | "SIN_DATOS_SUFICIENTES"
  | "PENDIENTE"
  | "NO_APLICA";

/** Identidad de sesión para componer con el principal real del llamante. */
export interface Sesion {
  readonly userId: string;
  readonly rol: string;
  readonly tenant: string;
  readonly identityId?: string;
}

/** Período soportado (§10). Fechas REALES del hecho; nunca inventa hechos. */
export type PeriodoClave = "actual" | "30d" | "90d" | "anio" | "rango" | "total";

export interface RangoPeriodo {
  readonly clave: PeriodoClave;
  /** ISO inclusivo, o null si no acota por ese extremo. */
  readonly desde: string | null;
  readonly hasta: string | null;
}

/** Total económico por moneda (string-safe). */
interface TotalMoneda {
  readonly moneda: string;
  /** Neto = Σ CARGO − Σ ABONO, cadena numeric(18,6). */
  readonly total: string;
  readonly cargos: string;
  readonly abonos: string;
  readonly componentes: number;
}

/* --------------------------- Resolución de período ----------------------- */

/**
 * Resuelve la clave de período a un rango [desde, hasta) ISO usando el "ahora"
 * provisto (inyectable para pruebas deterministas; el router pasa new Date()).
 * NO inventa hechos: sólo acota la ventana temporal de filtrado.
 */
export function resolverPeriodo(
  clave: string | undefined,
  ahora: Date,
  desdeParam?: string,
  hastaParam?: string,
): RangoPeriodo {
  const k = (clave ?? "total") as PeriodoClave;
  const iso = (d: Date): string => d.toISOString();
  switch (k) {
    case "actual": {
      const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
      return { clave: "actual", desde: iso(d), hasta: null };
    }
    case "30d": {
      const d = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { clave: "30d", desde: iso(d), hasta: null };
    }
    case "90d": {
      const d = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { clave: "90d", desde: iso(d), hasta: null };
    }
    case "anio": {
      const d = new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1));
      return { clave: "anio", desde: iso(d), hasta: null };
    }
    case "rango":
      return {
        clave: "rango",
        desde: typeof desdeParam === "string" && desdeParam !== "" ? desdeParam : null,
        hasta: typeof hastaParam === "string" && hastaParam !== "" ? hastaParam : null,
      };
    default:
      return { clave: "total", desde: null, hasta: null };
  }
}

/** true si `fechaIso` cae dentro del rango [desde, hasta] (extremos inclusivos). */
function enRango(fechaIso: unknown, rango: RangoPeriodo): boolean {
  if (rango.desde === null && rango.hasta === null) return true;
  if (typeof fechaIso !== "string" || fechaIso === "") return false;
  const t = Date.parse(fechaIso);
  if (Number.isNaN(t)) return false;
  if (rango.desde !== null && t < Date.parse(rango.desde)) return false;
  if (rango.hasta !== null && t > Date.parse(rango.hasta)) return false;
  return true;
}

/* --------------------------- Sumas string-safe --------------------------- */

/**
 * Acumulador de neto CARGO/ABONO por moneda en micros BigInt (string-safe). Cada
 * moneda es una serie SEPARADA (§6: nunca se suman/convierten monedas distintas).
 */
class NetoPorMoneda {
  private readonly cargos = new Map<string, bigint>();
  private readonly abonos = new Map<string, bigint>();
  private readonly cuenta = new Map<string, number>();

  agregar(moneda: string, valor: string, naturaleza: "CARGO" | "ABONO"): KernelError | null {
    if (!RE_DINERO.test(valor)) return null; // valor no canónico ⇒ se ignora (no se inventa)
    const m = aMicros(valor);
    if (!m.ok) return m.error;
    const mapa = naturaleza === "ABONO" ? this.abonos : this.cargos;
    mapa.set(moneda, (mapa.get(moneda) ?? 0n) + m.value);
    this.cuenta.set(moneda, (this.cuenta.get(moneda) ?? 0) + 1);
    return null;
  }

  vacio(): boolean {
    return this.cuenta.size === 0;
  }

  totales(): TotalMoneda[] {
    const monedas = new Set<string>([...this.cargos.keys(), ...this.abonos.keys()]);
    return [...monedas].sort().map((moneda) => {
      const c = this.cargos.get(moneda) ?? 0n;
      const a = this.abonos.get(moneda) ?? 0n;
      return {
        moneda,
        total: microsACadena(c - a),
        cargos: microsACadena(c),
        abonos: microsACadena(a),
        componentes: this.cuenta.get(moneda) ?? 0,
      };
    });
  }
}

/* --------------------------- Runtime helpers ----------------------------- */

const ctxCostos = (s: Sesion): ExecutionContext =>
  // Reutiliza el mismo builder que el router de costos (P_READ por rol canónico).
  contextForCostos(s.userId, s.rol, s.tenant, s.identityId);

const qCostos = (ctx: ExecutionContext, name: string, input: unknown) =>
  costosRuntime().platform.kernel.queries.execute(ctx, name, input);
const qManodeobra = (ctx: ExecutionContext, name: string, input: unknown) =>
  manodeobraRuntime().platform.kernel.queries.execute(ctx, name, input);
const qUtilizacion = (ctx: ExecutionContext, name: string, input: unknown) =>
  utilizacionRuntime().platform.kernel.queries.execute(ctx, name, input);

/* ----------------------- Componente mano de obra ------------------------- */

interface Componente {
  readonly tipo: "MANO_OBRA" | "MATERIALES" | "OTROS";
  readonly estado: EstadoComponente;
  readonly porMoneda: TotalMoneda[];
  /** Evidencia: hechos/valoraciones individuales que respaldan el total (§18). */
  readonly evidencia: Record<string, unknown>[];
  readonly pendientes: Record<string, unknown>[];
}

/**
 * Compone MANO DE OBRA para una OT o un activo (según el filtro provisto). Suma el
 * costo por moneda (naturaleza CARGO: la valoración es siempre costo positivo) y
 * lista PENDIENTES (valoraciones sin tarifa/recurso, estado != VALORADA).
 */
async function componerManoObra(
  s: Sesion,
  filtro: { ordenId?: string; activoId?: string },
  rango: RangoPeriodo,
): Promise<Result<Componente, KernelError>> {
  const ctx = contextForManodeobra(s.userId, s.rol, s.tenant, s.identityId);
  const r = await qManodeobra(ctx, "modulo.manodeobra.valoraciones", filtro);
  if (!r.ok) return r;
  const filas = ((r.value as { valoraciones?: Record<string, unknown>[] }).valoraciones ?? [])
    // GAP-MO-PERIODO: la query no acepta rango ⇒ se filtra por valoradoAt aquí.
    .filter((v) => enRango(v["valoradoAt"], rango));

  const neto = new NetoPorMoneda();
  const evidencia: Record<string, unknown>[] = [];
  const pendientes: Record<string, unknown>[] = [];
  for (const v of filas) {
    const estado = String(v["estado"] ?? "");
    const costo = v["costo"];
    const moneda = v["moneda"];
    if (estado === "VALORADA" && typeof costo === "string" && typeof moneda === "string" && moneda !== "") {
      const err = neto.agregar(moneda, costo, "CARGO");
      if (err) return { ok: false, error: err } as Result<never, KernelError>;
      evidencia.push({
        fuente: "manodeobra", origen: "modulo.manodeobra.valoraciones", tipo: "MANO_OBRA",
        sesionId: v["sesionId"], ordenId: v["ordenId"], activoId: v["activoId"],
        identityId: v["identityId"], moneda, valor: costo, naturaleza: "CARGO",
        cuando: v["valoradoAt"], quien: v["valoradoPor"], tarifaId: v["tarifaId"], estado,
      });
    } else {
      // Sesión CERRADA sin costo definitivo ⇒ componente PENDIENTE (no $0).
      pendientes.push({
        fuente: "manodeobra", sesionId: v["sesionId"], ordenId: v["ordenId"],
        activoId: v["activoId"], identityId: v["identityId"], estado, motivo: estado,
      });
    }
  }
  const estado = estadoDe(neto, pendientes.length);
  return { ok: true, value: { tipo: "MANO_OBRA", estado, porMoneda: neto.totales(), evidencia, pendientes } };
}

/* --------------- Componentes materiales / otros (module-costos) ---------- */

/**
 * Compone hechos económicos (`modulo.costos.hechos`) para OT o activo, separando
 * MATERIAL (materiales/repuestos) de OTROS. Neto CARGO−ABONO por moneda. Excluye
 * hechos ANULADOS del neto (estado VIGENTE). Conserva cada hecho como evidencia.
 */
async function componerHechos(
  s: Sesion,
  filtro: { otId?: string; activoId?: string },
  rango: RangoPeriodo,
): Promise<Result<{ materiales: Componente; otros: Componente }, KernelError>> {
  const ctx = ctxCostos(s);
  const r = await qCostos(ctx, "modulo.costos.hechos", {
    otId: filtro.otId,
    activoId: filtro.activoId,
    // ACTIVO = hecho vigente (no anulado). Los ANULADOS quedan fuera del neto.
    estado: "ACTIVO",
    desde: rango.desde ?? undefined,
    hasta: rango.hasta ?? undefined,
  });
  if (!r.ok) return r;
  const hechos = (r.value as { hechos?: Record<string, unknown>[] }).hechos ?? [];

  const netoMat = new NetoPorMoneda();
  const netoOtr = new NetoPorMoneda();
  const evidMat: Record<string, unknown>[] = [];
  const evidOtr: Record<string, unknown>[] = [];

  for (const h of hechos) {
    const tipo = String(h["tipo"] ?? "");
    const naturaleza = String(h["naturaleza"] ?? "CARGO") === "ABONO" ? "ABONO" : "CARGO";
    const moneda = h["moneda"];
    const total = h["costoTotal"];
    if (typeof moneda !== "string" || moneda === "" || typeof total !== "string") continue;
    const destinoNeto = tipo === "OTROS" ? netoOtr : netoMat;
    const err = destinoNeto.agregar(moneda, total, naturaleza);
    if (err) return { ok: false, error: err } as Result<never, KernelError>;
    const ev = {
      fuente: "costos", origen: "modulo.costos.hechos", tipo, costoId: h["costoId"],
      otId: h["otId"], activoId: h["activoId"], identityId: h["identityId"],
      movimientoId: h["movimientoId"], articuloId: h["articuloId"],
      moneda, valor: total, naturaleza, cuando: h["ocurridoAt"],
      quien: h["registradoPor"], snapshot: h["fuente"], estado: h["estado"],
    };
    if (tipo === "OTROS") evidOtr.push(ev);
    else evidMat.push(ev);
  }

  return {
    ok: true,
    value: {
      materiales: {
        tipo: "MATERIALES", estado: estadoDe(netoMat, 0),
        porMoneda: netoMat.totales(), evidencia: evidMat, pendientes: [],
      },
      otros: {
        tipo: "OTROS", estado: estadoDe(netoOtr, 0),
        porMoneda: netoOtr.totales(), evidencia: evidOtr, pendientes: [],
      },
    },
  };
}

/** Materiales PENDIENTES de materializar (tabla de orquestación 021.2). */
async function pendientesMaterial(s: Sesion, otId: string): Promise<Record<string, unknown>[]> {
  const filas = await listarPendientes(s.tenant);
  return filas
    .filter((p) => p.otId === otId && p.estado !== "MATERIALIZADO")
    .map((p) => ({
      fuente: "costos.orquestacion", movimientoId: p.movimientoId, otId: p.otId,
      articuloId: p.articuloId, cantidad: p.cantidad, unidad: p.unidad,
      moneda: p.moneda, familia: p.familia, motivo: p.motivo, estado: "PENDIENTE",
      cuando: p.ocurridoAt,
    }));
}

/* ----------------------------- Combustible ------------------------------- */

/**
 * Combustible del activo (CONTEXTUAL, §3). GAP-FUEL-OT: sin relación combustible→OT
 * ⇒ nunca es costo directo de una OT.
 *
 * GAP-FUEL-MONEY (DGP-021.3 R1, §26/§27): el dinero de tanqueo es float en su módulo
 * de origen (serie 019, congelado). Esta fase NO produce NINGÚN agregado monetario de
 * combustible: está PROHIBIDO sumar `costoTotal` (o `litros` como magnitud de dinero)
 * en floating point. Por tanto NO existe `costoOrigen` total ni `porMoneda` sumado.
 *
 * En su lugar se exponen, de forma estrictamente CONTEXTUAL:
 *  - el CONTEO de tanqueos (entero) — total, con costo y sin costo de origen,
 *  - un desglose por moneda que es SOLO un CONTEO de tanqueos (entero), sin dinero,
 *  - la lista de tanqueos INDIVIDUALES con su valor de ORIGEN tal cual (sin sumar),
 *    para trazabilidad. Cada `costoOrigen` es el string del valor float de origen de
 *    ESE tanqueo (no un agregado). `litros` se emite por tanqueo como cantidad física
 *    de origen, sin agregarse.
 *
 * Queda DECLARADO el GAP: no habrá total monetario de combustible por moneda hasta que
 * la serie 019 exponga cadenas decimales exactas (numeric string-safe).
 */
async function combustibleContextual(
  s: Sesion,
  activoId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const ctx = contextForUtilizacion(s.userId, s.rol, s.tenant);
  const r = await qUtilizacion(ctx, "modulo.utilizacion.tanqueos", {
    activoId,
    estado: "vigente",
    desde: rango.desde ?? undefined,
    hasta: rango.hasta ?? undefined,
  });
  if (!r.ok) return r;
  const tanqueos = (r.value as Record<string, unknown>[]) ?? [];
  const filtrados = tanqueos.filter((t) => enRango(t["fechaHora"], rango));

  if (filtrados.length === 0) {
    return {
      ok: true,
      value: {
        atribuibleAOt: "NO_APLICA", estado: "SIN_DATOS_SUFICIENTES",
        precisionOrigen: "float-utilizacion-no-exacto",
        gapMoneda: "GAP-FUEL-MONEY", conteoPorMoneda: [], eventos: [],
        tanqueos: 0, tanqueosConCosto: 0, tanqueosSinCosto: 0,
      },
    };
  }

  // SOLO conteos enteros por moneda (jamás sumas monetarias/float) + eventos crudos.
  const conteoMoneda = new Map<string, number>();
  const eventos: Record<string, unknown>[] = [];
  let sinCosto = 0;
  let conCosto = 0;
  for (const t of filtrados) {
    const moneda = typeof t["moneda"] === "string" && t["moneda"] !== "" ? String(t["moneda"]) : null;
    const costo = t["costoTotal"];
    const tieneCosto = moneda !== null && typeof costo === "number";
    if (tieneCosto) {
      conCosto += 1;
      conteoMoneda.set(moneda, (conteoMoneda.get(moneda) ?? 0) + 1); // conteo ENTERO
    } else {
      sinCosto += 1;
    }
    // Valor de ORIGEN por tanqueo, tal cual, SIN agregar (sólo trazabilidad).
    eventos.push({
      tanqueoId: t["id"] ?? t["tanqueoId"] ?? null,
      cuando: t["fechaHora"] ?? null,
      moneda: moneda,
      // String del valor float de ORIGEN de ESTE tanqueo; no es un total.
      costoOrigen: typeof costo === "number" ? String(costo) : null,
      litros: typeof t["litros"] === "number" ? String(t["litros"] as number) : null,
    });
  }

  return {
    ok: true,
    value: {
      // §3: NUNCA como costo directo de la OT.
      atribuibleAOt: "NO_APLICA",
      // Contextual del activo en período; los valores de ORIGEN son no-exactos.
      estado: conCosto > 0 || filtrados.length > 0 ? "CONTEXTUAL" : "SIN_DATOS_SUFICIENTES",
      precisionOrigen: "float-utilizacion-no-exacto",
      // GAP declarado: sin totales monetarios de combustible hasta que 019 exponga
      // cadenas decimales exactas.
      gapMoneda: "GAP-FUEL-MONEY",
      tanqueos: filtrados.length,
      tanqueosConCosto: conCosto,
      tanqueosSinCosto: sinCosto,
      // Desglose por moneda = SOLO conteo entero de tanqueos (sin dinero).
      conteoPorMoneda: [...conteoMoneda.entries()].sort().map(([moneda, tanqueos]) => ({ moneda, tanqueos })),
      // Valores de origen por tanqueo, individuales, sin sumar.
      eventos,
    },
  };
}

/* ------------------------------ Estado ----------------------------------- */

/**
 * Deriva el estado de un componente (§8): SIN_DATOS si no hay hechos ni pendientes;
 * PENDIENTE si hay pendientes; COMPLETO si sólo hay hechos; PARCIAL si hay hechos
 * Y pendientes. $0 real (neto cero con hechos) NO es SIN_DATOS.
 */
function estadoDe(neto: NetoPorMoneda, pendientes: number): EstadoComponente {
  const hayHechos = !neto.vacio();
  if (!hayHechos && pendientes === 0) return "SIN_DATOS_SUFICIENTES";
  if (!hayHechos && pendientes > 0) return "PENDIENTE";
  if (hayHechos && pendientes > 0) return "PARCIAL";
  return "COMPLETO";
}

/**
 * Estado AGREGADO de la composición (§8). PENDIENTE si algún componente lo está o
 * hay pendientes de materialización; PARCIAL si algún componente es PARCIAL o hay
 * mezcla de con/sin datos; SIN_DATOS si nada tiene datos; COMPLETO si todos los
 * componentes con datos están completos y no hay pendientes.
 */
function estadoAgregado(componentes: EstadoComponente[], hayPendientesMat: boolean): EstadoComponente {
  const conDatos = componentes.filter((e) => e !== "SIN_DATOS_SUFICIENTES" && e !== "NO_APLICA");
  if (conDatos.length === 0 && !hayPendientesMat) return "SIN_DATOS_SUFICIENTES";
  if (componentes.includes("PENDIENTE") || hayPendientesMat) {
    // Si hay algún dato real además de pendientes ⇒ PARCIAL; si sólo pendientes ⇒ PENDIENTE.
    const hayCompleto = componentes.includes("COMPLETO") || componentes.includes("PARCIAL");
    return hayCompleto ? "PARCIAL" : "PENDIENTE";
  }
  if (componentes.includes("PARCIAL")) return "PARCIAL";
  return "COMPLETO";
}

/* -------------------------- Composición pública -------------------------- */

/** Composición de costos de una OT (mano de obra + materiales + otros + combustible NO_APLICA). */
export async function componerOt(
  s: Sesion,
  otId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  // Verifica existencia de la OT vía contrato de costos (deriva activo real).
  const mo = await componerManoObra(s, { ordenId: otId }, rango);
  if (!mo.ok) return mo;
  const hs = await componerHechos(s, { otId }, rango);
  if (!hs.ok) return hs;
  const pend = await pendientesMaterial(s, otId);
  const hayPendientesMat = pend.length > 0;

  const componentes = [mo.value, hs.value.materiales, hs.value.otros];
  const agregado = estadoAgregado(componentes.map((c) => c.estado), hayPendientesMat);

  return {
    ok: true,
    value: {
      ot: otId,
      periodo: rango.clave,
      rango: { desde: rango.desde, hasta: rango.hasta },
      estado: agregado,
      componentes: {
        manoObra: mo.value,
        materiales: { ...hs.value.materiales, pendientes: pend },
        otros: hs.value.otros,
        // §3/§7: combustible NUNCA es costo directo de OT (GAP-FUEL-OT).
        combustible: { tipo: "COMBUSTIBLE", estado: "NO_APLICA", atribuibleAOt: "NO_APLICA", porMoneda: [], nota: "Sin contrato de atribución combustible→OT (GAP-FUEL-OT). Ver combustible del activo." },
      },
      // Totales económicos POR MONEDA (§6: series separadas; sin conversión).
      totalesPorMoneda: totalesGlobales([mo.value, hs.value.materiales, hs.value.otros]),
      pendientesMaterializacion: pend,
      // §13: el costoReal manual de la OT NO es fuente económica; no se incluye aquí.
    },
  };
}

/** Composición del costo histórico/operacional de un activo. */
export async function componerActivo(
  s: Sesion,
  activoId: string,
  rango: RangoPeriodo,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const mo = await componerManoObra(s, { activoId }, rango);
  if (!mo.ok) return mo;
  const hs = await componerHechos(s, { activoId }, rango);
  if (!hs.ok) return hs;
  const fuel = await combustibleContextual(s, activoId, rango);
  if (!fuel.ok) return fuel;

  const componentes = [mo.value, hs.value.materiales, hs.value.otros];
  const agregado = estadoAgregado(componentes.map((c) => c.estado), false);

  return {
    ok: true,
    value: {
      activo: activoId,
      periodo: rango.clave,
      rango: { desde: rango.desde, hasta: rango.hasta },
      estado: agregado,
      componentes: {
        manoObra: mo.value,
        materiales: hs.value.materiales,
        otros: hs.value.otros,
        // Combustible CONTEXTUAL del activo (separado del total económico).
        combustible: fuel.value,
      },
      totalesPorMoneda: totalesGlobales([mo.value, hs.value.materiales, hs.value.otros]),
      // Preparado para DGP-021.4 (costo/hora, costo/km): denominador = horómetro/odómetro.
      costoPorHora: { estado: "SIN_DATOS_SUFICIENTES", nota: "Diferido a DGP-021.4 (denominador = horómetro del activo)." },
      costoPorKm: { estado: "SIN_DATOS_SUFICIENTES", nota: "Diferido a DGP-021.4 (denominador = odómetro del activo)." },
    },
  };
}

/**
 * Suma los netos económicos (mano de obra + materiales + otros) POR MONEDA, en
 * micros BigInt (string-safe). NUNCA mezcla monedas. El combustible NO entra aquí.
 */
function totalesGlobales(componentes: Componente[]): TotalMoneda[] {
  const cargos = new Map<string, bigint>();
  const abonos = new Map<string, bigint>();
  const cuenta = new Map<string, number>();
  for (const c of componentes) {
    for (const t of c.porMoneda) {
      // Reconstituye cargos/abonos por moneda (ya string-safe desde el componente).
      const rc = aMicros(t.cargos);
      const ra = aMicros(t.abonos);
      if (!rc.ok || !ra.ok) continue;
      cargos.set(t.moneda, (cargos.get(t.moneda) ?? 0n) + rc.value);
      abonos.set(t.moneda, (abonos.get(t.moneda) ?? 0n) + ra.value);
      cuenta.set(t.moneda, (cuenta.get(t.moneda) ?? 0) + t.componentes);
    }
  }
  const monedas = new Set<string>([...cargos.keys(), ...abonos.keys()]);
  return [...monedas].sort().map((moneda) => {
    const c = cargos.get(moneda) ?? 0n;
    const a = abonos.get(moneda) ?? 0n;
    return { moneda, total: microsACadena(c - a), cargos: microsACadena(c), abonos: microsACadena(a), componentes: cuenta.get(moneda) ?? 0 };
  });
}
