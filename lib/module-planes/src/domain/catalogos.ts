/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Catálogos CONFIGURABLES por tenant.
 *
 * REGLA DURA (lección DGP-011.1): NADA de enums de dominio. Toda dimensión
 * clasificatoria (tipos de plan, estrategias, disciplinas, unidades de medidor,
 * turnos, tipos de calendario, orígenes de generación, etc.) vive en catálogos
 * administrables por tenant.
 *
 * Semántica de validación de referencias (idéntica a DGP-009.1 / 011.1):
 *   · Catálogo VACÍO  ⇒ se aceptan los valores CANÓNICOS por defecto (o forma
 *                        libre si no hay canónicos declarados).
 *   · Catálogo NO vacío ⇒ el valor DEBE existir Y estar HABILITADO.
 */

/** Estados de habilitación de una entrada de catálogo. */
export const ESTADO_HABILITADO = "habilitado" as const;
export const ESTADO_DESHABILITADO = "deshabilitado" as const;

/** Nombres canónicos de todos los catálogos del módulo (20). */
export const CATALOGOS = [
  "tipos-plan",
  "estrategias",
  "disciplinas",
  "prioridades",
  "criticidades",
  "unidades-medidor",
  "tipos-frecuencia",
  "modos-combinacion",
  "origenes-generacion",
  "tipos-calendario",
  "turnos",
  "tipos-parada",
  "motivos-suspension",
  "tipos-actividad",
  "categorias-riesgo",
  "tipos-recurso",
  "empresas",
  "proyectos",
  "ubicaciones",
  "clases-activo",
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
  "tipos-plan": [
    "preventivo",
    "predictivo",
    "inspeccion",
    "lubricacion",
    "calibracion",
    "cambio-componentes",
    "limpieza",
    "campania",
    "legal",
    "normativo",
    "rutina-fabricante",
    "rutina-interna",
    "personalizado",
  ],
  "estrategias": ["basado-condicion", "basado-tiempo", "basado-uso", "correr-hasta-falla", "mixta"],
  "disciplinas": ["mecanica", "electrica", "instrumentacion", "civil", "predictiva", "operacion", "seguridad"],
  "prioridades": ["baja", "media", "alta", "critica"],
  "criticidades": ["a", "b", "c", "d"],
  "unidades-medidor": ["horas", "horometro", "odometro", "kilometros", "ciclos", "produccion", "contador", "arranques"],
  "tipos-frecuencia": [
    "dias",
    "semanas",
    "meses",
    "anios",
    "horas",
    "horometro",
    "odometro",
    "ciclos",
    "produccion",
    "contador",
    "eventos",
  ],
  "modos-combinacion": ["lo-que-ocurra-primero", "todas", "cualquiera"],
  "origenes-generacion": ["manual", "programada", "frecuencia", "horometro", "odometro", "eventos", "multiple"],
  "tipos-calendario": ["empresa", "proyecto", "activo"],
  "turnos": ["diurno", "nocturno", "mixto", "administrativo"],
  "tipos-parada": ["programada", "no-programada", "mantenimiento-mayor", "festivo", "bloqueo"],
  "motivos-suspension": ["falta-repuestos", "operacion-continua", "clima", "presupuesto", "reprogramacion", "otro"],
  "tipos-actividad": ["inspeccion", "lubricacion", "ajuste", "reemplazo", "limpieza", "medicion", "prueba", "calibracion"],
  "categorias-riesgo": ["mecanico", "electrico", "quimico", "altura", "espacio-confinado", "energia-peligrosa", "ninguno"],
  "tipos-recurso": ["tecnico", "cuadrilla", "contratista", "especialista"],
  "clases-activo": ["movil", "fijo", "rotativo", "estatico", "electrico", "instrumentacion"],
};

/** Todos los `recordType` de catálogo (para el descriptor del servicio). */
export function recordTypesCatalogos(): string[] {
  return CATALOGOS.map(recordTypeCatalogo);
}
