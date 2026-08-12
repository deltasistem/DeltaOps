/**
 * DGP-021.1 · Puertos del Módulo de Costos.
 *
 * El módulo NUNCA lee tablas ajenas (`ord_*`, `abs_*`, `idn_*`) por SQL directo.
 * Toda información ajena entra por PUERTOS fail-closed que componen CONTRATOS
 * PÚBLICOS:
 *  - `IdentidadPort`: resuelve el NOMBRE de presentación desde la identidad
 *    canónica (adaptador api-server sobre el servicio público de Identidad).
 *  - `OrdenesPort`: verifica EXISTENCIA de la OT y deriva la relación canónica
 *    OT→activo (`modulo.ordenes.detalle`). El `activoId` JAMÁS viene del frontend.
 *  - `CostoExactoPort`: consume `modulo.abastecimiento.costos-exactos` (DGP-021.0)
 *    para el snapshot de MATERIAL. PROHIBIDO leer `abs_costos_read` o el endpoint
 *    float legacy.
 * La persistencia PROPIA del módulo (hechos + read models + recibos + bitácora)
 * vive en puertos de repositorio con adaptadores PG (RLS) y Fake (memoria).
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EstadoHecho, HechoEconomico, TipoHecho } from "./hecho";
import type { Dinero } from "./dinero";

export type TenantId = string;

/* --------------------------------- Identidad ----------------------------- */

export interface IdentidadResuelta {
  readonly identityId: string;
  readonly nombre: string;
}

/** Puerto fail-closed hacia la Identidad canónica (sólo resuelve nombre). */
export interface IdentidadPort {
  resolver(tenantId: TenantId, identityId: string): Promise<Result<IdentidadResuelta | null, KernelError>>;
  resolverVarios(tenantId: TenantId, identityIds: readonly string[]): Promise<Result<Record<string, string>, KernelError>>;
}

/* --------------------------------- Órdenes ------------------------------- */

/** Snapshot público mínimo de una OT (proyección de `modulo.ordenes.detalle`). */
export interface OrdenSnapshot {
  readonly ordenId: string;
  readonly estado: string;
  /** Relación canónica OT→activo principal (null si la OT no tiene activo). */
  readonly activoPrincipalId: string | null;
}

/** Puerto de SOLO LECTURA hacia el contrato público de Órdenes. */
export interface OrdenesPort {
  /** Verifica que la OT EXISTE en el tenant y devuelve su relación canónica al activo. */
  obtener(tenantId: TenantId, ordenId: string): Promise<Result<OrdenSnapshot | null, KernelError>>;
}

/* ----------------------------- Abastecimiento ---------------------------- */

/** Costo exacto de un artículo por moneda (proyección de DGP-021.0). */
export interface CostoExactoArticulo {
  readonly articuloId: string;
  readonly moneda: string;
  readonly metodoValoracion: string;
  /** Costo unitario PROMEDIO PONDERADO, cadena decimal canónica numeric(18,6). */
  readonly costoUnitario: Dinero;
  readonly cantidadAcumulada: Dinero;
  readonly actualizadoAt: string;
}

/** Puerto de SOLO LECTURA hacia el contrato público de costos exactos (DGP-021.0). */
export interface CostoExactoPort {
  /**
   * Costos exactos de un artículo (una entrada por moneda). Ausencia total ⇒
   * lista vacía (SIN COSTO ≠ "0"): el comando debe rechazar la materialización.
   */
  costosDeArticulo(tenantId: TenantId, articuloId: string): Promise<Result<CostoExactoArticulo[], KernelError>>;
}

/* ------------------------------- Repositorio ----------------------------- */

/** Filtro tenant-scoped para las consultas de hechos (read models). */
export interface FiltroHechos {
  readonly otId?: string;
  readonly activoId?: string;
  readonly tipo?: TipoHecho;
  readonly moneda?: string;
  readonly estado?: EstadoHecho;
  /** Rango [desde, hasta) sobre `ocurridoAt` (ISO). */
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
}

export interface HechoRepository {
  buscar(tenantId: TenantId, costoId: string): Promise<Result<HechoEconomico | null, KernelError>>;
  /**
   * Materializa el hecho de forma idempotente. Devuelve `insertado=false` si ya
   * existía (guarda durable por índice único de read model/tenant).
   */
  materializar(uow: UnitOfWork, hecho: HechoEconomico): Promise<Result<{ insertado: boolean }, KernelError>>;
  /** Persiste la ANULACIÓN (update in place del estado + metadatos; snapshot intacto). */
  anular(uow: UnitOfWork, hecho: HechoEconomico): Promise<Result<void, KernelError>>;
  /** Consulta de hechos tenant-scoped (CQRS: TODA lectura pasa por aquí). */
  listar(tenantId: TenantId, filtro: FiltroHechos): Promise<Result<HechoEconomico[], KernelError>>;
}

/* ------------------------------- Recibos opId ---------------------------- */

export interface Recibo {
  readonly opId: string;
  readonly comando: string;
  readonly resultado?: Record<string, unknown>;
}
export interface ReciboClaim {
  readonly duenio: boolean;
  readonly pendiente?: boolean;
  readonly resultado?: Record<string, unknown>;
}
export interface ReciboPort {
  buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>>;
  reclamar(uow: UnitOfWork, tenantId: TenantId, comando: string, opId: string, actorId: string): Promise<Result<ReciboClaim, KernelError>>;
  sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>>;
}
