/**
 * DGP-011.2 · Runtime del Módulo Enterprise Inventory en el API Server.
 * Singleton Kernel + Plataforma + Workflow Engine + Módulo Inventario con
 * adaptadores PostgreSQL reales. Mismo patrón que ordenes-runtime (DGP-009.2).
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  inventarioModule,
  crearInventarioRuntimeOperacional,
  type InventarioRuntimeOperacional,
  type ModuleAdapters,
} from "@workspace/module-inventario";
import { DELTAOPS_TENANT } from "./reference-runtime";

let runtime: InventarioRuntimeOperacional | null = null;

export function inventarioRuntime(): InventarioRuntimeOperacional {
  if (!runtime) runtime = crearInventarioRuntimeOperacional({ pool });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...inventarioModule({
    items: null as never,
    inventario: null as never,
    bodegas: null as never,
    lotesSeries: null as never,
    reservas: null as never,
    transferencias: null as never,
    ajustes: null as never,
    conteos: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    readModel: null as never,
    eventLog: null as never,
    syncReceipts: null as never,
    consola: null as never,
  } as ModuleAdapters).permissions,
];

/** Mapa rol → permisos (admin: todo; operador: sin admin; lector: lectura). */
export function principalInventario(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: [
        "gestionar-items", "operar-inventario", "reservar-inventario",
        "transferir-inventario", "contar-inventario", "ajustar-inventario",
        "administrar-inventario",
      ],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.inventario.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: [
        "gestionar-items", "operar-inventario", "reservar-inventario",
        "transferir-inventario", "contar-inventario", "ajustar-inventario",
      ],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.inventario.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForInventario(userId: string, rol: string): ExecutionContext {
  return createExecutionContext({
    principal: principalInventario(userId, rol),
    metadata: { tenantId: DELTAOPS_TENANT },
  });
}
