/**
 * DGP-013 · Módulo Enterprise Procurement — FAKES en memoria de los PUERTOS.
 *
 * NO son infraestructura de producción: implementaciones en memoria (Map) 100%
 * deterministas para pruebas de dominio y para el harness. Los adaptadores
 * concretos (PostgreSQL / read models CQRS / motor de workflow) llegan en la
 * etapa 2.
 *
 * IMPORTANTE (gobierno): estos fakes NO incluyen ningún `WorkflowPort`. El
 * adaptador de workflow lo provee el ensamblaje; sin un `WorkflowPort` aprobado,
 * los comandos gobernados fallan de forma segura. Un `WorkflowPort` de PRUEBA
 * vive EXCLUSIVAMENTE en `test-runtime.ts`, jamás aquí como modo por defecto.
 */
import { ok, fail, KernelErrors, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type { CatalogoArticulo } from "../domain/articulo";
import type { Proveedor } from "../domain/proveedor";
import type { SolicitudCompra } from "../domain/solicitud";
import type { Cotizacion } from "../domain/cotizacion";
import type { OrdenCompra } from "../domain/orden-compra";
import type { Recepcion } from "../domain/recepcion";
import type { HistorialAbastecimiento } from "../domain/historial";
import type {
  ArticuloFiltro,
  ArticuloRepository,
  CatalogoPort,
  ConfigCodigo,
  Consecutivo,
  ConsecutivoPort,
  CotizacionRepository,
  EventLogStore,
  EventoDurable,
  HistorialRepository,
  OpcionCatalogo,
  OrdenCompraFiltro,
  OrdenCompraRepository,
  ProveedorFiltro,
  ProveedorRepository,
  Recibo,
  ReciboPort,
  RecepcionRepository,
  SolicitudFiltro,
  SolicitudRepository,
  TenantId,
  EstadoMaterializacion,
  MaterializacionStore,
  RegistroMaterializacion,
} from "../domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* --------------------------------- Artículos ----------------------------- */

export class FakeArticuloRepository implements ArticuloRepository {
  private readonly store = new Map<string, CatalogoArticulo>();
  async insert(_uow: UnitOfWork, a: CatalogoArticulo): Promise<Result<CatalogoArticulo, KernelError>> {
    if (this.store.has(key(a.tenantId, a.id))) return fail(KernelErrors.conflict(`El artículo ${a.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === a.tenantId && x.codigo === a.codigo) return fail(KernelErrors.conflict(`El código de artículo ${a.codigo} ya existe`));
    }
    this.store.set(key(a.tenantId, a.id), clone(a));
    return ok(clone(a));
  }
  async update(_uow: UnitOfWork, a: CatalogoArticulo, expectedVersion: number): Promise<Result<CatalogoArticulo, KernelError>> {
    const prev = this.store.get(key(a.tenantId, a.id));
    if (!prev) return fail(KernelErrors.notFound("catalogo-articulo", a.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(a.tenantId, a.id), clone(a));
    return ok(clone(a));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<CatalogoArticulo | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: ArticuloFiltro): Promise<Result<CatalogoArticulo[], KernelError>> {
    let rows = [...this.store.values()].filter((a) => a.tenantId === tenantId);
    if (filtro.tipo) rows = rows.filter((a) => a.tipo === filtro.tipo);
    if (filtro.familia) rows = rows.filter((a) => a.familia === filtro.familia);
    if (filtro.activo !== undefined) rows = rows.filter((a) => a.activo === filtro.activo);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* -------------------------------- Proveedores ---------------------------- */

export class FakeProveedorRepository implements ProveedorRepository {
  private readonly store = new Map<string, Proveedor>();
  async insert(_uow: UnitOfWork, p: Proveedor): Promise<Result<Proveedor, KernelError>> {
    if (this.store.has(key(p.tenantId, p.id))) return fail(KernelErrors.conflict(`El proveedor ${p.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === p.tenantId && x.codigo === p.codigo) return fail(KernelErrors.conflict(`El código de proveedor ${p.codigo} ya existe`));
    }
    this.store.set(key(p.tenantId, p.id), clone(p));
    return ok(clone(p));
  }
  async update(_uow: UnitOfWork, p: Proveedor, expectedVersion: number): Promise<Result<Proveedor, KernelError>> {
    const prev = this.store.get(key(p.tenantId, p.id));
    if (!prev) return fail(KernelErrors.notFound("proveedor", p.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(p.tenantId, p.id), clone(p));
    return ok(clone(p));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Proveedor | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: ProveedorFiltro): Promise<Result<Proveedor[], KernelError>> {
    let rows = [...this.store.values()].filter((p) => p.tenantId === tenantId);
    if (filtro.tipo) rows = rows.filter((p) => p.tipo === filtro.tipo);
    if (filtro.activo !== undefined) rows = rows.filter((p) => p.activo === filtro.activo);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* -------------------------------- Solicitudes ---------------------------- */

export class FakeSolicitudRepository implements SolicitudRepository {
  private readonly store = new Map<string, SolicitudCompra>();
  async insert(_uow: UnitOfWork, s: SolicitudCompra): Promise<Result<SolicitudCompra, KernelError>> {
    if (this.store.has(key(s.tenantId, s.id))) return fail(KernelErrors.conflict(`La solicitud ${s.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === s.tenantId && x.codigo === s.codigo) return fail(KernelErrors.conflict(`El código de solicitud ${s.codigo} ya existe`));
    }
    this.store.set(key(s.tenantId, s.id), clone(s));
    return ok(clone(s));
  }
  async update(_uow: UnitOfWork, s: SolicitudCompra, expectedVersion: number): Promise<Result<SolicitudCompra, KernelError>> {
    const prev = this.store.get(key(s.tenantId, s.id));
    if (!prev) return fail(KernelErrors.notFound("solicitud-compra", s.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(s.tenantId, s.id), clone(s));
    return ok(clone(s));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<SolicitudCompra | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudCompra[], KernelError>> {
    let rows = [...this.store.values()].filter((s) => s.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((s) => s.estado === filtro.estado);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* -------------------------------- Cotizaciones --------------------------- */

export class FakeCotizacionRepository implements CotizacionRepository {
  private readonly store = new Map<string, Cotizacion>();
  async insert(_uow: UnitOfWork, c: Cotizacion): Promise<Result<Cotizacion, KernelError>> {
    if (this.store.has(key(c.tenantId, c.id))) return fail(KernelErrors.conflict(`La cotización ${c.id} ya existe`));
    this.store.set(key(c.tenantId, c.id), clone(c));
    return ok(clone(c));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Cotizacion | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async listPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Cotizacion[], KernelError>> {
    return ok([...this.store.values()].filter((c) => c.tenantId === tenantId && c.solicitudId === solicitudId).map(clone));
  }
}

/* ----------------------------- Órdenes de compra ------------------------- */

export class FakeOrdenCompraRepository implements OrdenCompraRepository {
  private readonly store = new Map<string, OrdenCompra>();
  async insert(_uow: UnitOfWork, o: OrdenCompra): Promise<Result<OrdenCompra, KernelError>> {
    if (this.store.has(key(o.tenantId, o.id))) return fail(KernelErrors.conflict(`La OC ${o.id} ya existe`));
    for (const x of this.store.values()) {
      if (x.tenantId === o.tenantId && x.codigo === o.codigo) return fail(KernelErrors.conflict(`El código de OC ${o.codigo} ya existe`));
    }
    this.store.set(key(o.tenantId, o.id), clone(o));
    return ok(clone(o));
  }
  async update(_uow: UnitOfWork, o: OrdenCompra, expectedVersion: number): Promise<Result<OrdenCompra, KernelError>> {
    const prev = this.store.get(key(o.tenantId, o.id));
    if (!prev) return fail(KernelErrors.notFound("orden-compra", o.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    this.store.set(key(o.tenantId, o.id), clone(o));
    return ok(clone(o));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<OrdenCompra | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async list(tenantId: TenantId, filtro: OrdenCompraFiltro): Promise<Result<OrdenCompra[], KernelError>> {
    let rows = [...this.store.values()].filter((o) => o.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((o) => o.estado === filtro.estado);
    if (filtro.proveedorId) rows = rows.filter((o) => o.proveedorId === filtro.proveedorId);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* -------------------------------- Recepciones ---------------------------- */

export class FakeRecepcionRepository implements RecepcionRepository {
  private readonly store = new Map<string, Recepcion>();
  async insert(_uow: UnitOfWork, r: Recepcion): Promise<Result<Recepcion, KernelError>> {
    if (this.store.has(key(r.tenantId, r.id))) return fail(KernelErrors.conflict(`La recepción ${r.id} ya existe`));
    this.store.set(key(r.tenantId, r.id), clone(r));
    return ok(clone(r));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Recepcion | null, KernelError>> {
    const r = this.store.get(key(tenantId, id));
    return ok(r ? clone(r) : null);
  }
  async contarPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<number, KernelError>> {
    return ok([...this.store.values()].filter((r) => r.tenantId === tenantId && r.ordenCompraId === ordenCompraId).length);
  }
  async listPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<Recepcion[], KernelError>> {
    return ok(
      [...this.store.values()]
        .filter((r) => r.tenantId === tenantId && r.ordenCompraId === ordenCompraId)
        .sort((a, b) => a.consecutivo - b.consecutivo)
        .map(clone),
    );
  }
}

/* -------------------------------- Historial ------------------------------ */

export class FakeHistorialRepository implements HistorialRepository {
  private readonly store = new Map<string, HistorialAbastecimiento[]>();
  async append(_uow: UnitOfWork, h: HistorialAbastecimiento): Promise<Result<HistorialAbastecimiento, KernelError>> {
    const list = this.store.get(h.entityRef) ?? [];
    list.push(clone(h));
    this.store.set(h.entityRef, list);
    return ok(clone(h));
  }
  async listPorEntidad(_tenantId: TenantId, entityRef: string): Promise<Result<HistorialAbastecimiento[], KernelError>> {
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
  readonly articulos: FakeArticuloRepository;
  readonly proveedores: FakeProveedorRepository;
  readonly solicitudes: FakeSolicitudRepository;
  readonly cotizaciones: FakeCotizacionRepository;
  readonly ordenes: FakeOrdenCompraRepository;
  readonly recepciones: FakeRecepcionRepository;
  readonly historial: FakeHistorialRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly eventLog: FakeEventLogStore;
}

/** Dedup en memoria del vínculo recepción-línea → movimiento (Offline First). */
export class FakeMaterializacionStore implements MaterializacionStore {
  private readonly rows = new Map<string, RegistroMaterializacion>();
  private key(t: string, recepcionId: string, linea: number): string { return `${t}::${recepcionId}:${linea}`; }

  async reservar(_uow: UnitOfWork, tenantId: TenantId, r: RegistroMaterializacion) {
    const k = this.key(tenantId, r.recepcionId, r.numeroLineaOC);
    if (this.rows.has(k)) return ok(false);
    this.rows.set(k, { ...r });
    return ok(true);
  }
  async vincular(_uow: UnitOfWork, tenantId: TenantId, recepcionId: string, numeroLineaOC: number, movimientoId: string, estado: EstadoMaterializacion) {
    const k = this.key(tenantId, recepcionId, numeroLineaOC);
    const cur = this.rows.get(k);
    if (!cur || cur.movimientoId != null) return ok(false);
    this.rows.set(k, { ...cur, movimientoId, estado });
    return ok(true);
  }
  async buscar(tenantId: TenantId, recepcionId: string, numeroLineaOC: number) {
    return ok(this.rows.get(this.key(tenantId, recepcionId, numeroLineaOC)) ?? null);
  }
  async listPorRecepcion(tenantId: TenantId, recepcionId: string) {
    const out: RegistroMaterializacion[] = [];
    for (const r of this.rows.values()) if (r.recepcionId === recepcionId) out.push({ ...r });
    out.sort((a, b) => a.numeroLineaOC - b.numeroLineaOC);
    return ok(out);
  }
}

export function crearFakeAdapters(): FakeAdapters {
  return {
    articulos: new FakeArticuloRepository(),
    proveedores: new FakeProveedorRepository(),
    solicitudes: new FakeSolicitudRepository(),
    cotizaciones: new FakeCotizacionRepository(),
    ordenes: new FakeOrdenCompraRepository(),
    recepciones: new FakeRecepcionRepository(),
    historial: new FakeHistorialRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    eventLog: new FakeEventLogStore(),
  };
}
