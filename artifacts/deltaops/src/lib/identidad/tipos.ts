/**
 * DGP-017 · Tipos de la experiencia Enterprise Identity, Tenancy & SaaS.
 *
 * Reflejan el contrato CONGELADO `identity.openapi.json` (base `/api/deltaops`).
 * No se inventan campos: cualquier extensión debe existir primero en el contrato.
 */

/** Roles canónicos del RBAC empresarial (enum del contrato). */
export type Rol =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "SUPERVISOR"
  | "PLANIFICADOR"
  | "TECNICO"
  | "CONSULTA";

/** Módulos susceptibles de entitlement por tenant (enum del contrato). */
export type Modulo =
  | "referencia"
  | "activos"
  | "ordenes"
  | "inventario"
  | "planes"
  | "abastecimiento"
  | "preventivo"
  | "correctivo"
  | "analytics";

/** Branding seguro del tenant (solo tokens controlados; nunca CSS arbitrario). */
export interface Branding {
  readonly nombre?: string;
  readonly nombreApp?: string;
  readonly logoUrl?: string;
  readonly logoAltUrl?: string;
  readonly faviconUrl?: string;
  readonly colorPrimario?: string;
  readonly colorSecundario?: string;
}

/** Empresa/tenant en el contexto de sesión. */
export interface Tenant {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly estado: string;
  readonly idioma?: string;
  readonly zonaHoraria?: string;
  readonly moneda?: string;
  readonly branding?: Branding;
}

/** Resumen de una membresía del usuario (para el selector de empresa). */
export interface MembresiaResumen {
  readonly tenantId: string;
  readonly nombre: string;
  readonly rol: Rol;
}

/** Payload completo de sesión (`GET /auth/session`, `POST /auth/login|switch`). */
export interface Sesion {
  readonly identityId: string;
  readonly email: string;
  readonly nombre: string;
  readonly tenant: Tenant;
  readonly rol: Rol;
  readonly capacidades?: readonly string[];
  readonly permisos?: readonly string[];
  readonly modulos: readonly Modulo[];
  readonly membresias: readonly MembresiaResumen[];
}

/** Cuerpo 409 SELECT_TENANT del login multiempresa. */
export interface SeleccionTenant {
  readonly code: "SELECT_TENANT";
  readonly membresias: readonly MembresiaResumen[];
}

/** Invitación empresarial. */
export interface Invitacion {
  readonly invitationId: string;
  readonly email: string;
  readonly rol: Rol;
  readonly estado: string;
  readonly expiresAt?: string;
  readonly createdAt?: string;
}

/** Usuario del tenant (administración). */
export interface Usuario {
  readonly identityId: string;
  readonly email: string;
  readonly nombre: string;
  readonly estado?: string;
  readonly rol: Rol;
  readonly estadoMembresia?: string;
}

/** Rol del catálogo canónico (`GET /roles`). */
export interface RolCatalogo {
  readonly clave: Rol;
  readonly nombre: string;
  readonly descripcion?: string;
}

/** Configuración del tenant (`GET /tenant/config`). */
export interface ConfigTenant {
  readonly idioma?: string;
  readonly zonaHoraria?: string;
  readonly moneda?: string;
  readonly configuracion?: Record<string, unknown>;
  readonly modulos?: readonly Modulo[];
}

/** Notificación por correo (estado en la plataforma). */
export interface Notificacion {
  readonly emailId: string;
  readonly tipo: string;
  readonly destinatario: string;
  readonly asunto?: string;
  readonly estado: string;
  readonly createdAt?: string;
  readonly sentAt?: string | null;
}

/** Evento de auditoría. */
export interface AuditoriaEvento {
  readonly action: string;
  readonly actorId: string;
  readonly subjectId?: string | null;
  readonly detail?: Record<string, unknown>;
  readonly occurredAt: string;
}

/** Estados formales de un tenant (admin SaaS). */
export type EstadoTenant = "ACTIVO" | "SUSPENDIDO" | "CERRADO";
