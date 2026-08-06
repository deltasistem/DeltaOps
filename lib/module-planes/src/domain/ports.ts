/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — PUERTOS del dominio.
 *
 * SOLO dominio: la persistencia y colaboradores se expresan como PUERTOS. Los
 * adaptadores concretos (PostgreSQL / Record Store / proyecciones) son
 * INFRAESTRUCTURA de la etapa 2; aquí sólo se declaran los contratos, con FAKES
 * en memoria (infrastructure/fakes.ts) para pruebas 100% deterministas.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { CodigoPlan } from "./value-objects";
import type { PlanMantenimiento } from "./plan";
import type { CalendarioOperacional } from "./calendario";
import type { GeneracionOrden } from "./generacion";
import type { HistorialPlan } from "./suspension";

export type TenantId = string;

/* ------------------------------ Repositorios ----------------------------- */

export interface PlanFiltro {
  readonly estado?: string;
  readonly tipoPlan?: string;
  readonly limit?: number;
}

export interface PlanRepository {
  insert(uow: UnitOfWork, plan: PlanMantenimiento): Promise<Result<PlanMantenimiento, KernelError>>;
  update(uow: UnitOfWork, plan: PlanMantenimiento, expectedVersion: number): Promise<Result<PlanMantenimiento, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<PlanMantenimiento | null, KernelError>>;
  list(tenantId: TenantId, filtro: PlanFiltro): Promise<Result<PlanMantenimiento[], KernelError>>;
}

export interface CalendarioRepository {
  insert(uow: UnitOfWork, cal: CalendarioOperacional): Promise<Result<CalendarioOperacional, KernelError>>;
  update(uow: UnitOfWork, cal: CalendarioOperacional, expectedVersion: number): Promise<Result<CalendarioOperacional, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<CalendarioOperacional | null, KernelError>>;
}

/** Repositorio de generaciones con lookup por CLAVE DE DEDUP (idempotencia). */
export interface GeneracionRepository {
  insert(uow: UnitOfWork, g: GeneracionOrden): Promise<Result<GeneracionOrden, KernelError>>;
  findByClaveDedup(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrden | null, KernelError>>;
  listPorPlan(tenantId: TenantId, planId: string): Promise<Result<GeneracionOrden[], KernelError>>;
  /**
   * Persiste el VÍNCULO generación→OT de forma idempotente: fija `ordenTrabajoId`
   * y `estado=materializada`. Devuelve `false` si la generación ya estaba
   * vinculada (idempotente, sin re-escritura); `true` si el vínculo se aplicó.
   */
  linkOrden(uow: UnitOfWork, tenantId: TenantId, generacionId: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>>;
}

/**
 * PUERTO de materialización de Órdenes de Trabajo (colaborador cross-módulo). El
 * orquestador `generar-ordenes-preventivas` NO anida comandos de otro runtime:
 * delega la creación REAL de la OT en este puerto (idempotente por `opId`), que
 * en el runtime operacional compone el comando OFICIAL `modulo.ordenes.crear` en
 * su propio Kernel/UoW. El VÍNCULO generación→OT se persiste ATÓMICAMENTE en la
 * UoW del módulo Planes (evento autosuficiente + read model).
 */
export interface OrdenAMaterializar {
  readonly opId: string;
  readonly planId: string;
  readonly planCodigo: string;
  readonly activoId: string;
  readonly ocurrencia: string;
  readonly claveDedup: string;
  readonly fechaObjetivo: string;
  readonly prioridad: string | null;
  readonly tipoOrden: string;
  readonly medidores: Record<string, unknown> | null;
}

export interface ResultadoMaterializacion {
  readonly ordenTrabajoId: string;
  readonly idempotente: boolean;
}

export interface MaterializadorOrdenes {
  crearOrden(
    tenantId: TenantId,
    actorId: string,
    orden: OrdenAMaterializar,
  ): Promise<Result<ResultadoMaterializacion, KernelError>>;
  /** Lectura best-effort de medidores del activo (horómetro/odómetro). */
  medidoresDeActivo?(tenantId: TenantId, actorId: string, activoId: string): Promise<Record<string, unknown> | null>;
}

export interface HistorialRepository {
  append(uow: UnitOfWork, h: HistorialPlan): Promise<Result<HistorialPlan, KernelError>>;
  listPorPlan(tenantId: TenantId, planId: string): Promise<Result<HistorialPlan[], KernelError>>;
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
  prefijo: "PLN",
  separador: "-",
  padding: 5,
  serie: "default",
};

export interface ConsecutivoPort {
  siguiente(uow: UnitOfWork, tenantId: TenantId, cfg: ConfigCodigo, actorId: string): Promise<Result<CodigoPlan, KernelError>>;
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
