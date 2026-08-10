-- DeltaOps · DGP-017 · Migración 0033 — Enterprise Identity, Tenancy & SaaS Foundation.
--
-- ADITIVA y compatible: NO altera ni elimina columnas de deltaops.users (los
-- logins existentes siguen funcionando). Introduce el modelo formal Enterprise:
--   ten_tenants        — Tenant como primera clase (estado, config, branding).
--   idn_identities     — Identidad GLOBAL de usuario (email único global).
--   idn_memberships    — Membresía Identidad ↔ Tenant (estado, rol, accesos).
--   idn_roles          — Roles RBAC como DATOS del sistema (por tenant).
--   idn_invitations    — Invitaciones (token hasheado, expira, un solo uso).
--   idn_password_resets— Tokens de recuperación (hasheados, un solo uso).
--   ntf_email_outbox   — Cola de correos con idempotencia (idempotency_key).
--   ntf_email_log      — Bitácora de estados de entrega por correo.
--
-- MODELO DE ACCESO CROSS-TENANT (justificación):
--   La IDENTIDAD es global por naturaleza (un email puede tener membresías en
--   varios tenants). Por ello `idn_identities` e `idn_memberships` NO llevan
--   política RLS por `app.tenant_id`: su acceso se restringe SIEMPRE en la capa
--   de aplicación (consultas filtradas por identity_id / membership del actor).
--   Todo lo que es PROPIEDAD de un tenant (tenants config/branding, invitaciones,
--   resets, correos) SÍ lleva RLS por `app.tenant_id`.
--
-- Espejo Drizzle: lib/db/src/schema/deltaops-identity.ts
-- Idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING).

/* ============================ TENANTS ============================ */
CREATE TABLE IF NOT EXISTS deltaops.ten_tenants (
  tenant_id       text PRIMARY KEY,               -- código lógico usado por RLS (app.tenant_id)
  codigo          text NOT NULL,                  -- código comercial visible
  nombre_comercial text NOT NULL,
  razon_social    text,
  id_tributaria   text,
  estado          text NOT NULL DEFAULT 'ACTIVO', -- ACTIVO | SUSPENDIDO | INACTIVO
  zona_horaria    text NOT NULL DEFAULT 'America/Santiago',
  idioma          text NOT NULL DEFAULT 'es',
  moneda          text NOT NULL DEFAULT 'CLP',
  configuracion   jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding        jsonb NOT NULL DEFAULT '{}'::jsonb,
  modulos         jsonb NOT NULL DEFAULT '[]'::jsonb, -- entitlements de módulos habilitados
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  suspended_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ten_tenants_estado_chk CHECK (estado IN ('ACTIVO','SUSPENDIDO','INACTIVO')),
  CONSTRAINT ten_tenants_codigo_uq UNIQUE (codigo)
);

/* ============================ IDENTIDAD GLOBAL ============================ */
CREATE TABLE IF NOT EXISTS deltaops.idn_identities (
  identity_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,                  -- único GLOBAL (case-insensitive)
  nombre          text NOT NULL,
  password_hash   text NOT NULL,
  estado          text NOT NULL DEFAULT 'ACTIVO', -- ACTIVO | DESHABILITADO | PENDIENTE
  ultimo_acceso   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idn_identities_estado_chk CHECK (estado IN ('ACTIVO','DESHABILITADO','PENDIENTE'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_idn_identities_email
  ON deltaops.idn_identities (lower(email));

/* ============================ MEMBRESÍAS ============================ */
CREATE TABLE IF NOT EXISTS deltaops.idn_memberships (
  membership_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id     uuid NOT NULL REFERENCES deltaops.idn_identities(identity_id) ON DELETE CASCADE,
  tenant_id       text NOT NULL,
  rol             text NOT NULL DEFAULT 'CONSULTA', -- clave de idn_roles (por tenant)
  estado          text NOT NULL DEFAULT 'ACTIVO',   -- ACTIVO | DESHABILITADO
  created_at      timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idn_memberships_estado_chk CHECK (estado IN ('ACTIVO','DESHABILITADO')),
  CONSTRAINT idn_memberships_uq UNIQUE (identity_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_idn_memberships_tenant ON deltaops.idn_memberships (tenant_id);
CREATE INDEX IF NOT EXISTS idx_idn_memberships_identity ON deltaops.idn_memberships (identity_id);

/* ============================ ROLES (RBAC como datos) ============================ */
CREATE TABLE IF NOT EXISTS deltaops.idn_roles (
  tenant_id     text NOT NULL,
  clave         text NOT NULL,   -- SUPER_ADMIN | TENANT_ADMIN | SUPERVISOR | PLANIFICADOR | TECNICO | CONSULTA
  nombre        text NOT NULL,
  descripcion   text,
  permisos      jsonb NOT NULL DEFAULT '[]'::jsonb, -- permisos Kernel adicionales explícitos (opcional)
  capacidades   jsonb NOT NULL DEFAULT '[]'::jsonb,
  es_sistema    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, clave)
);

/* ============================ INVITACIONES ============================ */
CREATE TABLE IF NOT EXISTS deltaops.idn_invitations (
  invitation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  email           text NOT NULL,
  rol             text NOT NULL DEFAULT 'CONSULTA',
  token_hash      text NOT NULL,                 -- SHA-256 del token (nunca en claro)
  estado          text NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | ACEPTADA | REVOCADA | EXPIRADA
  invitado_por    text NOT NULL,
  idempotency_key text,                          -- (tenant,email) activo idempotente
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idn_invitations_estado_chk CHECK (estado IN ('PENDIENTE','ACEPTADA','REVOCADA','EXPIRADA'))
);
CREATE INDEX IF NOT EXISTS idx_idn_invitations_tenant ON deltaops.idn_invitations (tenant_id);
-- Solo UNA invitación PENDIENTE por (tenant,email) → idempotencia de re-invitar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idn_invitations_pendiente
  ON deltaops.idn_invitations (tenant_id, lower(email))
  WHERE estado = 'PENDIENTE';

/* ============================ RECUPERACIÓN DE CONTRASEÑA ============================ */
CREATE TABLE IF NOT EXISTS deltaops.idn_password_resets (
  reset_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid NOT NULL REFERENCES deltaops.idn_identities(identity_id) ON DELETE CASCADE,
  tenant_id     text NOT NULL,                    -- tenant contextual del flujo (aislamiento)
  token_hash    text NOT NULL,                    -- SHA-256 del token (nunca en claro)
  estado        text NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | USADO | EXPIRADO
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idn_password_resets_estado_chk CHECK (estado IN ('PENDIENTE','USADO','EXPIRADO'))
);
CREATE INDEX IF NOT EXISTS idx_idn_password_resets_identity ON deltaops.idn_password_resets (identity_id);

/* ============================ CORREO — plantillas y cola ============================ */
CREATE TABLE IF NOT EXISTS deltaops.ntf_email_templates (
  clave         text PRIMARY KEY,     -- bienvenida | invitacion | recuperacion | cambio-password | ...
  idioma        text NOT NULL DEFAULT 'es',
  asunto        text NOT NULL,
  cuerpo        text NOT NULL,        -- plantilla con placeholders {{var}} (sin HTML de usuario)
  descripcion   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deltaops.ntf_email_outbox (
  email_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  idempotency_key text NOT NULL,       -- evita duplicados (UNIQUE por tenant)
  tipo            text NOT NULL,       -- clave de plantilla
  destinatario    text NOT NULL,
  idioma          text NOT NULL DEFAULT 'es',
  asunto          text NOT NULL,
  cuerpo          text NOT NULL,
  branding        jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado          text NOT NULL DEFAULT 'QUEUED', -- QUEUED | SENT | FAILED
  intentos        integer NOT NULL DEFAULT 0,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ntf_email_outbox_estado_chk CHECK (estado IN ('QUEUED','SENT','FAILED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ntf_email_idem
  ON deltaops.ntf_email_outbox (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ntf_email_estado ON deltaops.ntf_email_outbox (tenant_id, estado, created_at);

/* ============================ RLS por tenant (recursos propiedad del tenant) ============================ */
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ten_tenants','idn_roles','idn_invitations','idn_password_resets','ntf_email_outbox'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
  END LOOP;
END $$;

-- ten_tenants: la clave lógica del tenant es tenant_id.
CREATE POLICY ten_tenants_tenant_isolation ON deltaops.ten_tenants
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY idn_roles_tenant_isolation ON deltaops.idn_roles
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY idn_invitations_tenant_isolation ON deltaops.idn_invitations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY idn_password_resets_tenant_isolation ON deltaops.idn_password_resets
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY ntf_email_outbox_tenant_isolation ON deltaops.ntf_email_outbox
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
