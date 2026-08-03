/**
 * DGP-006 · Business Foundation Framework — Generic Timeline Runtime.
 *
 * Puente hacia el Shared Service `platform.timeline`. La línea temporal de
 * plataforma solo proyecta eventos de plataforma; este runtime añade la
 * proyección de los eventos del NÚCLEO (creada/actualizada/transicionada/
 * eliminada, y opcionalmente asignada/aprobada) creando entradas de timeline.
 *
 * - Proyección idempotente: la entrada usa el id del evento (`tl:<eventId>`),
 *   se construye SOLO desde el payload y se salta si ya existe (dedupe).
 * - Consulta `<servicio>.<entidad>.cronologia` → `platform.timeline.byEntity`
 *   filtrando por la referencia estable `<servicio>:<entidad>:<id>`.
 */
import { z } from "zod";
import {
  createExecutionContext,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type KernelError,
  type QueryDefinition,
  type Result,
} from "@workspace/kernel";
import { tenantOf, type EventHandlerDefinition, type ServiceDeps } from "@workspace/platform";
import { eventosDeEntidad, type DefinicionEntidad } from "../nucleo/definicion";
import { referenciaEntidad } from "./comentarios";

const TIMELINE_SERVICE = "platform.timeline";

/** Nombre canónico de la consulta de cronología de una entidad. */
export function nombreCronologia(def: DefinicionEntidad): string {
  return `${def.servicio}.${def.nombre}.cronologia`;
}

/**
 * Eventos del núcleo que se proyectan a la línea temporal. Incluye los cuatro
 * canónicos más eventos opcionales del prefijo (asignada/aprobada) que algunos
 * módulos emiten mediante transiciones específicas.
 */
export function eventosCronologia(def: DefinicionEntidad): readonly string[] {
  const canon = eventosDeEntidad(def);
  const prefijo = canon.creada.replace(/\.creada$/, "");
  return [
    canon.creada,
    canon.actualizada,
    canon.transicionada,
    canon.eliminada,
    `${prefijo}.asignada`,
    `${prefijo}.aprobada`,
  ];
}

/**
 * Proyecta un evento del núcleo a una entrada de timeline de plataforma.
 * Idempotente por `tl:<eventId>` (dedupe) y construida solo desde el payload.
 */
async function proyectarEntrada(
  def: DefinicionEntidad,
  deps: ServiceDeps,
  event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string; occurredAt: Date },
): Promise<Result<void, KernelError>> {
  const tenantId = String(event.payload["tenantId"] ?? "");
  const id = String(event.payload["id"] ?? "");
  if (!tenantId || !id) return ok(undefined);

  // Referencia estable de colaboración (colon-form), la misma que consulta
  // `.cronologia` — independiente del `entityRef` interno del núcleo.
  const entityRef = referenciaEntidad(def, id);

  const entryId = `tl:${event.id}`;
  const existing = await deps.store.findById(tenantId, entryId);
  if (!existing.ok) return existing;
  if (existing.value) return ok(undefined); // dedupe por eventId

  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  const ctx = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId: event.correlationId,
    metadata: { tenantId },
  });
  const result = await uowPort.execute(ctx, (uow) =>
    deps.store.insert(uow, {
      id: entryId,
      tenantId,
      service: TIMELINE_SERVICE,
      recordType: "entry",
      status: "active",
      data: {
        eventType: event.type,
        entityRef,
        actorId: event.payload["actorId"] ?? "system",
        payload: event.payload,
        occurredAt: event.occurredAt.toISOString(),
      },
      createdBy: "system",
    }),
  );
  return result.ok ? ok(undefined) : result;
}

/** Event handlers de proyección a timeline para todas las entidades del módulo. */
export function handlersCronologia(
  entidades: readonly DefinicionEntidad[],
): readonly EventHandlerDefinition[] {
  const handlers: EventHandlerDefinition[] = [];
  for (const def of entidades) {
    for (const eventType of eventosCronologia(def)) {
      handlers.push({
        eventType,
        handlerName: `cronologia:${eventType}`,
        handle: (deps: ServiceDeps) => (event) => proyectarEntrada(def, deps, event),
      });
    }
  }
  return handlers;
}

/** Genera la consulta de cronología de una entidad. */
export function crearCronologia(def: DefinicionEntidad): {
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombre = nombreCronologia(def);

  const cronologia = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({ id: z.string().min(1) }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const entityRef = referenciaEntidad(def, input.id);
      return deps.runtime.queries.execute(ctx, "platform.timeline.byEntity", { entityRef });
    },
  });

  return { queries: [cronologia] };
}
