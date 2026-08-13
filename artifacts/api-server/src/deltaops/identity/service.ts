/**
 * DeltaOps · DGP-017 — Servicio de Identidad, Tenancy y Membresías.
 *
 * Capa de acceso a datos y reglas de negocio de identidad. La identidad es
 * GLOBAL (email único global); las membresías vinculan identidad↔tenant con rol
 * y estado. Los recursos propiedad del tenant (tenant, invitaciones, resets) se
 * consultan bajo `withTenant` (RLS). La identidad/membresía se consultan bajo
 * `withGlobal` filtrando explícitamente por identity_id/tenant_id (aislamiento
 * en capa de aplicación, justificado en la migración 0033).
 */
import { withGlobal, withTenant } from "./db-helpers";

/* --------------------------------- Tipos ---------------------------------- */

export interface Tenant {
  tenantId: string;
  codigo: string;
  nombreComercial: string;
  razonSocial: string | null;
  idTributaria: string | null;
  estado: "ACTIVO" | "SUSPENDIDO" | "INACTIVO";
  zonaHoraria: string;
  idioma: string;
  moneda: string;
  configuracion: Record<string, unknown>;
  branding: Record<string, unknown>;
  modulos: string[];
  createdAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
}

export interface Identity {
  identityId: string;
  email: string;
  nombre: string;
  estado: "ACTIVO" | "DESHABILITADO" | "PENDIENTE";
  authEpoch: number;
  ultimoAcceso: string | null;
}

export interface Membership {
  membershipId: string;
  identityId: string;
  tenantId: string;
  rol: string;
  estado: "ACTIVO" | "DESHABILITADO";
  ultimoAcceso: string | null;
}

function mapTenant(row: Record<string, any>): Tenant {
  return {
    tenantId: row.tenant_id,
    codigo: row.codigo,
    nombreComercial: row.nombre_comercial,
    razonSocial: row.razon_social,
    idTributaria: row.id_tributaria,
    estado: row.estado,
    zonaHoraria: row.zona_horaria,
    idioma: row.idioma,
    moneda: row.moneda,
    configuracion: row.configuracion ?? {},
    branding: row.branding ?? {},
    modulos: Array.isArray(row.modulos) ? row.modulos : [],
    createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    activatedAt: row.activated_at ? (row.activated_at.toISOString?.() ?? String(row.activated_at)) : null,
    suspendedAt: row.suspended_at ? (row.suspended_at.toISOString?.() ?? String(row.suspended_at)) : null,
  };
}

function mapIdentity(row: Record<string, any>): Identity {
  return {
    identityId: row.identity_id,
    email: row.email,
    nombre: row.nombre,
    estado: row.estado,
    authEpoch: typeof row.auth_epoch === "number" ? row.auth_epoch : Number(row.auth_epoch ?? 0),
    ultimoAcceso: row.ultimo_acceso ? (row.ultimo_acceso.toISOString?.() ?? String(row.ultimo_acceso)) : null,
  };
}

function mapMembership(row: Record<string, any>): Membership {
  return {
    membershipId: row.membership_id,
    identityId: row.identity_id,
    tenantId: row.tenant_id,
    rol: row.rol,
    estado: row.estado,
    ultimoAcceso: row.ultimo_acceso ? (row.ultimo_acceso.toISOString?.() ?? String(row.ultimo_acceso)) : null,
  };
}

/* --------------------------------- Tenants -------------------------------- */

export async function obtenerTenant(tenantId: string): Promise<Tenant | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.ten_tenants WHERE tenant_id=$1`,
      [tenantId],
    );
    return r.rows[0] ? mapTenant(r.rows[0]) : null;
  });
}

/**
 * Lista global de tenants (SOLO SUPER_ADMIN — autorización en la capa HTTP con
 * `requireSuperAdmin`). DGP-023.5 (N-1): NO depende ya del BYPASS de superusuario.
 *
 * `ten_tenants` tiene RLS, por lo que el rol runtime `deltaops_app` (no-owner,
 * no-bypass) vería 0 filas con un `SELECT` directo bajo `withGlobal`. El acceso
 * cross-tenant se obtiene mediante la función SECURITY DEFINER acotada
 * `deltaops.tenants_para_super_admin()` (owner `deltaops_owner`, search_path fijo,
 * sin parámetros, solo SELECT), que el guard SUPER_ADMIN ya autorizó. La función
 * NUNCA acepta tenantId del cliente para elevar acceso.
 */
export async function listarTenants(): Promise<Tenant[]> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.tenants_para_super_admin()`,
    );
    return r.rows.map(mapTenant);
  });
}

export interface CrearTenantInput {
  tenantId: string;
  codigo: string;
  nombreComercial: string;
  razonSocial?: string | null;
  idTributaria?: string | null;
  zonaHoraria?: string;
  idioma?: string;
  moneda?: string;
  modulos?: string[];
  branding?: Record<string, unknown>;
  configuracion?: Record<string, unknown>;
}

export async function crearTenant(input: CrearTenantInput): Promise<Tenant> {
  return withTenant(input.tenantId, async (client) => {
    const r = await client.query(
      `INSERT INTO deltaops.ten_tenants
         (tenant_id, codigo, nombre_comercial, razon_social, id_tributaria,
          estado, zona_horaria, idioma, moneda, configuracion, branding, modulos, activated_at)
       VALUES ($1,$2,$3,$4,$5,'ACTIVO',$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         codigo=EXCLUDED.codigo,
         nombre_comercial=EXCLUDED.nombre_comercial,
         razon_social=EXCLUDED.razon_social,
         id_tributaria=EXCLUDED.id_tributaria,
         updated_at=now()
       RETURNING *`,
      [
        input.tenantId,
        input.codigo,
        input.nombreComercial,
        input.razonSocial ?? null,
        input.idTributaria ?? null,
        input.zonaHoraria ?? "America/Santiago",
        input.idioma ?? "es",
        input.moneda ?? "CLP",
        JSON.stringify(input.configuracion ?? {}),
        JSON.stringify(input.branding ?? {}),
        JSON.stringify(input.modulos ?? []),
      ],
    );
    return mapTenant(r.rows[0]);
  });
}

export async function cambiarEstadoTenant(
  tenantId: string,
  estado: "ACTIVO" | "SUSPENDIDO" | "INACTIVO",
): Promise<Tenant | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.ten_tenants
         SET estado=$2,
             activated_at = CASE WHEN $2='ACTIVO' THEN now() ELSE activated_at END,
             suspended_at = CASE WHEN $2='SUSPENDIDO' THEN now() ELSE suspended_at END,
             updated_at=now()
       WHERE tenant_id=$1 RETURNING *`,
      [tenantId, estado],
    );
    return r.rows[0] ? mapTenant(r.rows[0]) : null;
  });
}

export async function actualizarConfiguracion(
  tenantId: string,
  parche: Record<string, unknown>,
): Promise<Tenant | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.ten_tenants
         SET configuracion = configuracion || $2::jsonb, updated_at=now()
       WHERE tenant_id=$1 RETURNING *`,
      [tenantId, JSON.stringify(parche)],
    );
    return r.rows[0] ? mapTenant(r.rows[0]) : null;
  });
}

export async function actualizarBranding(
  tenantId: string,
  branding: Record<string, unknown>,
): Promise<Tenant | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.ten_tenants
         SET branding = branding || $2::jsonb, updated_at=now()
       WHERE tenant_id=$1 RETURNING *`,
      [tenantId, JSON.stringify(branding)],
    );
    return r.rows[0] ? mapTenant(r.rows[0]) : null;
  });
}

export async function actualizarModulos(
  tenantId: string,
  modulos: string[],
): Promise<Tenant | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.ten_tenants SET modulos=$2::jsonb, updated_at=now()
       WHERE tenant_id=$1 RETURNING *`,
      [tenantId, JSON.stringify(modulos)],
    );
    return r.rows[0] ? mapTenant(r.rows[0]) : null;
  });
}

/* ------------------------------- Identidades ------------------------------ */

export async function obtenerIdentidadPorEmail(email: string): Promise<
  | (Identity & { passwordHash: string })
  | null
> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_identities WHERE lower(email)=lower($1)`,
      [email],
    );
    if (!r.rows[0]) return null;
    return { ...mapIdentity(r.rows[0]), passwordHash: r.rows[0].password_hash };
  });
}

export async function obtenerIdentidad(identityId: string): Promise<Identity | null> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_identities WHERE identity_id=$1`,
      [identityId],
    );
    return r.rows[0] ? mapIdentity(r.rows[0]) : null;
  });
}

export async function crearIdentidad(input: {
  email: string;
  nombre: string;
  passwordHash: string;
  estado?: "ACTIVO" | "PENDIENTE" | "DESHABILITADO";
}): Promise<Identity> {
  return withGlobal(async (client) => {
    // El índice único es funcional sobre lower(email); no hay arbiter para
    // ON CONFLICT, así que se consulta primero (idempotencia por email).
    const existing = await client.query(
      `SELECT * FROM deltaops.idn_identities WHERE lower(email)=lower($1)`,
      [input.email],
    );
    if (existing.rows[0]) {
      const upd = await client.query(
        `UPDATE deltaops.idn_identities SET nombre=$2, updated_at=now()
         WHERE identity_id=$1 RETURNING *`,
        [existing.rows[0].identity_id, input.nombre],
      );
      return mapIdentity(upd.rows[0]);
    }
    const r = await client.query(
      `INSERT INTO deltaops.idn_identities (email, nombre, password_hash, estado)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.email.toLowerCase(), input.nombre, input.passwordHash, input.estado ?? "ACTIVO"],
    );
    return mapIdentity(r.rows[0]);
  });
}

export async function actualizarPassword(
  identityId: string,
  passwordHash: string,
): Promise<void> {
  await withGlobal(async (client) => {
    await client.query(
      `UPDATE deltaops.idn_identities SET password_hash=$2, estado='ACTIVO', updated_at=now()
       WHERE identity_id=$1`,
      [identityId, passwordHash],
    );
  });
}

export async function cambiarEstadoIdentidad(
  identityId: string,
  estado: "ACTIVO" | "DESHABILITADO",
): Promise<void> {
  await withGlobal(async (client) => {
    await client.query(
      `UPDATE deltaops.idn_identities SET estado=$2, updated_at=now() WHERE identity_id=$1`,
      [identityId, estado],
    );
  });
}

export async function registrarAcceso(identityId: string, tenantId: string): Promise<void> {
  await withGlobal(async (client) => {
    await client.query(
      `UPDATE deltaops.idn_identities SET ultimo_acceso=now() WHERE identity_id=$1`,
      [identityId],
    );
    await client.query(
      `UPDATE deltaops.idn_memberships SET ultimo_acceso=now()
       WHERE identity_id=$1 AND tenant_id=$2`,
      [identityId, tenantId],
    );
  });
}

/**
 * Incrementa atómicamente el epoch de autorización de la identidad y devuelve el
 * NUEVO valor. Se invoca en cada login y cambio de tenant; la sesión guarda este
 * valor en `authVersion` y el middleware exige que coincida con el vigente.
 */
export async function incrementarAuthEpoch(identityId: string): Promise<number> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_identities
         SET auth_epoch = auth_epoch + 1, updated_at = now()
       WHERE identity_id = $1
       RETURNING auth_epoch`,
      [identityId],
    );
    return Number(r.rows[0]?.auth_epoch ?? 0);
  });
}

/** Devuelve el epoch de autorización vigente de la identidad (o null si no existe). */
export async function authEpochDe(identityId: string): Promise<number | null> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT auth_epoch FROM deltaops.idn_identities WHERE identity_id = $1`,
      [identityId],
    );
    if (!r.rows[0]) return null;
    return Number(r.rows[0].auth_epoch ?? 0);
  });
}

/* ------------------------------- Membresías ------------------------------- */

export async function membresiasDe(identityId: string): Promise<Membership[]> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_memberships WHERE identity_id=$1 AND estado='ACTIVO'`,
      [identityId],
    );
    return r.rows.map(mapMembership);
  });
}

export async function membresia(
  identityId: string,
  tenantId: string,
): Promise<Membership | null> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_memberships WHERE identity_id=$1 AND tenant_id=$2`,
      [identityId, tenantId],
    );
    return r.rows[0] ? mapMembership(r.rows[0]) : null;
  });
}

export async function crearMembresia(input: {
  identityId: string;
  tenantId: string;
  rol: string;
}): Promise<Membership> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `INSERT INTO deltaops.idn_memberships (identity_id, tenant_id, rol, estado)
       VALUES ($1,$2,$3,'ACTIVO')
       ON CONFLICT (identity_id, tenant_id) DO UPDATE SET rol=EXCLUDED.rol, updated_at=now()
       RETURNING *`,
      [input.identityId, input.tenantId, input.rol],
    );
    return mapMembership(r.rows[0]);
  });
}

export async function cambiarRolMembresia(
  identityId: string,
  tenantId: string,
  rol: string,
): Promise<Membership | null> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_memberships SET rol=$3, updated_at=now()
       WHERE identity_id=$1 AND tenant_id=$2 RETURNING *`,
      [identityId, tenantId, rol],
    );
    return r.rows[0] ? mapMembership(r.rows[0]) : null;
  });
}

export async function cambiarEstadoMembresia(
  identityId: string,
  tenantId: string,
  estado: "ACTIVO" | "DESHABILITADO",
): Promise<Membership | null> {
  return withGlobal(async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_memberships SET estado=$3, updated_at=now()
       WHERE identity_id=$1 AND tenant_id=$2 RETURNING *`,
      [identityId, tenantId, estado],
    );
    return r.rows[0] ? mapMembership(r.rows[0]) : null;
  });
}

/** Usuarios (identidad + membresía) de un tenant, con búsqueda opcional. */
export async function listarUsuariosDeTenant(
  tenantId: string,
  filtro?: { q?: string; estado?: string },
): Promise<
  Array<Identity & { rol: string; estadoMembresia: string; membershipId: string }>
> {
  return withGlobal(async (client) => {
    const params: unknown[] = [tenantId];
    let sql = `SELECT i.*, m.rol AS m_rol, m.estado AS m_estado, m.membership_id, m.ultimo_acceso AS m_acceso
               FROM deltaops.idn_memberships m
               JOIN deltaops.idn_identities i ON i.identity_id = m.identity_id
               WHERE m.tenant_id = $1`;
    if (filtro?.q) {
      params.push(`%${filtro.q.toLowerCase()}%`);
      sql += ` AND (lower(i.email) LIKE $${params.length} OR lower(i.nombre) LIKE $${params.length})`;
    }
    if (filtro?.estado) {
      params.push(filtro.estado);
      sql += ` AND m.estado = $${params.length}`;
    }
    sql += ` ORDER BY i.nombre`;
    const r = await client.query(sql, params);
    return r.rows.map((row: Record<string, any>) => ({
      ...mapIdentity(row),
      rol: row.m_rol,
      estadoMembresia: row.m_estado,
      membershipId: row.membership_id,
      ultimoAcceso: row.m_acceso ? (row.m_acceso.toISOString?.() ?? String(row.m_acceso)) : null,
    }));
  });
}
