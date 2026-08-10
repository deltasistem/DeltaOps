import bcrypt from "bcryptjs";
import { db, pool, deltaopsUsersTable } from "@workspace/db";

/**
 * DeltaOps · DGP-001 — Seed inicial.
 * Crea el usuario administrador de plataforma si no existe (idempotente).
 * Datos sintéticos de desarrollo — nunca datos reales.
 *
 * Ejecutar: pnpm --filter @workspace/scripts run seed:deltaops
 */
const ADMIN = {
  email: "admin@deltaops.dev",
  nombre: "Administrador de Plataforma",
  rol: "platform_admin",
};

/**
 * Default de DESARROLLO derivado (no secreto), misma política que
 * `seed-credentials.ts` de api-server: en producción es obligatorio proveer
 * `DELTAOPS_ADMIN_PASSWORD`; en desarrollo se usa un valor derivado del nombre
 * de la variable, sin literales de contraseña en el repositorio.
 */
function defaultDev(envKey: string): string {
  return `dev-${envKey.toLowerCase().replace(/_/g, "-")}-0001!`;
}

const MODULOS_TODOS = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
];

const ROLES_SISTEMA: Array<[string, string, string]> = [
  ["SUPER_ADMIN", "Super Administrador", "Administración global de la plataforma SaaS."],
  ["TENANT_ADMIN", "Administrador de Empresa", "Administración total dentro de su empresa."],
  ["SUPERVISOR", "Supervisor", "Gestión operativa completa."],
  ["PLANIFICADOR", "Planificador", "Planificación y gestión de trabajo."],
  ["TECNICO", "Técnico", "Ejecución operativa de trabajo asignado."],
  ["CONSULTA", "Consulta", "Acceso de solo lectura."],
];

/** Siembra idempotente del tenant principal `deltaops` y la identidad admin. */
async function seedEnterprisePrincipal(passwordHash: string): Promise<void> {
  const client = await pool.connect();
  const tenantId = "deltaops";
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(
      `INSERT INTO deltaops.ten_tenants
         (tenant_id, codigo, nombre_comercial, estado, zona_horaria, idioma, moneda, branding, modulos, activated_at)
       VALUES ($1,'DELTAOPS','DeltaOps','ACTIVO','America/Santiago','es','CLP',$2::jsonb,$3::jsonb, now())
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, JSON.stringify({ nombre: "DeltaOps", nombreApp: "DeltaOps" }), JSON.stringify(MODULOS_TODOS)],
    );
    for (const [clave, nombre, desc] of ROLES_SISTEMA) {
      await client.query(
        `INSERT INTO deltaops.idn_roles (tenant_id, clave, nombre, descripcion, es_sistema)
         VALUES ($1,$2,$3,$4,true) ON CONFLICT (tenant_id, clave) DO NOTHING`,
        [tenantId, clave, nombre, desc],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  // Identidad global + membresía SUPER_ADMIN (sin RLS: identidad global).
  const idClient = await pool.connect();
  try {
    const ex = await idClient.query<{ identity_id: string }>(
      `SELECT identity_id FROM deltaops.idn_identities WHERE lower(email)=lower($1)`,
      [ADMIN.email],
    );
    let identityId = ex.rows[0]?.identity_id;
    if (!identityId) {
      const ins = await idClient.query<{ identity_id: string }>(
        `INSERT INTO deltaops.idn_identities (email, nombre, password_hash, estado)
         VALUES ($1,$2,$3,'ACTIVO') RETURNING identity_id`,
        [ADMIN.email.toLowerCase(), ADMIN.nombre, passwordHash],
      );
      identityId = ins.rows[0]?.identity_id;
    }
    if (identityId) {
      await idClient.query(
        `INSERT INTO deltaops.idn_memberships (identity_id, tenant_id, rol, estado)
         VALUES ($1,$2,'SUPER_ADMIN','ACTIVO')
         ON CONFLICT (identity_id, tenant_id) DO UPDATE SET rol=EXCLUDED.rol, updated_at=now()`,
        [identityId, "deltaops"],
      );
    }
  } finally {
    idClient.release();
  }
}

async function main(): Promise<void> {
  // Guarda de producción: jamás sembrar credenciales conocidas en producción.
  // En producción es obligatorio proveer DELTAOPS_ADMIN_PASSWORD.
  const isProd = process.env.NODE_ENV === "production";
  const providedPassword = process.env.DELTAOPS_ADMIN_PASSWORD;
  if (isProd && !providedPassword) {
    throw new Error(
      "Seed en producción requiere DELTAOPS_ADMIN_PASSWORD (contraseña de arranque única). Abortado.",
    );
  }
  const password = providedPassword ?? defaultDev("DELTAOPS_ADMIN_PASSWORD");

  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await db
    .insert(deltaopsUsersTable)
    .values({
      email: ADMIN.email,
      nombre: ADMIN.nombre,
      rol: ADMIN.rol,
      passwordHash,
    })
    .onConflictDoNothing({ target: deltaopsUsersTable.email })
    .returning({ id: deltaopsUsersTable.id });

  if (inserted.length > 0) {
    console.log(`Usuario admin creado (id=${inserted[0]!.id}): ${ADMIN.email}`);
  } else {
    console.log(`Usuario admin ya existía: ${ADMIN.email}`);
  }

  // DGP-017: tenant principal `deltaops` de primera clase + roles + identidad
  // SUPER_ADMIN del administrador de plataforma (idempotente, aditivo). Se hace
  // por SQL directo bajo `app.tenant_id` para no acoplar scripts a api-server.
  await seedEnterprisePrincipal(passwordHash);
  console.log("Enterprise: tenant `deltaops` + identidad SUPER_ADMIN sembrados");

  await pool.end();
}

main().catch((err) => {
  console.error("Seed DeltaOps falló:", err);
  process.exit(1);
});
