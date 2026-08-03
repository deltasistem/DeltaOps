/**
 * DGP-006 · Business Foundation Framework — Generic Search Runtime.
 *
 * Puente genérico entre una DefinicionEntidad y el servicio de plataforma
 * `platform.search` (NUNCA reimplementa índice propio):
 *   - indexarEntidad(deps, def, registro, ctx): ejecuta `platform.search.indexDocument`
 *     con un `documentId` estable `<servicio>:<entidad>:<id>` (patrón ref:).
 *   - crearHandlerIndexacion(def): EventHandlerDefinition[] que indexa de forma
 *     idempotente desde el PAYLOAD de los eventos `.creada` y `.actualizada`.
 *   - crearQueryBusqueda(def): QueryDefinition `<servicio>.<entidad>.buscar` que
 *     delega en `platform.search.global` y filtra por el `recordType` de la
 *     entidad (aislamiento entre entidades dentro del mismo índice del tenant).
 *
 * 100% neutro: la indexación se construye SOLO desde el payload del evento
 * (autosuficiente); el documentId estable garantiza upsert idempotente.
 */
import { z } from "zod";
import {
  createExecutionContext,
  ok,
  SYSTEM_PRINCIPAL,
  type ExecutionContext,
  type KernelError,
  type QueryDefinition,
  type Result,
} from "@workspace/kernel";
import { tenantOf, type EventHandlerDefinition, type ServiceDeps } from "@workspace/platform";
import { eventosDeEntidad, nombresOperaciones, type DefinicionEntidad } from "../nucleo/definicion";
import type { RegistroEntidad } from "../nucleo/entidad";

/** entityType estable de la entidad en el índice (`<servicio>:<entidad>`). */
export function tipoEntidadBusqueda(def: DefinicionEntidad): string {
  return `${def.servicio}:${def.nombre}`;
}

/** documentId estable de un registro (patrón ref:): `<servicio>:<entidad>:<id>`. */
export function documentIdDe(def: DefinicionEntidad, id: string): string {
  return `${def.servicio}:${def.nombre}:${id}`;
}

/**
 * Construye el título y contenido indexables desde el `data` de un registro,
 * concatenando los campos marcados como `buscable` en la definición. El primer
 * campo buscable actúa de título; el resto de contenido.
 */
export function textoIndexable(
  def: DefinicionEntidad,
  data: Record<string, unknown>,
): { titulo: string; contenido: string } {
  const buscables = def.campos.filter((c) => c.buscable);
  const titulo = buscables.length > 0 ? String(data[buscables[0]!.nombre] ?? "") : "";
  const contenido = buscables
    .map((c) => String(data[c.nombre] ?? ""))
    .filter((v) => v.length > 0)
    .join(" ");
  return { titulo, contenido };
}

/**
 * Indexa un registro en `platform.search` a través del comando oficial. El
 * documentId estable produce un upsert idempotente (reindexar no duplica).
 */
export async function indexarEntidad(
  deps: ServiceDeps,
  def: DefinicionEntidad,
  registro: Pick<RegistroEntidad, "id" | "data">,
  ctx: ExecutionContext,
): Promise<Result<unknown, KernelError>> {
  const { titulo, contenido } = textoIndexable(def, registro.data);
  return deps.runtime.commands.execute(ctx, "platform.search.indexDocument", {
    documentId: documentIdDe(def, registro.id),
    entityType: tipoEntidadBusqueda(def),
    entityRef: `${def.servicio}.${def.nombre}:${registro.id}`,
    titulo,
    contenido,
  });
}

/**
 * EventHandlerDefinition[] que indexa la entidad desde el payload de sus
 * eventos `.creada` y `.actualizada`. Idempotente: mismo documentId ⇒ upsert.
 */
export function crearHandlerIndexacion(def: DefinicionEntidad): EventHandlerDefinition[] {
  const eventos = eventosDeEntidad(def);
  return [eventos.creada, eventos.actualizada].map((eventType) => ({
    eventType,
    handlerName: `indexar:${eventType}`,
    handle:
      (deps: ServiceDeps) =>
      async (event: { payload: Record<string, unknown>; correlationId: string }) => {
        const p = event.payload;
        const tenantId = String(p["tenantId"] ?? "");
        const id = String(p["id"] ?? "");
        if (!tenantId || !id) return ok(undefined);
        const data = (p["data"] as Record<string, unknown> | undefined) ?? {};
        const ctx = createExecutionContext({
          principal: SYSTEM_PRINCIPAL,
          correlationId: event.correlationId,
          metadata: { tenantId },
        });
        const r = await indexarEntidad(deps, def, { id, data }, ctx);
        return r.ok ? ok(undefined) : r;
      },
  }));
}

/**
 * Query genérica `<servicio>.<entidad>.buscar`: delega en `platform.search.global`
 * y filtra por el `entityType` de la entidad, de modo que la búsqueda de una
 * entidad no devuelve documentos de otras entidades del mismo tenant.
 */
export function crearQueryBusqueda(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => QueryDefinition<any, any> {
  const nombre = `${def.servicio}.${def.nombre}.buscar`;
  const entityType = tipoEntidadBusqueda(def);
  return (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({
      q: z.string().min(1),
      limit: z.number().int().positive().max(200).optional(),
    }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const res = await deps.runtime.queries.execute(ctx, "platform.search.global", {
        q: input.q,
        limit: input.limit,
      });
      if (!res.ok) return res;
      const docs = res.value as { entityType?: string }[];
      return ok(docs.filter((d) => d.entityType === entityType));
    },
  });
}
