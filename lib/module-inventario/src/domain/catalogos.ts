/**
 * DGP-011.1 · Módulo Enterprise Inventory — Catálogos CONFIGURABLES por tenant.
 *
 * REGLA DURA: NADA de enums de dominio. Toda dimensión clasificatoria (tipos de
 * item, categorías, familias, marcas, unidades, tipos/motivos de movimiento,
 * tipos de ajuste/conteo, estados, tipos de bodega/ubicación, empresas, centros
 * de costo, proyectos…) vive en catálogos administrables por tenant.
 *
 * Semántica de validación de referencias (idéntica a DGP-009.1):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

/** Estados de habilitación de una entrada de catálogo. */
export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos del módulo. */
export const CATALOGOS = [
  "tipos-item",
  "categorias",
  "familias",
  "subfamilias",
  "marcas",
  "fabricantes",
  "modelos",
  "unidades",
  "monedas",
  "tipos-movimiento",
  "motivos-movimiento",
  "tipos-ajuste",
  "tipos-conteo",
  "estados-item",
  "tipos-bodega",
  "tipos-ubicacion",
  "empresas",
  "centros-costo",
  "proyectos",
  "tipos-reserva",
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
  /** Clave del padre para catálogos jerárquicos (familias→subfamilias…). */
  readonly padre?: string | null;
}

/**
 * Valores CANÓNICOS por defecto que se aceptan cuando el catálogo está VACÍO.
 * NO son enums: son un punto de partida configurable; el tenant puede sustituir
 * cualquiera creando su propio catálogo. Un catálogo NO listado aquí ⇒ forma
 * libre mientras esté vacío.
 */
export const CANONICOS_POR_CATALOGO: Partial<Record<NombreCatalogo, readonly string[]>> = {
  "tipos-item": ["insumo", "repuesto", "herramienta", "equipo", "consumible", "servicio"],
  "unidades": ["unidad", "caja", "kilogramo", "litro", "metro", "paquete"],
  "monedas": ["USD", "EUR", "COP", "MXN"],
  "tipos-movimiento": [
    "entrada",
    "salida",
    "transferencia",
    "reserva",
    "liberacion",
    "consumo",
    "devolucion",
    "ajuste-positivo",
    "ajuste-negativo",
    "conteo",
    "inicializacion",
    "correccion",
  ],
  "motivos-movimiento": ["compra", "venta", "orden-trabajo", "preventivo", "correctivo", "proyecto", "merma", "hallazgo"],
  "tipos-ajuste": ["merma", "sobrante", "daño", "vencimiento", "correccion", "inventario-inicial"],
  "tipos-conteo": ["parcial", "ciclico", "general", "reconteo"],
  "estados-item": ["activo", "inactivo", "descontinuado"],
  "tipos-bodega": ["principal", "transito", "cuarentena", "consignacion", "virtual"],
  "tipos-ubicacion": ["bodega", "subbodega", "pasillo", "estanteria", "nivel", "posicion"],
  "tipos-reserva": ["orden-trabajo", "preventivo", "correctivo", "proyecto", "solicitud", "transferencia"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
