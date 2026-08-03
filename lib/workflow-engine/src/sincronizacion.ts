/**
 * DGP-007 · Workflow Engine — Offline + Synchronization Runtime.
 *
 * Orquestación de una cola de operaciones offline `{opId, comando, input}`
 * siguiendo el convenio `/sync` de DGP-006 (ver
 * `lib/business-foundation/docs/andamiaje.md`):
 *
 *   - El punto de entrada NO es un comando del Kernel que envuelva a otros: es
 *     una función de orquestación `procesarCola(runtime, ctx, ops)` que, POR
 *     CADA operación, ejecuta el comando real vía `commands.execute` (UNA UoW
 *     por operación). No hay UoW exterior ni recibos en un store separado.
 *   - La idempotencia es DURABLE y TENANT-SCOPED porque vive en el propio
 *     registro: el núcleo deduplica `crear/iniciar` por el `id` de cliente y el
 *     resto de comandos por `opId` guardado como `_opIds` dentro del registro
 *     (todo dentro del Unit of Work del comando real). El recibo de respuesta se
 *     DERIVA del resultado (`idempotente: true`), sin estado local.
 *   - Detección de conflictos por versión: si un comando devuelve
 *     `KRN-CFL-001`, se responde `estado: "conflicto"` con el estado ACTUAL de
 *     la instancia para que el cliente resuelva.
 *   - Reintentos: los comandos infra-fallidos (`KRN-INF-001`) se marcan
 *     `reintentable` (no se consideran definitivos).
 *
 * `crear`/`iniciar`/`publicar` exigen `id` de cliente (garantía Offline First).
 *
 * 100% neutro. Todo por el Kernel (pipeline de comandos) y RecordStorePort.
 */
import { z } from "zod";
import type { ExecutionContext } from "@workspace/kernel";
import { tenantOf, type PlatformRuntime } from "@workspace/platform";
import { RECORD_TYPE_INSTANCIA } from "./motor";

/** Estado del resultado de una operación sincronizada. */
export type EstadoSync = "aplicada" | "idempotente" | "conflicto" | "rechazada" | "reintentable";

/** Una operación en la cola offline. */
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

/** Resultado de sincronizar una operación. */
export interface ResultadoSync {
  readonly opId: string;
  readonly comando: string;
  readonly estado: EstadoSync;
  /** Salida del comando cuando `aplicada`/`idempotente`. */
  readonly resultado?: unknown;
  /** Estado actual de la instancia cuando `conflicto` (para resolución cliente). */
  readonly actual?: unknown;
  readonly error?: string;
}

/** Resumen agregado de la cola procesada. */
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
const COMANDOS_CREACION = new Set(["iniciar", "publicar"]);

function esComandoCreacion(comando: string): boolean {
  const sufijo = comando.split(".").pop() ?? "";
  return COMANDOS_CREACION.has(sufijo);
}

/** Lee el estado actual de la instancia objetivo (para resolución de conflicto). */
async function estadoActual(
  runtime: PlatformRuntime,
  ctx: ExecutionContext,
  input: Record<string, unknown>,
): Promise<unknown> {
  const id = typeof input["id"] === "string" ? input["id"] : undefined;
  if (!id) return null;
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return null;
  const found = await runtime.store.findById(tenant.value, id);
  if (!found.ok || !found.value || found.value.recordType !== RECORD_TYPE_INSTANCIA) return null;
  return {
    id: found.value.id,
    estado: found.value.status,
    version: found.value.version,
    data: found.value.data,
  };
}

/**
 * Procesa una cola de operaciones offline. Cada operación se ejecuta con su
 * PROPIA UoW (vía `commands.execute`); jamás hay UoW exterior ni comandos
 * anidados. La idempotencia es durable y tenant-scoped (vive en `_opIds`/id de
 * cliente del propio registro). El recibo se deriva del resultado del comando.
 */
export async function procesarCola(
  runtime: PlatformRuntime,
  ctx: ExecutionContext,
  operaciones: readonly OperacionSync[],
): Promise<ResumenSync> {
  const resultados: ResultadoSync[] = [];

  for (const op of operaciones) {
    // Creación offline exige id de cliente (clave de deduplicación durable).
    if (esComandoCreacion(op.comando) && !op.input["id"]) {
      resultados.push({
        opId: op.opId,
        comando: op.comando,
        estado: "rechazada",
        error: "La operación de creación exige un id de cliente (Offline First).",
      });
      continue;
    }

    // opId dentro del input → idempotencia del núcleo (por id en crear; por
    // _opIds en el resto), SIEMPRE tenant-scoped porque el tenant sale del ctx.
    const input = { ...op.input, opId: op.opId };
    const r = await runtime.kernel.commands.execute(ctx, op.comando, input);

    if (r.ok) {
      const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
      resultados.push({
        opId: op.opId,
        comando: op.comando,
        estado: idempotente ? "idempotente" : "aplicada",
        resultado: r.value,
      });
    } else if (r.error.code === "KRN-CFL-001") {
      // Conflicto de versión: adjunta el estado ACTUAL para resolución.
      const actual = await estadoActual(runtime, ctx, op.input);
      resultados.push({
        opId: op.opId,
        comando: op.comando,
        estado: "conflicto",
        actual,
        error: r.error.message,
      });
    } else if (r.error.code === "KRN-INF-001") {
      resultados.push({ opId: op.opId, comando: op.comando, estado: "reintentable", error: r.error.message });
    } else {
      resultados.push({ opId: op.opId, comando: op.comando, estado: "rechazada", error: r.error.message });
    }
  }

  // Drena el outbox una vez tras la cola (como el /sync de DGP-006).
  await runtime.kernel.outboxProcessor.processPending();

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
