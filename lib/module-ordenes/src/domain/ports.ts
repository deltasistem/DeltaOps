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

/* ------------------- Puerto hacia Identidad canónica --------------------- */

/**
 * Proyección MÍNIMA de la identidad canónica de DeltaOps (DGP-017,
 * `idn_identities` + `idn_memberships`) que el dominio de Órdenes necesita para
 * VALIDAR una asignación de recurso humano (DGP-020.1, resuelve G-1).
 *
 * `identityId` es la ÚNICA clave de negocio. `nombre`/`email` son atributos de
 * PRESENTACIÓN (nunca clave). `estado` es el de la IDENTIDAD y
 * `estadoMembresia` el de la MEMBRESÍA en el tenant; ambos deben estar activos
 * para admitir una nueva asignación (el dominio no inventa estados: usa los que
 * el contrato de Identidad ya declara).
 */
export interface IdentidadVerificada {
  readonly identityId: string;
  readonly tenantId: TenantId;
  readonly nombre: string;
  readonly email: string;
  /** Estado de la IDENTIDAD canónica ("ACTIVO" | "DESHABILITADO" | "PENDIENTE"). */
  readonly estado: string;
  /** Estado de la MEMBRESÍA en el tenant ("ACTIVO" | "DESHABILITADO"). */
  readonly estadoMembresia: string;
  /** Rol canónico de la membresía (presentación/futuras reglas). */
  readonly rol: string;
}

export interface IdentidadElegible {
  readonly identityId: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: string;
  readonly estadoMembresia: string;
}

/**
 * Puerto hacia la Identidad canónica. Órdenes NUNCA accede a las tablas internas
 * de Identidad: consulta este puerto, cuyo adaptador de producción se respalda
 * en las consultas PÚBLICAS del servicio de Identidad (DGP-017). El tenant se
 * deriva SIEMPRE del contexto autenticado del backend (nunca del frontend).
 *
 * Contrato FAIL-SAFE (como `WorkflowPort` de DGP-011.1): ante cualquier fallo de
 * infraestructura devuelve `Result.fail`; la ausencia de identidad/membresía se
 * representa como `Result.ok(null)` para que el comando decida el error de
 * negocio (identidad inexistente ⇒ validación, no 500).
 */
export interface IdentidadPort {
  /**
   * Verifica una identidad DENTRO del tenant indicado. Devuelve `ok(null)` si la
   * identidad no existe o no tiene membresía en ESE tenant (aislamiento
   * cross-tenant: una identidad de otro tenant se ve como inexistente aquí).
   */
  verificar(tenantId: TenantId, identityId: string): Promise<Result<IdentidadVerificada | null, KernelError>>;
  /** Identidades ELEGIBLES del tenant (para el selector del frontend). */
  elegibles(tenantId: TenantId, filtro?: { q?: string }): Promise<Result<IdentidadElegible[], KernelError>>;
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
