/**
 * DGP-007 · Dynamic Forms Engine — Definición declarativa de formularios.
 *
 * Un formulario se describe 100% con DATOS (DefinicionFormulario). La estructura
 * es recursiva (campos y contenedores) y se valida con Zod. A partir de la
 * definición se DERIVA el esquema Zod de los datos capturados por el formulario.
 *
 * Este archivo es NEUTRO: no contiene ningún concepto de negocio. Los ejemplos
 * de las pruebas y docs usan formularios de "revisión genérica" / "solicitud
 * genérica" / "expediente".
 */
import { z } from "zod";

/* --------------------------- Tipos de campo hoja -------------------------- */

/** Tipos de campo "hoja" (capturan un valor). */
export type TipoCampoHoja =
  | "texto"
  | "numero"
  | "decimal"
  | "fecha"
  | "hora"
  | "fechaHora"
  | "booleano"
  | "select"
  | "multiSelect"
  | "autocomplete"
  | "tabla"
  | "adjunto"
  | "firma"
  | "ubicacion"
  | "codigoQr"
  | "codigoBarras"
  | "nfc"
  | "imagen"
  | "checklist";

/** Tipos de contenedor (agrupan otros nodos, no capturan valor propio). */
export type TipoContenedor = "grupo" | "seccion" | "pestanas" | "wizard";

export type TipoNodo = TipoCampoHoja | TipoContenedor;

/** Opción de un campo de selección. */
export interface OpcionSeleccion {
  readonly valor: string;
  readonly etiqueta: string;
}

/**
 * Fuente declarativa de datos para `autocomplete`. Nunca es código: o es un
 * catálogo estático (`opciones`), o una referencia a un catálogo/consulta del
 * tenant que la capa de aplicación resuelve vía QueryBus del Kernel.
 */
export interface FuenteDatos {
  /** Modo `catalogo`: consulta un catálogo del tenant por nombre. */
  readonly catalogo?: string;
  /** Modo `query`: nombre de una QueryDefinition registrada en el Kernel. */
  readonly query?: string;
  /** Opciones estáticas embebidas (modo autocontenido). */
  readonly opciones?: readonly OpcionSeleccion[];
}

/* ------------------------------- Nodo campo ------------------------------- */

/**
 * Restricciones declarativas de un campo (usadas por definicion.ts para derivar
 * el esquema Zod y por validacion.ts para el Validation Runtime).
 */
export interface RestriccionesCampo {
  readonly longitudMin?: number;
  readonly longitudMax?: number;
  readonly minimo?: number;
  readonly maximo?: number;
  /** Formato de texto: email, uri o expresión regular. */
  readonly formato?: "email" | "uri" | "patron";
  /** Patrón regex cuando `formato === "patron"`. */
  readonly patron?: string;
  /** Nº de decimales permitidos para `decimal`. */
  readonly decimales?: number;
}

/** Nodo hoja: un campo que captura un valor. */
export interface CampoFormulario {
  readonly clase: "campo";
  readonly clave: string;
  readonly tipo: TipoCampoHoja;
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly obligatorio?: boolean;
  readonly soloLectura?: boolean;
  readonly valorDefecto?: unknown;
  readonly restricciones?: RestriccionesCampo;
  /** Opciones para `select` / `multiSelect`. */
  readonly opciones?: readonly OpcionSeleccion[];
  /** Fuente de datos para `autocomplete`. */
  readonly fuente?: FuenteDatos;
  /** Subcampos de una `tabla` (cada fila es un objeto con estos campos). */
  readonly subcampos?: readonly CampoFormulario[];
  /** Referencia a un checklist reutilizable cuando `tipo === "checklist"`. */
  readonly checklistRef?: string;
}

/** Paso de un contenedor `wizard`. */
export interface PasoWizard {
  readonly clave: string;
  readonly etiqueta: string;
  readonly hijos: readonly NodoFormulario[];
}

/** Nodo contenedor: agrupa otros nodos de forma recursiva. */
export interface ContenedorFormulario {
  readonly clase: "contenedor";
  readonly clave: string;
  readonly tipo: TipoContenedor;
  readonly etiqueta: string;
  readonly ayuda?: string;
  /** Hijos para grupo/seccion/pestanas. */
  readonly hijos?: readonly NodoFormulario[];
  /** Pasos para wizard. */
  readonly pasos?: readonly PasoWizard[];
}

export type NodoFormulario = CampoFormulario | ContenedorFormulario;

/** Definición declarativa completa de un formulario. */
export interface DefinicionFormulario {
  readonly clave: string;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly nodos: readonly NodoFormulario[];
}

/* ------------------------------ Zod estructura ---------------------------- */

const restriccionesSchema: z.ZodType<RestriccionesCampo> = z
  .object({
    longitudMin: z.number().int().nonnegative().optional(),
    longitudMax: z.number().int().positive().optional(),
    minimo: z.number().optional(),
    maximo: z.number().optional(),
    formato: z.enum(["email", "uri", "patron"]).optional(),
    patron: z.string().optional(),
    decimales: z.number().int().nonnegative().optional(),
  })
  .strict();

const opcionSchema: z.ZodType<OpcionSeleccion> = z
  .object({ valor: z.string().min(1), etiqueta: z.string().min(1) })
  .strict();

const fuenteSchema: z.ZodType<FuenteDatos> = z
  .object({
    catalogo: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    opciones: z.array(opcionSchema).optional(),
  })
  .strict();

const TIPOS_HOJA: readonly TipoCampoHoja[] = [
  "texto", "numero", "decimal", "fecha", "hora", "fechaHora", "booleano",
  "select", "multiSelect", "autocomplete", "tabla", "adjunto", "firma",
  "ubicacion", "codigoQr", "codigoBarras", "nfc", "imagen", "checklist",
];

const campoSchema: z.ZodType<CampoFormulario> = z.lazy(() =>
  z
    .object({
      clase: z.literal("campo"),
      clave: z.string().min(1),
      tipo: z.enum([...TIPOS_HOJA] as [TipoCampoHoja, ...TipoCampoHoja[]]),
      etiqueta: z.string().min(1),
      ayuda: z.string().optional(),
      obligatorio: z.boolean().optional(),
      soloLectura: z.boolean().optional(),
      valorDefecto: z.unknown().optional(),
      restricciones: restriccionesSchema.optional(),
      opciones: z.array(opcionSchema).optional(),
      fuente: fuenteSchema.optional(),
      subcampos: z.array(campoSchema).optional(),
      checklistRef: z.string().optional(),
    })
    .strict(),
) as z.ZodType<CampoFormulario>;

const pasoSchema: z.ZodType<PasoWizard> = z.lazy(() =>
  z
    .object({
      clave: z.string().min(1),
      etiqueta: z.string().min(1),
      hijos: z.array(nodoSchema),
    })
    .strict(),
) as z.ZodType<PasoWizard>;

const contenedorSchema: z.ZodType<ContenedorFormulario> = z.lazy(() =>
  z
    .object({
      clase: z.literal("contenedor"),
      clave: z.string().min(1),
      tipo: z.enum(["grupo", "seccion", "pestanas", "wizard"]),
      etiqueta: z.string().min(1),
      ayuda: z.string().optional(),
      hijos: z.array(nodoSchema).optional(),
      pasos: z.array(pasoSchema).optional(),
    })
    .strict(),
) as z.ZodType<ContenedorFormulario>;

const nodoSchema: z.ZodType<NodoFormulario> = z.lazy(() =>
  z.union([campoSchema, contenedorSchema]),
) as z.ZodType<NodoFormulario>;

/** Esquema Zod que valida la ESTRUCTURA de una DefinicionFormulario. */
export const definicionFormularioSchema: z.ZodType<DefinicionFormulario> = z
  .object({
    clave: z.string().min(1),
    titulo: z.string().min(1),
    descripcion: z.string().optional(),
    nodos: z.array(nodoSchema),
  })
  .strict() as z.ZodType<DefinicionFormulario>;

/** Valida la estructura de una definición; devuelve la definición tipada. */
export function validarDefinicion(entrada: unknown): DefinicionFormulario {
  return definicionFormularioSchema.parse(entrada);
}

/* ---------------------------- Recorrido de nodos -------------------------- */

/** Hijos de un contenedor (unifica hijos/pasos). */
export function hijosDe(nodo: ContenedorFormulario): readonly NodoFormulario[] {
  if (nodo.tipo === "wizard") return (nodo.pasos ?? []).flatMap((p) => p.hijos);
  return nodo.hijos ?? [];
}

/** Recorre en profundidad todos los nodos (contenedores incluidos). */
export function* recorrerNodos(
  nodos: readonly NodoFormulario[],
): Generator<NodoFormulario> {
  for (const nodo of nodos) {
    yield nodo;
    if (nodo.clase === "contenedor") yield* recorrerNodos(hijosDe(nodo));
  }
}

/** Todos los campos hoja del formulario (aplanados). */
export function camposHoja(def: DefinicionFormulario): CampoFormulario[] {
  const out: CampoFormulario[] = [];
  for (const nodo of recorrerNodos(def.nodos)) {
    if (nodo.clase === "campo") out.push(nodo);
  }
  return out;
}

/** Devuelve un campo por su clave (o `undefined`). */
export function campoPorClave(
  def: DefinicionFormulario,
  clave: string,
): CampoFormulario | undefined {
  return camposHoja(def).find((c) => c.clave === clave);
}

/* --------------------------- Derivación de Zod ---------------------------- */

/** Esquema Zod del valor de un campo hoja (sin obligatoriedad aplicada). */
function esquemaValorCampo(campo: CampoFormulario): z.ZodTypeAny {
  const r = campo.restricciones;
  switch (campo.tipo) {
    case "texto":
    case "codigoQr":
    case "codigoBarras":
    case "nfc": {
      let s = z.string();
      if (r?.longitudMin !== undefined) s = s.min(r.longitudMin);
      if (r?.longitudMax !== undefined) s = s.max(r.longitudMax);
      if (r?.formato === "email") s = s.email();
      if (r?.formato === "uri") s = s.url();
      if (r?.formato === "patron" && r.patron) s = s.regex(new RegExp(r.patron));
      return s;
    }
    case "numero": {
      let n = z.number().int();
      if (r?.minimo !== undefined) n = n.min(r.minimo);
      if (r?.maximo !== undefined) n = n.max(r.maximo);
      return n;
    }
    case "decimal": {
      let n = z.number();
      if (r?.minimo !== undefined) n = n.min(r.minimo);
      if (r?.maximo !== undefined) n = n.max(r.maximo);
      return n;
    }
    case "booleano":
      return z.boolean();
    case "fecha":
    case "hora":
    case "fechaHora":
      // Serializable (ISO string) — Offline First friendly.
      return z.string();
    case "select":
    case "autocomplete": {
      const valores = (campo.opciones ?? campo.fuente?.opciones ?? []).map((o) => o.valor);
      if (valores.length === 0) return z.string();
      return z.enum([...valores] as [string, ...string[]]);
    }
    case "multiSelect": {
      const valores = (campo.opciones ?? campo.fuente?.opciones ?? []).map((o) => o.valor);
      const item = valores.length === 0 ? z.string() : z.enum([...valores] as [string, ...string[]]);
      return z.array(item);
    }
    case "tabla": {
      const filaShape: z.ZodRawShape = {};
      for (const sub of campo.subcampos ?? []) {
        filaShape[sub.clave] = aplicarObligatoriedad(sub, esquemaValorCampo(sub));
      }
      return z.array(z.object(filaShape));
    }
    case "adjunto":
      // id de adjunto de platform.attachment (o lista).
      return z.union([z.string(), z.array(z.string())]);
    case "firma":
      return z.object({
        dataUrl: z.string(),
        firmante: z.string(),
        timestamp: z.string(),
      });
    case "ubicacion":
      return z.object({
        lat: z.number(),
        lng: z.number(),
        precision: z.number().optional(),
      });
    case "imagen":
      return z.union([z.string(), z.array(z.string())]);
    case "checklist":
      // Resultado de un checklist embebido (ver checklist.ts).
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function aplicarObligatoriedad(campo: CampoFormulario, esquema: z.ZodTypeAny): z.ZodTypeAny {
  return campo.obligatorio ? esquema : esquema.optional();
}

/**
 * Deriva el esquema Zod de los DATOS del formulario completo: un objeto cuya
 * clave es la `clave` de cada campo hoja y cuyo valor es su esquema derivado.
 * Los contenedores no producen claves de datos (son solo estructura/layout).
 */
export function esquemaDatosFormulario(
  def: DefinicionFormulario,
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const campo of camposHoja(def)) {
    shape[campo.clave] = aplicarObligatoriedad(campo, esquemaValorCampo(campo));
  }
  return z.object(shape);
}

/** Esquema Zod de un único campo (útil para validación puntual). */
export function esquemaCampo(campo: CampoFormulario): z.ZodTypeAny {
  return aplicarObligatoriedad(campo, esquemaValorCampo(campo));
}
