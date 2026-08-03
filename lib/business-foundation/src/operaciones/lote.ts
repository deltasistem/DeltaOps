/**
 * DGP-006 · Business Foundation Framework — Generic Bulk Operations Runtime.
 *
 * Comando `<servicio>.<entidad>.lote` que recibe un array de operaciones
 * {opId, comando: crear|editar|eliminar|transicionar, input} y las ejecuta
 * SECUENCIALMENTE reutilizando el bus de comandos del Kernel (mismos
 * contratos, autorización, validación, UoW, outbox y auditoría por elemento).
 *
 * - Máximo configurable por tenant (clave `<servicio>.lote-max`, default 100).
 * - Ejecución PARCIAL: un fallo no aborta el lote; se devuelve un recibo por
 *   elemento {opId, ok, error?, result?}.
 * - Idempotente por `opId`: cada sub-comando reutiliza el patrón `_opIds` del
 *   núcleo, de modo que reintentar el mismo lote no duplica efectos.
 *
 * NB: cada sub-comando abre su propia UoW (el bus la gestiona), por eso el lote
 * es una secuencia de transacciones independientes, no una transacción única.
 */
import { z } from "zod";
import { childContext, fail, KernelErrors, type CommandDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import { nombresOperaciones, type DefinicionEntidad } from "../nucleo/definicion";
import { auditarOperacion, baseOperaciones, configNumero, ok } from "./comun";

/** Clave de configuración del tamaño máximo de lote. */
export const CONFIG_LOTE_MAX = "lote-max";
export const LOTE_MAX_DEFAULT = 100;

export type ComandoLote = "crear" | "editar" | "eliminar" | "transicionar";

export interface OperacionLote {
  readonly opId: string;
  readonly comando: ComandoLote;
  readonly input: Record<string, unknown>;
}

export interface ReciboLote {
  readonly opId: string;
  readonly ok: boolean;
  readonly error?: { readonly code: string; readonly message: string };
  readonly result?: unknown;
}

/** Nombre canónico del comando de lote de una entidad. */
export function nombreLote(def: DefinicionEntidad): string {
  return `${baseOperaciones(def)}.lote`;
}

/** Mapea un comando lógico de lote a la operación CRUD real de la entidad. */
function resolverComando(def: DefinicionEntidad, comando: ComandoLote): string | undefined {
  const ops = nombresOperaciones(def);
  switch (comando) {
    case "crear":
      return ops.crear;
    case "editar":
      return ops.editar;
    case "eliminar":
      return ops.eliminar;
    case "transicionar":
      return def.maquinaEstados ? ops.transicionar : undefined;
  }
}

/**
 * Genera el comando de lote de una entidad. Devuelve una fábrica
 * `(deps) => CommandDefinition` para `extras.comandos`.
 */
export function crearComandoLote(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => CommandDefinition<any, any> {
  const name = nombreLote(def);
  return (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name,
    inputSchema: z.object({
      operaciones: z
        .array(
          z.object({
            opId: z.string().min(1),
            comando: z.enum(["crear", "editar", "eliminar", "transicionar"]),
            input: z.record(z.string(), z.unknown()),
          }),
        )
        .min(1),
    }),
    // Autorización base: leer. Cada sub-comando aplica su propio permiso real.
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      const max = await configNumero(deps, tenant.value, `${def.servicio}.${CONFIG_LOTE_MAX}`, LOTE_MAX_DEFAULT);
      const operaciones = input.operaciones as OperacionLote[];
      if (operaciones.length > max) {
        // Rechazo global del lote: excede el máximo permitido.
        return fail(KernelErrors.validation(`El lote excede el máximo de ${max} operaciones`, { max, recibidas: operaciones.length }));
      }

      const recibos: ReciboLote[] = [];
      // Ejecución secuencial: cada sub-comando abre su propia transacción.
      for (const op of operaciones) {
        const comando = resolverComando(def, op.comando);
        if (!comando) {
          recibos.push({ opId: op.opId, ok: false, error: { code: "KRN-CFL-001", message: `Comando no disponible: ${op.comando}` } });
          continue;
        }
        // Propaga el opId al sub-comando para idempotencia offline (_opIds).
        const subInput = { opId: op.opId, ...op.input };
        const r = await deps.runtime.commands.execute(childContext(ctx), comando, subInput);
        if (r.ok) {
          recibos.push({ opId: op.opId, ok: true, result: r.value });
        } else {
          recibos.push({ opId: op.opId, ok: false, error: { code: r.error.code, message: r.error.message } });
        }
      }

      const okCount = recibos.filter((r) => r.ok).length;
      // Auditoría del lote (resumen). El detalle por elemento ya lo audita cada
      // sub-comando por separado.
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "lote", null, {
        total: recibos.length,
        ok: okCount,
        fallidos: recibos.length - okCount,
      });
      if (!audited.ok) return audited;

      return ok({ total: recibos.length, ok: okCount, fallidos: recibos.length - okCount, recibos });
    },
  });
}
