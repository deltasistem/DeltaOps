/**
 * DGP-004 · Runtime compartido de DeltaOps en el API Server.
 * Singleton Kernel + Plataforma + Reference Module con adaptadores
 * PostgreSQL reales. Lo consumen la Consola de Plataforma y el módulo.
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  createReferenceRuntime,
  referenceModule,
  type ReferenceRuntime,
} from "@workspace/module-reference";

/** Tenant principal de la instancia DeltaOps (defecto de los usuarios). */
export const DELTAOPS_TENANT = "deltaops";

/**
 * Tenant DEMO oficial del programa (DGP-011.3). Permanente, aislado por RLS del
 * tenant principal `deltaops`. El usuario administrador demo (`admin@delta.demo`)
 * pertenece ÚNICAMENTE a este tenant (columna `tenant` en `deltaops.users`).
 */
export const DELTA_DEMO_TENANT = "delta-demo";

let runtime: ReferenceRuntime | null = null;

export function deltaopsRuntime(): ReferenceRuntime {
  if (!runtime) {
    runtime = createReferenceRuntime({ pool });
  }
  return runtime;
}

const PLATFORM_PERMISSIONS = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
];
const MODULE_PERMISSIONS = [
  ...referenceModule({ repository: null as never, readModel: null as never }).permissions,
];

/** Mapa rol → permisos (admin: todo; operador: sin admin; lector: lectura). */
export function principalFor(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["gestionar-elementos-referencia", "consultar-elementos-referencia"],
    };
  }
  if (rol === "operador") {
    // Mínimo privilegio: SOLO permisos del módulo (sin admin) más los
    // permisos de plataforma estrictamente necesarios para su UX.
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.referencia.admin"),
        "platform.comment.read", "platform.comment.write",
        "platform.attachment.read", "platform.attachment.write",
        "platform.timeline.read", "platform.search.read",
        "platform.config.read", "platform.ai.infer",
      ],
      capacidades: ["gestionar-elementos-referencia"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.referencia.read", "platform.search.read", "platform.timeline.read",
      "platform.comment.read", "platform.attachment.read", "platform.config.read"],
    capacidades: ["consultar-elementos-referencia"],
  };
}

export function contextFor(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalFor(userId, rol),
    metadata: { tenantId: tenant },
  });
}
