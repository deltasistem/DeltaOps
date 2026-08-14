/**
 * DELTAOPS LITE-09 · Catálogo declarativo de la flota histórica de Delta.
 *
 * Estos son DATOS del lote de importación (decisiones P-1/P-2/P-6 del discovery
 * aprobado por Dirección), NO código de negocio con ramas por código de activo.
 * La regla de tenencia/responsabilidad de mantenimiento se representa como
 * ATRIBUTOS declarados del activo (dimensión existente `especificaciones`), de
 * modo que el importador nunca hace `if (codigo === "C11")`: aplica la regla dura
 * de exclusión de rutinas/OT internas leyendo `mantenimiento === "TERCERO"`.
 *
 * Sin hardcode de "si código = C11": la equivalencia de alias y la tenencia son
 * columnas de esta tabla de datos.
 */

/** Responsabilidad de mantenimiento declarada del activo. */
export type Mantenimiento = "DELTA" | "TERCERO";
/** Tenencia declarada del activo. */
export type Tenencia = "PROPIO" | "ALQUILADO";

export interface ActivoHistorico {
  /** Código empresarial canónico (clave de identidad). */
  readonly codigo: string;
  /** Nombre actual (denominación operacional vigente). */
  readonly nombre: string;
  /** Aliases históricos/variantes observados en las fuentes (para unificación). */
  readonly alias: readonly string[];
  readonly tipo: string;
  readonly categoria: string;
  readonly familia: string;
  readonly tenencia: Tenencia;
  readonly mantenimiento: Mantenimiento;
  /** Unidad del medidor primario (horas → horómetro). */
  readonly unidadMedidor: string;
}

/**
 * Flota operada por Delta que SÍ se crea como activo (P-2), más el Baritanque
 * como excepción (P-6). C11/C11 SIGAR es UN solo activo (alias, no duplicado).
 */
export const FLOTA_HISTORICA: readonly ActivoHistorico[] = [
  // Cargadores propios C1–C8 (mantenimiento Delta).
  ...["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"].map((c) => ({
    codigo: c,
    nombre: c,
    alias: [] as string[],
    tipo: "maquinaria",
    categoria: "maquinaria",
    familia: "maquinaria-amarilla",
    tenencia: "PROPIO" as Tenencia,
    mantenimiento: "DELTA" as Mantenimiento,
    unidadMedidor: "horas",
  })),
  // C11 → C11 SIGAR: MISMO activo, alquilado, mantenimiento del TERCERO (P/directiva §3).
  {
    codigo: "C11",
    nombre: "C11 SIGAR",
    alias: ["C11", "C11 SIGAR"],
    tipo: "maquinaria",
    categoria: "maquinaria",
    familia: "maquinaria-amarilla",
    tenencia: "ALQUILADO",
    mantenimiento: "TERCERO",
    unidadMedidor: "horas",
  },
  // Montacargas propios M1–M13 (mantenimiento Delta).
  ...Array.from({ length: 13 }, (_, i) => `M${i + 1}`).map((c) => ({
    codigo: c,
    nombre: c,
    alias: [] as string[],
    tipo: "maquinaria",
    categoria: "maquinaria",
    familia: "montacargas",
    tenencia: "PROPIO" as Tenencia,
    mantenimiento: "DELTA" as Mantenimiento,
    unidadMedidor: "horas",
  })),
  // DISAN #1 / #2 (montacargas).
  ...["DISAN #1", "DISAN #2"].map((c) => ({
    codigo: c,
    nombre: c,
    alias: [] as string[],
    tipo: "maquinaria",
    categoria: "maquinaria",
    familia: "montacargas",
    tenencia: "PROPIO" as Tenencia,
    mantenimiento: "DELTA" as Mantenimiento,
    unidadMedidor: "horas",
  })),
  // SEM05/06/07 unifican "SEM N GPR" (P-1a).
  {
    codigo: "SEM05", nombre: "SEM05", alias: ["SEM05", "SEM 5 GPR"],
    tipo: "maquinaria", categoria: "maquinaria", familia: "montacargas",
    tenencia: "PROPIO", mantenimiento: "DELTA", unidadMedidor: "horas",
  },
  {
    codigo: "SEM06", nombre: "SEM06", alias: ["SEM06", "SEM 6 GPR"],
    tipo: "maquinaria", categoria: "maquinaria", familia: "montacargas",
    tenencia: "PROPIO", mantenimiento: "DELTA", unidadMedidor: "horas",
  },
  {
    codigo: "SEM07", nombre: "SEM07", alias: ["SEM07", "SEM 7 GPR"],
    tipo: "maquinaria", categoria: "maquinaria", familia: "montacargas",
    tenencia: "PROPIO", mantenimiento: "DELTA", unidadMedidor: "horas",
  },
  // Baritanque: tanque de almacenamiento interno (excepción P-6).
  {
    codigo: "Baritanque", nombre: "Baritanque", alias: ["Baritanque", "BARITANQUE"],
    tipo: "maquinaria", categoria: "energia", familia: "tanques-almacenamiento",
    tenencia: "PROPIO", mantenimiento: "DELTA", unidadMedidor: "horas",
  },
];

/**
 * Códigos de equipos de terceros/incidentales que se EXCLUYEN con reporte (P-1b,
 * P-2). Sus filas no crean activo ni cargan datos; se reportan como omitidas.
 * (Se comparan por forma normalizada; ver `normalizarCodigo`.)
 */
export const CODIGOS_EXCLUIDOS: readonly string[] = [
  "CAMIONETA ALVARO",
  "Serpomar Logístic Sas, Liugong 856",
  "Serpomar Liugong 856",
  "SDR",
  "A02",
  "RETRO 312 BL",
  "950-01",
  "950-03",
  "VOLVO L70F",
  "C-9",
  "C9",
];

/** Normaliza un código crudo (mayúsculas, espacios colapsados). */
export function normalizarCodigo(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Índice alias-normalizado → activo canónico (unificación de identidad). */
const INDICE_ALIAS: Map<string, ActivoHistorico> = (() => {
  const m = new Map<string, ActivoHistorico>();
  for (const a of FLOTA_HISTORICA) {
    m.set(normalizarCodigo(a.codigo), a);
    for (const al of a.alias) m.set(normalizarCodigo(al), a);
  }
  return m;
})();

const SET_EXCLUIDOS = new Set(CODIGOS_EXCLUIDOS.map(normalizarCodigo));

export type ResolucionActivo =
  | { readonly clase: "flota"; readonly activo: ActivoHistorico; readonly literalOriginal: string }
  | { readonly clase: "excluido"; readonly literalOriginal: string }
  | { readonly clase: "desconocido"; readonly literalOriginal: string };

/**
 * Resuelve un literal crudo de código de activo a la flota canónica, a exclusión
 * declarada, o a desconocido (para reporte, jamás fusión automática — directiva §5).
 */
export function resolverActivo(raw: string): ResolucionActivo {
  const literalOriginal = String(raw ?? "").trim();
  const norm = normalizarCodigo(literalOriginal);
  if (norm.length === 0) return { clase: "desconocido", literalOriginal };
  const canon = INDICE_ALIAS.get(norm);
  if (canon) return { clase: "flota", activo: canon, literalOriginal };
  if (SET_EXCLUIDOS.has(norm)) return { clase: "excluido", literalOriginal };
  return { clase: "desconocido", literalOriginal };
}
