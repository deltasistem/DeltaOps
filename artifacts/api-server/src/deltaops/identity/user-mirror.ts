/**
 * DeltaOps · DGP-017 — Proyección de sesión hacia `deltaops.users` (legacy).
 *
 * COMPATIBILIDAD: los middlewares de sesión de TODOS los módulos de negocio
 * (contratos congelados DGP-004+) leen `deltaops.users` por `deltaopsUserId`
 * para obtener `{ rol, tenant }` y derivar el Principal del módulo. Para que la
 * identidad Enterprise (idn_*) sea el sistema de registro SIN modificar esos
 * módulos, cada sesión activa PROYECTA su (identidad, tenant, rol efectivo) a
 * una fila de `deltaops.users`:
 *   - `rol`    = rol LEGACY derivado del rol canónico (admin/operador/lector).
 *   - `tenant` = tenant-context ACTIVO de la sesión.
 *
 * Así, un cambio de tenant o de rol reproyecta la fila y los módulos observan
 * SIEMPRE el contexto correcto (nunca el del tenant anterior).
 */
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import { aRolLegacy } from "./rbac";

export interface ProyeccionUsuario {
  userId: number;
  email: string;
  rolLegacy: "admin" | "operador" | "lector";
  tenant: string;
}

/**
 * Garantiza una fila `deltaops.users` que refleje el contexto de sesión activo.
 * Devuelve el id legacy que se guardará en la sesión (`deltaopsUserId`).
 */
export async function proyectarUsuario(input: {
  email: string;
  nombre: string;
  passwordHash: string;
  rolCanonico: string;
  tenant: string;
}): Promise<ProyeccionUsuario> {
  const email = input.email.toLowerCase();
  const rolLegacy = aRolLegacy(input.rolCanonico);

  const [existing] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.email, email));

  if (existing) {
    // Reproyecta rol/tenant/nombre (idempotente por sesión).
    if (existing.rol !== rolLegacy || existing.tenant !== input.tenant || existing.nombre !== input.nombre) {
      await db
        .update(deltaopsUsersTable)
        .set({ rol: rolLegacy, tenant: input.tenant, nombre: input.nombre })
        .where(eq(deltaopsUsersTable.id, existing.id));
    }
    return { userId: existing.id, email, rolLegacy, tenant: input.tenant };
  }

  const [inserted] = await db
    .insert(deltaopsUsersTable)
    .values({
      email,
      nombre: input.nombre,
      rol: rolLegacy,
      tenant: input.tenant,
      passwordHash: input.passwordHash,
    })
    .returning({ id: deltaopsUsersTable.id });

  return { userId: inserted.id, email, rolLegacy, tenant: input.tenant };
}
