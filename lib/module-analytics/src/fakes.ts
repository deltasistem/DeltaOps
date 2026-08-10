/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — FAKES en memoria.
 *
 * NO son infraestructura de producción: implementaciones en memoria (Map) 100%
 * deterministas para pruebas de dominio y para el harness. Incluye FAKES RICOS de
 * las fuentes read-only (que en Etapa 2 envolverán los contratos públicos reales
 * de cada módulo). Un puerto de fuente AUSENTE ⇒ la evaluación falla de forma
 * segura (KRN-CFL) — jamás inventa datos.
 */
import { fail, KernelErrors, ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "./domain/catalogos";
import type { DefinicionIndicador } from "./domain/definicion-indicador";
import type { Dashboard } from "./domain/dashboard";
import type { SnapshotEvaluacion } from "./domain/snapshot";
import type { Hecho } from "./domain/filtros";
import type {
  CatalogoPort,
  CriterioFuente,
  DashboardFiltro,
  DashboardRepository,
  DefinicionFiltro,
  DefinicionRepository,
  EventLogStore,
  EventoDurable,
  FuenteHechos,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  SnapshotRepository,
  TenantId,
} from "./domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* ---------------------------- Definiciones ------------------------------- */

export class FakeDefinicionRepository implements DefinicionRepository {
  private readonly store = new Map<string, DefinicionIndicador>();
  async insert(_uow: UnitOfWork, d: DefinicionIndicador): Promise<Result<DefinicionIndicador, KernelError>> {
    if (this.store.has(key(d.tenantId, d.clave))) return fail(KernelErrors.conflict(`El indicador "${d.clave}" ya existe`));
    this.store.set(key(d.tenantId, d.clave), clone(d));
    return ok(clone(d));
  }
  async update(_uow: UnitOfWork, d: DefinicionIndicador, expectedVersion: number): Promise<Result<DefinicionIndicador, KernelError>> {
    const prev = this.store.get(key(d.tenantId, d.clave));
    if (!prev) return fail(KernelErrors.notFound("indicador", d.clave));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(d.tenantId, d.clave), clone(d));
    return ok(clone(d));
  }
  async findByClave(tenantId: TenantId, clave: string): Promise<Result<DefinicionIndicador | null, KernelError>> {
    const f = this.store.get(key(tenantId, clave));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: DefinicionFiltro): Promise<Result<DefinicionIndicador[], KernelError>> {
    let rows = [...this.store.values()].filter((d) => d.tenantId === tenantId);
    if (filtro.categoria) rows = rows.filter((d) => d.categoria === filtro.categoria);
    if (filtro.habilitado !== undefined) rows = rows.filter((d) => d.habilitado === filtro.habilitado);
    if (filtro.delSistema !== undefined) rows = rows.filter((d) => d.delSistema === filtro.delSistema);
    rows.sort((a, b) => (a.clave < b.clave ? -1 : 1));
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* ------------------------------ Dashboards ------------------------------- */

export class FakeDashboardRepository implements DashboardRepository {
  private readonly store = new Map<string, Dashboard>();
  async insert(_uow: UnitOfWork, d: Dashboard): Promise<Result<Dashboard, KernelError>> {
    if (this.store.has(key(d.tenantId, d.id))) return fail(KernelErrors.conflict(`El dashboard ${d.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === d.tenantId && x.clave === d.clave) return fail(KernelErrors.conflict(`La clave de dashboard "${d.clave}" ya existe`));
    }
    this.store.set(key(d.tenantId, d.id), clone(d));
    return ok(clone(d));
  }
  async update(_uow: UnitOfWork, d: Dashboard, expectedVersion: number): Promise<Result<Dashboard, KernelError>> {
    const prev = this.store.get(key(d.tenantId, d.id));
    if (!prev) return fail(KernelErrors.notFound("dashboard", d.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(d.tenantId, d.id), clone(d));
    return ok(clone(d));
  }
  async delete(_uow: UnitOfWork, tenantId: TenantId, id: string, expectedVersion: number): Promise<Result<void, KernelError>> {
    const prev = this.store.get(key(tenantId, id));
    if (!prev) return fail(KernelErrors.notFound("dashboard", id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.delete(key(tenantId, id));
    return ok(undefined);
  }
  async findByClave(tenantId: TenantId, clave: string): Promise<Result<Dashboard | null, KernelError>> {
    for (const d of this.store.values()) if (d.tenantId === tenantId && d.clave === clave) return ok(clone(d));
    return ok(null);
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Dashboard | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: DashboardFiltro): Promise<Result<Dashboard[], KernelError>> {
    let rows = [...this.store.values()].filter((d) => d.tenantId === tenantId);
    if (filtro.delSistema !== undefined) rows = rows.filter((d) => d.delSistema === filtro.delSistema);
    if (filtro.propietarioId) rows = rows.filter((d) => d.propietarioId === filtro.propietarioId);
    rows.sort((a, b) => (a.clave < b.clave ? -1 : 1));
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* ------------------------------- Snapshots ------------------------------- */

export class FakeSnapshotRepository implements SnapshotRepository {
  private readonly store = new Map<string, SnapshotEvaluacion>();
  private k(t: string, clave: string) { return `${t}::${clave}`; }
  async upsert(_uow: UnitOfWork, s: SnapshotEvaluacion): Promise<Result<{ snapshot: SnapshotEvaluacion; nuevo: boolean }, KernelError>> {
    const k = this.k(s.tenantId, s.claveSnapshot);
    const prev = this.store.get(k);
    if (prev) return ok({ snapshot: clone(prev), nuevo: false });
    this.store.set(k, clone(s));
    return ok({ snapshot: clone(s), nuevo: true });
  }
  async buscarPorClave(tenantId: TenantId, claveSnapshot: string): Promise<Result<SnapshotEvaluacion | null, KernelError>> {
    const f = this.store.get(this.k(tenantId, claveSnapshot));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, targetClave: string): Promise<Result<SnapshotEvaluacion[], KernelError>> {
    return ok([...this.store.values()].filter((s) => s.tenantId === tenantId && s.targetClave === targetClave).map(clone));
  }
}

/* -------------------------------- Catálogos ------------------------------ */

interface EntradaAlmacenada extends EntradaCatalogo {
  readonly habilitado: boolean;
}

export class FakeCatalogos implements CatalogoPort {
  private readonly store = new Map<string, Map<string, Map<string, EntradaAlmacenada>>>();
  private mapa(tenant: string, catalogo: NombreCatalogo): Map<string, EntradaAlmacenada> {
    let t = this.store.get(tenant);
    if (!t) { t = new Map(); this.store.set(tenant, t); }
    let c = t.get(catalogo);
    if (!c) { c = new Map(); t.set(catalogo, c); }
    return c;
  }
  async upsert(_uow: UnitOfWork, tenant: string, catalogo: NombreCatalogo, entrada: EntradaCatalogo): Promise<Result<void, KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const prev = c.get(entrada.clave);
    c.set(entrada.clave, { ...entrada, habilitado: prev?.habilitado ?? true });
    return ok(undefined);
  }
  async habilitar(_uow: UnitOfWork, tenant: string, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const prev = c.get(clave);
    if (!prev) return fail(KernelErrors.notFound(`catalogo:${catalogo}`, clave));
    c.set(clave, { ...prev, habilitado });
    return ok(undefined);
  }
  async opciones(tenant: string, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const rows = [...c.values()]
      .filter((e) => e.habilitado)
      .map((e, i) => ({ value: e.clave, label: e.etiqueta, posicion: e.posicion ?? i, padre: e.padre ?? null }))
      .sort((a, b) => a.posicion - b.posicion);
    return ok(rows);
  }
  async contarEntradas(tenant: string, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    return ok(this.mapa(tenant, catalogo).size);
  }
  async validarReferencia(tenant: string, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    const valor = clave ?? "";
    if (valor === "") {
      return obligatorio ? fail(KernelErrors.validation(`La referencia a "${catalogo}" es obligatoria`)) : ok(undefined);
    }
    const c = this.mapa(tenant, catalogo);
    if (c.size === 0) {
      const canonicos = CANONICOS_POR_CATALOGO[catalogo];
      if (!canonicos || canonicos.length === 0) return ok(undefined);
      return canonicos.includes(valor)
        ? ok(undefined)
        : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
    }
    const e = c.get(valor);
    if (!e) return fail(KernelErrors.validation(`"${valor}" no existe en el catálogo "${catalogo}"`));
    if (!e.habilitado) return fail(KernelErrors.validation(`"${valor}" está deshabilitado en "${catalogo}"`));
    return ok(undefined);
  }
}

/* ------------------------- Recibos de idempotencia ----------------------- */

export class FakeRecibos implements ReciboPort {
  private readonly store = new Map<string, Recibo>();
  private k(tenant: string, comando: string, opId: string) { return `${tenant}::${comando}::${opId}`; }
  async buscar(tenant: string, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    const f = this.store.get(this.k(tenant, comando, opId));
    return ok(f ? clone(f) : null);
  }
  async sellar(_uow: UnitOfWork, tenant: string, recibo: Recibo): Promise<Result<void, KernelError>> {
    this.store.set(this.k(tenant, recibo.comando, recibo.opId), clone(recibo));
    return ok(undefined);
  }
}

/* ------------------------------- Event log ------------------------------- */

export class FakeEventLogStore implements EventLogStore {
  private readonly store = new Map<string, EventoDurable[]>();
  async append(_uow: UnitOfWork, e: EventoDurable): Promise<Result<void, KernelError>> {
    const list = this.store.get(e.tenantId) ?? [];
    if (list.some((x) => x.eventId === e.eventId)) return ok(undefined);
    list.push(clone(e));
    this.store.set(e.tenantId, list);
    return ok(undefined);
  }
  async listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>> {
    return ok((this.store.get(tenantId) ?? []).map(clone));
  }
}

/* --------------------------- Fuentes read-only --------------------------- */

/**
 * Fuente de hechos EN MEMORIA: sirve series por dataset. En Etapa 2 estas fuentes
 * envolverán los contratos públicos reales de cada módulo. Aquí son RICAS: aceptan
 * datos por dataset y aplican un push-down básico de rango de fecha.
 */
export class FakeFuente implements FuenteHechos {
  private readonly series = new Map<string, Hecho[]>();
  constructor(datos: Record<string, readonly Hecho[]> = {}) {
    for (const [ds, filas] of Object.entries(datos)) this.series.set(ds, filas.map(clone));
  }
  /** Alimenta/sobrescribe un dataset (helper de pruebas). */
  sembrar(dataset: string, filas: readonly Hecho[]): void {
    this.series.set(dataset, filas.map(clone));
  }
  datasets(): readonly string[] {
    return [...this.series.keys()];
  }
  async hechos(_tenantId: TenantId, criterio: CriterioFuente): Promise<Result<Hecho[], KernelError>> {
    const filas = this.series.get(criterio.dataset);
    if (!filas) return ok([]);
    let rows = filas.map(clone);
    if (criterio.limite && criterio.limite > 0) rows = rows.slice(0, criterio.limite);
    return ok(rows);
  }
}

/* ------------------------------- Ensamblaje ------------------------------ */

export interface FakeAdapters {
  readonly definiciones: FakeDefinicionRepository;
  readonly dashboards: FakeDashboardRepository;
  readonly snapshots: FakeSnapshotRepository;
  readonly catalogos: FakeCatalogos;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    definiciones: new FakeDefinicionRepository(),
    dashboards: new FakeDashboardRepository(),
    snapshots: new FakeSnapshotRepository(),
    catalogos: new FakeCatalogos(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
