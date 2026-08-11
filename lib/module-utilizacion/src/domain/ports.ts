/**
 * DGP-019.1 · Módulo de Utilización — PUERTOS de dominio.
 *
 * Repositorios append-only (lecturas / tanqueos), catálogo configurable,
 * recibos de idempotencia offline, bitácora de eventos durable, y el puerto
 * FAIL-SAFE de composición con Activos. Todas las referencias externas son ids
 * opacos; jamás se importa el aggregate de otro módulo.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { Lectura, Tanqueo, TipoMedidor } from "./value-objects";

export type TenantId = string;

/* ------------------------- Repositorio de lecturas ----------------------- */

export interface LecturaFiltro {
  readonly activoId?: string;
  readonly tipoMedidor?: TipoMedidor;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface LecturaRepository {
  /** Inserta un hecho de lectura (append-only). Conflicto si el id ya existe. */
  insert(uow: UnitOfWork, l: Lectura): Promise<Result<Lectura, KernelError>>;
  /** Reemplaza el hecho (sólo transiciones no destructivas: anulación/sinc). */
  replace(uow: UnitOfWork, l: Lectura): Promise<Result<Lectura, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Lectura | null, KernelError>>;
  /** Última lectura VIGENTE y NO inconsistente del medidor (por fechaHora). */
  ultimaValida(tenantId: TenantId, activoId: string, tipoMedidor: TipoMedidor): Promise<Result<Lectura | null, KernelError>>;
  list(tenantId: TenantId, filtro: LecturaFiltro): Promise<Result<Lectura[], KernelError>>;
}

/* ------------------------ Repositorio de tanqueos ------------------------ */

export interface TanqueoFiltro {
  readonly activoId?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TanqueoRepository {
  insert(uow: UnitOfWork, t: Tanqueo): Promise<Result<Tanqueo, KernelError>>;
  replace(uow: UnitOfWork, t: Tanqueo): Promise<Result<Tanqueo, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Tanqueo | null, KernelError>>;
  list(tenantId: TenantId, filtro: TanqueoFiltro): Promise<Result<Tanqueo[], KernelError>>;
}

/* ------------------------------- Catálogos ------------------------------- */

export interface OpcionCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly estado: string;
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

/* -------------------------- Recibos de idempotencia ---------------------- */

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

/* ------------------- Composición FAIL-SAFE con Activos ------------------- */

export interface MedicionActivo {
  readonly valor: number;
  readonly unidad: string;
  readonly medidoAt: string | null;
}

/**
 * Detalle público de un activo, resuelto vía la query oficial
 * `modulo.activos.detalle`. Sólo lo que la sincronización necesita: la versión
 * (para `expectedVersion`) y el último valor conocido de cada medidor.
 */
export interface DetalleActivo {
  readonly version: number;
  readonly horometro: MedicionActivo | null;
  readonly odometro: MedicionActivo | null;
}

export interface ActualizarMedidorInput {
  readonly activoId: string;
  readonly expectedVersion: number;
  readonly valor: number;
  readonly unidad: string;
  readonly fecha: string;
  readonly opId?: string | null;
}

export interface ResultadoActualizacionActivo {
  readonly version: number;
}

/**
 * Puerto FAIL-SAFE hacia Activos. Compone las QUERIES/COMANDOS PÚBLICOS reales
 * del módulo de Activos (`detalle`, `actualizar-horometro`, `actualizar-odometro`)
 * desde la capa de integración. Si no se inyecta, la sincronización del último
 * valor NO se intenta (la lectura histórica se conserva igual).
 */
export interface ActivosPort {
  /** Valida existencia de activos (fail-safe): devuelve los inexistentes. */
  existen(tenantId: TenantId, activoIds: readonly string[]): Promise<Result<{ inexistentes: readonly string[] }, KernelError>>;
  /** Detalle público (versión + último valor de medidores) para la sincronización. */
  detalle(tenantId: TenantId, activoId: string): Promise<Result<DetalleActivo | null, KernelError>>;
  /** Comando público `actualizar-horometro` (idempotente por opId). */
  actualizarHorometro(tenantId: TenantId, actorId: string, input: ActualizarMedidorInput): Promise<Result<ResultadoActualizacionActivo, KernelError>>;
  /** Comando público `actualizar-odometro` (idempotente por opId). */
  actualizarOdometro(tenantId: TenantId, actorId: string, input: ActualizarMedidorInput): Promise<Result<ResultadoActualizacionActivo, KernelError>>;
}
