/**
 * DeltaOps · DGP-017 — Proyección de sesión hacia `deltaops.users` (legacy).
 *
 * COMPATIBILIDAD: los middlewares de sesión de TODOS los módulos de negocio
 * (contratos congelados DGP-004+) leen `deltaops.users` por `deltaopsUserId`
 * para obtener `{ rol, tenant }` y derivar el Principal del módulo.
 *
 * AISLAMIENTO POR SESIÓN (corrección crítica DGP-017 ronda 1): NO se proyecta a
 * una única fila mutable por email (eso permitía que una sesión de la identidad
 * en el tenant B mutara el contexto observado por otra sesión de la MISMA
 * identidad en el tenant A). En su lugar, se proyecta una fila DEDICADA e
 * INMUTABLE por par (identidad, tenant), direccionada con un email sintético
 * determinista. El id de ESA fila se fija en la sesión (`deltaopsUserId`), de
 * modo que dos sesiones concurrentes de la misma identidad en tenants distintos
 * apuntan a filas distintas y JAMÁS se contaminan entre sí. La fila refleja el
 * rol legacy del rol canónico de la membresía en ese tenant.
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
 * Email sintético determinista de la fila espejo por (identidad, tenant). No es
 * un correo real ni sirve para autenticación (el login es por identidad global);
 * solo satisface la restricción UNIQUE(email) de la tabla congelada.
 */
export function emailEspejo(identityId: string, tenant: string): string {
  return `mirror.${identityId}.${tenant}@deltaops.internal`;
}

/**
 * Garantiza la fila `deltaops.users` DEDICADA al par (identidad, tenant) del
 * contexto de sesión, y devuelve su id (a fijar en `deltaopsUserId`). La fila es
 * estable: su `rol`/`tenant` corresponden a esa membresía y no los altera otra
 * sesión (otra sesión usa su propia fila).
 */
export async function proyectarUsuario(input: {
  identityId: string;
  email: string;
  nombre: string;
  passwordHash: string;
  rolCanonico: string;
  tenant: string;
}): Promise<ProyeccionUsuario> {
  const rolLegacy = aRolLegacy(input.rolCanonico);
  const emailSintetico = emailEspejo(input.identityId, input.tenant);

  const [existing] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.email, emailSintetico));

  if (existing) {
    // Reafirma rol/nombre por si cambió el rol de la membresía en ESTE tenant.
    if (existing.rol !== rolLegacy || existing.tenant !== input.tenant || existing.nombre !== input.nombre) {
      await db
        .update(deltaopsUsersTable)
        .set({ rol: rolLegacy, tenant: input.tenant, nombre: input.nombre })
        .where(eq(deltaopsUsersTable.id, existing.id));
    }
    return { userId: existing.id, email: emailSintetico, rolLegacy, tenant: input.tenant };
  }

  const [inserted] = await db
    .insert(deltaopsUsersTable)
    .values({
      email: emailSintetico,
      nombre: input.nombre,
      rol: rolLegacy,
      tenant: input.tenant,
      passwordHash: input.passwordHash,
    })
    .returning({ id: deltaopsUsersTable.id });

  return { userId: inserted.id, email: emailSintetico, rolLegacy, tenant: input.tenant };
}
