/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — Catálogos configurables por tenant.
 *
 * Los catálogos NO usan tablas ad hoc: se persisten en el Record Store de la
 * plataforma (deltaops.platform_records, multitenant + RLS) bajo el servicio
 * `modulo.ordenes` y `recordType = catalogo:<nombre>`. Semántica aprobada
 * (idéntica a DGP-008):
 *   - Catálogo VACÍO   ⇒ se admiten los valores CANÓNICOS del dominio.
 *   - Catálogo NO VACÍO ⇒ el valor referido debe estar PRESENTE **y** HABILITADO.
 *
 * NINGÚN tipo/estado/prioridad está fijado en código: todos son datos.
 */
export const CATALOGOS = [
  "tipos",
  "categorias",
  "prioridades",
  "severidades",
  "estados", // estados adicionales del ciclo definidos por el tenant
  "slas",
  "empresas",
  "proyectos",
  "centros-costo",
  "ubicaciones",
  "monedas",
  "riesgos",
  "impactos",
  "causas",
] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

/**
 * Tipos de OT CANÓNICOS mínimos exigidos por el mandato. Son SOLO el conjunto
 * por defecto cuando el catálogo `tipos` está vacío; el tenant puede sustituir
 * o ampliar libremente por configuración (nunca se codifican ramas por tipo).
 */
export const TIPOS_CANONICOS = [
  "correctiva",
  "preventiva",
  "predictiva",
  "inspeccion",
  "instalacion",
  "desmontaje",
  "calibracion",
  "lubricacion",
  "limpieza",
  "emergencia",
  "campana",
] as const;
export type TipoCanonico = (typeof TIPOS_CANONICOS)[number];

/** Prioridades canónicas por defecto (catálogo `prioridades` vacío). */
export const PRIORIDADES_CANONICAS = ["baja", "media", "alta", "critica"] as const;
/** Severidades canónicas por defecto (catálogo `severidades` vacío). */
export const SEVERIDADES_CANONICAS = ["menor", "moderada", "mayor", "critica"] as const;
/** Riesgos e impactos canónicos por defecto. */
export const RIESGOS_CANONICOS = ["bajo", "medio", "alto"] as const;
export const IMPACTOS_CANONICOS = ["bajo", "medio", "alto"] as const;

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

/**
 * Conjunto canónico por catálogo (cuando el catálogo está vacío). Vacío ⇒ el
 * catálogo es de forma libre (empresas, proyectos, etc.): sin canónicos, un
 * catálogo vacío no restringe pero tampoco valida (referencias opcionales).
 */
export const CANONICOS_POR_CATALOGO: Partial<Record<NombreCatalogo, readonly string[]>> = {
  tipos: TIPOS_CANONICOS,
  prioridades: PRIORIDADES_CANONICAS,
  severidades: SEVERIDADES_CANONICAS,
  riesgos: RIESGOS_CANONICOS,
  impactos: IMPACTOS_CANONICOS,
};
