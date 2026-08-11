/**
 * DGP-019.1 · Módulo de Utilización — Sincronización offline por ORQUESTACIÓN
 * con protocolo de RECLAMACIÓN DURABLE (claim → ejecutar → finalize / release).
 *
 * `procesarCola` orquesta cada operación offline con su PROPIA UoW (una por
 * comando OFICIAL del runtime); el outbox se drena UNA vez al final. Los
 * identificadores de cola son los COMANDOS del runtime (no rutas HTTP). Recibos
 * idempotentes tenant-scoped. Mismo patrón que module-correctivo (DGP-015).
 */
import { z } from "zod";
import type { ExecutionContext } from "@workspace/kernel";
import { tenantOf, type PlatformRuntime } from "@workspace/platform";
import { MODULO } from "./module-name";
import type { ModuleAdapters } from "./module";
import type { SyncReceipt, SyncReceiptStore } from "./infrastructure/operacional";

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

/** Comandos de CREACIÓN offline que EXIGEN `id` de cliente (Offline First). */
const COMANDOS_CREACION = new Set(["registrar-lectura", "registrar-tanqueo", "reinicio-medidor"]);

/** Mapea el comando de escritura al query que resuelve su estado actual (conflicto). */
const QUERY_POR_COMANDO: Record<string, string> = {
  "registrar-lectura": "lectura-detalle",
  "anular-lectura": "lectura-detalle",
  "reinicio-medidor": "lectura-detalle",
  "registrar-tanqueo": "tanqueo-detalle",
  "anular-tanqueo": "tanqueo-detalle",
};

function sufijo(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando.slice(MODULO.length + 1) : comando;
}
function nombreComando(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando : `${MODULO}.${comando}`;
}

async function estadoActual(runtime: PlatformRuntime, ctx: ExecutionContext, comando: string, input: Record<string, unknown>): Promise<unknown> {
  const query = QUERY_POR_COMANDO[sufijo(comando)];
  if (!query) return null;
  const id = typeof input["id"] === "string" ? input["id"] : null;
  if (!id) return null;
  const r = await runtime.kernel.queries.execute(ctx, `${MODULO}.${query}`, { id });
  return r.ok ? r.value : null;
}

const ESPERA_MAX_MS = 2000;
const ESPERA_PASO_MS = 25;
async function esperarFinalizacion(receipts: SyncReceiptStore, tenantId: string, opId: string): Promise<SyncReceipt | null> {
  const inicio = Date.now();
  for (;;) {
    const r = await receipts.find(tenantId, opId);
    const recibo = r.ok ? r.value : null;
    if (recibo && recibo.estado !== "pendiente") return recibo;
    if (Date.now() - inicio >= ESPERA_MAX_MS) return recibo && recibo.estado !== "pendiente" ? recibo : null;
    await new Promise((res) => setTimeout(res, ESPERA_PASO_MS));
  }
}

function resultadoDeRecibo(opId: string, comando: string, recibo: SyncReceipt): ResultadoSync {
  const guardado = (recibo.resultado ?? {}) as Partial<ResultadoSync>;
  const estadoOriginal = (guardado.estado as EstadoSync | undefined) ?? (recibo.estado as EstadoSync);
  const estado: EstadoSync = estadoOriginal === "aplicada" || estadoOriginal === "idempotente" ? "idempotente" : estadoOriginal;
  return {
    opId,
    comando,
    estado,
    ...(guardado.resultado !== undefined ? { resultado: guardado.resultado } : {}),
    ...(guardado.actual !== undefined ? { actual: guardado.actual } : {}),
    ...(guardado.error !== undefined ? { error: guardado.error } : {}),
  };
}

export async function procesarCola(
  runtime: PlatformRuntime,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  operaciones: readonly OperacionSync[],
): Promise<ResumenSync> {
  const resultados: ResultadoSync[] = [];
  const tenant = tenantOf(ctx);
  if (!tenant.ok) {
    for (const op of operaciones) resultados.push({ opId: op.opId, comando: nombreComando(op.comando), estado: "rechazada", error: tenant.error.message });
    return resumir(resultados);
  }
  const tenantId = tenant.value;
  const clienteId = typeof ctx.principal?.id === "string" ? ctx.principal.id : null;
  const receipts = adapters.syncReceipts;
  if (!receipts) {
    for (const op of operaciones) resultados.push({ opId: op.opId, comando: nombreComando(op.comando), estado: "rechazada", error: "El runtime no está configurado con recibos de sincronización durables." });
    return resumir(resultados);
  }

  for (const op of operaciones) {
    const comando = nombreComando(op.comando);

    if (COMANDOS_CREACION.has(sufijo(comando)) && !op.input["id"]) {
      resultados.push({ opId: op.opId, comando, estado: "rechazada", error: "La operación de creación exige un id de cliente (Offline First)." });
      continue;
    }

    // Claim DURABLE del opId ANTES de ejecutar (lección DGP-008.1).
    const claim = await receipts.claim(tenantId, op.opId, clienteId, comando);
    if (!claim.ok) {
      resultados.push({ opId: op.opId, comando, estado: "reintentable", error: claim.error.message });
      continue;
    }

    if (!claim.value.duenio) {
      const existente = claim.value.recibo ?? null;
      if (existente && existente.estado !== "pendiente") {
        resultados.push(resultadoDeRecibo(op.opId, comando, existente));
        continue;
      }
      const finalizado = await esperarFinalizacion(receipts, tenantId, op.opId);
      if (finalizado) resultados.push(resultadoDeRecibo(op.opId, comando, finalizado));
      else resultados.push({ opId: op.opId, comando, estado: "reintentable", error: "Operación reclamada por otro worker; aún no finaliza." });
      continue;
    }

    const r = await runtime.kernel.commands.execute(ctx, comando, { ...op.input, opId: op.opId });

    let resultado: ResultadoSync;
    let reintentable = false;
    if (r.ok) {
      const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
      resultado = { opId: op.opId, comando, estado: idempotente ? "idempotente" : "aplicada", resultado: r.value };
    } else if (r.error.code === "KRN-CFL-001") {
      const actual = await estadoActual(runtime, ctx, comando, op.input);
      resultado = { opId: op.opId, comando, estado: "conflicto", actual, error: r.error.message };
    } else if (r.error.code === "KRN-INF-001") {
      reintentable = true;
      resultado = { opId: op.opId, comando, estado: "reintentable", error: r.error.message };
    } else {
      resultado = { opId: op.opId, comando, estado: "rechazada", error: r.error.message };
    }

    if (reintentable) await receipts.release(tenantId, op.opId);
    else await receipts.finalize(tenantId, { opId: op.opId, clienteId, comando, estado: resultado.estado, resultado });
    resultados.push(resultado);
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
