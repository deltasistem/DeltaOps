/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Catálogos CONFIGURABLES.
 *
 * REGLA DURA (lección DGP-011.1): NADA de enums de dominio. TODO el vocabulario
 * clasificatorio del mantenimiento preventivo (tipos de programa, motivos de
 * reprogramación/suspensión/exclusión, roles de personal, tipos de recurso,
 * clasificaciones de SLA, etc.) vive en catálogos administrables por tenant.
 *
 * Semántica de validación de referencias (idéntica a DGP-009/011/012/013):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

/** Estados de habilitación de una entrada de catálogo. */
export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos del módulo. */
export const CATALOGOS = [
  "tipos-programa",
  "clasificaciones-programa",
  "motivos-reprogramacion",
  "motivos-suspension",
  "motivos-exclusion",
  "roles-personal",
  "tipos-recurso",
  "tipos-herramienta",
  "clasificaciones-sla",
  "unidades-tiempo",
  "monedas",
  "prioridades",
  "origenes-generacion",
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
  "tipos-programa": ["ruta", "servicio-mayor", "servicio-menor", "lubricacion", "predictivo", "legal", "campania"],
  "clasificaciones-programa": ["operativo", "seguridad", "ambiental", "regulatorio", "calidad"],
  "motivos-reprogramacion": [
    "disponibilidad-recurso",
    "ventana-operativa",
    "clima",
    "repuesto-pendiente",
    "prioridad-superior",
    "solicitud-cliente",
    "otro",
  ],
  "motivos-suspension": [
    "fuera-de-servicio",
    "en-reparacion",
    "reasignacion",
    "baja-temporal",
    "revision-programa",
    "otro",
  ],
  "motivos-exclusion": ["parada-planta", "festivo", "inventario-fisico", "auditoria", "temporada-baja", "otro"],
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
  "tipos-herramienta": ["manual", "electrica", "hidraulica", "neumatica", "medicion", "izaje", "especializada"],
  "clasificaciones-sla": ["critico", "alto", "medio", "bajo"],
  "unidades-tiempo": ["minutos", "horas", "dias"],
  "monedas": ["usd", "eur", "cop", "mxn", "pen", "clp", "brl"],
  "prioridades": ["baja", "media", "alta", "critica"],
  "origenes-generacion": ["manual", "programada", "frecuencia", "medidor", "eventos", "multiple"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
