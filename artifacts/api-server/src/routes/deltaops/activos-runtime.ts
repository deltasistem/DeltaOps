/**
 * DGP-008.1 · Runtime del Módulo Activos en el API Server.
 * Singleton Kernel + Plataforma + Módulo Activos con adaptadores PostgreSQL
 * reales. Mismo patrón que reference-runtime (DGP-004).
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { activosModule, crearActivosRuntime, type ActivosRuntime } from "@workspace/module-activos";
import { DELTAOPS_TENANT } from "./reference-runtime";

let runtime: ActivosRuntime | null = null;

export function activosRuntime(): ActivosRuntime {
  if (!runtime) runtime = crearActivosRuntime({ pool });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...activosModule({ repository: null as never, readModel: null as never }).permissions,
];

/** Mapa rol → permisos (admin: todo; operador: sin admin; lector: lectura). */
export function principalActivos(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["gestionar-activos", "consultar-activos", "administrar-activos"],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.activos.admin"),
        "platform.comment.read", "platform.comment.write",
        "platform.attachment.read", "platform.attachment.write",
        "platform.timeline.read", "platform.search.read", "platform.config.read",
      ],
      capacidades: ["gestionar-activos", "consultar-activos"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: [
      "modulo.activos.read", "platform.search.read", "platform.timeline.read",
      "platform.comment.read", "platform.attachment.read", "platform.config.read",
    ],
    capacidades: ["consultar-activos"],
  };
}

export function contextForActivos(userId: string, rol: string): ExecutionContext {
  return createExecutionContext({
    principal: principalActivos(userId, rol),
    metadata: { tenantId: DELTAOPS_TENANT },
  });
}
