/**
 * DeltaOps Plataforma · Timeline Service.
 * Línea temporal 100% reconstruible mediante eventos: NUNCA se escribe
 * directamente. Las entradas son proyecciones de los eventos de plataforma;
 * `rebuild` reconstruye desde la auditoría (fuente de eventos consumada).
 */
import { z } from "zod";
import { ok, SYSTEM_PRINCIPAL, type Result, type KernelError } from "@workspace/kernel";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition, ServiceDeps } from "../core/service";
import { tenantOf } from "../core/types";
import { COMMENT_CREATED, COMMENT_DELETED, COMMENT_EDITED } from "./comment";
import { ATTACHMENT_DELETED, ATTACHMENT_REGISTERED } from "./attachment";
import { TASK_ASSIGNED, TASK_COMPLETED, TASK_CREATED } from "./task";

const SERVICE = "platform.timeline";

/** Eventos de plataforma que se proyectan a la línea temporal. */
const PROJECTED_EVENTS = [
  COMMENT_CREATED,
  COMMENT_EDITED,
  COMMENT_DELETED,
  ATTACHMENT_REGISTERED,
  ATTACHMENT_DELETED,
  TASK_CREATED,
  TASK_ASSIGNED,
  TASK_COMPLETED,
] as const;

/**
 * Mapa auditoría→evento: cada acción auditada que emite un evento proyectable.
 * `rebuild` solo reproyecta estas entradas — nunca auditoría arbitraria —
 * preservando el contrato "línea temporal reconstruible desde eventos".
 */
const AUDIT_TO_EVENT: Record<string, string> = {
  "platform.comment:create": COMMENT_CREATED,
  "platform.comment:edit": COMMENT_EDITED,
  "platform.comment:delete": COMMENT_DELETED,
  "platform.attachment:register": ATTACHMENT_REGISTERED,
  "platform.attachment:delete": ATTACHMENT_DELETED,
  "platform.task:create": TASK_CREATED,
  "platform.task:assign": TASK_ASSIGNED,
  "platform.task:complete": TASK_COMPLETED,
};

async function projectEntry(
  deps: ServiceDeps,
  event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string; occurredAt: Date },
): Promise<Result<void, KernelError>> {
  const tenantId = String(event.payload["tenantId"] ?? "");
  if (!tenantId) return ok(undefined); // evento sin tenant: no proyectable
  // Idempotente: la entrada usa el id del evento como id del registro.
  const existing = await deps.store.findById(tenantId, `tl:${event.id}`);
  if (!existing.ok) return existing;
  if (existing.value) return ok(undefined);

  const { runtime } = deps;
  const uowPort = runtime.container.resolve(
    (await import("@workspace/kernel")).KernelTokens.unitOfWork,
  );
  const ctx = (await import("@workspace/kernel")).createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId: event.correlationId,
    metadata: { tenantId },
  });
  const result = await uowPort.execute(ctx, async (uow) => {
    return deps.store.insert(uow, {
      id: `tl:${event.id}`,
      tenantId,
      service: SERVICE,
      recordType: "entry",
      status: "active",
      data: {
        eventType: event.type,
        entityRef: event.payload["entityRef"] ?? event.payload["id"] ?? null,
        actorId: event.payload["actorId"] ?? "system",
        payload: event.payload,
        occurredAt: event.occurredAt.toISOString(),
      },
      createdBy: "system",
    });
  });
  return result.ok ? ok(undefined) : result;
}

export function timelineService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Línea temporal proyectada exclusivamente desde eventos",
    capabilities: [
      {
        name: "consultar-timeline",
        permissions: ["platform.timeline.read"],
        description: "Consultar la línea temporal",
      },
    ],
    permissions: ["platform.timeline.read", "platform.timeline.rebuild"],
    dependsOn: ["platform.comment", "platform.attachment", "platform.task"],
    events: [],
    recordTypes: ["entry"],
    configDefaults: { "max-entradas-consulta": "200" },
    commands: [
      // Reconstrucción: borra proyección y re-proyecta desde auditoría
      (deps) => ({
        name: `${SERVICE}.rebuild`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.timeline.rebuild"] },
        async handle(ctx, _input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const entries = await deps.store.list(tenant.value, {
            service: SERVICE,
            recordType: "entry",
            limit: 500,
          });
          if (!entries.ok) return entries;
          for (const e of entries.value) {
            const del = await deps.store.softDelete(uow, tenant.value, e.id);
            if (!del.ok) return del;
          }
          const trail = await deps.audit.list(tenant.value, { limit: 500 });
          if (!trail.ok) return trail;
          let projected = 0;
          for (const a of [...trail.value].reverse()) {
            // Solo se reproyectan entradas de auditoría que corresponden a
            // emisiones de eventos proyectables (equivalencia evento↔auditoría
            // garantizada porque comando, evento y auditoría comparten UoW).
            const eventType = AUDIT_TO_EVENT[`${a.service}:${a.action}`];
            if (!eventType) continue;
            const ins = await deps.store.insert(uow, {
              id: `tl:rebuild:${a.id}`,
              tenantId: tenant.value,
              service: SERVICE,
              recordType: "entry",
              status: "active",
              data: {
                eventType,
                entityRef: a.subjectId,
                actorId: a.actorId,
                payload: a.detail,
                occurredAt: a.occurredAt.toISOString(),
              },
              createdBy: "system",
            });
            if (!ins.ok) return ins;
            projected += 1;
          }
          return ok({ projected });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.byEntity`,
        inputSchema: z.object({ entityRef: z.string() }),
        authorization: { permissions: ["platform.timeline.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "entry", limit: 500 });
          if (!rows.ok) return rows;
          return ok(rows.value.filter((r) => r.data["entityRef"] === input.entityRef));
        },
      }),
      (deps) => ({
        name: `${SERVICE}.recent`,
        inputSchema: z.object({ limit: z.number().int().positive().max(200).optional() }),
        authorization: { permissions: ["platform.timeline.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.list(tenant.value, {
            service: SERVICE,
            recordType: "entry",
            limit: input.limit ?? 50,
          });
        },
      }),
    ],
    eventHandlers: PROJECTED_EVENTS.map((eventType) => ({
      eventType,
      handlerName: `project:${eventType}`,
      handle: (deps) => (event) => projectEntry(deps, event),
    })),
    healthCheck: storeHealthCheck(SERVICE),
  };
}
