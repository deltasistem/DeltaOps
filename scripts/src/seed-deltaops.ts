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
  password: "deltaops-dev-2026",
};

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
  const password = providedPassword ?? ADMIN.password;

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
  await pool.end();
}

main().catch((err) => {
  console.error("Seed DeltaOps falló:", err);
  process.exit(1);
});
