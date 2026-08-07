/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — PUERTOS del dominio.
 *
 * SOLO dominio: la persistencia y los colaboradores cross-módulo se expresan como
 * PUERTOS. Los adaptadores concretos (PostgreSQL / read models / Workflow Engine /
 * composición con Activos/Órdenes/Inventario/Abastecimiento/Dynamic Forms) son
 * INFRAESTRUCTURA de la etapa 2; aquí sólo se declaran los contratos, con FAKES
 * en memoria (infrastructure/fakes.ts) para pruebas 100% deterministas.
 *
 * COMPOSICIÓN sin acoplamiento (lección 009.3): la colaboración con Activos,
 * Inventario, Abastecimiento y Órdenes se hace por PUERTOS FAIL-SAFE que envuelven
 * los COMANDOS PÚBLICOS oficiales en su PROPIO runtime/UoW — jamás por comandos
 * anidados ni importando aggregates ajenos. Si un puerto no se inyecta, el comando
 * que lo requiere FALLA de forma segura (nunca asume el efecto).
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";
import type { SolicitudMantenimiento } from "./solicitud";
import type { Diagnostico } from "./diagnostico";
import type { Intervencion } from "./intervencion";
import type { GeneracionOrdenCorrectiva } from "./orden-correctiva";
import type { HistorialCorrectivo } from "./historial";
import type { EventoActivo } from "./eventos-activo";

export type TenantId = string;

/* ------------------------------ Repositorios ----------------------------- */

export interface SolicitudFiltro {
  readonly estado?: string;
  readonly origen?: string;
  readonly activoId?: string;
  readonly limit?: number;
}

export interface SolicitudRepository {
  insert(uow: UnitOfWork, s: SolicitudMantenimiento): Promise<Result<SolicitudMantenimiento, KernelError>>;
  update(uow: UnitOfWork, s: SolicitudMantenimiento, expectedVersion: number): Promise<Result<SolicitudMantenimiento, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<SolicitudMantenimiento | null, KernelError>>;
  list(tenantId: TenantId, filtro: SolicitudFiltro): Promise<Result<SolicitudMantenimiento[], KernelError>>;
}

export interface DiagnosticoRepository {
  insert(uow: UnitOfWork, d: Diagnostico): Promise<Result<Diagnostico, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Diagnostico | null, KernelError>>;
  buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Diagnostico | null, KernelError>>;
}

export interface IntervencionRepository {
  insert(uow: UnitOfWork, i: Intervencion): Promise<Result<Intervencion, KernelError>>;
  update(uow: UnitOfWork, i: Intervencion, expectedVersion: number): Promise<Result<Intervencion, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<Intervencion | null, KernelError>>;
  buscarPorSolicitud(tenantId: TenantId, solicitudId: string): Promise<Result<Intervencion | null, KernelError>>;
}

export interface GeneracionRepository {
  insert(uow: UnitOfWork, g: GeneracionOrdenCorrectiva): Promise<Result<GeneracionOrdenCorrectiva, KernelError>>;
  update(uow: UnitOfWork, g: GeneracionOrdenCorrectiva, expectedVersion: number): Promise<Result<GeneracionOrdenCorrectiva, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>>;
  buscarPorClave(tenantId: TenantId, claveDedup: string): Promise<Result<GeneracionOrdenCorrectiva | null, KernelError>>;
}

export interface HistorialRepository {
  append(uow: UnitOfWork, h: HistorialCorrectivo): Promise<Result<HistorialCorrectivo, KernelError>>;
  listPorEntidad(tenantId: TenantId, entityRef: string): Promise<Result<HistorialCorrectivo[], KernelError>>;
}

export interface EventoActivoRepository {
  append(uow: UnitOfWork, e: EventoActivo): Promise<Result<EventoActivo, KernelError>>;
  /** Eventos previos del activo (para detección de reincidencia). */
  listPorActivo(tenantId: TenantId, activoId: string): Promise<Result<EventoActivo[], KernelError>>;
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
export type SerieDocumento = "solicitud" | "intervencion";

export const CONFIG_CODIGO_DEFAULT: Record<SerieDocumento, ConfigCodigo> = {
  "solicitud": { prefijo: "SOL", separador: "-", padding: 6, serie: "solicitud" },
  "intervencion": { prefijo: "INT", separador: "-", padding: 6, serie: "intervencion" },
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

export interface ValidacionActivo {
  readonly inexistentes: readonly string[];
}

/**
 * Puerto FAIL-SAFE hacia el módulo de Activos: valida EXISTENCIA de activos y de
 * componentes referenciados. Referencia por id opaco; NO importa el aggregate. Si
 * no se inyecta, los comandos que requieren validación fallan de forma segura.
 */
export interface ActivosPort {
  existen(tenantId: TenantId, activoIds: readonly string[]): Promise<Result<ValidacionActivo, KernelError>>;
  /** Valida que los componentes existan dentro del activo indicado. */
  componentesExisten(
    tenantId: TenantId,
    activoId: string,
    componenteIds: readonly string[],
  ): Promise<Result<ValidacionActivo, KernelError>>;
}

/* -------------------- Composición: Dynamic Forms (diagnóstico) ----------- */

/**
 * Puerto FAIL-SAFE hacia Dynamic Forms (DGP-003): verifica que la plantilla del
 * diagnóstico esté PUBLICADA en la versión indicada y (opcionalmente) valida las
 * respuestas contra el esquema de la plantilla. Envuelve el contrato público en
 * su PROPIO runtime; jamás comandos anidados.
 */
export interface DynamicFormsPort {
  verificarPlantilla(
    tenantId: TenantId,
    plantillaId: string,
    version: number,
  ): Promise<Result<{ publicada: boolean }, KernelError>>;
  validarRespuestas(
    tenantId: TenantId,
    plantillaId: string,
    version: number,
    respuestas: Record<string, unknown>,
  ): Promise<Result<{ validas: boolean; errores: readonly string[] }, KernelError>>;
}

/* ------------------ Composición: Materializador de Órdenes --------------- */

export interface EntradaMaterializacionOrden {
  /** opId = claveDedup de la generación (idempotencia end-to-end). */
  readonly opId: string;
  readonly generacionId: string;
  readonly solicitudId: string;
  /** Activo principal en el formato canónico del módulo de Órdenes. */
  readonly activoPrincipal: { activoId: string; entityRef: string; rol: "principal" | "relacionado" };
  readonly titulo: string;
  readonly prioridad: string;
  /** Tipo canónico de OT = "correctiva" (fijado por Órdenes). */
  readonly tipo: string;
  readonly diagnostico: { plantillaId: string; version: number } | null;
}

export interface ResultadoMaterializacionOrden {
  readonly ordenTrabajoId: string;
  readonly idempotente: boolean;
}

/**
 * MATERIALIZADOR DE ÓRDENES (colaborador cross-módulo). Compone el comando OFICIAL
 * `modulo.ordenes.crear` (tipo canónico "correctiva") en su PROPIO runtime/UoW
 * (jamás anidado). FAIL-SAFE: si no está configurado, la orquestación rechaza con
 * KRN-CFL (nunca crea OTs por vías no oficiales). Idempotente por `opId`.
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
 * inserta el registro pendiente (unique por clave): true ⇒ este proceso ganó;
 * false ⇒ otra generación ya existe (no-dupe). `vincular` fija el ordenTrabajoId
 * ATÓMICAMENTE con guard (`orden_trabajo_id IS NULL`).
 */
export interface GeneracionDedupStore {
  reservar(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, generacionId: string): Promise<Result<boolean, KernelError>>;
  vincular(uow: UnitOfWork, tenantId: TenantId, claveDedup: string, ordenTrabajoId: string): Promise<Result<boolean, KernelError>>;
  buscar(tenantId: TenantId, claveDedup: string): Promise<Result<{ generacionId: string; ordenTrabajoId: string | null } | null, KernelError>>;
}

/* -------------------- Composición: Inventario (repuestos) ---------------- */

/** Línea de repuesto (referencia por artículo/inventario). */
export interface LineaRepuesto {
  readonly inventarioId: string;
  readonly articuloId: string;
  readonly cantidad: number;
  readonly unidad: string;
}

export interface ResultadoDisponibilidad {
  /** Líneas con stock suficiente. */
  readonly disponibles: readonly LineaRepuesto[];
  /** Líneas con stock insuficiente (activan solicitud de compra). */
  readonly faltantes: readonly (LineaRepuesto & { disponible: number })[];
}

export interface ResultadoConsumo {
  readonly consumidoTotal: boolean;
  /** Cantidad efectivamente consumida (soporta consumo PARCIAL). */
  readonly cantidadConsumida: number;
}

/**
 * Puerto FAIL-SAFE hacia Inventario (DGP-011). Compone los COMANDOS OFICIALES:
 * `reservar`, `mover` (tipo=consumo / tipo=devolucion), `liberar-reserva`,
 * `existencia`. NUNCA acceso directo a las tablas de inventario. Idempotente por
 * `opId`. Consumo desde reservas; consumo PARCIAL y devolución soportados.
 */
export interface InventarioPort {
  /** Verifica disponibilidad de las líneas de repuesto. */
  verificarDisponibilidad(tenantId: TenantId, lineas: readonly LineaRepuesto[]): Promise<Result<ResultadoDisponibilidad, KernelError>>;
  /** Reserva repuestos para la intervención (demanda = orden). */
  reservar(tenantId: TenantId, actorId: string, entrada: { opId: string; demandaId: string; lineas: readonly LineaRepuesto[] }): Promise<Result<{ idempotente: boolean }, KernelError>>;
  /** Consume desde reservas (mover tipo=consumo). Soporta consumo parcial. */
  consumir(tenantId: TenantId, actorId: string, entrada: { opId: string; demandaId: string; linea: LineaRepuesto }): Promise<Result<ResultadoConsumo, KernelError>>;
  /** Devuelve repuestos no usados (mover tipo=devolucion). */
  devolver(tenantId: TenantId, actorId: string, entrada: { opId: string; demandaId: string; linea: LineaRepuesto }): Promise<Result<{ idempotente: boolean }, KernelError>>;
}

/* -------------------- Composición: Abastecimiento (compras) -------------- */

export interface LineaCompra {
  readonly numero: number;
  readonly articuloId?: string;
  readonly descripcion?: string;
  readonly cantidad: number;
}

/**
 * Puerto FAIL-SAFE hacia Abastecimiento (DGP-013). Ante stock INSUFICIENTE,
 * compone el COMANDO OFICIAL `modulo.abastecimiento.crear-solicitud` con
 * `origen.tipo = "orden"`. Idempotente por `opId` (no duplica solicitudes de
 * compra para la misma OT/clave).
 */
export interface AbastecimientoPort {
  solicitarCompra(
    tenantId: TenantId,
    actorId: string,
    entrada: {
      opId: string;
      titulo: string;
      prioridad: string;
      referenciaId: string;
      lineas: readonly LineaCompra[];
    },
  ): Promise<Result<{ solicitudCompraId: string; idempotente: boolean }, KernelError>>;
}
