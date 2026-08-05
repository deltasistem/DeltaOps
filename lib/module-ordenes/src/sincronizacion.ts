/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — Sincronización offline por ORQUESTACIÓN.
 *
 * `procesarCola` NO es un comando del Kernel que envuelva a otros (eso anidaría
 * UoWs): es una función de orquestación que ejecuta cada operación offline con
 * su PROPIA UoW (una por comando). La idempotencia Offline First se garantiza a
 * nivel de comando por `opId` (recibos durables `ReciboPort`, sellados en la
 * misma UoW del comando). Reintentar la cola es seguro: los comandos ya
 * aplicados devuelven `{ idempotente: true }` desde su recibo.
 *
 * El outbox se drena UNA vez tras procesar la cola (patrón /sync de DGP-006).
 */
import { z } from "zod";
import type { ExecutionContext } from "@workspace/kernel";
import { tenantOf, type PlatformRuntime } from "@workspace/platform";
import { MODULO } from "./module-name";
import type { ModuleAdapters } from "./module";

export type EstadoSync = "aplicada" | "idempotente" | "conflicto" | "rechazada" | "reintentable";

export interface OperacionSync {
  readonly opId: string;
  readonly comando: string;
  readonly input: Record<string, unknown>;
}

export const OperacionSyncSchema = z.object({
  opId: z.string().min(1),
  comando: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});
export const ColaSyncSchema = z.array(OperacionSyncSchema).min(1).max(100);

export interface ResultadoSync {
  readonly opId: string;
  readonly comando: string;
  readonly estado: EstadoSync;
  readonly resultado?: unknown;
  readonly actual?: unknown;
  readonly error?: string;
}

export interface ResumenSync {
  readonly total: number;
  readonly aplicadas: number;
  readonly idempotentes: number;
  readonly conflictos: number;
  readonly reintentables: number;
  readonly rechazadas: number;
  readonly resultados: readonly ResultadoSync[];
}

/** Comandos que exigen `id` de cliente (creación offline). */
const COMANDOS_CREACION = new Set(["crear"]);

function sufijo(comando: string): string {
  return comando.split(".").pop() ?? "";
}

/** Normaliza el nombre al namespace del módulo si viene abreviado. */
function nombreComando(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando : `${MODULO}.${sufijo(comando)}`;
}

async function estadoActual(
  runtime: PlatformRuntime,
  ctx: ExecutionContext,
  input: Record<string, unknown>,
): Promise<unknown> {
  const id = typeof input["id"] === "string" ? input["id"] : null;
  if (!id) return null;
  const r = await runtime.kernel.queries.execute(ctx, `${MODULO}.detalle`, { id });
  return r.ok ? r.value : null;
}

export async function procesarCola(
  runtime: PlatformRuntime,
  _adapters: ModuleAdapters,
  ctx: ExecutionContext,
  operaciones: readonly OperacionSync[],
): Promise<ResumenSync> {
  const resultados: ResultadoSync[] = [];
  const tenant = tenantOf(ctx);
  if (!tenant.ok) {
    for (const op of operaciones) {
      resultados.push({ opId: op.opId, comando: nombreComando(op.comando), estado: "rechazada", error: tenant.error.message });
    }
    return resumir(resultados);
  }

  for (const op of operaciones) {
    const comando = nombreComando(op.comando);

    if (COMANDOS_CREACION.has(sufijo(comando)) && !op.input["id"]) {
      resultados.push({
        opId: op.opId,
        comando,
        estado: "rechazada",
        error: "La operación de creación exige un id de cliente (Offline First).",
      });
      continue;
    }

    // Ejecuta el comando (su PROPIA UoW; nunca anidada). El `opId` propaga la
    // idempotencia durable a nivel de comando (recibos).
    const r = await runtime.kernel.commands.execute(ctx, comando, { ...op.input, opId: op.opId });
    if (r.ok) {
      const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
      resultados.push({ opId: op.opId, comando, estado: idempotente ? "idempotente" : "aplicada", resultado: r.value });
      continue;
    }
    if (r.error.code === "KRN-CFL-001") {
      const actual = await estadoActual(runtime, ctx, op.input);
      resultados.push({ opId: op.opId, comando, estado: "conflicto", actual, error: r.error.message });
      continue;
    }
    if (r.error.code === "KRN-INF-001") {
      resultados.push({ opId: op.opId, comando, estado: "reintentable", error: r.error.message });
      continue;
    }
    resultados.push({ opId: op.opId, comando, estado: "rechazada", error: r.error.message });
  }

  await runtime.kernel.outboxProcessor.processPending();
  return resumir(resultados);
}

function resumir(resultados: ResultadoSync[]): ResumenSync {
  return {
    total: resultados.length,
    aplicadas: resultados.filter((x) => x.estado === "aplicada").length,
    idempotentes: resultados.filter((x) => x.estado === "idempotente").length,
    conflictos: resultados.filter((x) => x.estado === "conflicto").length,
    reintentables: resultados.filter((x) => x.estado === "reintentable").length,
    rechazadas: resultados.filter((x) => x.estado === "rechazada").length,
    resultados,
  };
}
