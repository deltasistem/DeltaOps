/**
 * DGP-020.3 · Catálogo de CATEGORÍAS de mano de obra — DATOS, no enums.
 *
 * La categoría es un concepto ESTABLE (no texto libre por OT). Se persiste en el
 * Record Store de plataforma (deltaops.platform_records, multitenant + RLS) bajo
 * el servicio `modulo.manodeobra` y `recordType = catalogo:categorias-mdo`
 * (mismo mecanismo que module-activos). Semántica aprobada (idéntica a DGP-008):
 *   - Catálogo VACÍO    ⇒ se admiten los valores CANÓNICOS por defecto.
 *   - Catálogo NO VACÍO ⇒ la clave referida debe estar PRESENTE **y** HABILITADA.
 *
 * NINGUNA categoría está fijada en código como rama de lógica: son datos.
 */
export const CATALOGOS = ["categorias-mdo"] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

export const ESTADO_HABILITADO = "habilitado";
export const ESTADO_DESHABILITADO = "deshabilitado";

/** recordType canónico de un catálogo en el Record Store. */
export function recordTypeCatalogo(nombre: NombreCatalogo): string {
  return `catalogo:${nombre}`;
}

/**
 * Categorías CANÓNICAS por defecto (cuando el catálogo `categorias-mdo` está
 * vacío). El tenant puede sustituir/ampliar libremente por configuración; nunca
 * se codifican ramas por categoría.
 */
export const CATEGORIAS_CANONICAS = [
  { clave: "tecnico-mecanico", etiqueta: "Técnico mecánico", posicion: 10 },
  { clave: "tecnico-electrico", etiqueta: "Técnico eléctrico", posicion: 20 },
  { clave: "soldador", etiqueta: "Soldador", posicion: 30 },
  { clave: "operador", etiqueta: "Operador", posicion: 40 },
  { clave: "supervisor", etiqueta: "Supervisor", posicion: 50 },
  { clave: "ayudante", etiqueta: "Ayudante", posicion: 60 },
  { clave: "especialista", etiqueta: "Especialista", posicion: 70 },
] as const;

/** Conjunto de claves canónicas (para validación de catálogo vacío). */
export const CLAVES_CANONICAS: readonly string[] = CATEGORIAS_CANONICAS.map((c) => c.clave);

/** Entrada de catálogo (data del PlatformRecord). */
export interface EntradaCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly posicion?: number;
  readonly padre?: string | null;
}

/** Opción de catálogo (proyección de lectura). */
export interface OpcionCatalogo {
  readonly value: string;
  readonly label: string;
  readonly posicion: number;
  readonly padre: string | null;
}
