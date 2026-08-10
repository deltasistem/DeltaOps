/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Catálogos CONFIGURABLES.
 *
 * REGLA DURA (lección DGP-011.1): NADA de enums de dominio de negocio. Todo el
 * vocabulario clasificatorio de la analítica (categorías de indicador, unidades,
 * formatos de presentación, periodos de meta) vive en catálogos administrables
 * por tenant, con fallback a valores CANÓNICOS cuando el catálogo está vacío.
 *
 * Semántica de validación de referencias (idéntica a DGP-009/011/012/013/014/015):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos configurables del módulo. */
export const CATALOGOS = [
  "categorias-indicador",
  "unidades",
  "formatos",
  "periodos-meta",
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
  readonly posicion?: number;
  readonly padre?: string | null;
}

/**
 * Valores CANÓNICOS por defecto que se aceptan cuando el catálogo está VACÍO.
 * NO son enums: son un punto de partida configurable; el tenant puede sustituir
 * cualquiera creando su propio catálogo.
 */
export const CANONICOS_POR_CATALOGO: Partial<Record<NombreCatalogo, readonly string[]>> = {
  "categorias-indicador": [
    "disponibilidad",
    "confiabilidad",
    "mantenibilidad",
    "utilizacion",
    "tiempos",
    "ordenes",
    "costos",
    "inventario",
    "servicio",
    "cumplimiento",
    "carga",
    "fallas",
    "abastecimiento",
  ],
  "unidades": [
    "porcentaje",
    "horas",
    "minutos",
    "dias",
    "conteo",
    "moneda",
    "ratio",
    "unidades",
    "veces",
  ],
  "formatos": ["entero", "decimal-1", "decimal-2", "porcentaje", "moneda", "duracion", "ratio"],
  "periodos-meta": ["diario", "semanal", "mensual", "trimestral", "semestral", "anual"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
