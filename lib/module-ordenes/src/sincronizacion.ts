/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Sincronización offline por ORQUESTACIÓN
 * con protocolo de RECLAMACIÓN DURABLE (claim → ejecutar → finalize / release).
 *
 * `procesarCola` NO es un comando del Kernel que envuelva a otros (eso anidaría
 * UoWs): es una función de orquestación que ejecuta cada operación offline con
 * su PROPIA UoW (una por comando).
 *
 * Protocolo de claim durable por `opId` (tenant-scoped, `SyncReceiptStore`):
 *   1. `claim`: reclama atómicamente el `opId`. Si otro worker ya lo reclamó,
 *      NO se ejecuta el comando; en su lugar:
 *        - si el recibo ya está FINALIZADO ⇒ se devuelve su resultado sellado
 *          (idempotencia entre workers/reintentos: un solo efecto);
 *        - si sigue `pendiente` (otro worker ejecuta ahora mismo) ⇒ se ESPERA
 *          (poll acotado) a que finalice y se devuelve su resultado; si no
 *          finaliza a tiempo ⇒ `reintentable`.
 *   2. `ejecutar`: siendo dueño, ejecuta el comando (idempotencia adicional a
 *      nivel de comando por `ReciboPort`).
 *   3. `finalize`: sella el resultado terminal (aplicada/idempotente/conflicto/
 *      rechazada) en el recibo → futuros claims lo devuelven sin re-ejecutar.
 *   4. `release`: SÓLO ante fallo REINTENTABLE (infra) se libera el claim para
 *      que un reintento posterior pueda volver a reclamar y ejecutar sin
 *      duplicar efectos (el `ReciboPort` del comando evita el doble efecto si el
 *      comando alcanzó a aplicarse antes del fallo de orquestación).
 *
 * El outbox se drena UNA vez tras procesar la cola (patrón /sync de DGP-006).
 */
import { z } from "zod";
import type { ExecutionContext } from "@workspace/kernel";
import { tenantOf, type PlatformRuntime } from "@workspace/platform";
import { MODULO } from "./module-name";
import type { ModuleAdapters } from "./module";
import type { SyncReceipt } from "./infrastructure/operacional";

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

/** Nombre corto del comando dentro del módulo (para detectar creación). */
function sufijo(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando.slice(MODULO.length + 1) : comando;
}

/**
 * Normaliza el nombre al namespace del módulo si viene abreviado. Soporta
 * comandos multi-segmento (p.ej. `bitacora.registrar` ⇒ `modulo.ordenes.bitacora.registrar`).
 */
function nombreComando(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando : `${MODULO}.${comando}`;
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

/** Espera acotada (poll) a que un recibo `pendiente` de otro worker finalice. */
const ESPERA_MAX_MS = 2000;
const ESPERA_PASO_MS = 25;
async function esperarFinalizacion(
  adapters: ModuleAdapters,
  tenantId: string,
  opId: string,
): Promise<SyncReceipt | null> {
  const inicio = Date.now();
  // Primera lectura inmediata; en pruebas concurrentes deterministas el otro
  // worker ya finalizó antes de ceder el turno.
  for (;;) {
    const r = await adapters.syncReceipts.find(tenantId, opId);
    const recibo = r.ok ? r.value : null;
    if (recibo && recibo.estado !== "pendiente") return recibo;
    if (Date.now() - inicio >= ESPERA_MAX_MS) return recibo && recibo.estado !== "pendiente" ? recibo : null;
    await new Promise((res) => setTimeout(res, ESPERA_PASO_MS));
  }
}

/**
 * Reconstruye el `ResultadoSync` desde un recibo FINALIZADO (replay entre
 * workers/reintentos). Un replay NO produce efecto nuevo: si el original fue un
 * éxito (aplicada/idempotente) el replay se reporta como `idempotente`
 * (Offline First: un solo efecto). Conflictos/rechazos conservan su estado
 * terminal y su payload original.
 */
function resultadoDeRecibo(opId: string, comando: string, recibo: SyncReceipt): ResultadoSync {
  const guardado = (recibo.resultado ?? {}) as Partial<ResultadoSync>;
  const estadoOriginal = (guardado.estado as EstadoSync | undefined) ?? (recibo.estado as EstadoSync);
  const estado: EstadoSync =
    estadoOriginal === "aplicada" || estadoOriginal === "idempotente" ? "idempotente" : estadoOriginal;
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
    for (const op of operaciones) {
      resultados.push({ opId: op.opId, comando: nombreComando(op.comando), estado: "rechazada", error: tenant.error.message });
    }
    return resumir(resultados);
  }
  const tenantId = tenant.value;
  const clienteId = typeof ctx.principal?.id === "string" ? ctx.principal.id : null;

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

    // (1) CLAIM durable del opId (tenant-scoped, atómico).
    const claim = await adapters.syncReceipts.claim(tenantId, op.opId, clienteId, comando);
    if (!claim.ok) {
      // Fallo de infraestructura al reclamar ⇒ reintentable (no se ejecutó nada).
      resultados.push({ opId: op.opId, comando, estado: "reintentable", error: claim.error.message });
      continue;
    }

    if (!claim.value.duenio) {
      // Claim AJENO: otro worker es el dueño del opId. No re-ejecutamos.
      const existente = claim.value.recibo ?? null;
      if (existente && existente.estado !== "pendiente") {
        resultados.push(resultadoDeRecibo(op.opId, comando, existente));
        continue;
      }
      // Sigue `pendiente` ⇒ el otro worker está ejecutando: esperamos su resultado.
      const finalizado = await esperarFinalizacion(adapters, tenantId, op.opId);
      if (finalizado) {
        resultados.push(resultadoDeRecibo(op.opId, comando, finalizado));
      } else {
        resultados.push({ opId: op.opId, comando, estado: "reintentable", error: "Operación reclamada por otro worker; aún no finaliza." });
      }
      continue;
    }

    // (2) Somos DUEÑOS: ejecutamos el comando (su PROPIA UoW; nunca anidada). El
    // `opId` propaga además la idempotencia durable a nivel de comando (recibos).
    const r = await runtime.kernel.commands.execute(ctx, comando, { ...op.input, opId: op.opId });

    let resultado: ResultadoSync;
    let reintentable = false;
    if (r.ok) {
      const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
      resultado = { opId: op.opId, comando, estado: idempotente ? "idempotente" : "aplicada", resultado: r.value };
    } else if (r.error.code === "KRN-CFL-001") {
      const actual = await estadoActual(runtime, ctx, op.input);
      resultado = { opId: op.opId, comando, estado: "conflicto", actual, error: r.error.message };
    } else if (r.error.code === "KRN-INF-001") {
      reintentable = true;
      resultado = { opId: op.opId, comando, estado: "reintentable", error: r.error.message };
    } else {
      resultado = { opId: op.opId, comando, estado: "rechazada", error: r.error.message };
    }

    // (3)/(4) FINALIZE (terminal) o RELEASE (sólo reintentable, para reintentar
    // sin duplicar: el ReciboPort del comando evita el doble efecto).
    if (reintentable) {
      await adapters.syncReceipts.release(tenantId, op.opId);
    } else {
      await adapters.syncReceipts.finalize(tenantId, {
        opId: op.opId,
        clienteId,
        comando,
        estado: resultado.estado,
        resultado,
      });
    }
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
