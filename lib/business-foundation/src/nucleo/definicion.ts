/**
 * DGP-006 · Business Foundation Framework — Definiciones declarativas.
 *
 * Contract First + Configuration First: un módulo de negocio se describe con
 * datos (DefinicionModulo → DefinicionEntidad → DefinicionCampo) y el núcleo
 * genérico lo convierte en un PlatformServiceDefinition completo (comandos,
 * consultas, eventos, proyección, configuración por tenant).
 *
 * Este archivo es 100% neutro: NO contiene ningún concepto de negocio. Los
 * tipos son genéricos y en español (DefinicionEntidad, DefinicionCampo, ...).
 */
import { z } from "zod";

/* ------------------------------- Campos ---------------------------------- */

export type TipoCampo =
  | "texto"
  | "numero"
  | "booleano"
  | "fecha"
  | "enum"
  | "referencia"
  | "json";

/** Descriptor declarativo de un campo de datos de una entidad. */
export interface DefinicionCampo {
  readonly nombre: string;
  readonly tipo: TipoCampo;
  readonly requerido?: boolean;
  /** Valores permitidos cuando `tipo === "enum"`. */
  readonly enumValores?: readonly string[];
  /** Longitud máxima para `tipo === "texto"`. */
  readonly longitudMax?: number;
  /** El campo participa en la búsqueda textual (search del payload). */
  readonly buscable?: boolean;
  /** El campo puede usarse como filtro en el listado. */
  readonly filtrable?: boolean;
}

/** Convierte un campo declarativo en su esquema Zod. */
export function campoAZod(campo: DefinicionCampo): z.ZodTypeAny {
  let esquema: z.ZodTypeAny;
  switch (campo.tipo) {
    case "texto": {
      let s = z.string();
      if (campo.longitudMax !== undefined) s = s.max(campo.longitudMax);
      if (campo.requerido) s = s.min(1);
      esquema = s;
      break;
    }
    case "numero":
      esquema = z.number();
      break;
    case "booleano":
      esquema = z.boolean();
      break;
    case "fecha":
      // Fecha serializable (ISO string) — Offline First friendly.
      esquema = z.string();
      break;
    case "enum": {
      const valores = campo.enumValores ?? [];
      if (valores.length === 0) {
        esquema = z.string();
      } else {
        esquema = z.enum([...valores] as [string, ...string[]]);
      }
      break;
    }
    case "referencia":
      esquema = z.string();
      break;
    case "json":
      esquema = z.unknown();
      break;
  }
  return campo.requerido ? esquema : esquema.optional();
}

/** Construye el esquema Zod del objeto `data` a partir de los campos. */
export function camposAZod(campos: readonly DefinicionCampo[]): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const campo of campos) shape[campo.nombre] = campoAZod(campo);
  return z.object(shape);
}

/* -------------------------- Máquina de estados --------------------------- */

export interface DefinicionEstado {
  readonly nombre: string;
  /** Estado inicial al crear la entidad (exactamente uno). */
  readonly inicial?: boolean;
  /** Estado terminal (sin transiciones salientes). */
  readonly final?: boolean;
}

/**
 * Transición declarativa: `de → a` disparada por un `comando` lógico. El
 * `guard` es una función pura sobre los datos del registro que devuelve `true`
 * (permitida), `false` (rechazada) o un `string` con el motivo del rechazo.
 */
export interface DefinicionTransicion {
  readonly de: string;
  readonly a: string;
  readonly comando: string;
  /** Permiso adicional exigido para ejecutar esta transición. */
  readonly permiso?: string;
  readonly guard?: (datos: Record<string, unknown>) => boolean | string;
}

export interface DefinicionMaquinaEstados {
  readonly estados: readonly DefinicionEstado[];
  readonly transiciones: readonly DefinicionTransicion[];
}

/* ------------------------------ Permisos --------------------------------- */

/** Mapa de permisos de una entidad. Claves libres; las CRUD son estándar. */
export interface PermisosEntidad {
  readonly leer: string;
  readonly crear: string;
  readonly editar: string;
  readonly eliminar: string;
  readonly admin: string;
  readonly [clave: string]: string;
}

/* ------------------------------- Entidad --------------------------------- */

export interface DefinicionEntidad {
  /** Nombre técnico usado como `recordType` en el Record Store. */
  readonly nombre: string;
  /** Etiqueta legible (UI/documentación). */
  readonly etiqueta: string;
  /** Servicio propietario, p. ej. `modulo.<slug>`. */
  readonly servicio: string;
  readonly campos: readonly DefinicionCampo[];
  readonly maquinaEstados?: DefinicionMaquinaEstados;
  readonly permisos: PermisosEntidad;
  /** Capacidades que agrupan permisos de la entidad. */
  readonly capacidades: readonly {
    readonly name: string;
    readonly permissions: readonly string[];
    readonly description: string;
  }[];
  /** Defaults de configuración por tenant (clave → valor). */
  readonly configuracionDefaults?: Record<string, string>;
  /**
   * Prefijo de los eventos de dominio. Por defecto `<servicio>.<nombre>`.
   * Los eventos completos son `<prefijo>.creada|actualizada|eliminada|transicionada`.
   */
  readonly eventos?: string;
}

/* -------------------------------- Módulo --------------------------------- */

export interface DefinicionModulo {
  readonly servicio: string;
  readonly etiqueta: string;
  readonly entidades: readonly DefinicionEntidad[];
  readonly capacidades: readonly {
    readonly name: string;
    readonly permissions: readonly string[];
    readonly description: string;
  }[];
  readonly permisos: readonly string[];
  /** Servicios de plataforma de los que depende el módulo. */
  readonly dependeDe?: readonly string[];
  readonly configuracionDefaults?: Record<string, string>;
  readonly version?: string;
  readonly descripcion?: string;
}

/* ------------------------------- Helpers --------------------------------- */

/** Prefijo de eventos efectivo de una entidad. */
export function prefijoEventos(def: DefinicionEntidad): string {
  return def.eventos ?? `${def.servicio}.${def.nombre}`;
}

/** Nombres canónicos de los eventos de dominio de una entidad. */
export function eventosDeEntidad(def: DefinicionEntidad): {
  creada: string;
  actualizada: string;
  eliminada: string;
  transicionada: string;
  todos: readonly string[];
} {
  const p = prefijoEventos(def);
  const creada = `${p}.creada`;
  const actualizada = `${p}.actualizada`;
  const eliminada = `${p}.eliminada`;
  const transicionada = `${p}.transicionada`;
  return { creada, actualizada, eliminada, transicionada, todos: [creada, actualizada, eliminada, transicionada] };
}

/** Nombres canónicos de comandos/consultas CRUD de una entidad. */
export function nombresOperaciones(def: DefinicionEntidad): {
  crear: string;
  editar: string;
  eliminar: string;
  transicionar: string;
  obtener: string;
  listar: string;
} {
  const base = `${def.servicio}.${def.nombre}`;
  return {
    crear: `${base}.crear`,
    editar: `${base}.editar`,
    eliminar: `${base}.eliminar`,
    transicionar: `${base}.transicionar`,
    obtener: `${base}.obtener`,
    listar: `${base}.listar`,
  };
}

/** Devuelve el estado inicial declarado por la máquina de estados (si hay). */
export function estadoInicial(def: DefinicionEntidad): string | undefined {
  const m = def.maquinaEstados;
  if (!m) return undefined;
  return m.estados.find((e) => e.inicial)?.nombre ?? m.estados[0]?.nombre;
}
