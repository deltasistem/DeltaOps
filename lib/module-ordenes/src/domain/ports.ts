/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — PUERTOS del dominio.
 *
 * Esta subfase entrega SOLO el dominio: la persistencia y los colaboradores se
 * expresan como PUERTOS (interfaces) que el dominio necesita para funcionar. Los
 * ADAPTADORES concretos (PostgreSQL / Record Store / runtime compuesto) son
 * INFRAESTRUCTURA y llegan en DGP-009.2; aquí solo se declaran los contratos y
 * se acompañan de FAKES en memoria (ver `infrastructure/fakes.ts`) para pruebas
 * de dominio 100% deterministas.
 *
 * NOTA: `config` (tenantConfig) es un primitivo de la plataforma (DGP-003), no
 * infraestructura de este módulo; se consume vía `ServiceDeps.tenantConfig`.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EstadoOrden, ExtensionMaquina } from "./maquina-estados";
import type { OrdenTrabajo } from "./orden";
import type { EntradaCatalogo, NombreCatalogo } from "./catalogos";

export type TenantId = string;

/* ------------------------------- Repositorio ---------------------------- */

export interface OrdenFiltro {
  readonly estado?: EstadoOrden;
  readonly limit?: number;
}

/**
 * Repositorio del aggregate: única fuente de verdad de este paquete. La lectura
 * mínima que el dominio necesita se sirve del propio aggregate (no hay read
 * model materializado; la proyección/CQRS de lectura llega en DGP-009.2).
 */
export interface OrdenRepository {
  insert(uow: UnitOfWork, o: OrdenTrabajo): Promise<Result<OrdenTrabajo, KernelError>>;
  update(uow: UnitOfWork, o: OrdenTrabajo, expectedVersion: number): Promise<Result<OrdenTrabajo, KernelError>>;
  findById(tenantId: TenantId, id: string): Promise<Result<OrdenTrabajo | null, KernelError>>;
  list(tenantId: TenantId, filtro: OrdenFiltro): Promise<Result<OrdenTrabajo[], KernelError>>;
}

/* -------------------------------- Catálogos ------------------------------ */

export interface OpcionCatalogo {
  readonly value: string;
  readonly label: string;
  readonly posicion: number;
  readonly padre: string | null;
}

/** Puerto de catálogos configurables por tenant. */
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
  /**
   * Estados de negocio declarados para el tenant (además del default canónico).
   * Permite que la máquina refleje estados añadidos por configuración sin
   * fallback silencioso. Devuelve los NOMBRES neutros del motor (camelCase).
   */
  estadosDeclarados(tenantId: TenantId): Promise<Result<string[], KernelError>>;
  /**
   * Extensión DECLARATIVA de la máquina de estados del tenant (estados +
   * transiciones extra). Cero código: son datos que el módulo compone con el
   * ciclo base y publica/activa en el Workflow Engine (ver `componerDefinicion`).
   * Un tenant sin extensión devuelve `EXTENSION_VACIA`.
   */
  extensionMaquina(tenantId: TenantId): Promise<Result<ExtensionMaquina, KernelError>>;
}

/* ------------------------------- Consecutivo ----------------------------- */

export interface ConfigCodigo {
  readonly prefijo: string;
  readonly separador: string;
  readonly padding: number;
  /** Clave del contador (permite varias series por tenant si se desea). */
  readonly serie: string;
}

export const CONFIG_CODIGO_DEFAULT: ConfigCodigo = {
  prefijo: "OT",
  separador: "-",
  padding: 6,
  serie: "default",
};

/** Puerto del generador de consecutivos (transaccional). */
export interface ConsecutivoPort {
  siguiente(
    uow: UnitOfWork,
    tenantId: TenantId,
    cfg: ConfigCodigo,
    actorId: string,
  ): Promise<Result<import("./value-objects").CodigoOrden, KernelError>>;
}

/* ------------------------- Recibos de idempotencia ----------------------- */

export interface Recibo {
  readonly opId: string;
  readonly comando: string;
  readonly resultado: Record<string, unknown>;
}

/** Recibos offline: exactamente-una aplicación por opId+comando. */
export interface ReciboPort {
  /** Devuelve el recibo previo si el opId ya fue aplicado. */
  buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>>;
  /** Sella el recibo dentro de la UoW del comando. */
  sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>>;
}

/* ---------------- Puerto hacia Dynamic Forms (plantillas) ---------------- */

export type ClasePlantilla = "formulario" | "checklist";

export interface PlantillaVerificada {
  readonly clave: string;
  readonly version: number;
  /** Clase inferida de la definición de la plantilla. */
  readonly clase: ClasePlantilla;
  /** Título de la plantilla (para etiquetar la referencia). */
  readonly titulo: string;
  /** Versión activa vigente para la clave (para evaluar compatibilidad N/N-1). */
  readonly versionActiva: number | null;
}

/**
 * Puerto hacia el motor de Dynamic Forms (`modulo.formularios`). El dominio lo
 * usa para VALIDAR que una plantilla existe, es de la clase esperada y su
 * versión es compatible (N/N-1), y para ANCLAR respuestas a la versión exacta.
 */
export interface PlantillasPort {
  /**
   * Verifica que la plantilla (clave+versión) existe y es de la clase esperada.
   * Falla con error explícito si no existe o la clase no coincide.
   */
  verificar(tenantId: TenantId, clase: ClasePlantilla, clave: string, version: number): Promise<Result<PlantillaVerificada, KernelError>>;
  /**
   * Verifica que una RESPUESTA existe y está anclada a la versión exacta de la
   * plantilla indicada (coherencia respuesta↔plantilla). Devuelve la versión de
   * plantilla con la que se llenó.
   */
  verificarRespuesta(tenantId: TenantId, respuestaId: string, plantillaClave: string): Promise<Result<{ respuestaId: string; plantillaClave: string; plantillaVersion: number }, KernelError>>;
}
