/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — PUERTOS del dominio.
 *
 * SOLO LECTURA sobre datos ajenos. Las FUENTES de hechos son PUERTOS FAIL-SAFE que,
 * en Etapa 2, envolverán los CONTRATOS PÚBLICOS de consulta de cada módulo en su
 * PROPIO runtime/UoW (jamás importando aggregates ni comandos anidados). Cada
 * puerto entrega una serie de HECHOS (filas neutras campo→valor) que el MOTOR
 * evalúa genéricamente. Si un puerto no se inyecta, la evaluación que lo requiere
 * FALLA de forma segura (KRN-CFL) — nunca inventa datos.
 *
 * MAPEO A CONTRATOS REALES (para componer en Etapa 2):
 *   · FuenteOrdenesPort        → `modulo.ordenes.listar` / `.agenda` / `.historial`
 *   · FuenteActivosPort        → `modulo.activos.listar` / `.arbol` / `.historial`
 *   · FuenteInventarioPort     → `modulo.inventario.items` / `.existencia` / `.movimientos`
 *   · FuenteCorrectivoPort     → `modulo.correctivo.solicitudes` / `.eventos-activo`
 *                                (eventos crudos MTBF/MTTR: insumosKpi de DGP-015)
 *   · FuentePreventivoPort     → `modulo.preventivo.programas` / `.generaciones`
 *   · FuenteAbastecimientoPort → `modulo.abastecimiento.solicitudes` / `.ordenes-compra` / `.costos`
 *   · FuentePlanesPort         → `modulo.planes.planes` / `.generaciones`
 *   · FuenteTimelinePort       → `platform.timeline` (entradas por entityRef)
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { DefinicionIndicador } from "./definicion-indicador";
import type { Dashboard } from "./dashboard";
import type { SnapshotEvaluacion } from "./snapshot";
import type { Hecho } from "./filtros";

export type TenantId = string;

/* --------------------- Fuentes de hechos (read-only) --------------------- */

/**
 * Criterio de consulta a una fuente: dataset + filtros crudos que la fuente puede
 * empujar (push-down) a su contrato público. Los filtros del motor se aplican
 * después; este criterio sólo acota el volumen traído.
 */
export interface CriterioFuente {
  readonly dataset: string;
  readonly desde?: string | null;
  readonly hasta?: string | null;
  readonly limite?: number | null;
  readonly extra?: Record<string, unknown>;
}

/** Contrato común de toda fuente de hechos read-only y fail-safe. */
export interface FuenteHechos {
  /** Datasets soportados por esta fuente. */
  datasets(): readonly string[];
  /** Trae una serie de hechos neutros para el dataset indicado. */
  hechos(tenantId: TenantId, criterio: CriterioFuente): Promise<Result<Hecho[], KernelError>>;
}

export interface FuenteOrdenesPort extends FuenteHechos {}
export interface FuenteActivosPort extends FuenteHechos {}
export interface FuenteInventarioPort extends FuenteHechos {}
export interface FuenteCorrectivoPort extends FuenteHechos {}
export interface FuentePreventivoPort extends FuenteHechos {}
export interface FuenteAbastecimientoPort extends FuenteHechos {}
export interface FuentePlanesPort extends FuenteHechos {}
export interface FuenteTimelinePort extends FuenteHechos {}

/** Registro de fuentes por clave de módulo (para resolver la fuente de un indicador). */
export interface RegistroFuentes {
  readonly ordenes?: FuenteOrdenesPort;
  readonly activos?: FuenteActivosPort;
  readonly inventario?: FuenteInventarioPort;
  readonly correctivo?: FuenteCorrectivoPort;
  readonly preventivo?: FuentePreventivoPort;
  readonly abastecimiento?: FuenteAbastecimientoPort;
  readonly planes?: FuentePlanesPort;
  readonly timeline?: FuenteTimelinePort;
}

export type ClaveFuente = keyof RegistroFuentes;

/* ------------------------------ Repositorios ----------------------------- */

export interface DefinicionFiltro {
  readonly categoria?: string;
  readonly habilitado?: boolean;
  readonly delSistema?: boolean;
  readonly limit?: number;
}

export interface DefinicionRepository {
  insert(uow: UnitOfWork, d: DefinicionIndicador): Promise<Result<DefinicionIndicador, KernelError>>;
  update(uow: UnitOfWork, d: DefinicionIndicador, expectedVersion: number): Promise<Result<DefinicionIndicador, KernelError>>;
  findByClave(tenantId: TenantId, clave: string): Promise<Result<DefinicionIndicador | null, KernelError>>;
  list(tenantId: TenantId, filtro: DefinicionFiltro): Promise<Result<DefinicionIndicador[], KernelError>>;
}

export interface DashboardFiltro {
  readonly delSistema?: boolean;
  readonly propietarioId?: string;
  readonly limit?: number;
}

export interface DashboardRepository {
  insert(uow: UnitOfWork, d: Dashboard): Promise<Result<Dashboard, KernelError>>;
  update(uow: UnitOfWork, d: Dashboard, expectedVersion: number): Promise<Result<Dashboard, KernelError>>;
  delete(uow: UnitOfWork, tenantId: TenantId, id: string, expectedVersion: number): Promise<Result<void, KernelError>>;
  findByClave(tenantId: TenantId, clave: string): Promise<Result<Dashboard | null, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Dashboard | null, KernelError>>;
  list(tenantId: TenantId, filtro: DashboardFiltro): Promise<Result<Dashboard[], KernelError>>;
}

export interface SnapshotRepository {
  /** Inserta idempotentemente por claveSnapshot; si ya existe, devuelve el previo. */
  upsert(uow: UnitOfWork, s: SnapshotEvaluacion): Promise<Result<{ snapshot: SnapshotEvaluacion; nuevo: boolean }, KernelError>>;
  buscarPorClave(tenantId: TenantId, claveSnapshot: string): Promise<Result<SnapshotEvaluacion | null, KernelError>>;
  list(tenantId: TenantId, targetClave: string): Promise<Result<SnapshotEvaluacion[], KernelError>>;
}

/* -------------------------------- Catálogos ------------------------------ */

export interface OpcionCatalogo {
  readonly value: string;
  readonly label: string;
  readonly posicion: number;
  readonly padre: string | null;
}

export interface CatalogoPort {
  upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>>;
  habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>>;
  opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>>;
  contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>>;
  validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>>;
}

/* ------------------------- Recibos de idempotencia ----------------------- */

export interface Recibo {
  readonly opId: string;
  readonly comando: string;
  readonly resultado: Record<string, unknown>;
}

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

export interface EventLogStore {
  append(uow: UnitOfWork, e: EventoDurable): Promise<Result<void, KernelError>>;
  listPorTenant(tenantId: TenantId): Promise<Result<EventoDurable[], KernelError>>;
}
