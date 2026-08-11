/**
 * DGP-019.1 · Módulo de Utilización — Catálogos CONFIGURABLES.
 *
 * REGLA DURA (lección DGP-011.1): el vocabulario clasificatorio administrable
 * por tenant vive en catálogos, jamás en enums de dominio. En esta fase el ÚNICO
 * catálogo configurable es `tipos-combustible` (para los tanqueos).
 *
 * NOTA IMPORTANTE: los TIPOS DE MEDIDOR (horómetro/odómetro) NO son catálogo:
 * son tipos canónicos INMUTABLES del dominio (ver value-objects.ts), porque el
 * mandato DGP-019.1 fija dos únicos medidores con unidad canónica (h / km) y sin
 * tipos configurables todavía.
 *
 * Semántica de validación de referencias (idéntica al resto del corpus):
 *   · Catálogo VACÍO   ⇒ se aceptan los valores CANÓNICOS por defecto.
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos configurables del módulo. */
export const CATALOGOS = ["tipos-combustible"] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

/** `recordType` de una entrada de catálogo (para el descriptor del servicio). */
export function recordTypeCatalogo(nombre: NombreCatalogo): string {
  return `catalogo.${nombre}`;
}

/** Entrada de catálogo administrable (ordenable). */
export interface EntradaCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly posicion?: number;
  readonly padre?: string | null;
}

/**
 * Valores CANÓNICOS por defecto aceptados cuando el catálogo está VACÍO. NO son
 * enums: son un punto de partida configurable; el tenant puede sustituirlos.
 */
export const CANONICOS_POR_CATALOGO: Partial<Record<NombreCatalogo, readonly string[]>> = {
  "tipos-combustible": ["diesel", "gasolina", "gas-natural", "glp", "electrico", "biodiesel"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
