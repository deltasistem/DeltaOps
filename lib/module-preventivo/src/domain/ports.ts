/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — PUERTOS del dominio.
 *
 * SOLO dominio: la persistencia y colaboradores cross-módulo se expresan como
 * PUERTOS. Los adaptadores concretos (PostgreSQL / read models CQRS / Workflow
 * Engine / composición con Planes/Activos/Órdenes) son INFRAESTRUCTURA de la
 * etapa 2; aquí sólo se declaran los contratos, con FAKES en memoria
 * (infrastructure/fakes.ts) para pruebas 100% deterministas.
 *
 * COMPOSICIÓN sin acoplamiento (lección 009.3): la colaboración con Planes,
 * Activos, Inventario y Órdenes se hace por PUERTOS FAIL-SAFE que envuelven los
 * contratos públicos/comandos oficiales en su PROPIO runtime/UoW — jamás por
 * comandos anidados ni importando aggregates ajenos.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { ProgramaPreventivo } from "./programa";
import type { ActividadPreventiva } from "./actividad";
import type { GeneracionPreventiva } from "./generacion";
import type { HistorialPreventivo } from "./historial";

export type TenantId = string;

/* ------------------------------ Repositorios ----------------------------- */

export interface ProgramaFiltro {
  readonly estado?: string;
  readonly tipo?: string;
  readonly padreId?: string | null;
  readonly limit?: number;
}

export interface ProgramaRepository {
  insert(uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<ProgramaPreventivo, KernelError>>;
  update(uow: UnitOfWork, p: ProgramaPreventivo, expectedVersion: number): Promise<Result<ProgramaPreventivo, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<ProgramaPreventivo | null, KernelError>>;
  list(tenantId: TenantId, filtro: ProgramaFiltro): Promise<Result<ProgramaPreventivo[], KernelError>>;
  /** Mapa (id → padreId) del tenant, para validar jerarquía sin ciclos. */
  mapaPadres(tenantId: TenantId): Promise<Result<Map<string, string | null>, KernelError>>;
}

export interface ProgramaVersionRepository {
  /** Persiste el snapshot inmutable de una versión histórica (N/N-1). */
  guardar(uow: UnitOfWork, p: ProgramaPreventivo): Promise<Result<void, KernelError>>;
  buscarVersion(tenantId: TenantId, programaId: string, versionPrograma: number): Promise<Result<ProgramaPreventivo | null, KernelError>>;
  listarVersiones(tenantId: TenantId, programaId: string): Promise<Result<ProgramaPreventivo[], KernelError>>;
}

export interface ActividadFiltro {
  readonly programaId?: string;
  readonly limit?: number;
}

export interface ActividadRepository {
  insert(uow: UnitOfWork, a: ActividadPreventiva): Promise<Result<ActividadPreventiva, KernelError>>;
  update(uow: UnitOfWork, a: ActividadPreventiva, expectedVersion: number): Promise<Result<ActividadPreventiva, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<ActividadPreventiva | null, KernelError>>;
  listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<ActividadPreventiva[], KernelError>>;
}

export interface GeneracionRepository {
  insert(uow: UnitOfWork, g: GeneracionPreventiva): Promise<Result<GeneracionPreventiva, KernelError>>;
  update(uow: UnitOfWork, g: GeneracionPreventiva, expectedVersion: number): Promise<Result<GeneracionPreventiva, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<GeneracionPreventiva | null, KernelError>>;
  buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionPreventiva | null, KernelError>>;
  listPorPrograma(tenantId: TenantId, programaId: string): Promise<Result<GeneracionPreventiva[], KernelError>>;
}

export interface HistorialRepository {
  append(uow: UnitOfWork, h: HistorialPreventivo): Promise<Result<HistorialPreventivo, KernelError>>;
  listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialPreventivo[], KernelError>>;
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

/** Consecutivos por familia de documento del módulo. */
export type SerieDocumento = "programa" | "generacion";

export const CONFIG_CODIGO_DEFAULT: Record<SerieDocumento, ConfigCodigo> = {
  "programa": { prefijo: "PRG", separador: "-", padding: 5, serie: "programa" },
  "generacion": { prefijo: "GEN", separador: "-", padding: 6, serie: "generacion" },
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

/* -------------------- Composición: Activos (validación) ------------------ */

/**
 * Puerto FAIL-SAFE hacia el módulo de Activos: valida la EXISTENCIA de activos
 * asociados a un programa. Referencia por id opaco; NO importa el aggregate. Si
 * no se inyecta, los comandos que requieren validación de activos fallan de
 * forma segura (nunca asumen existencia).
 */
export interface ActivosPort {
  existen(tenantId: TenantId, activoIds: readonly string[]): Promise<Result<{ inexistentes: readonly string[] }, KernelError>>;
}

/* --------------------- Composición: Planes (referencia) ------------------ */

export interface PlanPublicado {
  readonly planId: string;
  readonly version: number;
  readonly publicado: boolean;
}

/**
 * Puerto FAIL-SAFE hacia Planes (DGP-012): verifica que los planes referenciados
 * estén PUBLICADOS en la versión indicada (referencia sólo-lectura). Envuelve el
 * contrato público de Planes en su PROPIO runtime; jamás comandos anidados.
 */
export interface PlanesPort {
  verificarPublicados(
    tenantId: TenantId,
    refs: readonly { planId: string; version: number }[],
  ): Promise<Result<{ noPublicados: readonly { planId: string; version: number }[] }, KernelError>>;
}

/* ------------------ Composición: Materializador de Órdenes --------------- */

export interface EntradaMaterializacionOrden {
  /** opId = claveDedup de la generación (idempotencia end-to-end). */
  readonly opId: string;
  readonly generacionId: string;
  readonly programaId: string;
  readonly actividadId: string;
  readonly activoId: string;
  readonly fechaObjetivo: string;
  readonly checklist: { plantillaId: string; version: number } | null;
}

export interface ResultadoMaterializacionOrden {
  readonly ordenTrabajoId: string;
  readonly idempotente: boolean;
}

/**
 * MATERIALIZADOR DE ÓRDENES (colaborador cross-módulo). Compone el comando
 * OFICIAL de creación de OT del módulo de Órdenes en su PROPIO runtime/UoW
 * (jamás anidado). FAIL-SAFE: si no está configurado, la orquestación rechaza
 * con KRN-CFL (nunca crea OTs por vías no oficiales). Idempotente por `opId`.
 */
export interface MaterializadorOrdenes {
  crearOrden(
    tenantId: TenantId,
    actorId: string,
    entrada: EntradaMaterializacionOrden,
  ): Promise<Result<ResultadoMaterializacionOrden, KernelError>>;
}

/* ---------------- Dedup durable de generación (guard atómico) ------------ */

/**
 * Persistencia idempotente del guard anti-duplicado por `claveDedup`. `reservar`
 * inserta el registro pendiente (unique por clave): rowCount>0 ⇒ este proceso
 * ganó; rowCount=0 ⇒ otra generación ya existe (no-dupe). `vincular` fija el
 * ordenTrabajoId ATÓMICAMENTE con guard (`orden_trabajo_id IS NULL`).
 */
export interface GeneracionDedupStore {
  reservar(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, generacionId: string): Promise<Result<boolean, KernelError>>;
  vincular(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>>;
  buscar(tenantId: TenantId, claveDedup: string): Promise<Result<{ generacionId: string; ordenTrabajoId: string | null } | null, KernelError>>;
}
