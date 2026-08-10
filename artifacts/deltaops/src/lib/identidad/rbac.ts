/**
 * DGP-017 · RBAC de PRESENTACIÓN. Decide qué superficies OFRECER en la UI a
 * partir del rol/permisos de la sesión. NO es la autoridad: el backend rechaza
 * cualquier operación no autorizada (nunca hay bypass). No usar `if role===...`
 * disperso por la app; centralizar aquí las decisiones de composición.
 */
import type { Rol, Modulo, Sesion } from "./tipos";

/** Metadatos de cada rol para mostrarlos de forma legible. */
export const ROLES_META: Record<Rol, { nombre: string; descripcion: string }> = {
  SUPER_ADMIN: { nombre: "Super administrador", descripcion: "Administración global SaaS de todas las empresas." },
  TENANT_ADMIN: { nombre: "Administrador de empresa", descripcion: "Gestiona usuarios, configuración y branding de su empresa." },
  SUPERVISOR: { nombre: "Supervisor", descripcion: "Supervisa la operación de mantenimiento." },
  PLANIFICADOR: { nombre: "Planificador", descripcion: "Planifica trabajo y programas." },
  TECNICO: { nombre: "Técnico", descripcion: "Ejecuta órdenes e intervenciones." },
  CONSULTA: { nombre: "Consulta", descripcion: "Acceso de solo lectura." },
};

export const ROLES: readonly Rol[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "SUPERVISOR",
  "PLANIFICADOR",
  "TECNICO",
  "CONSULTA",
];

/** Nombre legible de un rol (con degradación segura). */
export function nombreRol(rol: string): string {
  return (ROLES_META as Record<string, { nombre: string }>)[rol]?.nombre ?? rol;
}

/** ¿El rol administra la empresa (usuarios, config, branding)? */
export function esAdminEmpresa(rol: Rol): boolean {
  return rol === "TENANT_ADMIN" || rol === "SUPER_ADMIN";
}

/** ¿El rol dispone de administración global SaaS? */
export function esSuperAdmin(rol: Rol): boolean {
  return rol === "SUPER_ADMIN";
}

/** Capacidades de presentación derivadas del rol de la sesión activa. */
export interface Capacidades {
  readonly administrarUsuarios: boolean;
  readonly configurarEmpresa: boolean;
  readonly administrarSaaS: boolean;
  readonly cambiarModulos: boolean;
}

export function capacidadesDe(sesion: Pick<Sesion, "rol">): Capacidades {
  const admin = esAdminEmpresa(sesion.rol);
  const superAdmin = esSuperAdmin(sesion.rol);
  return {
    administrarUsuarios: admin,
    configurarEmpresa: admin,
    administrarSaaS: superAdmin,
    cambiarModulos: superAdmin,
  };
}

/* --------------------------- Módulos / entitlements --------------------- */

/** Catálogo de módulos de negocio con su superficie de entrada. */
export const MODULOS_META: Record<Modulo, { nombre: string; ruta: string }> = {
  referencia: { nombre: "Referencia", ruta: "/referencia" },
  activos: { nombre: "Activos", ruta: "/activos" },
  ordenes: { nombre: "Órdenes", ruta: "/ordenes" },
  inventario: { nombre: "Inventario", ruta: "/inventario" },
  planes: { nombre: "Planes", ruta: "/planes" },
  abastecimiento: { nombre: "Abastecimiento", ruta: "/abastecimiento/solicitudes" },
  preventivo: { nombre: "Preventivo", ruta: "/preventivo/programas" },
  correctivo: { nombre: "Correctivo", ruta: "/correctivo/solicitudes" },
  analytics: { nombre: "Analytics", ruta: "/analytics" },
};

/** Orden canónico de despliegue de módulos en la navegación. */
export const MODULOS_ORDEN: readonly Modulo[] = [
  "activos",
  "ordenes",
  "inventario",
  "planes",
  "abastecimiento",
  "preventivo",
  "correctivo",
  "analytics",
  "referencia",
];

/**
 * ¿El tenant tiene habilitado (entitlement) el módulo? Se OCULTA en UI cuando
 * no está; el backend rechaza igualmente el acceso (nunca confiar solo en
 * ocultar). Sin lista de módulos en la sesión, se es conservador: nada visible.
 */
export function moduloHabilitado(sesion: Pick<Sesion, "modulos">, modulo: Modulo): boolean {
  return sesion.modulos.includes(modulo);
}

/** Módulos habilitados, en orden canónico, listos para navegación. */
export function modulosVisibles(sesion: Pick<Sesion, "modulos">): { modulo: Modulo; nombre: string; ruta: string }[] {
  return MODULOS_ORDEN.filter((m) => sesion.modulos.includes(m)).map((m) => ({
    modulo: m,
    nombre: MODULOS_META[m].nombre,
    ruta: MODULOS_META[m].ruta,
  }));
}
