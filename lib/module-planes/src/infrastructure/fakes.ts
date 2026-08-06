/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — FAKES en memoria de los PUERTOS.
 *
 * NO son infraestructura de producción: implementaciones en memoria (Map) 100%
 * deterministas para pruebas de dominio y para el harness. Los adaptadores
 * concretos (PostgreSQL / Record Store / motor de workflow) llegan en la etapa 2.
 *
 * IMPORTANTE (gobierno): estos fakes NO incluyen ningún `WorkflowPort`. El
 * adaptador de workflow lo provee el ensamblaje; sin un `WorkflowPort` aprobado,
 * los comandos gobernados fallan de forma segura. Un `WorkflowPort` de PRUEBA
 * vive EXCLUSIVAMENTE en `test-runtime.ts`, jamás aquí como modo por defecto.
 */
import { ok, fail, KernelErrors, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import { crearCodigoPlan, type CodigoPlan } from "../domain/value-objects";
import type { PlanMantenimiento } from "../domain/plan";
import type { CalendarioOperacional } from "../domain/calendario";
import type { GeneracionOrden } from "../domain/generacion";
import type { HistorialPlan } from "../domain/suspension";
import type {
  CalendarioRepository,
  CatalogoPort,
  ConfigCodigo,
  ConsecutivoPort,
  EventLogStore,
  EventoDurable,
  GeneracionRepository,
  HistorialRepository,
  OpcionCatalogo,
  PlanFiltro,
  PlanRepository,
  Recibo,
  ReciboPort,
  TenantId,
} from "../domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* --------------------------------- Planes -------------------------------- */

export class FakePlanRepository implements PlanRepository {
  private readonly store = new Map<string, PlanMantenimiento>();
  async insert(_uow: UnitOfWork, plan: PlanMantenimiento): Promise<Result<PlanMantenimiento, KernelError>> {
    if (this.store.has(key(plan.tenantId, plan.id))) return fail(KernelErrors.conflict(`El plan ${plan.id} ya existe`));
    for (const p of this.store.values()) {
      if (p.tenantId === plan.tenantId && p.codigo === plan.codigo) {
        return fail(KernelErrors.conflict(`El código de plan ${plan.codigo} ya existe`));
      }
    }
    this.store.set(key(plan.tenantId, plan.id), clone(plan));
    return ok(clone(plan));
  }
  async update(_uow: UnitOfWork, plan: PlanMantenimiento, expectedVersion: number): Promise<Result<PlanMantenimiento, KernelError>> {
    const prev = this.store.get(key(plan.tenantId, plan.id));
    if (!prev) return fail(KernelErrors.notFound("plan-mantenimiento", plan.id));
    if (prev.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    }
    this.store.set(key(plan.tenantId, plan.id), clone(plan));
    return ok(clone(plan));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<PlanMantenimiento | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: PlanFiltro): Promise<Result<PlanMantenimiento[], KernelError>> {
    let rows = [...this.store.values()].filter((p) => p.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((p) => p.estado === filtro.estado);
    if (filtro.tipoPlan) rows = rows.filter((p) => p.tipoPlan === filtro.tipoPlan);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* ------------------------------- Calendarios ----------------------------- */

export class FakeCalendarioRepository implements CalendarioRepository {
  private readonly store = new Map<string, CalendarioOperacional>();
  async insert(_uow: UnitOfWork, cal: CalendarioOperacional): Promise<Result<CalendarioOperacional, KernelError>> {
    if (this.store.has(key(cal.tenantId, cal.id))) return fail(KernelErrors.conflict(`El calendario ${cal.id} ya existe`));
    this.store.set(key(cal.tenantId, cal.id), clone(cal));
    return ok(clone(cal));
  }
  async update(_uow: UnitOfWork, cal: CalendarioOperacional, expectedVersion: number): Promise<Result<CalendarioOperacional, KernelError>> {
    const prev = this.store.get(key(cal.tenantId, cal.id));
    if (!prev) return fail(KernelErrors.notFound("calendario-operacional", cal.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict("Conflicto de versión de calendario"));
    this.store.set(key(cal.tenantId, cal.id), clone(cal));
    return ok(clone(cal));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<CalendarioOperacional | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
}

/* ------------------------------ Generaciones ----------------------------- */

export class FakeGeneracionRepository implements GeneracionRepository {
  private readonly store = new Map<string, GeneracionOrden>();
  private readonly porClave = new Map<string, string>();
  async insert(_uow: UnitOfWork, g: GeneracionOrden): Promise<Result<GeneracionOrden, KernelError>> {
    const ck = key(g.tenantId, g.claveDedup);
    if (this.porClave.has(ck)) return fail(KernelErrors.conflict(`Ya existe una generación con clave ${g.claveDedup}`));
    this.store.set(key(g.tenantId, g.id), clone(g));
    this.porClave.set(ck, g.id);
    return ok(clone(g));
  }
  async findByClaveDedup(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrden | null, KernelError>> {
    const id = this.porClave.get(key(tenantId, claveDedup));
    if (!id) return ok(null);
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async listPorPlan(tenantId: TenantId, planId: string): Promise<Result<GeneracionOrden[], KernelError>> {
    return ok([...this.store.values()].filter((g) => g.tenantId === tenantId && g.planId === planId).map(clone));
  }
  async linkOrden(_uow: UnitOfWork, tenantId: TenantId, generacionId: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>> {
    const f = this.store.get(key(tenantId, generacionId));
    if (!f) return fail(KernelErrors.notFound("generacion-orden", generacionId));
    if (f.ordenTrabajoId) return ok(false); // ya vinculada ⇒ idempotente
    this.store.set(key(tenantId, generacionId), clone({ ...f, ordenTrabajoId, estado: "materializada" }));
    return ok(true);
  }
}

/* -------------------------------- Historial ------------------------------ */

export class FakeHistorialRepository implements HistorialRepository {
  private readonly store = new Map<string, HistorialPlan[]>();
  async append(_uow: UnitOfWork, h: HistorialPlan): Promise<Result<HistorialPlan, KernelError>> {
    const k = key(h.id.split("::")[0] ?? "", h.planId);
    const list = this.store.get(h.planId) ?? [];
    list.push(clone(h));
    this.store.set(h.planId, list);
    void k;
    return ok(clone(h));
  }
  async listPorPlan(_tenantId: TenantId, planId: string): Promise<Result<HistorialPlan[], KernelError>> {
    return ok((this.store.get(planId) ?? []).map(clone));
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
      if (!canonicos || canonicos.length === 0) return ok(undefined); // forma libre
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

/* ------------------------------- Consecutivo ----------------------------- */

export class FakeConsecutivo implements ConsecutivoPort {
  private readonly contadores = new Map<string, number>();
  async siguiente(_uow: UnitOfWork, tenant: string, cfg: ConfigCodigo): Promise<Result<CodigoPlan, KernelError>> {
    const k = `${tenant}::${cfg.serie}`;
    const secuencia = (this.contadores.get(k) ?? 0) + 1;
    this.contadores.set(k, secuencia);
    const relleno = String(secuencia).padStart(cfg.padding, "0");
    return crearCodigoPlan({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
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
    // Idempotencia por eventId (at-least-once en el outbox).
    if (list.some((x) => x.eventId === e.eventId)) return ok(undefined);
    list.push(clone(e));
    this.store.set(e.tenantId, list);
    return ok(undefined);
  }
  async listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>> {
    return ok((this.store.get(tenantId) ?? []).map(clone));
  }
}

/* ------------------------------- Ensamblaje ------------------------------ */

export interface FakeAdapters {
  readonly planes: FakePlanRepository;
  readonly calendarios: FakeCalendarioRepository;
  readonly generaciones: FakeGeneracionRepository;
  readonly historial: FakeHistorialRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    planes: new FakePlanRepository(),
    calendarios: new FakeCalendarioRepository(),
    generaciones: new FakeGeneracionRepository(),
    historial: new FakeHistorialRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
