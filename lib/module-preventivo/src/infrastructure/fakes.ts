/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — FAKES en memoria de PUERTOS.
 *
 * NO son infraestructura de producción: implementaciones en memoria (Map) 100%
 * deterministas para pruebas de dominio y para el harness. Los adaptadores
 * concretos (PostgreSQL / read models CQRS / Workflow Engine / composición con
 * Planes/Activos/Órdenes) llegan en la ETAPA 2.
 *
 * IMPORTANTE (gobierno): estos fakes NO incluyen ningún `WorkflowPort`. El
 * adaptador de workflow lo provee el ensamblaje; sin un `WorkflowPort` aprobado,
 * los comandos gobernados fallan de forma segura. Un `WorkflowPort` de PRUEBA
 * vive EXCLUSIVAMENTE en `test-runtime.ts`, jamás aquí como modo por defecto.
 */
import { ok, fail, KernelErrors, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type { ProgramaPreventivo } from "../domain/programa";
import type { ActividadPreventiva } from "../domain/actividad";
import type { GeneracionPreventiva } from "../domain/generacion";
import type { HistorialPreventivo } from "../domain/historial";
import type {
  ActividadRepository,
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  EventLogStore,
  EventoDurable,
  GeneracionDedupStore,
  GeneracionRepository,
  HistorialRepository,
  OpcionCatalogo,
  ProgramaFiltro,
  ProgramaRepository,
  ProgramaVersionRepository,
  Recibo,
  ReciboPort,
  TenantId,
} from "../domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* -------------------------------- Programas ------------------------------ */

export class FakeProgramaRepository implements ProgramaRepository {
  private readonly store = new Map<string, ProgramaPreventivo>();
  async insert(_uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<ProgramaPreventivo, KernelError>> {
    if (this.store.has(key(p.tenantId, p.id))) return fail(KernelErrors.conflict(`El programa ${p.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === p.tenantId && x.codigo === p.codigo) return fail(KernelErrors.conflict(`El código de programa ${p.codigo} ya existe`));
    }
    this.store.set(key(p.tenantId, p.id), clone(p));
    return ok(clone(p));
  }
  async update(_uow: UnitOfWork, p: ProgramaPreventivo, expectedVersion: number): Promise<Result<ProgramaPreventivo, KernelError>> {
    const prev = this.store.get(key(p.tenantId, p.id));
    if (!prev) return fail(KernelErrors.notFound("programa-preventivo", p.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(p.tenantId, p.id), clone(p));
    return ok(clone(p));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<ProgramaPreventivo | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: ProgramaFiltro): Promise<Result<ProgramaPreventivo[], KernelError>> {
    let rows = [...this.store.values()].filter((p) => p.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((p) => p.estado === filtro.estado);
    if (filtro.tipo) rows = rows.filter((p) => p.tipo === filtro.tipo);
    if (filtro.padreId !== undefined) rows = rows.filter((p) => p.padreId === filtro.padreId);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
  async mapaPadres(tenantId: TenantId): Promise<Result<Map<string, string | null>, KernelError>> {
    const m = new Map<string, string | null>();
    for (const p of this.store.values()) if (p.tenantId === tenantId) m.set(p.id, p.padreId);
    return ok(m);
  }
}

/* ---------------------------- Versiones históricas ----------------------- */

export class FakeProgramaVersionRepository implements ProgramaVersionRepository {
  private readonly store = new Map<string, ProgramaPreventivo>();
  private k(t: string, id: string, v: number) { return `${t}::${id}::v${v}`; }
  async guardar(_uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<void, KernelError>> {
    this.store.set(this.k(p.tenantId, p.id, p.versionPrograma), clone(p));
    return ok(undefined);
  }
  async buscarVersion(tenantId: TenantId, programaId: string, versionPrograma: number): Promise<Result<ProgramaPreventivo | null, KernelError>> {
    const f = this.store.get(this.k(tenantId, programaId, versionPrograma));
    return ok(f ? clone(f) : null);
  }
  async listarVersiones(tenantId: TenantId, programaId: string): Promise<Result<ProgramaPreventivo[], KernelError>> {
    return ok(
      [...this.store.values()]
        .filter((p) => p.tenantId === tenantId && p.id === programaId)
        .sort((a, b) => a.versionPrograma - b.versionPrograma)
        .map(clone),
    );
  }
}

/* ------------------------------- Actividades ----------------------------- */

export class FakeActividadRepository implements ActividadRepository {
  private readonly store = new Map<string, ActividadPreventiva>();
  async insert(_uow: UnitOfWork, a: ActividadPreventiva): Promise<Result<ActividadPreventiva, KernelError>> {
    if (this.store.has(key(a.tenantId, a.id))) return fail(KernelErrors.conflict(`La actividad ${a.id} ya existe`));
    this.store.set(key(a.tenantId, a.id), clone(a));
    return ok(clone(a));
  }
  async update(_uow: UnitOfWork, a: ActividadPreventiva, expectedVersion: number): Promise<Result<ActividadPreventiva, KernelError>> {
    const prev = this.store.get(key(a.tenantId, a.id));
    if (!prev) return fail(KernelErrors.notFound("actividad-preventiva", a.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(a.tenantId, a.id), clone(a));
    return ok(clone(a));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<ActividadPreventiva | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<ActividadPreventiva[], KernelError>> {
    return ok(
      [...this.store.values()]
        .filter((a) => a.tenantId === tenantId && a.programaId === programaId)
        .sort((a, b) => a.orden - b.orden)
        .map(clone),
    );
  }
}

/* -------------------------------- Generación ----------------------------- */

export class FakeGeneracionRepository implements GeneracionRepository {
  private readonly store = new Map<string, GeneracionPreventiva>();
  async insert(_uow: UnitOfWork, g: GeneracionPreventiva): Promise<Result<GeneracionPreventiva, KernelError>> {
    if (this.store.has(key(g.tenantId, g.id))) return fail(KernelErrors.conflict(`La generación ${g.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === g.tenantId && x.claveDedup === g.claveDedup) {
        return fail(KernelErrors.conflict(`Ya existe una generación para la clave "${g.claveDedup}"`));
      }
    }
    this.store.set(key(g.tenantId, g.id), clone(g));
    return ok(clone(g));
  }
  async update(_uow: UnitOfWork, g: GeneracionPreventiva, expectedVersion: number): Promise<Result<GeneracionPreventiva, KernelError>> {
    const prev = this.store.get(key(g.tenantId, g.id));
    if (!prev) return fail(KernelErrors.notFound("generacion-preventiva", g.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(g.tenantId, g.id), clone(g));
    return ok(clone(g));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<GeneracionPreventiva | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionPreventiva | null, KernelError>> {
    for (const g of this.store.values()) if (g.tenantId === tenantId && g.claveDedup === claveDedup) return ok(clone(g));
    return ok(null);
  }
  async listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<GeneracionPreventiva[], KernelError>> {
    return ok([...this.store.values()].filter((g) => g.tenantId === tenantId && g.programaId === programaId).map(clone));
  }
}

/* ------------------------- Guard dedup de generación --------------------- */

export class FakeGeneracionDedupStore implements GeneracionDedupStore {
  private readonly rows = new Map<string, { generacionId: string; ordenTrabajoId: string | null }>();
  private k(t: string, clave: string) { return `${t}::${clave}`; }
  async reservar(_uow: UnitOfWork, tenantId: TenantId, claveDedup: string, generacionId: string): Promise<Result<boolean, KernelError>> {
    const k = this.k(tenantId, claveDedup);
    if (this.rows.has(k)) return ok(false);
    this.rows.set(k, { generacionId, ordenTrabajoId: null });
    return ok(true);
  }
  async vincular(_uow: UnitOfWork, tenantId: TenantId, claveDedup: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>> {
    const k = this.k(tenantId, claveDedup);
    const cur = this.rows.get(k);
    if (!cur || cur.ordenTrabajoId != null) return ok(false);
    this.rows.set(k, { ...cur, ordenTrabajoId });
    return ok(true);
  }
  async buscar(tenantId: TenantId, claveDedup: string): Promise<Result<{ generacionId: string; ordenTrabajoId: string | null } | null, KernelError>> {
    return ok(this.rows.get(this.k(tenantId, claveDedup)) ?? null);
  }
}

/* -------------------------------- Historial ------------------------------ */

export class FakeHistorialRepository implements HistorialRepository {
  private readonly store = new Map<string, HistorialPreventivo[]>();
  async append(_uow: UnitOfWork, h: HistorialPreventivo): Promise<Result<HistorialPreventivo, KernelError>> {
    const list = this.store.get(h.entityRef) ?? [];
    list.push(clone(h));
    this.store.set(h.entityRef, list);
    return ok(clone(h));
  }
  async listPorEntidad(_tenantId: TenantId, entityRef: string): Promise<Result<HistorialPreventivo[], KernelError>> {
    return ok((this.store.get(entityRef) ?? []).map(clone));
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
  async siguiente(_uow: UnitOfWork, tenant: string, cfg: ConfigCodigo): Promise<Result<Consecutivo, KernelError>> {
    const k = `${tenant}::${cfg.serie}`;
    const secuencia = (this.contadores.get(k) ?? 0) + 1;
    this.contadores.set(k, secuencia);
    const relleno = String(secuencia).padStart(cfg.padding, "0");
    return ok({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
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
    if (list.some((x) => x.eventId === e.eventId)) return ok(undefined); // idempotencia por eventId
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
  readonly programas: FakeProgramaRepository;
  readonly versiones: FakeProgramaVersionRepository;
  readonly actividades: FakeActividadRepository;
  readonly generaciones: FakeGeneracionRepository;
  readonly dedup: FakeGeneracionDedupStore;
  readonly historial: FakeHistorialRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    programas: new FakeProgramaRepository(),
    versiones: new FakeProgramaVersionRepository(),
    actividades: new FakeActividadRepository(),
    generaciones: new FakeGeneracionRepository(),
    dedup: new FakeGeneracionDedupStore(),
    historial: new FakeHistorialRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
