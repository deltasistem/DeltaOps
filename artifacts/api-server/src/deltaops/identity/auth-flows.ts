/**
 * DeltaOps · DGP-017 — Orquestación de autenticación Enterprise.
 *
 * Resuelve login por email+contraseña contra la IDENTIDAD GLOBAL. Compatibilidad
 * TOTAL con los logins existentes: si el email no existe aún como identidad pero
 * sí en `deltaops.users` (usuarios históricos), se PROMUEVE automáticamente a
 * identidad + membresía (rol y tenant tomados de la fila legacy), preservando el
 * hash bcrypt existente. Así `admin@deltaops.dev` / `admin@delta.demo` siguen
 * funcionando y quedan modelados como identidades Enterprise.
 */
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import { verifyPassword } from "./crypto";
import { aRolCanonico, type RolCanonico } from "./rbac";
import {
  crearIdentidad,
  crearMembresia,
  membresia,
  membresiasDe,
  obtenerIdentidadPorEmail,
  obtenerTenant,
  registrarAcceso,
  type Membership,
} from "./service";
import { proyectarUsuario } from "./user-mirror";

export type LoginResultado =
  | { ok: false; motivo: "credenciales" }
  | { ok: false; motivo: "usuario-deshabilitado" }
  | { ok: false; motivo: "sin-membresias" }
  | { ok: false; motivo: "tenant-no-operativo"; estado: string }
  | { ok: false; motivo: "seleccion-tenant"; membresias: Array<{ tenantId: string; nombre: string; rol: string }> }
  | {
      ok: true;
      identityId: string;
      email: string;
      nombre: string;
      passwordHash: string;
      tenantId: string;
      rolCanonico: RolCanonico;
    };

/**
 * Promueve un usuario legacy (`deltaops.users`) a identidad+membresía si aún no
 * existe como identidad. Idempotente. Devuelve identityId o null si no hay
 * usuario legacy con ese email.
 */
async function promoverLegacy(email: string): Promise<string | null> {
  const [legacy] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.email, email.toLowerCase()));
  if (!legacy) return null;

  const identidad = await crearIdentidad({
    email: legacy.email,
    nombre: legacy.nombre,
    passwordHash: legacy.passwordHash,
    estado: "ACTIVO",
  });
  await crearMembresia({
    identityId: identidad.identityId,
    tenantId: legacy.tenant,
    rol: aRolCanonico(legacy.rol),
  });
  return identidad.identityId;
}

/**
 * Login por email+contraseña. Si `tenantId` no se indica y hay múltiples
 * membresías, devuelve `seleccion-tenant`. Valida estado de usuario y tenant.
 */
export async function loginConCredenciales(
  email: string,
  password: string,
  tenantId?: string,
): Promise<LoginResultado> {
  let identidad = await obtenerIdentidadPorEmail(email);

  // Compatibilidad: promover usuario legacy si aún no es identidad.
  if (!identidad) {
    const promovido = await promoverLegacy(email);
    if (promovido) identidad = await obtenerIdentidadPorEmail(email);
  }

  if (!identidad) return { ok: false, motivo: "credenciales" };

  const passwordOk = await verifyPassword(password, identidad.passwordHash);
  if (!passwordOk) return { ok: false, motivo: "credenciales" };

  if (identidad.estado === "DESHABILITADO") {
    return { ok: false, motivo: "usuario-deshabilitado" };
  }

  const membresias = await membresiasDe(identidad.identityId);
  if (membresias.length === 0) return { ok: false, motivo: "sin-membresias" };

  // Selección de tenant.
  let elegido: Membership | undefined;
  if (tenantId) {
    elegido = membresias.find((m) => m.tenantId === tenantId);
    if (!elegido) return { ok: false, motivo: "credenciales" };
  } else if (membresias.length === 1) {
    elegido = membresias[0];
  } else {
    // Varias membresías: requiere selección explícita.
    const detalle = await Promise.all(
      membresias.map(async (m) => {
        const t = await obtenerTenant(m.tenantId);
        return { tenantId: m.tenantId, nombre: t?.nombreComercial ?? m.tenantId, rol: m.rol };
      }),
    );
    return { ok: false, motivo: "seleccion-tenant", membresias: detalle };
  }

  const tenant = await obtenerTenant(elegido.tenantId);
  if (!tenant || tenant.estado !== "ACTIVO") {
    return { ok: false, motivo: "tenant-no-operativo", estado: tenant?.estado ?? "INACTIVO" };
  }

  await registrarAcceso(identidad.identityId, elegido.tenantId);

  return {
    ok: true,
    identityId: identidad.identityId,
    email: identidad.email,
    nombre: identidad.nombre,
    passwordHash: identidad.passwordHash,
    tenantId: elegido.tenantId,
    rolCanonico: aRolCanonico(elegido.rol),
  };
}

/**
 * Prepara el cambio de tenant: valida membresía activa y tenant operativo.
 * Devuelve los datos para renovar el contexto de sesión (authVersion nueva).
 */
export async function prepararCambioTenant(
  identityId: string,
  tenantId: string,
): Promise<
  | { ok: false; motivo: "sin-membresia" | "tenant-no-operativo"; estado?: string }
  | { ok: true; rolCanonico: RolCanonico; tenantId: string }
> {
  const mem = await membresia(identityId, tenantId);
  if (!mem || mem.estado !== "ACTIVO") return { ok: false, motivo: "sin-membresia" };
  const tenant = await obtenerTenant(tenantId);
  if (!tenant || tenant.estado !== "ACTIVO") {
    return { ok: false, motivo: "tenant-no-operativo", estado: tenant?.estado };
  }
  await registrarAcceso(identityId, tenantId);
  return { ok: true, rolCanonico: aRolCanonico(mem.rol), tenantId };
}

/** Reproyecta la fila legacy `deltaops.users` para el contexto de sesión. */
export async function proyectarSesion(input: {
  email: string;
  nombre: string;
  passwordHash: string;
  rolCanonico: string;
  tenant: string;
}): Promise<number> {
  const p = await proyectarUsuario(input);
  return p.userId;
}
