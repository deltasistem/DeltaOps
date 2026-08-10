/**
 * DeltaOps · DGP-017 — Enterprise Identity, Tenancy & SaaS Foundation.
 * Espejo Drizzle de la migración:
 *   - lib/db/migrations/deltaops/0033_identity_tenancy.sql (fuente de verdad).
 * La RLS por tenant la aplican los .sql oficiales. ADITIVO: no altera las
 * tablas congeladas (deltaops.users sigue vigente para compatibilidad).
 */
import {
  boolean,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { deltaopsSchema } from "./deltaops";

/* --------------------------------- Tenants -------------------------------- */
export const tenTenantsTable = deltaopsSchema.table("ten_tenants", {
  tenantId: text("tenant_id").primaryKey(),
  codigo: text("codigo").notNull(),
  nombreComercial: text("nombre_comercial").notNull(),
  razonSocial: text("razon_social"),
  idTributaria: text("id_tributaria"),
  estado: text("estado").notNull().default("ACTIVO"),
  zonaHoraria: text("zona_horaria").notNull().default("America/Santiago"),
  idioma: text("idioma").notNull().default("es"),
  moneda: text("moneda").notNull().default("CLP"),
  configuracion: jsonb("configuracion").notNull().default({}),
  branding: jsonb("branding").notNull().default({}),
  modulos: jsonb("modulos").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- Identidades ------------------------------ */
export const idnIdentitiesTable = deltaopsSchema.table("idn_identities", {
  identityId: uuid("identity_id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  nombre: text("nombre").notNull(),
  passwordHash: text("password_hash").notNull(),
  estado: text("estado").notNull().default("ACTIVO"),
  /**
   * Epoch de autorización: se incrementa en cada login/cambio de tenant. La
   * sesión guarda el valor vigente en `authVersion`; el middleware exige que
   * coincidan (sesión con epoch obsoleta ⇒ 401).
   */
  authEpoch: integer("auth_epoch").notNull().default(0),
  ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------- Membresías ------------------------------- */
export const idnMembershipsTable = deltaopsSchema.table("idn_memberships", {
  membershipId: uuid("membership_id").primaryKey().defaultRandom(),
  identityId: uuid("identity_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  rol: text("rol").notNull().default("CONSULTA"),
  estado: text("estado").notNull().default("ACTIVO"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------- Roles --------------------------------- */
export const idnRolesTable = deltaopsSchema.table("idn_roles", {
  tenantId: text("tenant_id").notNull(),
  clave: text("clave").notNull(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  permisos: jsonb("permisos").notNull().default([]),
  capacidades: jsonb("capacidades").notNull().default([]),
  esSistema: boolean("es_sistema").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------ Invitaciones ------------------------------ */
export const idnInvitationsTable = deltaopsSchema.table("idn_invitations", {
  invitationId: uuid("invitation_id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  rol: text("rol").notNull().default("CONSULTA"),
  tokenHash: text("token_hash").notNull(),
  estado: text("estado").notNull().default("PENDIENTE"),
  invitadoPor: text("invitado_por").notNull(),
  idempotencyKey: text("idempotency_key"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Recuperación clave --------------------------- */
export const idnPasswordResetsTable = deltaopsSchema.table("idn_password_resets", {
  resetId: uuid("reset_id").primaryKey().defaultRandom(),
  identityId: uuid("identity_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  estado: text("estado").notNull().default("PENDIENTE"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------ Correo (email) ---------------------------- */
export const ntfEmailTemplatesTable = deltaopsSchema.table("ntf_email_templates", {
  clave: text("clave").primaryKey(),
  idioma: text("idioma").notNull().default("es"),
  asunto: text("asunto").notNull(),
  cuerpo: text("cuerpo").notNull(),
  descripcion: text("descripcion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ntfEmailOutboxTable = deltaopsSchema.table("ntf_email_outbox", {
  emailId: uuid("email_id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  tipo: text("tipo").notNull(),
  destinatario: text("destinatario").notNull(),
  idioma: text("idioma").notNull().default("es"),
  asunto: text("asunto").notNull(),
  cuerpo: text("cuerpo").notNull(),
  branding: jsonb("branding").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  estado: text("estado").notNull().default("QUEUED"),
  intentos: integer("intentos").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenTenant = typeof tenTenantsTable.$inferSelect;
export type IdnIdentity = typeof idnIdentitiesTable.$inferSelect;
export type IdnMembership = typeof idnMembershipsTable.$inferSelect;
export type IdnRole = typeof idnRolesTable.$inferSelect;
export type IdnInvitation = typeof idnInvitationsTable.$inferSelect;
export type IdnPasswordReset = typeof idnPasswordResetsTable.$inferSelect;
export type NtfEmailTemplate = typeof ntfEmailTemplatesTable.$inferSelect;
export type NtfEmailOutbox = typeof ntfEmailOutboxTable.$inferSelect;
