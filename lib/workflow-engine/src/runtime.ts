/**
 * DGP-007 · Workflow Engine — Composición de runtime (Fake u PostgreSQL).
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el motor de workflow como
 * servicio extra. Selecciona adaptadores PostgreSQL o Fake (offline) según haya
 * `pool`, igual que `lib/module-reference`.
 */
import type { Pool } from "pg";
import type { ExecutionContext } from "@workspace/kernel";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import { crearMotorWorkflow, type OpcionesMotorWorkflow } from "./modulo";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface WorkflowRuntime {
  readonly platform: PlatformRuntime;
  readonly servicio: string;
  /**
   * Sincroniza una cola de operaciones offline (una UoW por operación,
   * idempotencia durable tenant-scoped). Orquestación, NO comando anidado.
   */
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

/**
 * Crea un runtime con el motor de workflow montado. `opcionesMotor` describe el
 * servicio (permisos por defecto derivados del slug).
 */
export function createWorkflowRuntime(
  opcionesMotor: OpcionesMotorWorkflow,
  options: Omit<PlatformRuntimeOptions, "extraServices"> & { pool?: Pool } = {},
): WorkflowRuntime {
  const platform = createPlatformRuntime({
    ...options,
    extraServices: [crearMotorWorkflow(opcionesMotor)],
  });
  return {
    platform,
    servicio: opcionesMotor.servicio,
    sincronizar: (ctx, operaciones) => procesarCola(platform, ctx, operaciones),
  };
}
