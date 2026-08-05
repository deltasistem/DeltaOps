/**
 * DGP-011.1 · Módulo Enterprise Inventory — PUERTOS del dominio.
 *
 * SOLO dominio: la persistencia y colaboradores se expresan como PUERTOS. Los
 * adaptadores concretos (PostgreSQL / Record Store / proyecciones / motor de
 * workflow) son INFRAESTRUCTURA de fases posteriores; aquí sólo se declaran los
 * contratos, acompañados de FAKES en memoria (infrastructure/fakes.ts) para
 * pruebas 100% deterministas.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { CodigoInventario } from "./value-objects";
import type { ItemInventario } from "./item";
import type { Inventario, MovimientoInventario } from "./inventario";
import type { Bodega, Ubicacion } from "./bodega";
import type { LoteInventario, SerieInventario } from "./lote-serie";
import type { Reserva } from "./reserva";
import type { Transferencia } from "./transferencia";
import type { Ajuste } from "./ajuste";
import type { ConteoFisico } from "./conteo";

export type TenantId = string;

/* ------------------------------ Repositorios ----------------------------- */

export interface ItemFiltro {
  readonly estado?: string;
  readonly tipoItem?: string;
  readonly incluirEliminados?: boolean;
  readonly limit?: number;
}

export interface ItemRepository {
  insert(uow: UnitOfWork, item: ItemInventario): Promise<Result<ItemInventario, KernelError>>;
  update(uow: UnitOfWork, item: ItemInventario, expectedVersion: number): Promise<Result<ItemInventario, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<ItemInventario | null, KernelError>>;
  findBySku(tenantId: TenantId, sku: string): Promise<Result<ItemInventario | null, KernelError>>;
  list(tenantId: TenantId, filtro: ItemFiltro): Promise<Result<ItemInventario[], KernelError>>;
}

export interface ExistenciaClave {
  readonly itemId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
}

/** Repositorio de EXISTENCIAS + su historial inmutable de movimientos. */
export interface InventarioRepository {
  insert(uow: UnitOfWork, inv: Inventario): Promise<Result<Inventario, KernelError>>;
  update(uow: UnitOfWork, inv: Inventario, expectedVersion: number): Promise<Result<Inventario, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Inventario | null, KernelError>>;
  findByClave(tenantId: TenantId, clave: ExistenciaClave): Promise<Result<Inventario | null, KernelError>>;
  listPorItem(tenantId: TenantId, itemId: string): Promise<Result<Inventario[], KernelError>>;
  /** Persiste el registro inmutable del movimiento (fuente de verdad, replay). */
  registrarMovimiento(uow: UnitOfWork, mov: MovimientoInventario): Promise<Result<MovimientoInventario, KernelError>>;
  movimientosDe(tenantId: TenantId, inventarioId: string): Promise<Result<MovimientoInventario[], KernelError>>;
}

export interface BodegaRepository {
  insert(uow: UnitOfWork, b: Bodega): Promise<Result<Bodega, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Bodega | null, KernelError>>;
  insertUbicacion(uow: UnitOfWork, u: Ubicacion): Promise<Result<Ubicacion, KernelError>>;
  findUbicacion(tenantId: TenantId, id: string): Promise<Result<Ubicacion | null, KernelError>>;
}

export interface LoteSerieRepository {
  insertLote(uow: UnitOfWork, l: LoteInventario): Promise<Result<LoteInventario, KernelError>>;
  updateLote(uow: UnitOfWork, l: LoteInventario, expectedVersion: number): Promise<Result<LoteInventario, KernelError>>;
  findLote(tenantId: TenantId, itemId: string, codigo: string): Promise<Result<LoteInventario | null, KernelError>>;
  insertSerie(uow: UnitOfWork, s: SerieInventario): Promise<Result<SerieInventario, KernelError>>;
  updateSerie(uow: UnitOfWork, s: SerieInventario, expectedVersion: number): Promise<Result<SerieInventario, KernelError>>;
  findSerie(tenantId: TenantId, itemId: string, numero: string): Promise<Result<SerieInventario | null, KernelError>>;
}

export interface ReservaRepository {
  insert(uow: UnitOfWork, r: Reserva): Promise<Result<Reserva, KernelError>>;
  update(uow: UnitOfWork, r: Reserva, expectedVersion: number): Promise<Result<Reserva, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Reserva | null, KernelError>>;
}

export interface TransferenciaRepository {
  insert(uow: UnitOfWork, t: Transferencia): Promise<Result<Transferencia, KernelError>>;
  update(uow: UnitOfWork, t: Transferencia, expectedVersion: number): Promise<Result<Transferencia, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Transferencia | null, KernelError>>;
}

export interface AjusteRepository {
  insert(uow: UnitOfWork, a: Ajuste): Promise<Result<Ajuste, KernelError>>;
  update(uow: UnitOfWork, a: Ajuste, expectedVersion: number): Promise<Result<Ajuste, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Ajuste | null, KernelError>>;
}

export interface ConteoRepository {
  insert(uow: UnitOfWork, c: ConteoFisico): Promise<Result<ConteoFisico, KernelError>>;
  update(uow: UnitOfWork, c: ConteoFisico, expectedVersion: number): Promise<Result<ConteoFisico, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<ConteoFisico | null, KernelError>>;
}

/* -------------------------------- Catálogos ------------------------------ */

export interface OpcionCatalogo {
  readonly value: string;
  readonly label: string;
  readonly posicion: number;
  readonly padre: string | null;
}

/** Puerto de catálogos configurables por tenant (semántica canónica). */
export interface CatalogoPort {
  upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>>;
  habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>>;
  opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>>;
  contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>>;
  /**
   * Valida una referencia con la semántica canónica:
   *   - vacío + no obligatorio ⇒ ok
   *   - catálogo sin entradas   ⇒ acepta canónicos (o libre si no hay canónicos)
   *   - catálogo con entradas   ⇒ debe estar presente y habilitado
   */
  validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>>;
}

/* ------------------------------- Consecutivo ----------------------------- */

export interface ConfigCodigo {
  readonly prefijo: string;
  readonly separador: string;
  readonly padding: number;
  readonly serie: string;
}

export const CONFIG_CODIGO_DEFAULT: ConfigCodigo = {
  prefijo: "ITM",
  separador: "-",
  padding: 6,
  serie: "default",
};

export interface ConsecutivoPort {
  siguiente(
    uow: UnitOfWork,
    tenantId: TenantId,
    cfg: ConfigCodigo,
    actorId: string,
  ): Promise<Result<CodigoInventario, KernelError>>;
}

/* ------------------------- Recibos de idempotencia ----------------------- */

export interface Recibo {
  readonly opId: string;
  readonly comando: string;
  readonly resultado: Record<string, unknown>;
}

/** Recibos offline: exactamente-una aplicación por opId+comando (Offline First). */
export interface ReciboPort {
  buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>>;
  sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>>;
}
