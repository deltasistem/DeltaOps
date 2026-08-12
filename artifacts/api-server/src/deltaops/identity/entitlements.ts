/**
 * DeltaOps · DGP-017 — Module Entitlements por tenant.
 *
 * Define qué módulos de negocio tiene CONTRATADOS/habilitados cada empresa.
 * El enforcement es en BACKEND (middleware) además del futuro frontend: una
 * superficie de módulo no contratado se rechaza con 403 aunque el usuario
 * tenga permisos. NO duplica ni modifica los módulos existentes; solo controla
 * su disponibilidad por tenant.
 */

/** Catálogo de módulos de negocio conocidos (claves estables). */
export const MODULOS_CONOCIDOS = [
  "referencia",
  "activos",
  "ordenes",
  "inventario",
  "planes",
  "abastecimiento",
  "preventivo",
  "correctivo",
  "analytics",
  "utilizacion",
  "manodeobra",
  "costos",
] as const;

export type ModuloClave = (typeof MODULOS_CONOCIDOS)[number];

/** Todos los módulos habilitados (default histórico del tenant principal/DEMO). */
export const MODULOS_TODOS: readonly ModuloClave[] = [...MODULOS_CONOCIDOS];

/**
 * Mapa prefijo de ruta → módulo. Se usa para el middleware de entitlement:
 * dada una URL `/api/deltaops/<segmento>/...`, se resuelve el módulo.
 * Solo cubre superficies de MÓDULO DE NEGOCIO; las superficies de identidad,
 * tenancy, admin y plataforma quedan fuera (siempre disponibles).
 */
export const RUTA_A_MODULO: Record<string, ModuloClave> = {
  referencia: "referencia",
  activos: "activos",
  ordenes: "ordenes",
  inventario: "inventario",
  planes: "planes",
  abastecimiento: "abastecimiento",
  preventivo: "preventivo",
  correctivo: "correctivo",
  analytics: "analytics",
  utilizacion: "utilizacion",
  manodeobra: "manodeobra",
  costos: "costos",
};

export function esModuloConocido(v: string): v is ModuloClave {
  return (MODULOS_CONOCIDOS as readonly string[]).includes(v);
}

/** Normaliza y valida una lista de módulos entrante (ignora desconocidos). */
export function normalizarModulos(entrada: unknown): ModuloClave[] {
  if (!Array.isArray(entrada)) return [];
  const set = new Set<ModuloClave>();
  for (const m of entrada) {
    if (typeof m === "string" && esModuloConocido(m)) set.add(m);
  }
  return [...set];
}
