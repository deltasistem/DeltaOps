/**
 * DGP-011.1 · Módulo Enterprise Inventory — FAKES en memoria de los PUERTOS.
 *
 * NO son infraestructura de producción: son implementaciones en memoria (Map)
 * 100% deterministas para pruebas de dominio y para el harness. Los adaptadores
 * concretos (PostgreSQL / Record Store / motor de workflow) llegan en fases
 * posteriores.
 *
 * IMPORTANTE (gobierno): estos fakes NO incluyen ningún `WorkflowPort`. El
 * adaptador de workflow es responsabilidad del ensamblaje que monta el módulo;
 * sin un `WorkflowPort` aprobado, los comandos gobernados fallan de forma
 * segura. Un `WorkflowPort` de PRUEBA que aprueba/rechaza transiciones vive
 * EXCLUSIVAMENTE en la infraestructura de test (`test-runtime.ts`), jamás aquí
 * como modo operativo por defecto.
 */
import { ok, fail, KernelErrors, type KernelError, type OutboxRecord, type Result, type UnitOfWork } from "@workspace/kernel";
import {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeReadModelsStore,
  FakeSyncReceiptStore,
} from "./operacional";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import { crearCodigoInventario, type CodigoInventario } from "../domain/value-objects";
import type { ItemInventario } from "../domain/item";
import type { Inventario, MovimientoInventario } from "../domain/inventario";
import type { Bodega, Ubicacion } from "../domain/bodega";
import type { LoteInventario, SerieInventario } from "../domain/lote-serie";
import type { Reserva } from "../domain/reserva";
import type { Transferencia } from "../domain/transferencia";
import type { Ajuste } from "../domain/ajuste";
import type { ConteoFisico } from "../domain/conteo";
import type {
  AjusteRepository,
  BodegaRepository,
  CatalogoPort,
  ConfigCodigo,
  ConsecutivoPort,
  ConteoRepository,
  ExistenciaClave,
  InventarioRepository,
  ItemFiltro,
  ItemRepository,
  LoteSerieRepository,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  ReservaRepository,
  TenantId,
  TransferenciaRepository,
} from "../domain/ports";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* -------------------------------- Items ---------------------------------- */

export class FakeItemRepository implements ItemRepository {
  private readonly store = new Map<string, ItemInventario>();
  async insert(_uow: UnitOfWork, item: ItemInventario): Promise<Result<ItemInventario, KernelError>> {
    if (this.store.has(key(item.tenantId, item.id))) return fail(KernelErrors.conflict(`El item ${item.id} ya existe`));
    for (const it of this.store.values()) {
      if (it.tenantId === item.tenantId && it.sku.valor === item.sku.valor) {
        return fail(KernelErrors.conflict(`El SKU ${item.sku.valor} ya existe`));
      }
    }
    this.store.set(key(item.tenantId, item.id), clone(item));
    return ok(clone(item));
  }
  async update(_uow: UnitOfWork, item: ItemInventario, expectedVersion: number): Promise<Result<ItemInventario, KernelError>> {
    const prev = this.store.get(key(item.tenantId, item.id));
    if (!prev) return fail(KernelErrors.notFound("inventario-item", item.id));
    if (prev.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    }
    this.store.set(key(item.tenantId, item.id), clone(item));
    return ok(clone(item));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<ItemInventario | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async findBySku(tenantId: TenantId, sku: string): Promise<Result<ItemInventario | null, KernelError>> {
    for (const it of this.store.values()) {
      if (it.tenantId === tenantId && it.sku.valor === sku) return ok(clone(it));
    }
    return ok(null);
  }
  async list(tenantId: TenantId, filtro: ItemFiltro): Promise<Result<ItemInventario[], KernelError>> {
    let rows = [...this.store.values()].filter((i) => i.tenantId === tenantId);
    if (!filtro.incluirEliminados) rows = rows.filter((i) => !i.eliminado);
    if (filtro.estado) rows = rows.filter((i) => i.estado === filtro.estado);
    if (filtro.tipoItem) rows = rows.filter((i) => i.clasificacion.tipoItem === filtro.tipoItem);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* ------------------------------ Existencias ------------------------------ */

const claveExistencia = (tenant: string, c: ExistenciaClave) =>
  `${tenant}::${c.itemId}::${c.bodegaId}::${c.ubicacionId}::${c.loteCodigo ?? ""}::${c.serieNumero ?? ""}`;

export class FakeInventarioRepository implements InventarioRepository {
  private readonly store = new Map<string, Inventario>();
  private readonly porClave = new Map<string, string>();
  private readonly movimientos = new Map<string, MovimientoInventario[]>();

  async insert(_uow: UnitOfWork, inv: Inventario): Promise<Result<Inventario, KernelError>> {
    if (this.store.has(key(inv.tenantId, inv.id))) return fail(KernelErrors.conflict(`La existencia ${inv.id} ya existe`));
    const ck = claveExistencia(inv.tenantId, {
      itemId: inv.itemId,
      bodegaId: inv.bodegaId,
      ubicacionId: inv.ubicacion.ubicacionId,
      loteCodigo: inv.lote?.codigo ?? null,
      serieNumero: inv.serie?.numero ?? null,
    });
    if (this.porClave.has(ck)) return fail(KernelErrors.conflict("Ya existe una existencia con esa clave"));
    this.store.set(key(inv.tenantId, inv.id), clone(inv));
    this.porClave.set(ck, inv.id);
    return ok(clone(inv));
  }
  async update(_uow: UnitOfWork, inv: Inventario, expectedVersion: number): Promise<Result<Inventario, KernelError>> {
    const prev = this.store.get(key(inv.tenantId, inv.id));
    if (!prev) return fail(KernelErrors.notFound("inventario", inv.id));
    if (prev.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    }
    this.store.set(key(inv.tenantId, inv.id), clone(inv));
    return ok(clone(inv));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Inventario | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async findByClave(tenantId: TenantId, clave: ExistenciaClave): Promise<Result<Inventario | null, KernelError>> {
    const id = this.porClave.get(claveExistencia(tenantId, clave));
    if (!id) return ok(null);
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async listPorItem(tenantId: TenantId, itemId: string): Promise<Result<Inventario[], KernelError>> {
    return ok([...this.store.values()].filter((i) => i.tenantId === tenantId && i.itemId === itemId).map(clone));
  }
  async registrarMovimiento(_uow: UnitOfWork, mov: MovimientoInventario): Promise<Result<MovimientoInventario, KernelError>> {
    const list = this.movimientos.get(key(mov.tenantId, mov.inventarioId)) ?? [];
    list.push(clone(mov));
    this.movimientos.set(key(mov.tenantId, mov.inventarioId), list);
    return ok(clone(mov));
  }
  async movimientosDe(tenantId: TenantId, inventarioId: string): Promise<Result<MovimientoInventario[], KernelError>> {
    return ok((this.movimientos.get(key(tenantId, inventarioId)) ?? []).map(clone));
  }
}

/* -------------------------------- Bodegas -------------------------------- */

export class FakeBodegaRepository implements BodegaRepository {
  private readonly bodegas = new Map<string, Bodega>();
  private readonly ubicaciones = new Map<string, Ubicacion>();
  async insert(_uow: UnitOfWork, b: Bodega): Promise<Result<Bodega, KernelError>> {
    if (this.bodegas.has(key(b.tenantId, b.id))) return fail(KernelErrors.conflict(`La bodega ${b.id} ya existe`));
    this.bodegas.set(key(b.tenantId, b.id), clone(b));
    return ok(clone(b));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Bodega | null, KernelError>> {
    const f = this.bodegas.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
  async insertUbicacion(_uow: UnitOfWork, u: Ubicacion): Promise<Result<Ubicacion, KernelError>> {
    if (this.ubicaciones.has(key(u.tenantId, u.id))) return fail(KernelErrors.conflict(`La ubicación ${u.id} ya existe`));
    this.ubicaciones.set(key(u.tenantId, u.id), clone(u));
    return ok(clone(u));
  }
  async findUbicacion(tenantId: TenantId, id: string): Promise<Result<Ubicacion | null, KernelError>> {
    const f = this.ubicaciones.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
}

/* ------------------------------ Lotes/series ----------------------------- */

export class FakeLoteSerieRepository implements LoteSerieRepository {
  private readonly lotes = new Map<string, LoteInventario>();
  private readonly series = new Map<string, SerieInventario>();
  private kLote(t: string, itemId: string, codigo: string) { return `${t}::${itemId}::${codigo}`; }
  private kSerie(t: string, itemId: string, numero: string) { return `${t}::${itemId}::${numero}`; }

  async insertLote(_uow: UnitOfWork, l: LoteInventario): Promise<Result<LoteInventario, KernelError>> {
    const k = this.kLote(l.tenantId, l.itemId, l.codigo);
    if (this.lotes.has(k)) return fail(KernelErrors.conflict(`El lote ${l.codigo} ya existe para el item`));
    this.lotes.set(k, clone(l));
    return ok(clone(l));
  }
  async updateLote(_uow: UnitOfWork, l: LoteInventario, expectedVersion: number): Promise<Result<LoteInventario, KernelError>> {
    const k = this.kLote(l.tenantId, l.itemId, l.codigo);
    const prev = this.lotes.get(k);
    if (!prev) return fail(KernelErrors.notFound("inventario-lote", l.codigo));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict("Conflicto de versión de lote"));
    this.lotes.set(k, clone(l));
    return ok(clone(l));
  }
  async findLote(tenantId: TenantId, itemId: string, codigo: string): Promise<Result<LoteInventario | null, KernelError>> {
    const f = this.lotes.get(this.kLote(tenantId, itemId, codigo));
    return ok(f ? clone(f) : null);
  }
  async insertSerie(_uow: UnitOfWork, s: SerieInventario): Promise<Result<SerieInventario, KernelError>> {
    const k = this.kSerie(s.tenantId, s.itemId, s.numero);
    if (this.series.has(k)) return fail(KernelErrors.conflict(`La serie ${s.numero} ya existe para el item`));
    this.series.set(k, clone(s));
    return ok(clone(s));
  }
  async updateSerie(_uow: UnitOfWork, s: SerieInventario, expectedVersion: number): Promise<Result<SerieInventario, KernelError>> {
    const k = this.kSerie(s.tenantId, s.itemId, s.numero);
    const prev = this.series.get(k);
    if (!prev) return fail(KernelErrors.notFound("inventario-serie", s.numero));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict("Conflicto de versión de serie"));
    this.series.set(k, clone(s));
    return ok(clone(s));
  }
  async findSerie(tenantId: TenantId, itemId: string, numero: string): Promise<Result<SerieInventario | null, KernelError>> {
    const f = this.series.get(this.kSerie(tenantId, itemId, numero));
    return ok(f ? clone(f) : null);
  }
}

/* ------------------- Reservas / Transferencias / Ajustes / Conteos ------- */

class MapaRepo<T extends { tenantId: string; id: string; version: number }> {
  protected readonly store = new Map<string, T>();
  private readonly recurso: string;
  constructor(recurso: string) { this.recurso = recurso; }
  async insert(_uow: UnitOfWork, e: T): Promise<Result<T, KernelError>> {
    if (this.store.has(key(e.tenantId, e.id))) return fail(KernelErrors.conflict(`${this.recurso} ${e.id} ya existe`));
    this.store.set(key(e.tenantId, e.id), clone(e));
    return ok(clone(e));
  }
  async update(_uow: UnitOfWork, e: T, expectedVersion: number): Promise<Result<T, KernelError>> {
    const prev = this.store.get(key(e.tenantId, e.id));
    if (!prev) return fail(KernelErrors.notFound(this.recurso, e.id));
    if (prev.version !== expectedVersion) return fail(KernelErrors.conflict(`Conflicto de versión de ${this.recurso}`));
    this.store.set(key(e.tenantId, e.id), clone(e));
    return ok(clone(e));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<T | null, KernelError>> {
    const f = this.store.get(key(tenantId, id));
    return ok(f ? clone(f) : null);
  }
}

export class FakeReservaRepository extends MapaRepo<Reserva> implements ReservaRepository {
  constructor() { super("inventario-reserva"); }
}
export class FakeTransferenciaRepository extends MapaRepo<Transferencia> implements TransferenciaRepository {
  constructor() { super("inventario-transferencia"); }
}
export class FakeAjusteRepository extends MapaRepo<Ajuste> implements AjusteRepository {
  constructor() { super("inventario-ajuste"); }
}
export class FakeConteoRepository extends MapaRepo<ConteoFisico> implements ConteoRepository {
  constructor() { super("inventario-conteo"); }
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
  async siguiente(_uow: UnitOfWork, tenant: string, cfg: ConfigCodigo): Promise<Result<CodigoInventario, KernelError>> {
    const k = `${tenant}::${cfg.serie}`;
    const secuencia = (this.contadores.get(k) ?? 0) + 1;
    this.contadores.set(k, secuencia);
    const relleno = String(secuencia).padStart(cfg.padding, "0");
    return crearCodigoInventario({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
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

/* ------------------------------- Ensamblaje ------------------------------ */

/**
 * Fakes de los PUERTOS de datos del módulo. NO incluye `WorkflowPort`: el
 * gobierno de aprobaciones exige que el adaptador de workflow lo provea el
 * ensamblaje (nunca hay auto-aprobación por defecto).
 */
export interface FakeAdapters {
  readonly items: FakeItemRepository;
  readonly inventario: FakeInventarioRepository;
  readonly bodegas: FakeBodegaRepository;
  readonly lotesSeries: FakeLoteSerieRepository;
  readonly reservas: FakeReservaRepository;
  readonly transferencias: FakeTransferenciaRepository;
  readonly ajustes: FakeAjusteRepository;
  readonly conteos: FakeConteoRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly readModel: FakeReadModelsStore;
  readonly eventLog: FakeEventLogStore;
  readonly syncReceipts: FakeSyncReceiptStore;
  readonly consola: FakeConsolaStore;
}

/**
 * Fakes de dominio + operacionales. Por defecto la consola in-memory lee un
 * accesor de outbox VACÍO; el runtime operacional lo reemplaza con el accesor
 * perezoso del outbox in-memory del Kernel tras montar la plataforma.
 */
export function crearFakeAdapters(
  outboxRecords: () => readonly OutboxRecord[] = () => [],
): FakeAdapters {
  return {
    items: new FakeItemRepository(),
    inventario: new FakeInventarioRepository(),
    bodegas: new FakeBodegaRepository(),
    lotesSeries: new FakeLoteSerieRepository(),
    reservas: new FakeReservaRepository(),
    transferencias: new FakeTransferenciaRepository(),
    ajustes: new FakeAjusteRepository(),
    conteos: new FakeConteoRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    readModel: new FakeReadModelsStore(),
    eventLog: new FakeEventLogStore(),
    syncReceipts: new FakeSyncReceiptStore(),
    consola: new FakeConsolaStore(outboxRecords),
  };
}
