/**
 * DGP-019.1 · Constantes del módulo Utilización, Medidores y Combustible
 * (frontend). Apunta al contrato CONGELADO montado en `/api/deltaops/utilizacion`
 * (sesión obligatoria por cookie). No duplica lógica de negocio: sólo referencia
 * nombres de comandos y catálogos de PRESENTACIÓN. El backend es la autoridad
 * (valida consistencia, gobierna capacidades y sincroniza hacia Activos; el
 * frontend nunca hace bypass). El OpenAPI congelado
 * (`lib/module-utilizacion/openapi/utilizacion.openapi.json`) es la fuente de
 * verdad EXACTA de los payloads (verificado por `utilizacion-contract.test.ts`).
 */

/** Namespace de los comandos del módulo (para la cola /sync). Debe coincidir
 * con el descriptor del backend (`modulo.utilizacion`). */
export const MODULO = "modulo.utilizacion";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/utilizacion";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/utilizacion/sync";

/** Espacio de nombres de la cola offline (deltaops:utilizacion:cola:<tenant>). */
export const MODULO_OFFLINE = "utilizacion";

/** Tamaño de página de las tablas del módulo. */
export const TAMANO_PAGINA = 12;

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/* --------------------------- Tipos de medidor --------------------------- */

/** Tipos de medidor canónicos del contrato (`RegistrarLectura.tipoMedidor`). */
export const TIPOS_MEDIDOR = ["horometro", "odometro"] as const;
export type TipoMedidor = (typeof TIPOS_MEDIDOR)[number];

export const ETIQUETA_TIPO_MEDIDOR: Record<string, string> = {
  horometro: "Horómetro",
  odometro: "Odómetro",
};

/** Unidad canónica derivada del tipo de medidor (el backend la impone). */
export const UNIDAD_POR_MEDIDOR: Record<string, string> = {
  horometro: "h",
  odometro: "km",
};

/* ---------------------------- Estado lectura ---------------------------- */

/**
 * Presentación del estado de una lectura. El read model expone `estado`
 * (`vigente`|`anulada`) + `inconsistente` (boolean). Regla del mandato: una
 * lectura es "Válida", "Inconsistente" (valor decreciente, NO propaga) o
 * "Anulada". El backend es la autoridad; esto sólo pinta.
 */
export function etiquetaEstadoLectura(estado: string | undefined, inconsistente: boolean | undefined): string {
  if (estado === "anulada") return "Anulada";
  if (inconsistente) return "Inconsistente";
  return "Válida";
}

export function tonoEstadoLectura(estado: string | undefined, inconsistente: boolean | undefined): Tono {
  if (estado === "anulada") return "neutro";
  if (inconsistente) return "advertencia";
  return "exito";
}

/* --------------------- Sincronización hacia Activos --------------------- */

/**
 * Estado de propagación del último valor hacia el módulo Activos. Nace
 * `pendiente`, y el outbox lo lleva a `confirmada`|`no-aplica`|`fallida`
 * (con motivo visible). Se muestra SIEMPRE en la consulta (mandato §18).
 */
export const ETIQUETA_SYNC_ACTIVO: Record<string, string> = {
  pendiente: "Sincronización pendiente",
  confirmada: "Sincronizada",
  "no-aplica": "No aplica",
  fallida: "Sincronización fallida",
};

export function tonoSyncActivo(valor: string | undefined): Tono {
  switch (valor) {
    case "confirmada":
      return "exito";
    case "fallida":
      return "error";
    case "no-aplica":
      return "neutro";
    default:
      return "advertencia"; // pendiente
  }
}

/* ------------------------------ Catálogos ------------------------------- */

/** Único catálogo configurable del módulo (para los tanqueos). */
export const CATALOGO_COMBUSTIBLE = "tipos-combustible";

/** Etiquetas de presentación para las claves canónicas de combustible (el
 * catálogo del tenant es la autoridad; esto es un respaldo legible). */
export const ETIQUETA_COMBUSTIBLE: Record<string, string> = {
  diesel: "Diésel",
  gasolina: "Gasolina",
  "gas-natural": "Gas natural",
  glp: "GLP",
  electrico: "Eléctrico",
  biodiesel: "Biodiésel",
};
