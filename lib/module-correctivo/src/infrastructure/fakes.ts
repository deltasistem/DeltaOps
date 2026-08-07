/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — FAKES en memoria de PUERTOS.
 *
 * NO son infraestructura de producción: implementaciones en memoria (Map) 100%
 * deterministas para pruebas de dominio y para el harness. Los adaptadores
 * concretos (PostgreSQL / read models / Workflow Engine / composición con
 * Activos/Órdenes/Inventario/Abastecimiento/Dynamic Forms) llegan en la ETAPA 2.
 *
 * IMPORTANTE (gobierno): estos fakes NO incluyen ningún `WorkflowPort`. El
 * adaptador de workflow lo provee el ensamblaje; sin un `WorkflowPort` aprobado,
 * los comandos gobernados fallan de forma segura. Un `WorkflowPort` de PRUEBA
 * vive EXCLUSIVAMENTE en `test-runtime.ts`, jamás aquí como modo por defecto.
 */
import { ok, fail, KernelErrors, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type { SolicitudMantenimiento } from "../domain/solicitud";
import type { Diagnostico } from "../domain/diagnostico";
import type { Intervencion } from "../domain/intervencion";
import type { GeneracionOrdenCorrectiva } from "../domain/orden-correctiva";
import type { HistorialCorrectivo } from "../domain/historial";
import type { EventoActivo } from "../domain/eventos-activo";
import type {
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  DiagnosticoRepository,
  EventLogStore,
  EventoActivoRepository,
  EventoDurable,
  GeneracionDedupStore,
  GeneracionRepository,
  HistorialRepository,
  IntervencionRepository,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  SolicitudFiltro,
  SolicitudRepository,
  TenantId,
} from "../domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* ------------------------------- Solicitudes ----------------------------- */

export class FakeSolicitudRepository implements SolicitudRepository {
  private readonly store = new Map<string, SolicitudMantenimiento>();
  async insert(_uow: UnitOfWork, s: SolicitudMantenimiento): Promise<Result<SolicitudMantenimiento, KernelError>> {
    if (this.store.has(key(s.tenantId, s.id))) return fail(KernelErrors.conflict(`La solicitud ${s.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === s.tenantId && x.codigo === s.codigo) return fail(KernelErrors.conflict(`El código de solicitud ${s.codigo} ya existe`));
    }
    this.store.set(key(s.tenantId, s.id), clone(s));
    return ok(clone(s));
  }
  async update(_uow: UnitOfWork, s: SolicitudMantenimiento, expectedVersion: number): Promise<Result<SolicitudMantenimiento, KernelError>> {
    const prev = this.store.get(key(s.tenantId, s.id));
    if (!prev) return fail(KernelErrors.notFound("solicitud-correctiva", s.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(s.tenantId, s.id), clone(s));
    return ok(clone(s));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<SolicitudMantenimiento | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudMantenimiento[], KernelError>> {
    let rows = [...this.store.values()].filter((s) => s.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((s) => s.estado === filtro.estado);
    if (filtro.origen) rows = rows.filter((s) => s.origen === filtro.origen);
    if (filtro.activoId) rows = rows.filter((s) => s.objeto.activoId === filtro.activoId);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* ------------------------------- Diagnósticos ---------------------------- */

export class FakeDiagnosticoRepository implements DiagnosticoRepository {
  private readonly store = new Map<string, Diagnostico>();
  async insert(_uow: UnitOfWork, d: Diagnostico): Promise<Result<Diagnostico, KernelError>> {
    if (this.store.has(key(d.tenantId, d.id))) return fail(KernelErrors.conflict(`El diagnóstico ${d.id} ya existe`));
    this.store.set(key(d.tenantId, d.id), clone(d));
    return ok(clone(d));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Diagnostico | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Diagnostico | null, KernelError>> {
    for (const d of this.store.values()) if (d.tenantId === tenantId && d.solicitudId === solicitudId) return ok(clone(d));
    return ok(null);
  }
}

/* ------------------------------ Intervenciones --------------------------- */

export class FakeIntervencionRepository implements IntervencionRepository {
  private readonly store = new Map<string, Intervencion>();
  async insert(_uow: UnitOfWork, i: Intervencion): Promise<Result<Intervencion, KernelError>> {
    if (this.store.has(key(i.tenantId, i.id))) return fail(KernelErrors.conflict(`La intervención ${i.id} ya existe`));
    this.store.set(key(i.tenantId, i.id), clone(i));
    return ok(clone(i));
  }
  async update(_uow: UnitOfWork, i: Intervencion, expectedVersion: number): Promise<Result<Intervencion, KernelError>> {
    const prev = this.store.get(key(i.tenantId, i.id));
    if (!prev) return fail(KernelErrors.notFound("intervencion-correctiva", i.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(i.tenantId, i.id), clone(i));
    return ok(clone(i));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Intervencion | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Intervencion | null, KernelError>> {
    for (const i of this.store.values()) if (i.tenantId === tenantId && i.solicitudId === solicitudId) return ok(clone(i));
    return ok(null);
  }
}

/* -------------------------------- Generación ----------------------------- */

export class FakeGeneracionRepository implements GeneracionRepository {
  private readonly store = new Map<string, GeneracionOrdenCorrectiva>();
  async insert(_uow: UnitOfWork, g: GeneracionOrdenCorrectiva): Promise<Result<GeneracionOrdenCorrectiva, KernelError>> {
    if (this.store.has(key(g.tenantId, g.id))) return fail(KernelErrors.conflict(`La generación ${g.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === g.tenantId && x.claveDedup === g.claveDedup) {
        return fail(KernelErrors.conflict(`Ya existe una generación para la clave "${g.claveDedup}"`));
      }
    }
    this.store.set(key(g.tenantId, g.id), clone(g));
    return ok(clone(g));
  }
  async update(_uow: UnitOfWork, g: GeneracionOrdenCorrectiva, expectedVersion: number): Promise<Result<GeneracionOrdenCorrectiva, KernelError>> {
    const prev = this.store.get(key(g.tenantId, g.id));
    if (!prev) return fail(KernelErrors.notFound("generacion-correctiva", g.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(g.tenantId, g.id), clone(g));
    return ok(clone(g));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>> {
    for (const g of this.store.values()) if (g.tenantId === tenantId && g.claveDedup === claveDedup) return ok(clone(g));
    return ok(null);
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
  private readonly store = new Map<string, HistorialCorrectivo[]>();
  async append(_uow: UnitOfWork, h: HistorialCorrectivo): Promise<Result<HistorialCorrectivo, KernelError>> {
    const list = this.store.get(h.entityRef) ?? [];
    list.push(clone(h));
    this.store.set(h.entityRef, list);
    return ok(clone(h));
  }
  async listPorEntidad(_tenantId: TenantId, entityRef: string): Promise<Result<HistorialCorrectivo[], KernelError>> {
    return ok((this.store.get(entityRef) ?? []).map(clone));
  }
}

/* ---------------------------- Eventos de activo -------------------------- */

export class FakeEventoActivoRepository implements EventoActivoRepository {
  private readonly store = new Map<string, EventoActivo[]>();
  private k(t: string, activoId: string) { return `${t}::${activoId}`; }
  async append(_uow: UnitOfWork, e: EventoActivo): Promise<Result<EventoActivo, KernelError>> {
    const k = this.k(e.tenantId, e.activoId);
    const list = this.store.get(k) ?? [];
    list.push(clone(e));
    this.store.set(k, list);
    return ok(clone(e));
  }
  async listPorActivo(tenantId: TenantId, activoId: string): Promise<Result<EventoActivo[], KernelError>> {
    return ok((this.store.get(this.k(tenantId, activoId)) ?? []).map(clone));
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
  readonly solicitudes: FakeSolicitudRepository;
  readonly diagnosticos: FakeDiagnosticoRepository;
  readonly intervenciones: FakeIntervencionRepository;
  readonly generaciones: FakeGeneracionRepository;
  readonly dedup: FakeGeneracionDedupStore;
  readonly historial: FakeHistorialRepository;
  readonly eventosActivo: FakeEventoActivoRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    solicitudes: new FakeSolicitudRepository(),
    diagnosticos: new FakeDiagnosticoRepository(),
    intervenciones: new FakeIntervencionRepository(),
    generaciones: new FakeGeneracionRepository(),
    dedup: new FakeGeneracionDedupStore(),
    historial: new FakeHistorialRepository(),
    eventosActivo: new FakeEventoActivoRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
