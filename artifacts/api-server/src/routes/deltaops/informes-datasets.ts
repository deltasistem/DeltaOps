/**
 * DELTAOPS FINAL-02 · Datasets de INFORMES OPERACIONALES (composición de lectura).
 *
 * Principios (directiva FINAL-02):
 *  - «El informe NO crea datos»: cada dataset se compone EXCLUSIVAMENTE de
 *    queries públicas de los módulos autoridad (patrón DGP-021.3). Sin SQL
 *    cross-module, sin fuentes de verdad nuevas, sin tocar `lib/*` congeladas.
 *  - «Lo que se ve = lo que se exporta»: el MISMO builder produce el dataset
 *    de la consulta visual y el de la exportación (Excel/CSV). El router solo
 *    pagina/serializa; jamás re-filtra por su cuenta.
 *  - RBAC/tenant en backend: se compone con el PRINCIPAL DE SESIÓN (rol
 *    canónico/legacy según el contrato de cada módulo). Cada módulo aplica su
 *    propio RBAC y su aislamiento por tenant (RLS). Nada se «abre» aquí.
 *  - Dinero: cadenas numeric string-safe con micros BigInt (`aMicros`/
 *    `microsACadena`). El combustible es float de origen (módulo congelado):
 *    se presenta por evento, SIN agregados monetarios (GAP-FUEL-MONEY).
 *  - Fechas REALES del hecho (fechaHora/occurredAt/iniciadoAt), nunca selladoAt
 *    de importación. Campos inexistentes ⇒ `null` (la presentación/los archivos
 *    lo muestran como «—»); jamás se inventa un valor.
 *  - Datos históricos (LITE-09): los mantenimientos y preoperacionales
 *    históricos viven en `platform.timeline` (eventos `historico.*` por activo)
 *    y se recorren EXHAUSTIVAMENTE por entidad (sin topes silenciosos).
 */
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { aMicros, microsACadena, RE_DINERO } from "@workspace/module-costos";
import { MODULO as MODULO_ORDENES } from "@workspace/module-ordenes";
import { MODULO as MODULO_PLANES } from "@workspace/module-planes";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { utilizacionRuntime, contextForUtilizacion } from "./utilizacion-runtime";
import { manodeobraRuntime, contextForManodeobra } from "./manodeobra-runtime";
import { costosRuntime, contextForCostos } from "./costos-runtime";
import { planesRuntime, contextoRutinasDeActivo, contextForPlanes } from "./planes-runtime";
import { preoperacionalRuntime, contextForPreoperacional, SERVICIO_PREOP } from "./preoperacional-runtime";

/* -------------------------------- Tipos ----------------------------------- */

/** Principal de sesión con AMBOS roles (cada módulo exige el suyo). */
export interface SesionInformes {
  readonly userId: string;
  /** Rol canónico (TENANT_ADMIN/SUPERVISOR/PLANIFICADOR/TECNICO/CONSULTA…). */
  readonly rolCanonico: string;
  /** Rol legacy espejo (admin/operador/lector) para Activos/Planes. */
  readonly rolLegacy: string;
  readonly tenant: string;
  readonly identityId?: string;
}

export interface ColumnaInforme {
  readonly clave: string;
  readonly titulo: string;
}

export interface Dataset {
  readonly columnas: ColumnaInforme[];
  /** Filas completas, YA filtradas y ordenadas. Valores null ⇒ «—». */
  readonly filas: Record<string, unknown>[];
  /** Metadatos honestos (totales string-safe, conteos, avisos). */
  readonly meta: Record<string, unknown>;
}

export interface FiltrosInforme {
  readonly desde?: string;
  readonly hasta?: string;
  readonly activoId?: string;
  readonly estado?: string;
  readonly tipo?: string;
  readonly veredicto?: string;
  readonly centroCosto?: string;
  readonly origen?: string; // vivas | historico | todos
  readonly ordenId?: string;
  readonly moneda?: string;
}

const okd = (columnas: ColumnaInforme[], filas: Record<string, unknown>[], meta: Record<string, unknown> = {}): Result<Dataset, KernelError> =>
  ({ ok: true, value: { columnas, filas, meta } });

/* --------------------------- Helpers de acceso ---------------------------- */

const qActivos = (s: SesionInformes, name: string, input: unknown) =>
  activosRuntime().platform.kernel.queries.execute(contextForActivos(s.userId, s.rolLegacy, s.tenant), name, input);
const qOrdenes = (s: SesionInformes, name: string, input: unknown) =>
  ordenesRuntime().platform.kernel.queries.execute(contextForOrdenes(s.userId, s.rolCanonico, s.tenant, s.identityId), name, input);
const qUtl = (s: SesionInformes, name: string, input: unknown) =>
  utilizacionRuntime().platform.kernel.queries.execute(contextForUtilizacion(s.userId, s.rolCanonico, s.tenant), name, input);
const qMob = (s: SesionInformes, name: string, input: unknown) =>
  manodeobraRuntime().platform.kernel.queries.execute(contextForManodeobra(s.userId, s.rolCanonico, s.tenant, s.identityId), name, input);
const qCostos = (s: SesionInformes, name: string, input: unknown) =>
  costosRuntime().platform.kernel.queries.execute(contextForCostos(s.userId, s.rolCanonico, s.tenant, s.identityId), name, input);
const qPlanes = (ctx: ExecutionContext, name: string, input: unknown) =>
  planesRuntime().platform.kernel.queries.execute(ctx, name, input);
const qPreop = (s: SesionInformes, name: string, input: unknown) =>
  preoperacionalRuntime().platform.kernel.queries.execute(
    contextForPreoperacional(s.userId, s.rolCanonico, s.tenant, s.identityId), name, input);

/** Lee un campo string de una fila que puede venir plano o anidado en `datos`/`data`. */
function campo(fila: Record<string, unknown>, ...claves: string[]): unknown {
  for (const k of claves) {
    if (fila[k] !== undefined && fila[k] !== null) return fila[k];
    const d = fila["datos"] ?? fila["data"];
    if (d && typeof d === "object" && (d as Record<string, unknown>)[k] !== undefined && (d as Record<string, unknown>)[k] !== null) {
      return (d as Record<string, unknown>)[k];
    }
  }
  return null;
}
const cs = (fila: Record<string, unknown>, ...claves: string[]): string | null => {
  const v = campo(fila, ...claves);
  return v === null || v === undefined || v === "" ? null : String(v);
};

/** true si `fechaIso` cae en [desde, hasta] (inclusivos; extremos opcionales). */
function enRango(fechaIso: unknown, f: FiltrosInforme): boolean {
  if (!f.desde && !f.hasta) return true;
  if (typeof fechaIso !== "string" || fechaIso === "") return false;
  const t = Date.parse(fechaIso);
  if (Number.isNaN(t)) return false;
  if (f.desde && t < Date.parse(f.desde)) return false;
  if (f.hasta && t > finDeDia(f.hasta)) return false;
  return true;
}
/** `hasta` de solo fecha (YYYY-MM-DD) es inclusivo hasta el fin del día. */
function finDeDia(hasta: string): number {
  const t = Date.parse(hasta);
  return /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? t + 24 * 60 * 60 * 1000 - 1 : t;
}

interface ActivoRef {
  readonly id: string;
  readonly codigo: string | null;
  readonly nombre: string | null;
  readonly centroCosto: string | null;
  readonly categoria: string | null;
  readonly estado: string | null;
}

/** Mapa id→activo de TODO el tenant (paginado por offset; sin tope silencioso). */
async function mapaActivos(s: SesionInformes): Promise<Result<Map<string, ActivoRef>, KernelError>> {
  const mapa = new Map<string, ActivoRef>();
  const BATCH = 200;
  for (let offset = 0; ; offset += BATCH) {
    const r = await qActivos(s, "modulo.activos.listar", { limit: BATCH, offset });
    if (!r.ok) return r;
    const filas = (Array.isArray(r.value) ? r.value : ((r.value as { activos?: unknown[] })?.activos ?? [])) as Record<string, unknown>[];
    for (const a of filas) {
      const id = cs(a, "id");
      if (!id) continue;
      mapa.set(id, {
        id,
        codigo: cs(a, "codigoEmpresarial", "codigo_empresarial", "codigo"),
        nombre: cs(a, "nombre"),
        centroCosto: cs(a, "centroCosto"),
        categoria: cs(a, "categoria"),
        estado: cs(a, "estado"),
      });
    }
    if (filas.length < BATCH) break;
  }
  return { ok: true, value: mapa };
}

/** ¿La fila pasa el filtro de centro de costos? (null nunca coincide con un filtro). */
function pasaCentroCosto(a: ActivoRef | undefined, f: FiltrosInforme): boolean {
  if (!f.centroCosto) return true;
  return (a?.centroCosto ?? null) === f.centroCosto;
}

/**
 * Timeline EXHAUSTIVO por activo y tipo de evento (`platform.timeline.query`
 * con `entityRef` pagina el almacén sin tope). Devuelve los `data` crudos.
 */
async function timelinePorActivos(
  s: SesionInformes,
  activoIds: string[],
  eventTypes: string[],
  f: FiltrosInforme,
): Promise<Result<Record<string, unknown>[], KernelError>> {
  const salida: Record<string, unknown>[] = [];
  const ctx = contextForActivos(s.userId, s.rolLegacy, s.tenant);
  for (const activoId of activoIds) {
    for (const eventType of eventTypes) {
      const r = await activosRuntime().platform.kernel.queries.execute(ctx, "platform.timeline.query", {
        entityRef: `activo:${activoId}`,
        eventType,
        desde: f.desde,
        hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
      });
      if (!r.ok) return r;
      const filas = (Array.isArray(r.value) ? r.value : ((r.value as { items?: unknown[] })?.items ?? [])) as Record<string, unknown>[];
      for (const fila of filas) salida.push({ ...(fila["data"] as Record<string, unknown> ?? fila), _activoId: activoId });
    }
  }
  return { ok: true, value: salida };
}

/**
 * Duraciones de sesiones por lista de activos (la query pública exige
 * sesionId|ordenId|activoId: fan-out por entidad — adaptador válido DGP-016).
 */
async function duracionesPorActivos(s: SesionInformes, activoIds: string[]): Promise<Result<Record<string, unknown>[], KernelError>> {
  const salida: Record<string, unknown>[] = [];
  for (const activoId of activoIds) {
    const r = await qOrdenes(s, `${MODULO_ORDENES}.sesion.duraciones`, { activoId });
    if (!r.ok) return r;
    const filas = (Array.isArray(r.value) ? r.value : ((r.value as { duraciones?: unknown[] })?.duraciones ?? [])) as Record<string, unknown>[];
    salida.push(...filas);
  }
  return { ok: true, value: salida };
}

/** Valoraciones de mano de obra por lista de activos (misma razón que arriba). */
async function valoracionesPorActivos(s: SesionInformes, activoIds: string[]): Promise<Result<Record<string, unknown>[], KernelError>> {
  const salida: Record<string, unknown>[] = [];
  for (const activoId of activoIds) {
    const r = await qMob(s, "modulo.manodeobra.valoraciones", { activoId });
    if (!r.ok) return r;
    salida.push(...((r.value as { valoraciones?: Record<string, unknown>[] })?.valoraciones ?? []));
  }
  return { ok: true, value: salida };
}

/** Acumulador de neto CARGO/ABONO por moneda en micros BigInt (string-safe). */
class Neto {
  private readonly cargos = new Map<string, bigint>();
  private readonly abonos = new Map<string, bigint>();
  agregar(moneda: string, valor: string, naturaleza: string): void {
    if (!RE_DINERO.test(valor)) return; // valor no canónico ⇒ no se inventa
    const m = aMicros(valor);
    if (!m.ok) return;
    const mapa = naturaleza === "ABONO" ? this.abonos : this.cargos;
    mapa.set(moneda, (mapa.get(moneda) ?? 0n) + m.value);
  }
  vacio(): boolean { return this.cargos.size === 0 && this.abonos.size === 0; }
  totales(): { moneda: string; total: string; cargos: string; abonos: string }[] {
    const monedas = new Set<string>([...this.cargos.keys(), ...this.abonos.keys()]);
    return [...monedas].sort().map((moneda) => {
      const c = this.cargos.get(moneda) ?? 0n;
      const a = this.abonos.get(moneda) ?? 0n;
      return { moneda, total: microsACadena(c - a), cargos: microsACadena(c), abonos: microsACadena(a) };
    });
  }
  neto(moneda: string): string {
    return microsACadena((this.cargos.get(moneda) ?? 0n) - (this.abonos.get(moneda) ?? 0n));
  }
}

const ordenarDesc = (filas: Record<string, unknown>[], clave: string): Record<string, unknown>[] =>
  filas.sort((x, y) => String(y[clave] ?? "").localeCompare(String(x[clave] ?? "")));

/* ------------------------- 1 · Mantenimiento ------------------------------ */

export const COLS_MANTENIMIENTO: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "origen", titulo: "Origen" },
  { clave: "codigo", titulo: "OT" },
  { clave: "titulo", titulo: "Título / Descripción" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "tipo", titulo: "Tipo" },
  { clave: "estado", titulo: "Estado" },
  { clave: "responsable", titulo: "Responsable" },
  { clave: "duracionHoras", titulo: "Duración efectiva (h)" },
  { clave: "costoTotal", titulo: "Costo (string-safe)" },
  { clave: "moneda", titulo: "Moneda" },
];

export async function datasetMantenimiento(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const filas: Record<string, unknown>[] = [];
  const advertencias: string[] = [];
  const incluirVivas = f.origen !== "historico";
  const incluirHistoricos = f.origen !== "vivas";

  if (incluirVivas) {
    // El contrato congelado de listar acota limit≤500 sin offset. Para que la
    // exportación sea CONSOLIDADA (sin omitir registros), sin filtro de equipo
    // se hace fan-out por activo (adaptador válido DGP-016: cada llamada usa la
    // query pública con el principal de sesión); con filtro, una sola llamada.
    const ots: Record<string, unknown>[] = [];
    const activosObjetivo = f.activoId ? [f.activoId] : [...act.value.keys()];
    for (const activoPrincipalId of activosObjetivo) {
      const r = await qOrdenes(s, `${MODULO_ORDENES}.listar`, {
        estado: f.estado || undefined,
        tipo: f.tipo || undefined,
        activoPrincipalId,
        limit: 500,
      });
      if (!r.ok) return r;
      const lote = (Array.isArray(r.value) ? r.value : ((r.value as { ordenes?: unknown[] })?.ordenes ?? [])) as Record<string, unknown>[];
      // ESTADO EXPLÍCITO DE VENTANA: el contrato congelado acota limit≤500 sin
      // offset. Si un lote alcanza el tope, PUEDE haber más registros: se
      // advierte de forma visible (meta/UI/archivo), jamás truncamiento mudo.
      if (lote.length >= 500) {
        const a = act.value.get(activoPrincipalId);
        advertencias.push(`Posible ventana alcanzada: el equipo ${a?.codigo ?? activoPrincipalId} devolvió el tope de 500 OTs vivas del contrato; use filtros de estado/tipo/fechas para un corte completo.`);
      }
      ots.push(...lote);
    }
    // OTs sin activo principal (no cubiertas por el fan-out): una pasada global.
    if (!f.activoId) {
      const rg = await qOrdenes(s, `${MODULO_ORDENES}.listar`, {
        estado: f.estado || undefined,
        tipo: f.tipo || undefined,
        limit: 500,
      });
      if (!rg.ok) return rg;
      const loteGlobal = (Array.isArray(rg.value) ? rg.value : ((rg.value as { ordenes?: unknown[] })?.ordenes ?? [])) as Record<string, unknown>[];
      if (loteGlobal.length >= 500) {
        advertencias.push("Posible ventana alcanzada: la pasada global de OTs vivas devolvió el tope de 500 del contrato; OTs sin activo principal más allá de la ventana no se listan. Use filtros para un corte completo.");
      }
      const vistos = new Set(ots.map((o) => cs(o, "id")));
      for (const o of loteGlobal) {
        const id = cs(o, "id");
        const activoPrincipal = cs(o, "activoPrincipalId", "activo_principal_id");
        if (id && !vistos.has(id) && !activoPrincipal) ots.push(o);
      }
    }

    // Duraciones por OT (la query exige una entidad: fan-out por orden).
    const efectivoPorOt = new Map<string, number>();
    const durs: Record<string, unknown>[] = [];
    for (const o of ots) {
      const id = cs(o, "id");
      if (!id) continue;
      const rd = await qOrdenes(s, `${MODULO_ORDENES}.sesion.duraciones`, { ordenId: id });
      if (!rd.ok) return rd;
      durs.push(...((Array.isArray(rd.value) ? rd.value : ((rd.value as { duraciones?: unknown[] })?.duraciones ?? [])) as Record<string, unknown>[]));
    }
    for (const d of durs) {
      const otId = cs(d, "ordenId", "orden_id");
      const ms = Number(campo(d, "efectivoMs", "efectivo_ms") ?? 0);
      if (otId && Number.isFinite(ms)) efectivoPorOt.set(otId, (efectivoPorOt.get(otId) ?? 0) + ms);
    }

    // Hechos económicos vigentes por OT (UNA llamada; neto string-safe por moneda).
    const rc = await qCostos(s, "modulo.costos.hechos", { estado: "ACTIVO", desde: f.desde, hasta: f.hasta });
    if (!rc.ok) return rc;
    const hechos = ((rc.value as { hechos?: Record<string, unknown>[] })?.hechos ?? []);
    const netoPorOt = new Map<string, Neto>();
    for (const h of hechos) {
      const otId = cs(h, "otId");
      const moneda = cs(h, "moneda");
      const total = campo(h, "costoTotal");
      if (!otId || !moneda || typeof total !== "string") continue;
      const n = netoPorOt.get(otId) ?? new Neto();
      n.agregar(moneda, total, String(campo(h, "naturaleza") ?? "CARGO"));
      netoPorOt.set(otId, n);
    }

    for (const o of ots) {
      const id = cs(o, "id");
      const activoId = cs(o, "activo_principal_id", "activoPrincipalId") ?? cs(o, "activoPrincipal");
      const a = activoId ? act.value.get(activoId) : undefined;
      const fechas = (campo(o, "fechas") ?? {}) as Record<string, unknown>;
      const fecha = (typeof fechas["solicitada"] === "string" ? fechas["solicitada"] : null) ?? cs(o, "actualizado_at", "actualizadoAt");
      if (!enRango(fecha, f)) continue;
      if (!pasaCentroCosto(a, f)) continue;
      const efectivo = id ? efectivoPorOt.get(id) : undefined;
      const totales = id ? netoPorOt.get(id)?.totales() ?? [] : [];
      const base = {
        fecha,
        origen: "VIVA",
        codigo: cs(o, "codigo"),
        titulo: cs(o, "titulo"),
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        tipo: cs(o, "tipo"),
        estado: cs(o, "estado"),
        responsable: cs(o, "responsable"),
        duracionHoras: efectivo != null && efectivo > 0 ? Math.round((efectivo / 3_600_000) * 100) / 100 : null,
      };
      if (totales.length === 0) filas.push({ ...base, costoTotal: null, moneda: null });
      else for (const t of totales) filas.push({ ...base, costoTotal: t.total, moneda: t.moneda });
    }
  }

  if (incluirHistoricos) {
    const ids = f.activoId ? [f.activoId] : [...act.value.keys()];
    const th = await timelinePorActivos(s, ids, ["historico.mantenimiento.rutina", "historico.mantenimiento.correctivo"], f);
    if (!th.ok) return th;
    for (const e of th.value) {
      const a = act.value.get(String(e["_activoId"]));
      if (!pasaCentroCosto(a, f)) continue;
      const payload = (e["payload"] ?? {}) as Record<string, unknown>;
      const tipo = typeof payload["tipoMantenimiento"] === "string" ? payload["tipoMantenimiento"] : null;
      if (f.tipo && (tipo ?? "").toLowerCase() !== f.tipo.toLowerCase()) continue;
      if (f.estado) continue; // los históricos no tienen estado de OT: un filtro de estado los excluye honestamente
      filas.push({
        fecha: cs(e, "occurredAt"),
        origen: "HISTÓRICO",
        codigo: null,
        titulo: cs(e, "resumen") ?? (typeof payload["descripcionActividades"] === "string" ? payload["descripcionActividades"] : null),
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        tipo,
        estado: null,
        responsable: Array.isArray(payload["tecnicos"]) ? (payload["tecnicos"] as unknown[]).join("; ") || null : null,
        duracionHoras: typeof payload["tiempoReparacionHoras"] === "number" ? payload["tiempoReparacionHoras"] : null,
        costoTotal: null,
        moneda: null,
      });
    }
  }

  return okd(COLS_MANTENIMIENTO, ordenarDesc(filas, "fecha"), {
    nota: "Costos: neto CARGO−ABONO por moneda (string-safe). Históricos LITE-09 sin OT ni costo económico registrado.",
    ...(advertencias.length ? { advertencias } : {}),
  });
}

/* ----------------------- 2 · Preoperacionales ----------------------------- */

export const COLS_PREOPERACIONALES: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "origen", titulo: "Origen" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "veredicto", titulo: "Veredicto" },
  { clave: "operador", titulo: "Operador" },
  { clave: "incumplimientos", titulo: "Incumplimientos" },
  { clave: "detalle", titulo: "Detalle" },
];

export async function datasetPreoperacionales(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const filas: Record<string, unknown>[] = [];
  const advertencias: string[] = [];
  const incluirVivas = f.origen !== "historico";
  const incluirHistoricos = f.origen !== "vivas";

  if (incluirVivas) {
    // Ejecuciones VIVAS del record store (push-down activoId/veredicto). El
    // contrato congelado acota limit≤200 sin offset: para no omitir registros
    // en el consolidado se hace FAN-OUT POR ACTIVO (200 por equipo), y una
    // pasada global adicional que cubre ejecuciones sin activo mapeado.
    const rows: Record<string, unknown>[] = [];
    const vistos = new Set<string>();
    const agregar = (lote: Record<string, unknown>[]): void => {
      for (const row of lote) {
        const id = String(row["id"] ?? "");
        if (id && vistos.has(id)) continue;
        if (id) vistos.add(id);
        rows.push(row);
      }
    };
    const activosObjetivo = f.activoId ? [f.activoId] : [...act.value.keys()];
    for (const activoId of activosObjetivo) {
      const r = await qPreop(s, `${SERVICIO_PREOP}.listar`, {
        activoId,
        veredicto: f.veredicto || undefined,
        limit: 200,
      });
      if (!r.ok) return r;
      const lote = (Array.isArray(r.value) ? r.value : []) as Record<string, unknown>[];
      // ESTADO EXPLÍCITO DE VENTANA (jamás truncamiento mudo): si un equipo
      // devuelve el tope de 200 del contrato congelado, puede haber más.
      if (lote.length >= 200) {
        const a = act.value.get(activoId);
        advertencias.push(`Posible ventana alcanzada: el equipo ${a?.codigo ?? activoId} devolvió el tope de 200 ejecuciones del contrato; use filtros de veredicto/fechas para un corte completo.`);
      }
      agregar(lote);
    }
    if (!f.activoId) {
      const rg = await qPreop(s, `${SERVICIO_PREOP}.listar`, {
        veredicto: f.veredicto || undefined,
        limit: 200,
      });
      if (!rg.ok) return rg;
      const loteGlobal = (Array.isArray(rg.value) ? rg.value : []) as Record<string, unknown>[];
      if (loteGlobal.length >= 200) {
        advertencias.push("Posible ventana alcanzada: la pasada global devolvió el tope de 200 del contrato; ejecuciones sin equipo mapeado más allá de la ventana no se listan.");
      }
      agregar(loteGlobal);
    }
    for (const row of rows) {
      const d = (row["data"] ?? row) as Record<string, unknown>;
      // Históricos van por timeline (exhaustivo): el marcador del import vive
      // en contexto._origen (los vivos no lo llevan). Se admite también un
      // origen de nivel superior por robustez.
      const ctxOrigen = (d["contexto"] as Record<string, unknown> | undefined)?.["_origen"];
      if (String(d["origen"] ?? ctxOrigen ?? "") === "HISTORICO") continue;
      const fecha = cs(d, "ejecutadoAt", "selladoAt", "createdAt");
      if (!enRango(fecha, f)) continue;
      const a = act.value.get(String(d["activoId"] ?? ""));
      if (!pasaCentroCosto(a, f)) continue;
      filas.push({
        fecha,
        origen: "VIVA",
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        veredicto: cs(d, "veredicto"),
        operador: cs(d, "operadorNombre", "identityId", "actorId"),
        incumplimientos: typeof d["incumplimientos"] === "number" ? d["incumplimientos"] : null,
        detalle: cs(d, "observaciones", "resumen"),
      });
    }
  }

  if (incluirHistoricos) {
    const ids = f.activoId ? [f.activoId] : [...act.value.keys()];
    const th = await timelinePorActivos(s, ids, ["historico.preoperacional"], f);
    if (!th.ok) return th;
    for (const e of th.value) {
      const a = act.value.get(String(e["_activoId"]));
      if (!pasaCentroCosto(a, f)) continue;
      const veredicto = cs(e, "estado");
      if (f.veredicto && veredicto !== f.veredicto) continue;
      const payload = (e["payload"] ?? {}) as Record<string, unknown>;
      filas.push({
        fecha: cs(e, "occurredAt"),
        origen: "HISTÓRICO",
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        veredicto,
        operador: typeof payload["operador"] === "string" ? payload["operador"] : null,
        incumplimientos: typeof payload["incumplimientos"] === "number" ? payload["incumplimientos"] : null,
        detalle: cs(e, "resumen"),
      });
    }
  }

  return okd(COLS_PREOPERACIONALES, ordenarDesc(filas, "fecha"), {
    nota: "Vivas: recorrido por equipo (hasta 200 por equipo, tope del contrato congelado) más pasada global; si se alcanza una ventana se ADVIERTE explícitamente. Históricos: recorrido exhaustivo por equipo.",
    ...(advertencias.length ? { advertencias } : {}),
  });
}

/* -------------------------- 3 · Combustible ------------------------------- */

export const COLS_COMBUSTIBLE: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "tipoCombustible", titulo: "Combustible" },
  { clave: "litros", titulo: "Litros (origen)" },
  { clave: "costoOrigen", titulo: "Costo de origen (no exacto)" },
  { clave: "moneda", titulo: "Moneda" },
  { clave: "observacion", titulo: "Observación" },
];

export async function datasetCombustible(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const filas: Record<string, unknown>[] = [];
  const BATCH = 500;
  for (let offset = 0; ; offset += BATCH) {
    const r = await qUtl(s, "modulo.utilizacion.tanqueos", {
      activoId: f.activoId || undefined,
      estado: "vigente",
      desde: f.desde,
      hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
      limit: BATCH,
      offset,
    });
    if (!r.ok) return r;
    const lote = (Array.isArray(r.value) ? r.value : ((r.value as { tanqueos?: unknown[] })?.tanqueos ?? [])) as Record<string, unknown>[];
    for (const t of lote) {
      const fecha = cs(t, "fechaHora", "fecha_hora");
      if (!enRango(fecha, f)) continue;
      const a = act.value.get(String(campo(t, "activoId", "activo_id") ?? ""));
      if (!pasaCentroCosto(a, f)) continue;
      const costo = campo(t, "costoTotal", "costo_total");
      filas.push({
        fecha,
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        tipoCombustible: cs(t, "tipoCombustible", "tipo_combustible"),
        litros: typeof campo(t, "litros") === "number" ? campo(t, "litros") : null,
        // Valor de ORIGEN de ESTE tanqueo (float congelado): individual, sin sumar.
        costoOrigen: typeof costo === "number" ? String(costo) : null,
        moneda: cs(t, "moneda"),
        observacion: cs(t, "observacion"),
      });
    }
    if (lote.length < BATCH) break;
  }
  return okd(COLS_COMBUSTIBLE, ordenarDesc(filas, "fecha"), {
    gapMoneda: "GAP-FUEL-MONEY",
    nota: "Sin totales monetarios: el costo de tanqueo es float en su módulo de origen (congelado); cada valor es individual, sin agregar.",
    tanqueos: filas.length,
  });
}

/* ------------------- 4 · Horómetros / Lecturas ---------------------------- */

export const COLS_HOROMETROS: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "tipoMedidor", titulo: "Medidor" },
  { clave: "valor", titulo: "Valor" },
  { clave: "unidad", titulo: "Unidad" },
  { clave: "origen", titulo: "Origen" },
  { clave: "inconsistente", titulo: "Inconsistente" },
  { clave: "motivo", titulo: "Motivo de inconsistencia" },
];

export async function datasetHorometros(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const filas: Record<string, unknown>[] = [];
  let inconsistentes = 0;
  const BATCH = 500;
  for (let offset = 0; ; offset += BATCH) {
    const r = await qUtl(s, "modulo.utilizacion.lecturas", {
      activoId: f.activoId || undefined,
      tipoMedidor: f.tipo || undefined,
      estado: "vigente",
      desde: f.desde,
      hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
      limit: BATCH,
      offset,
    });
    if (!r.ok) return r;
    const lote = (Array.isArray(r.value) ? r.value : ((r.value as { lecturas?: unknown[] })?.lecturas ?? [])) as Record<string, unknown>[];
    for (const l of lote) {
      const fecha = cs(l, "fechaHora", "fecha_hora");
      if (!enRango(fecha, f)) continue;
      const a = act.value.get(String(campo(l, "activoId", "activo_id") ?? ""));
      if (!pasaCentroCosto(a, f)) continue;
      const inconsistente = campo(l, "inconsistente") === true;
      if (inconsistente) inconsistentes += 1;
      filas.push({
        fecha,
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        tipoMedidor: cs(l, "tipoMedidor", "tipo_medidor"),
        valor: typeof campo(l, "valor") === "number" ? campo(l, "valor") : cs(l, "valor"),
        unidad: cs(l, "unidad"),
        origen: cs(l, "origen"),
        inconsistente: inconsistente ? "SÍ" : "NO",
        motivo: cs(l, "motivoInconsistencia"),
      });
    }
    if (lote.length < BATCH) break;
  }
  return okd(COLS_HOROMETROS, ordenarDesc(filas, "fecha"), {
    lecturas: filas.length,
    inconsistentes,
    nota: "Las lecturas inconsistentes se conservan y se marcan; jamás se ocultan ni se corrigen.",
  });
}

/* ---------------------- 5 · Rutinas de la flota --------------------------- */

export const COLS_RUTINAS: ColumnaInforme[] = [
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "plan", titulo: "Plan / Rutina" },
  { clave: "dominio", titulo: "Dominio" },
  { clave: "etiqueta", titulo: "Situación" },
  { clave: "semaforo", titulo: "Semáforo" },
  { clave: "vencida", titulo: "Vencida" },
  { clave: "faltante", titulo: "Faltante" },
  { clave: "meta", titulo: "Próxima meta" },
  { clave: "unidad", titulo: "Unidad" },
];

export async function datasetRutinas(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const ids = f.activoId ? [f.activoId] : [...act.value.keys()];
  const filas: Record<string, unknown>[] = [];
  let sinContexto = 0;
  const ctxPlanes = contextForPlanes(s.userId, s.rolLegacy, s.tenant);
  const ahora = new Date().toISOString();

  for (const activoId of ids) {
    const a = act.value.get(activoId);
    if (!pasaCentroCosto(a, f)) continue;
    // Contexto operacional (medidores REALES) leído de Activos, FAIL-CLOSED:
    // AUTH se propaga; sin medidores/candidato ⇒ fila honesta «sin datos».
    const ctxOp = await contextoRutinasDeActivo(s.tenant, s.userId, s.rolLegacy, activoId);
    if (!ctxOp.ok) {
      if (ctxOp.error.code.startsWith("KRN-AUTH")) return ctxOp;
      sinContexto += 1;
      continue;
    }
    const r = await qPlanes(ctxPlanes, `${MODULO_PLANES}.estado-rutinas`, {
      activoId,
      ahora,
      medidores: ctxOp.value.medidores,
      candidato: ctxOp.value.candidato,
    });
    if (!r.ok) return r;
    const rutinas = ((r.value as { rutinas?: Record<string, unknown>[] })?.rutinas ?? []);
    for (const ru of rutinas) {
      if (f.estado === "vencidas" && ru["vencida"] !== true) continue;
      filas.push({
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
        centroCosto: a?.centroCosto ?? null,
        plan: [cs(ru, "codigo"), cs(ru, "nombre")].filter(Boolean).join(" · ") || null,
        dominio: cs(ru, "dominio"),
        etiqueta: cs(ru, "etiqueta"),
        semaforo: cs(ru, "semaforo"),
        vencida: ru["vencida"] === true ? "SÍ" : "NO",
        faltante: campo(ru, "faltante"),
        meta: campo(ru, "meta"),
        unidad: cs(ru, "unidad"),
      });
    }
  }
  filas.sort((x, y) => (y["vencida"] === "SÍ" ? 1 : 0) - (x["vencida"] === "SÍ" ? 1 : 0));
  return okd(COLS_RUTINAS, filas, {
    equiposSinContexto: sinContexto,
    nota: "Estado según motor de frecuencias sobre medidores reales del equipo. Equipos sin medidores/alcance no se evalúan (conteo en meta).",
  });
}

/* ------------------------ 6 · Horas hombre -------------------------------- */

export const COLS_HORAS_HOMBRE: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Inicio" },
  { clave: "fin", titulo: "Cierre" },
  { clave: "ot", titulo: "OT" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "identidad", titulo: "Técnico (identidad)" },
  { clave: "estado", titulo: "Estado" },
  { clave: "efectivoHoras", titulo: "Horas efectivas" },
  { clave: "pausadoHoras", titulo: "Horas en pausa" },
  { clave: "costo", titulo: "Costo valorado" },
  { clave: "moneda", titulo: "Moneda" },
  { clave: "estadoValoracion", titulo: "Valoración" },
];

export async function datasetHorasHombre(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  // La query pública exige entidad (sesión/orden/activo): con filtro directo se
  // usa; sin filtro, fan-out por TODOS los activos del tenant (DGP-016).
  let durs: Record<string, unknown>[];
  if (f.ordenId || f.activoId) {
    const rd = await qOrdenes(s, `${MODULO_ORDENES}.sesion.duraciones`, {
      ordenId: f.ordenId || undefined,
      activoId: f.activoId || undefined,
    });
    if (!rd.ok) return rd;
    durs = (Array.isArray(rd.value) ? rd.value : ((rd.value as { duraciones?: unknown[] })?.duraciones ?? [])) as Record<string, unknown>[];
  } else {
    const rd = await duracionesPorActivos(s, [...act.value.keys()]);
    if (!rd.ok) return rd;
    durs = rd.value;
  }

  // OTs para mostrar el código legible (una llamada).
  const ro = await qOrdenes(s, `${MODULO_ORDENES}.listar`, { limit: 500 });
  if (!ro.ok) return ro;
  const ots = (Array.isArray(ro.value) ? ro.value : ((ro.value as { ordenes?: unknown[] })?.ordenes ?? [])) as Record<string, unknown>[];
  const codigoOt = new Map<string, string>();
  for (const o of ots) {
    const id = cs(o, "id"); const cod = cs(o, "codigo");
    if (id && cod) codigoOt.set(id, cod);
  }

  // Valoraciones de mano de obra (la query exige entidad: filtro o fan-out).
  let vals: Record<string, unknown>[];
  if (f.ordenId || f.activoId) {
    const rv = await qMob(s, "modulo.manodeobra.valoraciones", {
      ordenId: f.ordenId || undefined,
      activoId: f.activoId || undefined,
    });
    if (!rv.ok) return rv;
    vals = ((rv.value as { valoraciones?: Record<string, unknown>[] })?.valoraciones ?? []);
  } else {
    const rv = await valoracionesPorActivos(s, [...act.value.keys()]);
    if (!rv.ok) return rv;
    vals = rv.value;
  }
  const valPorSesion = new Map<string, Record<string, unknown>>();
  for (const v of vals) {
    const sid = cs(v, "sesionId");
    if (sid) valPorSesion.set(sid, v);
  }

  const filas: Record<string, unknown>[] = [];
  for (const d of durs) {
    const inicio = cs(d, "iniciadoAt", "iniciado_at");
    if (!enRango(inicio, f)) continue;
    const activoId = String(campo(d, "activoId", "activo_id") ?? "");
    const a = act.value.get(activoId);
    if (!pasaCentroCosto(a, f)) continue;
    const sid = cs(d, "sesionId", "sesion_id");
    const otId = cs(d, "ordenId", "orden_id");
    const v = sid ? valPorSesion.get(sid) : undefined;
    const efectivo = Number(campo(d, "efectivoMs", "efectivo_ms") ?? 0);
    const pausado = Number(campo(d, "pausadoMs", "pausado_ms") ?? 0);
    const estadoVal = v ? String(v["estado"] ?? "") : null;
    filas.push({
      fecha: inicio,
      fin: cs(d, "cerradoAt", "cerrado_at"),
      ot: otId ? codigoOt.get(otId) ?? otId : null,
      activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
      identidad: cs(d, "identityId", "identity_id"),
      estado: cs(d, "estado"),
      efectivoHoras: Number.isFinite(efectivo) && efectivo > 0 ? Math.round((efectivo / 3_600_000) * 100) / 100 : 0,
      pausadoHoras: Number.isFinite(pausado) && pausado > 0 ? Math.round((pausado / 3_600_000) * 100) / 100 : 0,
      costo: estadoVal === "VALORADA" && typeof v?.["costo"] === "string" ? v["costo"] : null,
      moneda: estadoVal === "VALORADA" ? cs(v as Record<string, unknown>, "moneda") : null,
      estadoValoracion: estadoVal ?? "SIN VALORACIÓN",
    });
  }
  return okd(COLS_HORAS_HOMBRE, ordenarDesc(filas, "fecha"), {
    nota: "Solo dominio de mantenimiento (sesiones de trabajo sobre OT). Sesiones sin valoración se muestran PENDIENTES, jamás $0.",
  });
}

/* --------------------- 7 · Repuestos e insumos ---------------------------- */

export const COLS_REPUESTOS: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "ot", titulo: "OT" },
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "tipo", titulo: "Tipo" },
  { clave: "articuloId", titulo: "Artículo" },
  { clave: "naturaleza", titulo: "Naturaleza" },
  { clave: "costoTotal", titulo: "Costo (string-safe)" },
  { clave: "moneda", titulo: "Moneda" },
  { clave: "registradoPor", titulo: "Registrado por" },
];

export async function datasetRepuestos(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const rc = await qCostos(s, "modulo.costos.hechos", {
    estado: "ACTIVO",
    activoId: f.activoId || undefined,
    otId: f.ordenId || undefined,
    tipo: f.tipo || undefined,
    desde: f.desde,
    hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
  });
  if (!rc.ok) return rc;
  const hechos = ((rc.value as { hechos?: Record<string, unknown>[] })?.hechos ?? []);

  const ro = await qOrdenes(s, `${MODULO_ORDENES}.listar`, { limit: 500 });
  const codigoOt = new Map<string, string>();
  if (ro.ok) {
    const ots = (Array.isArray(ro.value) ? ro.value : ((ro.value as { ordenes?: unknown[] })?.ordenes ?? [])) as Record<string, unknown>[];
    for (const o of ots) {
      const id = cs(o, "id"); const cod = cs(o, "codigo");
      if (id && cod) codigoOt.set(id, cod);
    }
  }

  const filas: Record<string, unknown>[] = [];
  const neto = new Neto();
  for (const h of hechos) {
    const tipo = String(campo(h, "tipo") ?? "");
    if (tipo !== "MATERIAL" && tipo !== "OTROS") continue; // repuestos/insumos: hechos económicos exactos
    const fecha = cs(h, "ocurridoAt");
    if (!enRango(fecha, f)) continue;
    const a = act.value.get(String(campo(h, "activoId") ?? ""));
    if (!pasaCentroCosto(a, f)) continue;
    const moneda = cs(h, "moneda");
    const total = campo(h, "costoTotal");
    const naturaleza = String(campo(h, "naturaleza") ?? "CARGO");
    if (moneda && typeof total === "string") neto.agregar(moneda, total, naturaleza);
    const otId = cs(h, "otId");
    filas.push({
      fecha,
      ot: otId ? codigoOt.get(otId) ?? otId : null,
      activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || null : null,
      centroCosto: a?.centroCosto ?? null,
      tipo,
      articuloId: cs(h, "articuloId"),
      naturaleza,
      costoTotal: typeof total === "string" ? total : null,
      moneda,
      registradoPor: cs(h, "registradoPor"),
    });
  }
  return okd(COLS_REPUESTOS, ordenarDesc(filas, "fecha"), {
    totalesPorMoneda: neto.totales(),
    nota: "Ledger CARGO/ABONO string-safe del módulo de costos exactos. Devoluciones = ABONO (jamás montos negativos).",
  });
}

/* --------------------------- 8 · Costos ----------------------------------- */

export const COLS_COSTOS: ColumnaInforme[] = [
  { clave: "activo", titulo: "Equipo" },
  { clave: "centroCosto", titulo: "Centro de costos" },
  { clave: "moneda", titulo: "Moneda" },
  { clave: "manoObra", titulo: "Mano de obra" },
  { clave: "materiales", titulo: "Materiales" },
  { clave: "otros", titulo: "Otros" },
  { clave: "total", titulo: "Total (string-safe)" },
  { clave: "tanqueos", titulo: "Tanqueos (contexto)" },
];

export async function datasetCostos(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  const act = await mapaActivos(s);
  if (!act.ok) return act;

  const rc = await qCostos(s, "modulo.costos.hechos", {
    estado: "ACTIVO",
    activoId: f.activoId || undefined,
    desde: f.desde,
    hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
  });
  if (!rc.ok) return rc;
  const hechos = ((rc.value as { hechos?: Record<string, unknown>[] })?.hechos ?? []);

  let vals: Record<string, unknown>[];
  if (f.activoId) {
    const rv = await qMob(s, "modulo.manodeobra.valoraciones", { activoId: f.activoId });
    if (!rv.ok) return rv;
    vals = ((rv.value as { valoraciones?: Record<string, unknown>[] })?.valoraciones ?? []);
  } else {
    const rv = await valoracionesPorActivos(s, [...act.value.keys()]);
    if (!rv.ok) return rv;
    vals = rv.value;
  }

  // Acumuladores por (activo, moneda): TODO en micros BigInt.
  type Cel = { mo: Neto; mat: Neto; otr: Neto; monedas: Set<string> };
  const porActivo = new Map<string, Cel>();
  const cel = (id: string): Cel => {
    const c = porActivo.get(id) ?? { mo: new Neto(), mat: new Neto(), otr: new Neto(), monedas: new Set<string>() };
    porActivo.set(id, c);
    return c;
  };
  for (const h of hechos) {
    const id = cs(h, "activoId"); const moneda = cs(h, "moneda"); const total = campo(h, "costoTotal");
    if (!id || !moneda || typeof total !== "string") continue;
    const c = cel(id);
    c.monedas.add(moneda);
    const nat = String(campo(h, "naturaleza") ?? "CARGO");
    if (String(campo(h, "tipo") ?? "") === "OTROS") c.otr.agregar(moneda, total, nat);
    else c.mat.agregar(moneda, total, nat);
  }
  for (const v of vals) {
    if (String(v["estado"] ?? "") !== "VALORADA") continue;
    if (!enRango(v["valoradoAt"], f)) continue;
    const id = cs(v, "activoId"); const moneda = cs(v, "moneda"); const costo = v["costo"];
    if (!id || !moneda || typeof costo !== "string") continue;
    const c = cel(id);
    c.monedas.add(moneda);
    c.mo.agregar(moneda, costo, "CARGO");
  }

  // Combustible: SOLO conteo de tanqueos por activo (GAP-FUEL-MONEY: sin dinero).
  const tanqueosPorActivo = new Map<string, number>();
  {
    const BATCH = 500;
    for (let offset = 0; ; offset += BATCH) {
      const r = await qUtl(s, "modulo.utilizacion.tanqueos", {
        activoId: f.activoId || undefined, estado: "vigente",
        desde: f.desde, hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
        limit: BATCH, offset,
      });
      if (!r.ok) return r;
      const lote = (Array.isArray(r.value) ? r.value : ((r.value as { tanqueos?: unknown[] })?.tanqueos ?? [])) as Record<string, unknown>[];
      for (const t of lote) {
        if (!enRango(cs(t, "fechaHora", "fecha_hora"), f)) continue;
        const id = String(campo(t, "activoId", "activo_id") ?? "");
        if (id) tanqueosPorActivo.set(id, (tanqueosPorActivo.get(id) ?? 0) + 1);
      }
      if (lote.length < BATCH) break;
    }
  }

  const filas: Record<string, unknown>[] = [];
  const idsConDatos = new Set<string>([...porActivo.keys(), ...tanqueosPorActivo.keys()]);
  for (const id of idsConDatos) {
    const a = act.value.get(id);
    if (!pasaCentroCosto(a, f)) continue;
    const c = porActivo.get(id);
    const monedas = c ? [...c.monedas].sort() : [];
    if (monedas.length === 0) {
      // Solo contexto de combustible: sin dinero económico ⇒ fila honesta.
      filas.push({
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || id : id,
        centroCosto: a?.centroCosto ?? null,
        moneda: null, manoObra: null, materiales: null, otros: null, total: null,
        tanqueos: tanqueosPorActivo.get(id) ?? 0,
      });
      continue;
    }
    for (const moneda of monedas) {
      const mo = c!.mo.neto(moneda), mat = c!.mat.neto(moneda), otr = c!.otr.neto(moneda);
      const suma = new Neto();
      suma.agregar(moneda, mo, "CARGO"); suma.agregar(moneda, mat, "CARGO"); suma.agregar(moneda, otr, "CARGO");
      filas.push({
        activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() || id : id,
        centroCosto: a?.centroCosto ?? null,
        moneda,
        manoObra: mo, materiales: mat, otros: otr,
        total: suma.neto(moneda),
        tanqueos: tanqueosPorActivo.get(id) ?? 0,
      });
    }
  }
  filas.sort((x, y) => String(x["activo"] ?? "").localeCompare(String(y["activo"] ?? "")));
  return okd(COLS_COSTOS, filas, {
    nota: "Dinero económico string-safe (micros BigInt) por moneda; jamás se convierten monedas. Combustible: solo conteo contextual (GAP-FUEL-MONEY). Equipos sin hechos no aparecen (sin $0 falsos).",
    pendientesManoObra: vals.filter((v) => String(v["estado"] ?? "") !== "VALORADA").length,
  });
}

/* ------------------------ 9 · Hoja de vida -------------------------------- */

export const COLS_HOJA_VIDA: ColumnaInforme[] = [
  { clave: "fecha", titulo: "Fecha" },
  { clave: "tipo", titulo: "Tipo de evento" },
  { clave: "resumen", titulo: "Resumen" },
  { clave: "estado", titulo: "Estado" },
  { clave: "actor", titulo: "Actor" },
];

export async function datasetHojaDeVida(s: SesionInformes, f: FiltrosInforme): Promise<Result<Dataset, KernelError>> {
  if (!f.activoId) {
    return {
      ok: false,
      error: { code: "KRN-VAL-001", message: "El informe de hoja de vida exige un equipo (activoId)." } as KernelError,
    };
  }
  const act = await mapaActivos(s);
  if (!act.ok) return act;
  const a = act.value.get(f.activoId);
  const ctx = contextForActivos(s.userId, s.rolLegacy, s.tenant);
  const r = await activosRuntime().platform.kernel.queries.execute(ctx, "platform.timeline.query", {
    entityRef: `activo:${f.activoId}`,
    desde: f.desde,
    hasta: f.hasta ? new Date(finDeDia(f.hasta)).toISOString() : undefined,
  });
  if (!r.ok) return r;
  const entradas = (Array.isArray(r.value) ? r.value : ((r.value as { items?: unknown[] })?.items ?? [])) as Record<string, unknown>[];
  const filas: Record<string, unknown>[] = [];
  for (const e of entradas) {
    const d = (e["data"] ?? e) as Record<string, unknown>;
    const eventType = String(d["eventType"] ?? "");
    // Filtro de TIPO por PREFIJO en composición (el contrato congelado del
    // timeline solo filtra por eventType exacto).
    if (f.tipo && !eventType.startsWith(f.tipo)) continue;
    filas.push({
      fecha: cs(d, "occurredAt"),
      tipo: eventType || null,
      resumen: cs(d, "resumen"),
      estado: cs(d, "estado"),
      actor: cs(d, "actorId"),
    });
  }
  return okd(COLS_HOJA_VIDA, ordenarDesc(filas, "fecha"), {
    activo: a ? `${a.codigo ?? ""} ${a.nombre ?? ""}`.trim() : f.activoId,
    nota: "Cronología completa del equipo (incluye históricos LITE-09). Filtro de tipo por prefijo de evento.",
  });
}

/* ------------------------------ Registro ---------------------------------- */

export interface DefInforme {
  readonly clave: string;
  readonly titulo: string;
  readonly descripcion: string;
  /** Filtros soportados por el builder; el frontend renderiza SOLO estos. */
  readonly filtros: readonly (keyof FiltrosInforme)[];
  readonly builder: (s: SesionInformes, f: FiltrosInforme) => Promise<Result<Dataset, KernelError>>;
}

export const INFORMES: readonly DefInforme[] = [
  { clave: "mantenimiento", titulo: "Mantenimiento", descripcion: "Órdenes de trabajo vivas e históricos, con duración y costo por moneda.", filtros: ["desde", "hasta", "activoId", "estado", "tipo", "centroCosto"], builder: datasetMantenimiento },
  { clave: "preoperacionales", titulo: "Preoperacionales", descripcion: "Inspecciones preoperacionales vivas e históricas con veredicto.", filtros: ["desde", "hasta", "activoId", "veredicto", "centroCosto"], builder: datasetPreoperacionales },
  { clave: "combustible", titulo: "Combustible", descripcion: "Tanqueos por equipo con valores de origen (sin agregados monetarios).", filtros: ["desde", "hasta", "activoId", "centroCosto"], builder: datasetCombustible },
  { clave: "horometros", titulo: "Horómetros y lecturas", descripcion: "Lecturas de medidores, incluidas las inconsistentes (marcadas).", filtros: ["desde", "hasta", "activoId", "centroCosto"], builder: datasetHorometros },
  { clave: "rutinas", titulo: "Rutinas de la flota", descripcion: "Estado de rutinas de mantenimiento por equipo (motor de frecuencias).", filtros: ["activoId", "centroCosto"], builder: datasetRutinas },
  { clave: "horas-hombre", titulo: "Horas hombre", descripcion: "Sesiones de trabajo sobre OT con horas efectivas y valoración.", filtros: ["desde", "hasta", "activoId", "ordenId", "centroCosto"], builder: datasetHorasHombre },
  { clave: "repuestos", titulo: "Repuestos e insumos", descripcion: "Hechos económicos de materiales y otros (ledger CARGO/ABONO).", filtros: ["desde", "hasta", "activoId", "centroCosto"], builder: datasetRepuestos },
  { clave: "costos", titulo: "Costos por equipo", descripcion: "Neto económico por equipo y moneda (string-safe) + contexto de combustible.", filtros: ["desde", "hasta", "activoId", "centroCosto"], builder: datasetCostos },
  { clave: "hoja-de-vida", titulo: "Hoja de vida", descripcion: "Cronología completa de un equipo con filtros de tipo y fechas.", filtros: ["desde", "hasta", "activoId", "tipo"], builder: datasetHojaDeVida },
];

export const informePorClave = (clave: string): DefInforme | undefined =>
  INFORMES.find((i) => i.clave === clave);
