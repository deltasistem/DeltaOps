/**
 * DeltaOps · DGP-017 — RBAC como CONFIGURACIÓN del sistema.
 *
 * Los roles Enterprise (SUPER_ADMIN…CONSULTA) son DATOS: viven en
 * `deltaops.idn_roles` por tenant (sembrados idempotentemente) y componen
 * permisos/capacidades del Kernel. Aquí se define el catálogo canónico y su
 * MAPEO al rol legacy (admin/operador/lector) que consumen los `principal*`
 * de cada módulo (contratos congelados). Así NO se duplica la lógica de
 * permisos por módulo y NO aparece `if (rol === "admin")` disperso: cada
 * superficie deriva su Principal desde el rol efectivo por membresía.
 */

/** Roles canónicos Enterprise (clave estable usada en membresías y roles). */
export const ROLES_CANONICOS = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "SUPERVISOR",
  "PLANIFICADOR",
  "TECNICO",
  "CONSULTA",
] as const;

export type RolCanonico = (typeof ROLES_CANONICOS)[number];

/** Rol legacy consumido por los `principal*` de módulo (contrato congelado). */
export type RolLegacy = "admin" | "operador" | "lector";

/**
 * Mapeo rol canónico → rol legacy de módulo. Compatibilidad total: los
 * `principal*` existentes siguen recibiendo admin/operador/lector.
 */
const CANONICO_A_LEGACY: Record<RolCanonico, RolLegacy> = {
  SUPER_ADMIN: "admin",
  TENANT_ADMIN: "admin",
  SUPERVISOR: "operador",
  PLANIFICADOR: "operador",
  TECNICO: "operador",
  CONSULTA: "lector",
};

/**
 * Mapeo INVERSO/compat: los roles legacy históricos de `deltaops.users`
 * (admin/operador/lector) se elevan a un rol canónico equivalente para que la
 * sesión siempre razone en términos Enterprise.
 */
const LEGACY_A_CANONICO: Record<string, RolCanonico> = {
  admin: "TENANT_ADMIN",
  platform_admin: "SUPER_ADMIN",
  operador: "SUPERVISOR",
  lector: "CONSULTA",
};

export function esRolCanonico(v: string): v is RolCanonico {
  return (ROLES_CANONICOS as readonly string[]).includes(v);
}

/** Normaliza cualquier rol (canónico o legacy) a un rol canónico. */
export function aRolCanonico(rol: string): RolCanonico {
  if (esRolCanonico(rol)) return rol;
  return LEGACY_A_CANONICO[rol] ?? "CONSULTA";
}

/** Deriva el rol legacy de módulo a partir de un rol canónico o legacy. */
export function aRolLegacy(rol: string): RolLegacy {
  return CANONICO_A_LEGACY[aRolCanonico(rol)];
}

/** ¿Es un rol con privilegios administrativos del tenant? */
export function esAdminDeTenant(rol: string): boolean {
  const c = aRolCanonico(rol);
  return c === "TENANT_ADMIN" || c === "SUPER_ADMIN";
}

/** ¿Es el rol global de administración SaaS? */
export function esSuperAdmin(rol: string): boolean {
  return aRolCanonico(rol) === "SUPER_ADMIN";
}

/** Definición sembrable de cada rol del sistema (por tenant). */
export interface DefinicionRol {
  clave: RolCanonico;
  nombre: string;
  descripcion: string;
}

export const CATALOGO_ROLES: readonly DefinicionRol[] = [
  { clave: "SUPER_ADMIN", nombre: "Super Administrador", descripcion: "Administración global de la plataforma SaaS (multi-tenant)." },
  { clave: "TENANT_ADMIN", nombre: "Administrador de Empresa", descripcion: "Administración total dentro de su empresa/tenant." },
  { clave: "SUPERVISOR", nombre: "Supervisor", descripcion: "Gestión operativa completa sin administración de la empresa." },
  { clave: "PLANIFICADOR", nombre: "Planificador", descripcion: "Planificación y gestión de trabajo." },
  { clave: "TECNICO", nombre: "Técnico", descripcion: "Ejecución operativa de trabajo asignado." },
  { clave: "CONSULTA", nombre: "Consulta", descripcion: "Acceso de solo lectura." },
];
