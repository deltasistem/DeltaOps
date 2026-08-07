/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Catálogos CONFIGURABLES.
 *
 * REGLA DURA (lección DGP-011.1): NADA de enums de dominio. TODO el vocabulario
 * clasificatorio del mantenimiento correctivo (tipo de falla, modo de falla,
 * causa, efecto, prioridad, severidad, impacto, origen de la solicitud, etc.)
 * vive en catálogos administrables por tenant.
 *
 * Semántica de validación de referencias (idéntica a DGP-009/011/012/013/014):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

/** Estados de habilitación de una entrada de catálogo. */
export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/**
 * Nombres canónicos de todos los catálogos del módulo. Los OCHO catálogos
 * clasificatorios obligatorios del correctivo van primero (tipo-falla,
 * modo-falla, causa, efecto, prioridad, severidad, impacto, origen).
 */
export const CATALOGOS = [
  "tipos-falla",
  "modos-falla",
  "causas",
  "efectos",
  "prioridades",
  "severidades",
  "impactos",
  "origenes-solicitud",
  "criticidades",
  "sintomas",
  "unidades-tiempo",
  "monedas",
  "roles-personal",
  "tipos-recurso",
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
  "tipos-falla": [
    "mecanica",
    "electrica",
    "electronica",
    "hidraulica",
    "neumatica",
    "instrumentacion",
    "estructural",
    "software",
    "operacional",
  ],
  "modos-falla": [
    "desgaste",
    "fatiga",
    "corrosion",
    "sobrecarga",
    "fuga",
    "obstruccion",
    "cortocircuito",
    "sobrecalentamiento",
    "vibracion",
    "desalineacion",
    "rotura",
    "contaminacion",
  ],
  "causas": [
    "falta-mantenimiento",
    "error-operacion",
    "defecto-fabricacion",
    "condicion-ambiental",
    "fin-vida-util",
    "instalacion-incorrecta",
    "sobreesfuerzo",
    "material-defectuoso",
    "otro",
  ],
  "efectos": [
    "parada-total",
    "parada-parcial",
    "degradacion",
    "perdida-calidad",
    "riesgo-seguridad",
    "riesgo-ambiental",
    "sin-efecto-inmediato",
  ],
  "prioridades": ["baja", "media", "alta", "critica", "emergencia"],
  "severidades": ["leve", "moderada", "grave", "critica"],
  "impactos": [
    "produccion",
    "seguridad",
    "ambiental",
    "calidad",
    "economico",
    "regulatorio",
    "reputacional",
  ],
  "origenes-solicitud": [
    "operador",
    "supervisor",
    "produccion",
    "calidad",
    "sst",
    "iot",
    "api",
    "inspeccion",
  ],
  "criticidades": ["baja", "media", "alta", "critica"],
  "unidades-tiempo": ["minutos", "horas", "dias"],
  "monedas": ["usd", "eur", "cop", "mxn", "pen", "clp", "brl"],
  "roles-personal": [
    "tecnico",
    "tecnico-lider",
    "especialista",
    "supervisor",
    "ingeniero",
    "auxiliar",
    "contratista",
  ],
  "tipos-recurso": ["personal", "herramienta", "repuesto", "insumo", "equipo-apoyo", "servicio-externo"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
