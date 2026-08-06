/**
 * DGP-013 · Módulo Enterprise Procurement — PUERTOS del dominio.
 *
 * SOLO dominio: la persistencia y colaboradores se expresan como PUERTOS. Los
 * adaptadores concretos (PostgreSQL / read models CQRS / proyecciones) son
 * INFRAESTRUCTURA de la etapa 2; aquí sólo se declaran los contratos, con FAKES
 * en memoria (infrastructure/fakes.ts) para pruebas 100% deterministas.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { CatalogoArticulo } from "./articulo";
import type { Proveedor } from "./proveedor";
import type { SolicitudCompra } from "./solicitud";
import type { Cotizacion } from "./cotizacion";
import type { OrdenCompra } from "./orden-compra";
import type { Recepcion } from "./recepcion";
import type { HistorialAbastecimiento } from "./historial";

export type TenantId = string;

/* ------------------------------ Repositorios ----------------------------- */

export interface ArticuloFiltro {
  readonly tipo?: string;
  readonly familia?: string;
  readonly activo?: boolean;
  readonly limit?: number;
}

export interface ArticuloRepository {
  insert(uow: UnitOfWork, a: CatalogoArticulo): Promise<Result<CatalogoArticulo, KernelError>>;
  update(uow: UnitOfWork, a: CatalogoArticulo, expectedVersion: number): Promise<Result<CatalogoArticulo, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<CatalogoArticulo | null, KernelError>>;
  list(tenantId: TenantId, filtro: ArticuloFiltro): Promise<Result<CatalogoArticulo[], KernelError>>;
}

export interface ProveedorFiltro {
  readonly tipo?: string;
  readonly activo?: boolean;
  readonly limit?: number;
}

export interface ProveedorRepository {
  insert(uow: UnitOfWork, p: Proveedor): Promise<Result<Proveedor, KernelError>>;
  update(uow: UnitOfWork, p: Proveedor, expectedVersion: number): Promise<Result<Proveedor, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Proveedor | null, KernelError>>;
  list(tenantId: TenantId, filtro: ProveedorFiltro): Promise<Result<Proveedor[], KernelError>>;
}

export interface SolicitudFiltro {
  readonly estado?: string;
  readonly limit?: number;
}

export interface SolicitudRepository {
  insert(uow: UnitOfWork, s: SolicitudCompra): Promise<Result<SolicitudCompra, KernelError>>;
  update(uow: UnitOfWork, s: SolicitudCompra, expectedVersion: number): Promise<Result<SolicitudCompra, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<SolicitudCompra | null, KernelError>>;
  list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudCompra[], KernelError>>;
}

export interface CotizacionRepository {
  insert(uow: UnitOfWork, c: Cotizacion): Promise<Result<Cotizacion, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Cotizacion | null, KernelError>>;
  listPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Cotizacion[], KernelError>>;
}

export interface OrdenCompraFiltro {
  readonly estado?: string;
  readonly proveedorId?: string;
  readonly limit?: number;
}

export interface OrdenCompraRepository {
  insert(uow: UnitOfWork, o: OrdenCompra): Promise<Result<OrdenCompra, KernelError>>;
  update(uow: UnitOfWork, o: OrdenCompra, expectedVersion: number): Promise<Result<OrdenCompra, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<OrdenCompra | null, KernelError>>;
  list(tenantId: TenantId, filtro: OrdenCompraFiltro): Promise<Result<OrdenCompra[], KernelError>>;
}

export interface RecepcionRepository {
  insert(uow: UnitOfWork, r: Recepcion): Promise<Result<Recepcion, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Recepcion | null, KernelError>>;
  /** Cuenta recepciones existentes de una OC (para el consecutivo determinista). */
  contarPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<number, KernelError>>;
  listPorOrden(tenantId: TenantId, ordenCompraId: string): Promise<Result<Recepcion[], KernelError>>;
}

export interface HistorialRepository {
  append(uow: UnitOfWork, h: HistorialAbastecimiento): Promise<Result<HistorialAbastecimiento, KernelError>>;
  listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialAbastecimiento[], KernelError>>;
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

/** Consecutivos por familia de documento (artículo/proveedor/solicitud/OC). */
export type SerieDocumento = "articulo" | "proveedor" | "solicitud" | "orden-compra";

export const CONFIG_CODIGO_DEFAULT: Record<SerieDocumento, ConfigCodigo> = {
  "articulo": { prefijo: "ART", separador: "-", padding: 5, serie: "articulo" },
  "proveedor": { prefijo: "PRV", separador: "-", padding: 5, serie: "proveedor" },
  "solicitud": { prefijo: "SC", separador: "-", padding: 5, serie: "solicitud" },
  "orden-compra": { prefijo: "OC", separador: "-", padding: 5, serie: "orden-compra" },
};

export interface Consecutivo {
  readonly valor: string;
  readonly prefijo: string;
  readonly secuencia: number;
}

export interface ConsecutivoPort {
  siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, actorId: string): Promise<Result<Consecutivo, KernelError>>;
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

/* ------------------------------- Event log ------------------------------- */

export interface EventoDurable {
  readonly tenantId: string;
  readonly eventId: string;
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
}

/** Bitácora de eventos durable (fuente de verdad del replay/reproyección). */
export interface EventLogStore {
  append(uow: UnitOfWork, e: EventoDurable): Promise<Result<void, KernelError>>;
  listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>>;
}

/* --------------------- Integración: Inventario / Origen ------------------ */

/**
 * Insumo determinista para materializar UNA línea recibida como movimiento de
 * inventario. `opId = ${recepcionId}:${numeroLineaOC}` garantiza idempotencia
 * end-to-end aunque el orquestador se reintente.
 */
export interface EntradaMaterializacion {
  readonly opId: string;
  readonly recepcionId: string;
  readonly ordenCompraId: string;
  readonly numeroLineaOC: number;
  readonly articuloId: string | null;
  readonly inventarioItemId: string | null;
  readonly bodegaId: string | null;
  readonly ubicacionId: string | null;
  readonly cantidad: number;
  readonly unidad: string;
  readonly lote: string | null;
  readonly serie: string | null;
  readonly costoUnitario: number | null;
  readonly moneda: string | null;
  readonly referencia: { readonly tipo: string; readonly id: string } | null;
}

export interface ResultadoMaterializacion {
  readonly movimientoId: string;
  readonly idempotente: boolean;
}

/**
 * MATERIALIZADOR DE INVENTARIO (colaborador cross-módulo). Compone el comando
 * OFICIAL `modulo.inventario.mover` en su PROPIO runtime/UoW (jamás anidado):
 * el módulo permanece desacoplado. Fail-safe: si no está configurado, el
 * orquestador rechaza con KRN-CFL (nunca crea movimientos por vías no oficiales).
 */
export interface MaterializadorInventario {
  ingresar(
    tenantId: TenantId,
    actorId: string,
    entrada: EntradaMaterializacion,
  ): Promise<Result<ResultadoMaterializacion, KernelError>>;
  /** Liberación de reserva / cierre de origen (OT/plan) vía timeline oficial. */
  liberarOrigen?(
    tenantId: TenantId,
    actorId: string,
    vinculo: { ordenCompraId: string; solicitudId: string | null; origenTipo: string | null; origenId: string | null; recepcionId: string },
  ): Promise<Result<void, KernelError>>;
}

/* ---------------- Dedup durable de materialización (línea→mov) ----------- */

export type EstadoMaterializacion = "pendiente" | "aplicada" | "omitida";

export interface RegistroMaterializacion {
  readonly recepcionId: string;
  readonly ordenCompraId: string;
  readonly numeroLineaOC: number;
  readonly articuloId: string | null;
  readonly inventarioItemId: string | null;
  readonly cantidad: number;
  readonly movimientoId: string | null;
  readonly estado: EstadoMaterializacion;
}

/**
 * Persistencia idempotente del vínculo línea→movimiento. `reservar` inserta el
 * registro pendiente (unique por recepción+línea); `vincular` fija el
 * movimientoId ATÓMICAMENTE con guard (`movimiento_id IS NULL`): rowCount>0 ⇒
 * este proceso ganó y aplicó; rowCount=0 ⇒ otro proceso ya vinculó (no-dupe).
 */
export interface MaterializacionStore {
  reservar(uow: UnitOfWork, tenantId: TenantId, r: RegistroMaterializacion): Promise<Result<boolean, KernelError>>;
  vincular(uow: UnitOfWork, tenantId: TenantId, recepcionId: string, numeroLineaOC: number, movimientoId: string, estado: EstadoMaterializacion): Promise<Result<boolean, KernelError>>;
  buscar(tenantId: TenantId, recepcionId: string, numeroLineaOC: number): Promise<Result<RegistroMaterializacion | null, KernelError>>;
  listPorRecepcion(tenantId: TenantId, recepcionId: string): Promise<Result<RegistroMaterializacion[], KernelError>>;
}
