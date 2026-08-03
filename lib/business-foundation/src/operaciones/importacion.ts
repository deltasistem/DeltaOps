/**
 * DGP-006 · Business Foundation Framework — Generic Import Runtime.
 *
 * Comando `<servicio>.<entidad>.importar` que recibe FILAS JSON (array de
 * objetos planos YA parseados; el parseo CSV es responsabilidad del borde
 * HTTP) y las valida una a una contra el Zod de la entidad, aplicándolas en
 * lote reutilizando el comando `crear` del núcleo (por bus, con toda su
 * autorización/UoW/outbox/auditoría).
 *
 * - Recibos por fila {fila, ok, id?, errores?} — ejecución PARCIAL.
 * - Modo `simular` (dry-run): valida sin escribir nada.
 * - Máximo configurable por tenant (clave `<servicio>.importar-max`, default
 *   500), y respeta el permiso `crear` de la entidad.
 * - Offline First: `opId` por fila (base + índice) para idempotencia del núcleo.
 */
import { z } from "zod";
import { childContext, type CommandDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import { camposAZod, nombresOperaciones, type DefinicionEntidad } from "../nucleo/definicion";
import { auditarOperacion, baseOperaciones, configNumero, ok } from "./comun";

/** Clave de configuración del tamaño máximo de importación. */
export const CONFIG_IMPORTAR_MAX = "importar-max";
export const IMPORTAR_MAX_DEFAULT = 500;

export type ModoImportacion = "aplicar" | "simular";

export interface ReciboFila {
  readonly fila: number;
  readonly ok: boolean;
  readonly id?: string;
  readonly errores?: readonly { readonly path: readonly (string | number)[]; readonly message: string }[];
}

/** Nombre canónico del comando de importación de una entidad. */
export function nombreImportar(def: DefinicionEntidad): string {
  return `${baseOperaciones(def)}.importar`;
}

/**
 * Genera el comando de importación de una entidad. Devuelve una fábrica
 * `(deps) => CommandDefinition` para `extras.comandos`.
 *
 * `importarDesdeFilas` es el punto de entrada declarativo: fija la definición
 * y produce la fábrica lista para registrar.
 */
export function importarDesdeFilas(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => CommandDefinition<any, any> {
  const name = nombreImportar(def);
  const ops = nombresOperaciones(def);
  const dataSchema = camposAZod(def.campos);

  return (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name,
    inputSchema: z.object({
      filas: z.array(z.record(z.string(), z.unknown())).min(1),
      modo: z.enum(["aplicar", "simular"]).optional(),
      /** Prefijo de opId para idempotencia offline (opcional). */
      opIdBase: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.crear] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      const modo: ModoImportacion = (input.modo as ModoImportacion) ?? "aplicar";
      const max = await configNumero(deps, tenant.value, `${def.servicio}.${CONFIG_IMPORTAR_MAX}`, IMPORTAR_MAX_DEFAULT);
      const filas = input.filas as Record<string, unknown>[];

      const recibos: ReciboFila[] = [];
      const limite = Math.min(filas.length, max);

      for (let i = 0; i < limite; i += 1) {
        const fila = filas[i]!;
        // 1) Validación contra el Zod de la entidad (invariantes de dominio).
        const parsed = dataSchema.safeParse(fila);
        if (!parsed.success) {
          recibos.push({
            fila: i,
            ok: false,
            errores: parsed.error.issues.map((iss) => ({ path: iss.path, message: iss.message })),
          });
          continue;
        }
        // 2) Dry-run: no escribe.
        if (modo === "simular") {
          recibos.push({ fila: i, ok: true });
          continue;
        }
        // 3) Aplicar vía el comando `crear` del núcleo (idempotente por opId).
        const opId = input.opIdBase ? `${input.opIdBase}:${i}` : undefined;
        const r = await deps.runtime.commands.execute(childContext(ctx), ops.crear, {
          opId,
          data: parsed.data,
        });
        if (r.ok) {
          recibos.push({ fila: i, ok: true, id: (r.value as { id: string }).id });
        } else {
          recibos.push({
            fila: i,
            ok: false,
            errores: [{ path: [], message: r.error.message }],
          });
        }
      }

      // Filas que exceden el máximo: recibo de error explícito (no silencioso).
      for (let i = limite; i < filas.length; i += 1) {
        recibos.push({ fila: i, ok: false, errores: [{ path: [], message: `Excede el máximo de ${max} filas` }] });
      }

      const okCount = recibos.filter((r) => r.ok).length;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, `importar:${modo}`, null, {
        total: recibos.length,
        ok: okCount,
        fallidos: recibos.length - okCount,
      });
      if (!audited.ok) return audited;

      return ok({
        modo,
        total: recibos.length,
        ok: okCount,
        fallidos: recibos.length - okCount,
        recibos,
      });
    },
  });
}
