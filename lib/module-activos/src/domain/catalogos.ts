/**
 * DGP-008.1 · Módulo Activos — Catálogos configurables por tenant.
 *
 * Los catálogos NO usan tablas ad hoc: se persisten en el Record Store de la
 * plataforma (deltaops.platform_records, multitenant + RLS) bajo el servicio
 * `modulo.activos` y `recordType = catalogo:<nombre>`. Cada entrada tiene una
 * clave, etiqueta, posición, estado habilitado/deshabilitado y, cuando aplica,
 * un padre para jerarquías (familias → subfamilias, categorías jerárquicas).
 *
 * El agregado Activo referencia SIEMPRE claves de catálogo habilitadas; la
 * capa de aplicación valida esas referencias antes de persistir.
 */
export const CATALOGOS = [
  "tipos",
  "categorias",
  "familias",
  "subfamilias",
  "estados",
  "criticidades",
  "prioridades",
  "empresas",
  "centros-costo",
  "proyectos",
  "ubicaciones",
  "fabricantes",
  "modelos",
  "monedas",
  "unidades",
  "proveedores",
  "tiposRelacion",
] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

/** Catálogos que admiten jerarquía (campo `padre` → clave del catálogo padre). */
export const CATALOGOS_JERARQUICOS: Partial<Record<NombreCatalogo, NombreCatalogo>> = {
  categorias: "categorias", // categorías jerárquicas (padre = otra categoría)
  subfamilias: "familias", // subfamilia pertenece a una familia
  modelos: "fabricantes", // modelo pertenece a un fabricante
};

export const ESTADO_HABILITADO = "habilitado";
export const ESTADO_DESHABILITADO = "deshabilitado";

/** recordType canónico de un catálogo en el Record Store. */
export function recordTypeCatalogo(nombre: NombreCatalogo): string {
  return `catalogo:${nombre}`;
}

/** Entrada de catálogo (data del PlatformRecord). */
export interface EntradaCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly posicion?: number;
  readonly padre?: string | null;
}
