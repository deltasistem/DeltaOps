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

/**
 * ¿El rol es una identidad de administración GLOBAL de plataforma (consola
 * técnica de infraestructura: salud, uptime, readiness, motores, plataforma)?
 * SÓLO el SUPER_ADMIN aterriza en esa superficie. El resto NUNCA la ve.
 */
export function esConsolaGlobal(rol: Rol): boolean {
  return rol === "SUPER_ADMIN";
}

/**
 * Superficies EXCLUSIVAS del SUPER_ADMIN (administración global / infraestructura).
 * El guard de ruta oculta/redirige estas rutas para el resto de roles; la
 * autorización real la sigue imponiendo el backend (403). No confiar sólo en esto.
 */
export const RUTAS_SOLO_SUPER_ADMIN: readonly string[] = [
  "/plataforma",
  "/motores",
  "/motores/playground",
  "/consola-activos",
  "/administracion/saas",
];

/** ¿La ruta pertenece a las superficies exclusivas del SUPER_ADMIN? */
export function esRutaSoloSuperAdmin(ruta: string): boolean {
  return RUTAS_SOLO_SUPER_ADMIN.some((r) => ruta === r || ruta.startsWith(r + "/"));
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

/* ---------------------- Navegación por proceso (Lite) ------------------- */

/**
 * DELTAOPS LITE-03 §1 · Navegación agrupada por PROCESO operacional (no por
 * arquitectura técnica). Reagrupa las MISMAS rutas/entitlements existentes en
 * grupos legibles (INICIO / MANTENIMIENTO / EQUIPOS / INVENTARIO / INDICADORES
 * / ADMINISTRACIÓN). No crea rutas nuevas ni elimina ninguna: sólo compone la
 * presentación. La visibilidad de cada ítem sigue gobernada por el entitlement
 * de módulo (`moduloHabilitado`) y/o la capacidad de administración del rol; el
 * backend sigue siendo la autoridad (403), nunca se confía en ocultar.
 */
export interface ItemNav {
  readonly clave: string;
  readonly nombre: string;
  readonly ruta: string;
}

export interface GrupoNav {
  readonly clave: string;
  readonly titulo: string;
  readonly items: ItemNav[];
}

/**
 * Construye los grupos de navegación visibles para la sesión. Cada ítem sólo se
 * incluye si su módulo está habilitado (o, en Administración, si el rol tiene la
 * capacidad correspondiente). Los grupos vacíos se omiten. El módulo emergente
 * Utilización (sin enum en el contrato) se decide con su guard dedicado pasado
 * por el llamador para no acoplar este helper a esa capa.
 */
export function gruposNavegacion(
  sesion: Pick<Sesion, "rol" | "modulos">,
  opciones?: { utilizacionVisible?: boolean },
): GrupoNav[] {
  const tiene = (m: Modulo): boolean => sesion.modulos.includes(m);
  const admin = esAdminEmpresa(sesion.rol);
  const superAdmin = esSuperAdmin(sesion.rol);
  const grupos: GrupoNav[] = [];

  // MANTENIMIENTO · trabajo operativo (órdenes, correctivo, preventivo, planes).
  const mantenimiento: ItemNav[] = [];
  if (tiene("ordenes")) mantenimiento.push({ clave: "ordenes", nombre: "Órdenes", ruta: "/ordenes" });
  if (tiene("correctivo")) mantenimiento.push({ clave: "correctivo", nombre: "Correctivo", ruta: "/correctivo/solicitudes" });
  if (tiene("preventivo")) mantenimiento.push({ clave: "preventivo", nombre: "Preventivo", ruta: "/preventivo/programas" });
  if (tiene("planes")) mantenimiento.push({ clave: "planes", nombre: "Planes", ruta: "/planes" });
  if (mantenimiento.length > 0) grupos.push({ clave: "mantenimiento", titulo: "Mantenimiento", items: mantenimiento });

  // EQUIPOS · activos + utilización.
  const equipos: ItemNav[] = [];
  if (tiene("activos")) equipos.push({ clave: "activos", nombre: "Activos", ruta: "/activos" });
  if (opciones?.utilizacionVisible) equipos.push({ clave: "utilizacion", nombre: "Utilización", ruta: "/utilizacion/lecturas" });
  if (equipos.length > 0) grupos.push({ clave: "equipos", titulo: "Equipos", items: equipos });

  // INVENTARIO · inventario + abastecimiento.
  const inventario: ItemNav[] = [];
  if (tiene("inventario")) inventario.push({ clave: "inventario", nombre: "Inventario", ruta: "/inventario" });
  if (tiene("abastecimiento")) inventario.push({ clave: "abastecimiento", nombre: "Abastecimiento", ruta: "/abastecimiento/solicitudes" });
  if (inventario.length > 0) grupos.push({ clave: "inventario", titulo: "Inventario", items: inventario });

  // INDICADORES · analytics + costos.
  const indicadores: ItemNav[] = [];
  if (tiene("analytics")) indicadores.push({ clave: "analytics", nombre: "Analytics", ruta: "/analytics" });
  // Costos es una superficie propia (/costos) sin enum de módulo; se ofrece a
  // roles con capacidad de consulta administrativa/supervisión.
  if (tiene("analytics") && (admin || sesion.rol === "SUPERVISOR" || sesion.rol === "PLANIFICADOR")) {
    indicadores.push({ clave: "costos", nombre: "Costos", ruta: "/costos" });
  }
  if (indicadores.length > 0) grupos.push({ clave: "indicadores", titulo: "Indicadores", items: indicadores });

  // Referencia (catálogo transversal) se ofrece dentro de Indicadores/otros sólo
  // si el módulo está habilitado, conservando su acceso sin ensuciar el nav.
  if (tiene("referencia")) {
    grupos.push({ clave: "referencia", titulo: "Referencia", items: [{ clave: "referencia", nombre: "Referencia", ruta: "/referencia" }] });
  }

  // ADMINISTRACIÓN · por capacidad de administración del rol (no entitlement).
  const administracion: ItemNav[] = [];
  if (admin) {
    administracion.push({ clave: "usuarios", nombre: "Usuarios", ruta: "/administracion/usuarios" });
    administracion.push({ clave: "configuracion", nombre: "Configuración", ruta: "/administracion/configuracion" });
  }
  if (superAdmin) {
    administracion.push({ clave: "saas", nombre: "Administración SaaS", ruta: "/administracion/saas" });
  }
  if (administracion.length > 0) grupos.push({ clave: "administracion", titulo: "Administración", items: administracion });

  return grupos;
}

/* ------------------------------- Landing -------------------------------- */

/**
 * Entrada operacional PRINCIPAL por rol dentro de la experiencia empresarial.
 * NO es autorización (el backend manda): sólo decide a qué superficie de negocio
 * llevar/priorizar según el perfil, respetando siempre los módulos habilitados.
 * El SUPER_ADMIN no usa esto: aterriza en la consola global técnica.
 */
export interface LandingRol {
  /** Ruta operacional destacada (CTA principal) para ese rol. */
  readonly ruta: string;
  /** Etiqueta de la superficie destacada. */
  readonly etiqueta: string;
  /** Módulo que respalda la superficie (para verificar entitlement). */
  readonly modulo?: Modulo;
}

/**
 * Preferencia de landing por rol (en orden de prioridad). Se elige la primera
 * cuyo módulo esté habilitado; si ninguna aplica, se cae al primer módulo
 * visible o al perfil (sin superficies globales para no-SUPER_ADMIN).
 */
const PREFERENCIA_LANDING: Record<Rol, LandingRol[]> = {
  SUPER_ADMIN: [{ ruta: "/administracion/saas", etiqueta: "Administración global" }],
  TENANT_ADMIN: [
    { ruta: "/centro", etiqueta: "Centro de mantenimiento", modulo: "ordenes" },
    { ruta: "/administracion/usuarios", etiqueta: "Usuarios de la empresa" },
  ],
  SUPERVISOR: [
    { ruta: "/centro", etiqueta: "Centro de mantenimiento", modulo: "ordenes" },
    { ruta: "/ordenes/supervisor", etiqueta: "Supervisión de órdenes", modulo: "ordenes" },
  ],
  PLANIFICADOR: [
    { ruta: "/ordenes/planificacion", etiqueta: "Planificación", modulo: "ordenes" },
    { ruta: "/planes/calendario", etiqueta: "Calendario de planes", modulo: "planes" },
  ],
  TECNICO: [{ ruta: "/ordenes", etiqueta: "Mis órdenes", modulo: "ordenes" }],
  CONSULTA: [
    { ruta: "/centro", etiqueta: "Centro de mantenimiento", modulo: "ordenes" },
    { ruta: "/activos", etiqueta: "Activos", modulo: "activos" },
  ],
};

/**
 * Resuelve la superficie operacional principal (CTA) para la sesión, respetando
 * entitlements. Devuelve `null` para SUPER_ADMIN (consola global, no aplica) o
 * cuando no hay ninguna superficie operativa habilitada.
 */
export function landingOperacional(sesion: Pick<Sesion, "rol" | "modulos">): LandingRol | null {
  if (esConsolaGlobal(sesion.rol)) return null;
  const preferencias = PREFERENCIA_LANDING[sesion.rol] ?? [];
  for (const p of preferencias) {
    if (!p.modulo || sesion.modulos.includes(p.modulo)) return p;
  }
  const visibles = modulosVisibles(sesion);
  if (visibles.length > 0) return { ruta: visibles[0].ruta, etiqueta: visibles[0].nombre, modulo: visibles[0].modulo };
  return null;
}
