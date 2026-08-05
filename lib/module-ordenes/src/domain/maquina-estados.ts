/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — Ciclo de vida DECLARATIVO gobernado
 * por el Workflow Engine (DGP-007).
 *
 * El mandato exige que TODA transición se ejecute mediante el Workflow Engine y
 * NUNCA mediante lógica propia. Por ello el ciclo de vida se declara como una
 * `DefinicionWorkflow` (datos) y se ejecuta a través de los comandos de
 * instancia del motor. Este archivo NO contiene `switch`/`if` de transición:
 * solo la DECLARACIÓN canónica, los nombres de estado/comando y el MAPEO entre
 * los estados NEUTROS del motor y los estados de NEGOCIO de la OT.
 *
 * IMPORTANTE (guardarraíl DGP-006/DGP-007): el motor de workflow es NEUTRO y
 * RECHAZA vocabulario de negocio ("orden", "activo", …) y exige camelCase en
 * estados/comandos y kebab-case en la clave. Por eso la definición usa
 * identificadores neutros (`borrador`, `enEjecucion`, `ciclo-item`, …) y este
 * módulo los traduce a los estados de negocio públicos (`BORRADOR`,
 * `EN_EJECUCION`, …), que SÍ pertenecen a su dominio.
 *
 * Estados de negocio canónicos (mínimos exigidos):
 *   BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA → EN_EJECUCION ⇄ PAUSADA
 *   EN_EJECUCION → EN_VALIDACION → CERRADA (final)
 *   (cualquier estado no-final) → CANCELADA (operación estándar del motor)
 *
 * Los tenants pueden AÑADIR estados/transiciones por configuración (catálogo
 * `estados` + workflow publicado con la misma clave): el motor valida la
 * definición extendida.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ESTADO_CANCELADO, validarWorkflow, type DefinicionWorkflow, type EstadoWorkflow, type TransicionWorkflow } from "@workspace/workflow-engine";

/* --------------------------- Estados de negocio -------------------------- */

export const ESTADOS = [
  "BORRADOR",
  "ABIERTA",
  "PLANIFICADA",
  "ASIGNADA",
  "EN_EJECUCION",
  "PAUSADA",
  "EN_VALIDACION",
  "CERRADA",
  "CANCELADA",
] as const;
export type EstadoOrden = (typeof ESTADOS)[number];

export const ESTADO_INICIAL: EstadoOrden = "BORRADOR";
export const ESTADOS_FINALES: readonly EstadoOrden[] = ["CERRADA", "CANCELADA"];

/* ------------------- Estados NEUTROS del motor (camelCase) --------------- */

export const WF_BORRADOR = "borrador";
export const WF_ABIERTO = "abierto";
export const WF_PLANIFICADO = "planificado";
export const WF_ASIGNADO = "asignado";
export const WF_EN_EJECUCION = "enEjecucion";
export const WF_PAUSADO = "pausado";
export const WF_EN_VALIDACION = "enValidacion";
export const WF_CERRADO = "cerrado";

/**
 * Estado de negocio efectivo: la unión canónica O un estado añadido por el
 * tenant (string libre en SCREAMING_SNAKE_CASE derivado del nombre neutro).
 */
export type EstadoOrdenEfectivo = EstadoOrden | string;

/** Mapeo BASE (canónico) estado NEUTRO del motor → estado de NEGOCIO de la OT. */
export const NEUTRO_A_NEGOCIO_BASE: Readonly<Record<string, EstadoOrden>> = {
  [WF_BORRADOR]: "BORRADOR",
  [WF_ABIERTO]: "ABIERTA",
  [WF_PLANIFICADO]: "PLANIFICADA",
  [WF_ASIGNADO]: "ASIGNADA",
  [WF_EN_EJECUCION]: "EN_EJECUCION",
  [WF_PAUSADO]: "PAUSADA",
  [WF_EN_VALIDACION]: "EN_VALIDACION",
  [WF_CERRADO]: "CERRADA",
  [ESTADO_CANCELADO]: "CANCELADA",
};

/** Estados NEUTROS del ciclo canónico (base). */
export const ESTADOS_MOTOR_BASE: readonly string[] = [
  WF_BORRADOR, WF_ABIERTO, WF_PLANIFICADO, WF_ASIGNADO,
  WF_EN_EJECUCION, WF_PAUSADO, WF_EN_VALIDACION, WF_CERRADO, ESTADO_CANCELADO,
];

/** camelCase → SCREAMING_SNAKE_CASE (nombre de negocio de un estado del tenant). */
export function neutroANombreNegocio(neutro: string): string {
  return neutro
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

/**
 * Traduce el estado del motor al estado de NEGOCIO SIN fallback silencioso.
 *
 * - Estado canónico ⇒ nombre de negocio canónico.
 * - Estado declarado por el tenant (presente en `estadosTenant`, nombres NEUTROS
 *   del motor) ⇒ nombre de negocio derivado (SCREAMING_SNAKE).
 * - Estado NO declarado ⇒ ERROR EXPLÍCITO (nunca BORRADOR por defecto).
 *
 * @param estadosTenant Estados neutros extra declarados por el tenant (catálogo
 *   `estados` + definición extendida validada por `validarWorkflow`).
 */
export function estadoDeNegocio(
  estadoMotor: string,
  estadosTenant: readonly string[] = [],
): Result<EstadoOrdenEfectivo, KernelError> {
  const canonico = NEUTRO_A_NEGOCIO_BASE[estadoMotor];
  if (canonico) return ok(canonico);
  if (estadosTenant.includes(estadoMotor)) return ok(neutroANombreNegocio(estadoMotor));
  return fail(
    KernelErrors.validation(
      `Estado de workflow no declarado: "${estadoMotor}". ` +
        `Los estados extra deben declararse en el catálogo "estados" y en la definición de workflow del tenant.`,
    ),
  );
}

/* ------------------------- Comandos de transición ------------------------ */
/**
 * Comandos lógicos NEUTROS (camelCase) que dispara el consumidor a través del
 * motor. El motor resuelve la transición aplicable según el estado actual.
 */
export const CMD_ABRIR = "abrir";
export const CMD_PLANIFICAR = "planificar";
export const CMD_ASIGNAR = "asignar";
export const CMD_INICIAR = "iniciar";
export const CMD_PAUSAR = "pausar";
export const CMD_REANUDAR_EJECUCION = "reanudarEjecucion";
export const CMD_ENVIAR_VALIDACION = "enviarValidacion";
export const CMD_DEVOLVER = "devolver";
export const CMD_CERRAR = "cerrar";

/**
 * Clave NEUTRA (kebab-case) de la definición de workflow del ciclo. Un tenant
 * puede publicar su propia definición con esta misma clave para ampliar
 * estados/transiciones (versionado N/N-1 del motor).
 */
export const WORKFLOW_ORDEN = "ciclo-item";

/** Permisos exigidos para operar/validar transiciones (namespace del módulo). */
export const PERMISO_OPERAR = "modulo.ordenes.operar";
export const PERMISO_VALIDAR = "modulo.ordenes.validar";

/**
 * Definición declarativa del ciclo de vida para el Workflow Engine (neutra).
 *
 * - El cierre (`enValidacion → cerrado`) está GOBERNADO por una aprobación inline
 *   (gate): el comando `cerrar` no cierra hasta que la validación se aprueba; si
 *   se rechaza, vuelve a `enEjecucion` (`rechazoA`).
 * - `cancelado` se modela con la operación estándar `cancelar` del motor
 *   (cualquier estado no-final → cancelado), evitando declarar N transiciones.
 * - `pausado` usa transiciones explícitas (pausar/reanudar) para conservar
 *   trazabilidad de la ejecución (no la suspensión genérica del motor).
 */
export const DEFINICION_WORKFLOW_ORDEN: DefinicionWorkflow = {
  clave: WORKFLOW_ORDEN,
  etiqueta: "Ciclo de vida del elemento de trabajo",
  estados: [
    { nombre: WF_BORRADOR, inicial: true, etiqueta: "Borrador" },
    { nombre: WF_ABIERTO, etiqueta: "Abierto" },
    { nombre: WF_PLANIFICADO, etiqueta: "Planificado" },
    { nombre: WF_ASIGNADO, etiqueta: "Asignado" },
    { nombre: WF_EN_EJECUCION, etiqueta: "En ejecución" },
    { nombre: WF_PAUSADO, etiqueta: "Pausado" },
    { nombre: WF_EN_VALIDACION, etiqueta: "En validación" },
    { nombre: WF_CERRADO, final: true, etiqueta: "Cerrado" },
  ],
  transiciones: [
    { de: WF_BORRADOR, a: WF_ABIERTO, comando: CMD_ABRIR, permiso: PERMISO_OPERAR },
    { de: WF_ABIERTO, a: WF_PLANIFICADO, comando: CMD_PLANIFICAR, permiso: PERMISO_OPERAR },
    { de: WF_PLANIFICADO, a: WF_ASIGNADO, comando: CMD_ASIGNAR, permiso: PERMISO_OPERAR },
    { de: WF_ASIGNADO, a: WF_EN_EJECUCION, comando: CMD_INICIAR, permiso: PERMISO_OPERAR },
    { de: WF_EN_EJECUCION, a: WF_PAUSADO, comando: CMD_PAUSAR, permiso: PERMISO_OPERAR },
    { de: WF_PAUSADO, a: WF_EN_EJECUCION, comando: CMD_REANUDAR_EJECUCION, permiso: PERMISO_OPERAR },
    { de: WF_EN_EJECUCION, a: WF_EN_VALIDACION, comando: CMD_ENVIAR_VALIDACION, permiso: PERMISO_OPERAR },
    { de: WF_EN_VALIDACION, a: WF_EN_EJECUCION, comando: CMD_DEVOLVER, permiso: PERMISO_VALIDAR },
    {
      de: WF_EN_VALIDACION,
      a: WF_CERRADO,
      comando: CMD_CERRAR,
      permiso: PERMISO_VALIDAR,
      rechazoA: WF_EN_EJECUCION,
      acciones: [{ tipo: "emitirEvento", evento: "cerrado" }],
      aprobacion: {
        nombre: "validacionCierre",
        modo: "individual",
        permiso: PERMISO_VALIDAR,
        aprobadores: ["validador"],
      },
    },
  ],
  operacionesEstandar: {
    cancelar: { estado: ESTADO_CANCELADO, permiso: PERMISO_OPERAR },
    reabrir: false,
    suspender: false,
    reanudar: false,
  },
};

/* ------------------- Extensión declarativa por tenant -------------------- */
/**
 * Extensión DECLARATIVA (datos, cero código) de la máquina de estados que un
 * tenant puede definir por configuración. Añade estados y transiciones NEUTROS
 * (camelCase) al ciclo base para que instancias reales puedan ALCANZAR estados
 * propios del tenant (p. ej. `enEspera`).
 *
 * Restricciones (validadas al componer):
 *   - Los estados extra usan nombres NEUTROS (camelCase); NO pueden redeclarar
 *     un estado del ciclo base.
 *   - Las transiciones extra referencian estados existentes (base o extra) y
 *     usan comandos NEUTROS que no colisionan con los del ciclo base.
 */
export interface EstadoExtension {
  readonly nombre: string;
  readonly etiqueta?: string;
  readonly final?: boolean;
}

export interface TransicionExtension {
  readonly de: string;
  readonly comando: string;
  readonly hacia: string;
  readonly permiso?: string;
}

export interface ExtensionMaquina {
  readonly estados: readonly EstadoExtension[];
  readonly transiciones: readonly TransicionExtension[];
}

export const EXTENSION_VACIA: ExtensionMaquina = { estados: [], transiciones: [] };

/** Comandos del ciclo base (para detectar colisiones con la extensión). */
export const COMANDOS_BASE: readonly string[] = [
  CMD_ABRIR, CMD_PLANIFICAR, CMD_ASIGNAR, CMD_INICIAR, CMD_PAUSAR,
  CMD_REANUDAR_EJECUCION, CMD_ENVIAR_VALIDACION, CMD_DEVOLVER, CMD_CERRAR,
];

/**
 * Compone la definición ACTIVA del tenant = ciclo base + extensión declarativa,
 * y la VALIDA con el motor (`validarWorkflow`). Función pura, sin efectos.
 *
 * Devuelve la definición compuesta y el conjunto de estados NEUTROS extra
 * declarados (para coherencia con el catálogo `estados`). Errores explícitos si:
 *   - un estado extra redeclara uno del ciclo base;
 *   - una transición referencia un estado inexistente;
 *   - un comando extra colisiona con uno del ciclo base;
 *   - el motor rechaza la definición compuesta (`validarWorkflow`).
 */
export function componerDefinicion(
  extension: ExtensionMaquina = EXTENSION_VACIA,
): Result<{ definicion: DefinicionWorkflow; estadosExtra: string[] }, KernelError> {
  const baseEstados = new Set(ESTADOS_MOTOR_BASE);
  const estadosExtra: string[] = [];
  const estadosDef: EstadoWorkflow[] = [...DEFINICION_WORKFLOW_ORDEN.estados];

  for (const e of extension.estados) {
    if (baseEstados.has(e.nombre)) {
      return fail(KernelErrors.validation(`El estado extendido "${e.nombre}" redeclara un estado del ciclo base`));
    }
    if (estadosExtra.includes(e.nombre)) {
      return fail(KernelErrors.validation(`El estado extendido "${e.nombre}" está duplicado`));
    }
    estadosExtra.push(e.nombre);
    estadosDef.push({ nombre: e.nombre, ...(e.etiqueta ? { etiqueta: e.etiqueta } : {}), ...(e.final ? { final: true } : {}) });
  }

  const nombresValidos = new Set<string>([...baseEstados, ...estadosExtra]);
  const transicionesDef: TransicionWorkflow[] = [...DEFINICION_WORKFLOW_ORDEN.transiciones];
  for (const t of extension.transiciones) {
    if (!nombresValidos.has(t.de)) {
      return fail(KernelErrors.validation(`La transición extendida referencia un estado origen inexistente: "${t.de}"`));
    }
    if (!nombresValidos.has(t.hacia)) {
      return fail(KernelErrors.validation(`La transición extendida referencia un estado destino inexistente: "${t.hacia}"`));
    }
    if (COMANDOS_BASE.includes(t.comando)) {
      return fail(KernelErrors.validation(`El comando extendido "${t.comando}" colisiona con un comando del ciclo base`));
    }
    transicionesDef.push({ de: t.de, a: t.hacia, comando: t.comando, permiso: t.permiso ?? PERMISO_OPERAR });
  }

  const definicion: DefinicionWorkflow = {
    ...DEFINICION_WORKFLOW_ORDEN,
    estados: estadosDef,
    transiciones: transicionesDef,
  };

  const val = validarWorkflow(definicion);
  if (!val.valido) {
    return fail(KernelErrors.validation(`Definición de workflow del tenant inválida (DGP-007)`, { errores: val.errores }));
  }
  return ok({ definicion, estadosExtra });
}

/**
 * Serialización CANÓNICA de un valor: claves de objeto ordenadas
 * alfabéticamente de forma recursiva y arrays preservados. Determinista e
 * independiente del orden de inserción de propiedades. `undefined`/funciones se
 * omiten (como en `JSON.stringify`).
 */
function serializarCanonico(valor: unknown): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) {
    return `[${valor.map((v) => serializarCanonico(v)).join(",")}]`;
  }
  if (typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    const claves = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== "function")
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${serializarCanonico(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

/**
 * Firma de contenido ESTABLE y COMPLETA de la extensión, para derivar un id de
 * definición distinto cuando CUALQUIER campo semántico cambia (publica nueva
 * versión) e idéntico cuando no cambia (idempotente).
 *
 * Incluye TODOS los campos de `ExtensionMaquina` (nombre/etiqueta/final de cada
 * estado; de/comando/hacia/**permiso** de cada transición). Un cambio de
 * `permiso` en una transición extendida DEBE producir una firma distinta para
 * que se publique/active una definición nueva y el motor aplique la nueva
 * autorización (no retenga la anterior).
 *
 * Determinismo: normaliza cada estado/transición a un objeto de forma fija y
 * ORDENA ambas listas por su serialización canónica, de modo que la firma no
 * dependa del orden de los elementos ni del orden de las claves.
 */
export function firmaExtension(extension: ExtensionMaquina = EXTENSION_VACIA): string {
  const estados = extension.estados
    .map((e) => ({ nombre: e.nombre, etiqueta: e.etiqueta ?? null, final: e.final ?? false }))
    .map(serializarCanonico)
    .sort();
  const transiciones = extension.transiciones
    .map((t) => ({ de: t.de, comando: t.comando, hacia: t.hacia, permiso: t.permiso ?? null }))
    .map(serializarCanonico)
    .sort();
  const raw = serializarCanonico({ estados, transiciones });
  // Hash FNV-1a de 32 bits (determinista, sin dependencias).
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
