/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — Catálogos CONFIGURABLES.
 *
 * REGLA DURA (lección DGP-011.1): NADA de enums de dominio. Toda dimensión
 * clasificatoria (tipos de artículo, unidades de medida, monedas, condiciones de
 * pago, condiciones de entrega, novedades de recepción, tipos de origen de
 * solicitud, certificaciones, criterios de comparación, etc.) vive en catálogos
 * administrables por tenant.
 *
 * Semántica de validación de referencias (idéntica a DGP-009.1 / 011.1 / 012):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

/** Estados de habilitación de una entrada de catálogo. */
export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos del módulo. */
export const CATALOGOS = [
  "tipos-articulo",
  "unidades-medida",
  "familias-articulo",
  "monedas",
  "condiciones-pago",
  "condiciones-entrega",
  "incoterms",
  "tipos-proveedor",
  "certificaciones",
  "criterios-comparacion",
  "origenes-solicitud",
  "prioridades",
  "novedades-recepcion",
  "metodos-valoracion",
  "impuestos",
  "categorias-gasto",
] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

/** Devuelve el `recordType` de una entrada de catálogo (para persistencia futura). */
export function recordTypeCatalogo(nombre: NombreCatalogo): string {
  return `catalogo.${nombre}`;
}

/** Entrada de catálogo administrable (jerárquica y ordenable). */
export interface EntradaCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  /** Orden de presentación (opcional). */
  readonly posicion?: number;
  /** Clave del padre para catálogos jerárquicos. */
  readonly padre?: string | null;
}

/**
 * Valores CANÓNICOS por defecto que se aceptan cuando el catálogo está VACÍO.
 * NO son enums: son un punto de partida configurable; el tenant puede sustituir
 * cualquiera creando su propio catálogo. Un catálogo NO listado aquí ⇒ forma
 * libre mientras esté vacío.
 */
export const CANONICOS_POR_CATALOGO: Partial<Record<NombreCatalogo, readonly string[]>> = {
  "tipos-articulo": [
    "producto",
    "servicio",
    "lubricante",
    "consumible",
    "componente",
    "kit",
    "herramienta",
    "servicio-externo",
  ],
  "unidades-medida": ["unidad", "litro", "galon", "kilogramo", "metro", "caja", "juego", "hora", "servicio"],
  "monedas": ["usd", "eur", "cop", "mxn", "pen", "clp", "brl"],
  "condiciones-pago": ["contado", "credito-15", "credito-30", "credito-60", "credito-90", "anticipo"],
  "condiciones-entrega": ["en-sitio", "en-bodega", "recoge-cliente", "puesto-en-planta"],
  "incoterms": ["exw", "fca", "cpt", "cip", "dap", "dpu", "ddp", "fob", "cfr", "cif"],
  "tipos-proveedor": ["fabricante", "distribuidor", "mayorista", "representante", "contratista", "servicios"],
  "certificaciones": ["iso-9001", "iso-14001", "iso-45001", "iso-17025", "api", "ce", "ul", "otra"],
  "criterios-comparacion": ["precio", "plazo-entrega", "calificacion", "condiciones-pago", "garantia", "sla"],
  "origenes-solicitud": ["inventario", "orden", "plan", "usuario"],
  "prioridades": ["baja", "media", "alta", "critica"],
  "novedades-recepcion": [
    "faltante",
    "sobrante",
    "averiado",
    "vencido",
    "no-conforme",
    "documentacion-incompleta",
    "empaque-danado",
    "ninguna",
  ],
  "metodos-valoracion": ["promedio-ponderado", "ultimo-costo", "costo-estandar"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
