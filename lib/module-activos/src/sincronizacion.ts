/**
 * DGP-008.1 · Módulo Activos — Sincronización offline por ORQUESTACIÓN.
 *
 * Orquestación de una cola de operaciones offline `{opId, comando, input}` con
 * RECLAMACIÓN DURABLE del `opId` (Offline First), robusta bajo concurrencia y
 * ante fallos del guardado del recibo:
 *
 *   - NO es un comando del Kernel que envuelva a otros (eso anidaría UoWs). Es
 *     una función de orquestación `procesarCola(runtime, receipts, repo, ctx,
 *     ops)` expuesta por el runtime/router.
 *   - Por CADA operación (protocolo claim → ejecutar → finalizar):
 *       1. **CLAIM**: reclama durablemente el `opId` ANTES de ejecutar
 *          (`receipts.claim` = INSERT 'pendiente' ON CONFLICT DO NOTHING +
 *          lectura del existente en la MISMA transacción). Resultado:
 *          `{duenio:true}` si esta solicitud reclamó, o `{duenio:false, recibo}`.
 *       2. Si **NO es dueño**:
 *            - recibo en estado TERMINAL ⇒ REPLAY: se devuelve tal cual (no se
 *              ejecuta el comando; vale para creación Y mutación).
 *            - recibo 'pendiente' VIVO ⇒ otro dueño en curso: se reintenta la
 *              lectura con un polling acotado; si sigue pendiente se devuelve
 *              `reintentable` (jamás se ejecuta el comando).
 *            - recibo 'pendiente' VIEJO (created_at + umbral) ⇒ RECUPERACIÓN: el
 *              nuevo solicitante ADOPTA la propiedad y reconcilia contra el
 *              agregado (creación: por id de cliente; mutación: por versión) y
 *              finaliza el recibo con el resultado reconciliado.
 *       3. Si **es dueño**: ejecuta `commands.execute` (su PROPIA UoW del
 *          pipeline, jamás anidada) y luego **FINALIZA** el recibo con UPDATE
 *          ('pendiente'→terminal) guardando el resultado completo. Si el UPDATE
 *          de finalización falla tras confirmarse el comando, NO se reporta
 *          éxito durable: se devuelve `reintentable` (el recibo queda
 *          'pendiente' y una reclamación posterior lo recupera por reconciliación).
 *   - Infra del comando (`KRN-INF-001`) ⇒ `reintentable` y se LIBERA la
 *     reclamación (`release` = DELETE del 'pendiente') para que un reintento
 *     posterior pueda reclamar de nuevo (no dejó efecto durable alguno).
 *
 * `crear` exige `id` de cliente (garantía Offline First).
 *
 * 100% neutro. El outbox se drena UNA vez tras la cola (como el /sync de DGP-006).
 */
import { z } from "zod";
import type { ExecutionContext } from "@workspace/kernel";
import { tenantOf, type PlatformRuntime } from "@workspace/platform";
import type { ActivoRepository, SyncReceipt, SyncReceiptStore } from "./infrastructure/repository";
import { MODULO } from "./module-name";

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

/** Resultado de sincronizar una operación (recibo derivado del resultado). */
export interface ResultadoSync {
  readonly opId: string;
  readonly comando: string;
  readonly estado: EstadoSync;
  /** `true` cuando el resultado proviene de un recibo durable (replay). */
  readonly replay?: boolean;
  /** Salida del comando cuando `aplicada`/`idempotente`. */
  readonly resultado?: unknown;
  /** Estado ACTUAL del activo cuando `conflicto` (para resolución cliente). */
  readonly actual?: unknown;
  readonly error?: string;
  /** Advertencia cuando el efecto se aplicó pero el recibo no pudo finalizar. */
  readonly advertencia?: string;
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

/** Opciones de orquestación (umbral de recuperación de 'pendiente' viejos). */
export interface OpcionesSync {
  /** ms de antigüedad de un 'pendiente' para adoptarlo (defecto 30 s). */
  readonly umbralRecuperacionMs?: number;
  /** Nº de reintentos de lectura ante 'pendiente' vivo de otro dueño. */
  readonly pollingIntentos?: number;
  /** ms entre reintentos de lectura. */
  readonly pollingEsperaMs?: number;
  /** Reloj inyectable (pruebas de recuperación). */
  readonly ahora?: () => number;
}

const UMBRAL_RECUPERACION_MS = 30_000;
const POLLING_INTENTOS = 3;
const POLLING_ESPERA_MS = 25;

/** Comandos que exigen `id` de cliente (creación offline). */
const COMANDOS_CREACION = new Set(["crear"]);

/**
 * Lista blanca EXPLÍCITA de operaciones de colaboración admitidas en la cola
 * offline. Cada sufijo mapea a un comando del módulo que DELEGA en un servicio
 * de plataforma (comentar → platform.comment.create; adjuntar →
 * platform.attachment.register; etc.). Se sincronizan con el mismo protocolo
 * claim→ejecutar→finalizar y recibos/idempotencia. En la RECUPERACIÓN de un
 * 'pendiente' viejo NO se re-ejecutan a ciegas (no son reconciliables por
 * versión/id de agregado): se degradan a `reintentable` para que un claim
 * limpio posterior las procese una única vez.
 */
const COMANDOS_COLABORACION = new Set([
  "comentar",
  "editar-comentario",
  "borrar-comentario",
  "adjuntar",
]);

function sufijo(comando: string): string {
  return comando.split(".").pop() ?? "";
}

function esComandoCreacion(comando: string): boolean {
  return COMANDOS_CREACION.has(sufijo(comando));
}

function esComandoColaboracion(comando: string): boolean {
  return COMANDOS_COLABORACION.has(sufijo(comando));
}

/** Normaliza el nombre de comando al namespace del módulo. */
function nombreComando(comando: string): string {
  return comando.startsWith(`${MODULO}.`) ? comando : `${MODULO}.${sufijo(comando)}`;
}

function clienteIdDe(input: Record<string, unknown>): string | null {
  return typeof input["id"] === "string" ? input["id"] : null;
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lee el estado ACTUAL del activo objetivo (read model) para conflictos. */
async function estadoActual(
  runtime: PlatformRuntime,
  ctx: ExecutionContext,
  input: Record<string, unknown>,
): Promise<unknown> {
  const id = clienteIdDe(input);
  if (!id) return null;
  const r = await runtime.kernel.queries.execute(ctx, `${MODULO}.detalle`, { id });
  return r.ok ? r.value : null;
}

/** Reconstruye el `ResultadoSync` de respuesta a partir de un recibo durable. */
function desdeRecibo(recibo: SyncReceipt): ResultadoSync {
  const guardado = (recibo.resultado ?? {}) as Partial<ResultadoSync>;
  return {
    opId: recibo.opId,
    comando: recibo.comando,
    estado: (guardado.estado ?? recibo.estado) as EstadoSync,
    replay: true,
    resultado: guardado.resultado,
    actual: guardado.actual,
    error: guardado.error,
  };
}

/**
 * Procesa una cola de operaciones offline con RECLAMACIÓN durable por `opId`.
 * Jamás hay UoW exterior ni comandos anidados.
 */
export async function procesarCola(
  runtime: PlatformRuntime,
  receipts: SyncReceiptStore,
  repository: ActivoRepository,
  ctx: ExecutionContext,
  operaciones: readonly OperacionSync[],
  opciones: OpcionesSync = {},
): Promise<ResumenSync> {
  const tenant = tenantOf(ctx);
  const resultados: ResultadoSync[] = [];

  // Sin tenant no hay ámbito de recibos; se rechaza toda la cola.
  if (!tenant.ok) {
    for (const op of operaciones) {
      resultados.push({ opId: op.opId, comando: nombreComando(op.comando), estado: "rechazada", error: tenant.error.message });
    }
    return resumir(resultados);
  }
  const tenantId = tenant.value;
  const umbralMs = opciones.umbralRecuperacionMs ?? UMBRAL_RECUPERACION_MS;
  const intentos = opciones.pollingIntentos ?? POLLING_INTENTOS;
  const esperaMs = opciones.pollingEsperaMs ?? POLLING_ESPERA_MS;
  const ahora = opciones.ahora ?? Date.now;

  for (const op of operaciones) {
    const comando = nombreComando(op.comando);
    const clienteId = clienteIdDe(op.input);

    // 1) CLAIM: reclamación durable del opId ANTES de ejecutar.
    const claim = await receipts.claim(tenantId, op.opId, clienteId, comando);
    if (!claim.ok) {
      // No se pudo reclamar (infra): sin efecto durable ⇒ reintentable.
      resultados.push({ opId: op.opId, comando, estado: "reintentable", error: claim.error.message });
      continue;
    }

    if (!claim.value.duenio) {
      // 2) NO somos dueños: replay terminal, o pendiente (vivo/viejo).
      const previo = claim.value.recibo;
      const res = await resolverNoDuenio(
        runtime, receipts, repository, ctx, tenantId, op, comando, previo,
        { umbralMs, intentos, esperaMs, ahora },
      );
      resultados.push(res);
      continue;
    }

    // 3) Somos dueños: creación exige id de cliente.
    if (esComandoCreacion(comando) && !op.input["id"]) {
      const res: ResultadoSync = {
        opId: op.opId,
        comando,
        estado: "rechazada",
        error: "La operación de creación exige un id de cliente (Offline First).",
      };
      await finalizarReporte(receipts, tenantId, op, res, resultados);
      continue;
    }

    // Ejecuta el comando destino (su PROPIA UoW del pipeline; no anidada).
    const res = await ejecutar(runtime, ctx, op, comando);
    if (res.estado === "reintentable") {
      // Infra del comando: libera la reclamación para reintentos posteriores.
      await receipts.release(tenantId, op.opId);
      resultados.push(res);
      continue;
    }
    await finalizarReporte(receipts, tenantId, op, res, resultados);
  }

  // Drena el outbox una vez tras la cola (como el /sync de DGP-006).
  await runtime.kernel.outboxProcessor.processPending();

  return resumir(resultados);
}

/** Ejecuta el comando destino y deriva el `ResultadoSync` (sin persistir). */
async function ejecutar(
  runtime: PlatformRuntime,
  ctx: ExecutionContext,
  op: OperacionSync,
  comando: string,
): Promise<ResultadoSync> {
  const input = { ...op.input, opId: op.opId };
  const r = await runtime.kernel.commands.execute(ctx, comando, input);
  if (r.ok) {
    const idempotente = (r.value as { idempotente?: boolean }).idempotente === true;
    return { opId: op.opId, comando, estado: idempotente ? "idempotente" : "aplicada", resultado: r.value };
  }
  if (r.error.code === "KRN-CFL-001") {
    const actual = await estadoActual(runtime, ctx, op.input);
    return { opId: op.opId, comando, estado: "conflicto", actual, error: r.error.message };
  }
  if (r.error.code === "KRN-INF-001") {
    return { opId: op.opId, comando, estado: "reintentable", error: r.error.message };
  }
  return { opId: op.opId, comando, estado: "rechazada", error: r.error.message };
}

/**
 * FINALIZA el recibo 'pendiente' propio y encola el reporte. Si la finalización
 * FALLA (infra) tras un comando ya confirmado, NO se reporta éxito durable: se
 * degrada a `reintentable` con advertencia (el recibo queda 'pendiente' y se
 * recupera por reconciliación en un claim posterior).
 */
async function finalizarReporte(
  receipts: SyncReceiptStore,
  tenantId: string,
  op: OperacionSync,
  res: ResultadoSync,
  resultados: ResultadoSync[],
): Promise<void> {
  const fin = await receipts.finalize(tenantId, {
    opId: op.opId,
    clienteId: clienteIdDe(op.input),
    comando: res.comando,
    estado: res.estado,
    resultado: res,
  });
  if (!fin.ok) {
    resultados.push({
      opId: op.opId,
      comando: res.comando,
      estado: "reintentable",
      error: fin.error.message,
      advertencia: "El efecto se aplicó pero el recibo no pudo finalizar; reintente para confirmar.",
    });
    return;
  }
  resultados.push(res);
}

/**
 * Resuelve una operación cuya reclamación NO ganamos: replay terminal, polling
 * de 'pendiente' vivo, o recuperación/reconciliación de 'pendiente' viejo.
 */
async function resolverNoDuenio(
  runtime: PlatformRuntime,
  receipts: SyncReceiptStore,
  repository: ActivoRepository,
  ctx: ExecutionContext,
  tenantId: string,
  op: OperacionSync,
  comando: string,
  previo: SyncReceipt | undefined,
  cfg: { umbralMs: number; intentos: number; esperaMs: number; ahora: () => number },
): Promise<ResultadoSync> {
  let recibo = previo;

  // Recibo terminal ⇒ replay directo.
  if (recibo && recibo.estado !== "pendiente") return desdeRecibo(recibo);

  // 'pendiente' de otro dueño: reintenta la lectura brevemente.
  for (let i = 0; i < cfg.intentos; i++) {
    if (recibo && esViejo(recibo, cfg)) break; // adoptamos por recuperación
    await esperar(cfg.esperaMs);
    const relec = await receipts.find(tenantId, op.opId);
    if (relec.ok) recibo = relec.value ?? undefined;
    if (recibo && recibo.estado !== "pendiente") return desdeRecibo(recibo);
  }

  // Recuperación de 'pendiente' VIEJO: adoptar y reconciliar contra el agregado.
  if (recibo && recibo.estado === "pendiente" && esViejo(recibo, cfg)) {
    const reconciliado = await reconciliar(runtime, repository, ctx, tenantId, op, comando);
    const fin = await receipts.finalize(tenantId, {
      opId: op.opId,
      clienteId: clienteIdDe(op.input),
      comando: reconciliado.comando,
      estado: reconciliado.estado,
      resultado: reconciliado,
    });
    if (fin.ok && fin.value) return { ...reconciliado, replay: true };
    // Otro proceso finalizó primero: replay del recibo ya terminal.
    const cur = await receipts.find(tenantId, op.opId);
    if (cur.ok && cur.value && cur.value.estado !== "pendiente") return desdeRecibo(cur.value);
    return { opId: op.opId, comando, estado: "reintentable", error: "Recibo pendiente no reconciliable aún." };
  }

  // Sigue pendiente y no es viejo: otro dueño en curso ⇒ reintente después.
  return {
    opId: op.opId,
    comando,
    estado: "reintentable",
    error: "Operación en curso por otra solicitud; reintente.",
  };
}

function esViejo(recibo: SyncReceipt, cfg: { umbralMs: number; ahora: () => number }): boolean {
  if (!recibo.createdAt) return false;
  return cfg.ahora() - recibo.createdAt.getTime() >= cfg.umbralMs;
}

/**
 * Reconcilia el desenlace de un `opId` 'pendiente' consultando el AGREGADO:
 *  - creación: por `id` de cliente ⇒ si existe, `aplicada` con su estado/versión.
 *  - mutación: por `id` y comparando `expectedVersion` con la versión actual ⇒
 *    si la versión avanzó, `aplicada`; si sigue igual, aún no se aplicó ⇒
 *    `reintentable` (una nueva reclamación lo re-ejecutará).
 */
async function reconciliar(
  runtime: PlatformRuntime,
  repository: ActivoRepository,
  ctx: ExecutionContext,
  tenantId: string,
  op: OperacionSync,
  comando: string,
): Promise<ResultadoSync> {
  // Operaciones de colaboración: no son reconciliables por agregado; no se
  // re-ejecutan a ciegas. Se degradan a `reintentable` para un claim limpio.
  if (esComandoColaboracion(comando)) {
    return {
      opId: op.opId,
      comando,
      estado: "reintentable",
      error: "Operación de colaboración pendiente; reintente para procesarla una única vez.",
    };
  }

  const id = clienteIdDe(op.input);
  if (!id) return { opId: op.opId, comando, estado: "rechazada", error: "Sin id para reconciliar." };

  const actual = await repository.findById(tenantId, id);
  if (!actual.ok) return { opId: op.opId, comando, estado: "reintentable", error: actual.error.message };
  const activo = actual.value;

  if (esComandoCreacion(comando)) {
    if (activo) {
      return { opId: op.opId, comando, estado: "aplicada", resultado: { id, estado: activo.estado, version: activo.version } };
    }
    // No se creó: re-ejecuta ahora que hemos adoptado la propiedad.
    return ejecutar(runtime, ctx, op, comando);
  }

  // Mutación: compara con expectedVersion declarado.
  const esperada = typeof op.input["expectedVersion"] === "number" ? (op.input["expectedVersion"] as number) : null;
  if (!activo) return { opId: op.opId, comando, estado: "rechazada", error: "Activo inexistente para mutar." };
  if (esperada != null && activo.version > esperada) {
    return { opId: op.opId, comando, estado: "aplicada", resultado: { id, estado: activo.estado, version: activo.version } };
  }
  // La versión no avanzó ⇒ la mutación no se aplicó; re-ejecuta.
  return ejecutar(runtime, ctx, op, comando);
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
