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

/**
 * Cursor de paginación ESTABLE de una entrada: `<occurredAtISO>|<id>`. El `id`
 * desempata para determinismo cuando dos entradas comparten `occurredAt`. Es
 * opaco para el consumidor (la UI sólo lo reenvía tal cual).
 */
function cursorDe(entry: { id: string; data: Record<string, unknown> }): string {
  return `${String(entry.data["occurredAt"] ?? "")}|${String(entry.id)}`;
}

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
    permissions: ["platform.timeline.read", "platform.timeline.rebuild", "platform.timeline.record"],
    dependsOn: ["platform.comment", "platform.attachment", "platform.task"],
    events: [],
    recordTypes: ["entry"],
    configDefaults: { "max-entradas-consulta": "200" },
    commands: [
      // Registro de dominio: permite a un módulo proyectar SUS eventos al
      // Shared Timeline sin tocar tablas de plataforma (nunca escritura
      // directa). Idempotente por `entryId` (el id del evento del módulo):
      // una reentrega tardía del outbox no duplica la entrada.
      (deps) => ({
        name: `${SERVICE}.record`,
        inputSchema: z.object({
          entryId: z.string().min(1),
          entityRef: z.string().min(1),
          eventType: z.string().min(1),
          actorId: z.string().min(1),
          occurredAt: z.string().min(1),
          resumen: z.string().default(""),
          estado: z.string().nullable().optional(),
          entidadRelacionada: z.string().nullable().optional(),
          payload: z.record(z.unknown()).default({}),
        }),
        authorization: { permissions: ["platform.timeline.record"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = `tl:${input.entryId}`;
          const existing = await deps.store.findById(tenant.value, id);
          if (!existing.ok) return existing;
          if (existing.value) return ok({ id, idempotente: true });
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "entry",
            status: "active",
            data: {
              eventType: input.eventType,
              entityRef: input.entityRef,
              actorId: input.actorId,
              resumen: input.resumen,
              estado: input.estado ?? null,
              entidadRelacionada: input.entidadRelacionada ?? null,
              payload: input.payload,
              occurredAt: input.occurredAt,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          return ok({ id, idempotente: false });
        },
      }),
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
          // Recorre TODO el conjunto de la entidad paginando por offset (sin tope
          // silencioso de 500): la cronología de un activo puede superar 500.
          const rows: { id: string; data: Record<string, unknown> }[] = [];
          const BATCH = 500;
          for (let offset = 0; ; offset += BATCH) {
            const page = await deps.store.list(tenant.value, {
              service: SERVICE,
              recordType: "entry",
              dataEquals: { entityRef: input.entityRef },
              limit: BATCH,
              offset,
            });
            if (!page.ok) return page;
            rows.push(...page.value);
            if (page.value.length < BATCH) break;
          }
          return ok(rows);
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
      // Consulta cronológica con filtros: actor, rango de fechas, estado, entidad
      // relacionada y entityRef. Devuelve entradas ordenadas DESC por (occurredAt,
      // id). Soporta PAGINACIÓN ESTABLE por cursor `(occurredAt|id)` (aditiva):
      //  - Sin `cursor`/`limit`: contrato histórico (array de entradas).
      //  - Con `cursor` o `paginado:true`: envoltura `{ items, nextCursor }`.
      // NO hay topes silenciosos: con `entityRef` se recorre TODO el conjunto de
      // la entidad (paginando el `list` del almacén por offset) para no perder
      // entradas antiguas; la UI puede recorrer todo por cursor. Sin `entityRef`
      // (global) se conserva un tope conservador para no barrer el tenant entero.
      (deps) => ({
        name: `${SERVICE}.query`,
        inputSchema: z.object({
          entityRef: z.string().optional(),
          actorId: z.string().optional(),
          eventType: z.string().optional(),
          estado: z.string().optional(),
          entidadRelacionada: z.string().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
          cursor: z.string().optional(),
          paginado: z.boolean().optional(),
        }),
        authorization: { permissions: ["platform.timeline.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          // Recolección de filas. Con `entityRef` (alta cardinalidad) el filtro va
          // al almacén (dataEquals) y se PAGINA el `list` por offset hasta agotar
          // el conjunto de la entidad (sin tope silencioso). Sin `entityRef` se
          // trae una única ventana global acotada.
          const filas: { id: string; data: Record<string, unknown> }[] = [];
          if (input.entityRef) {
            const BATCH = 500;
            for (let offset = 0; ; offset += BATCH) {
              const page = await deps.store.list(tenant.value, {
                service: SERVICE,
                recordType: "entry",
                dataEquals: { entityRef: input.entityRef },
                limit: BATCH,
                offset,
              });
              if (!page.ok) return page;
              filas.push(...page.value);
              if (page.value.length < BATCH) break;
            }
          } else {
            const page = await deps.store.list(tenant.value, {
              service: SERVICE,
              recordType: "entry",
              limit: 500,
            });
            if (!page.ok) return page;
            filas.push(...page.value);
          }
          const desde = input.desde ? new Date(input.desde).getTime() : null;
          const hasta = input.hasta ? new Date(input.hasta).getTime() : null;
          const filtered = filas.filter((r) => {
            const d = r.data;
            if (input.entityRef && d["entityRef"] !== input.entityRef) return false;
            if (input.actorId && d["actorId"] !== input.actorId) return false;
            if (input.eventType && d["eventType"] !== input.eventType) return false;
            if (input.estado && d["estado"] !== input.estado) return false;
            if (input.entidadRelacionada && d["entidadRelacionada"] !== input.entidadRelacionada) return false;
            const ts = d["occurredAt"] ? new Date(String(d["occurredAt"])).getTime() : null;
            if (desde != null && (ts == null || ts < desde)) return false;
            if (hasta != null && (ts == null || ts > hasta)) return false;
            return true;
          });
          // Orden ESTABLE DESC por (occurredAt, id): el id desempata para que el
          // cursor sea determinista aun con `occurredAt` iguales.
          filtered.sort((a, b) => {
            const ta = new Date(String(a.data["occurredAt"] ?? 0)).getTime();
            const tb = new Date(String(b.data["occurredAt"] ?? 0)).getTime();
            if (tb !== ta) return tb - ta;
            return String(b.id).localeCompare(String(a.id));
          });

          // ¿Paginación por cursor? (aditiva). Cursor = `<occurredAtISO>|<id>`.
          const usaPaginacion = input.paginado === true || input.cursor != null;
          if (usaPaginacion) {
            const pageSize = input.limit ?? 100;
            let inicio = 0;
            if (input.cursor) {
              const idx = filtered.findIndex((r) => cursorDe(r) === input.cursor);
              inicio = idx >= 0 ? idx + 1 : 0;
            }
            const items = filtered.slice(inicio, inicio + pageSize);
            const hayMas = inicio + pageSize < filtered.length;
            const nextCursor = hayMas && items.length > 0 ? cursorDe(items[items.length - 1]) : null;
            return ok({ items, nextCursor });
          }

          // Contrato histórico (array). Con `entityRef` se devuelve TODO el
          // conjunto de la entidad (sin recorte a 200 que dejaba fuera eventos
          // antiguos); en consulta global se mantiene un tope conservador.
          const tope = input.limit ?? (input.entityRef ? filtered.length : 200);
          return ok(filtered.slice(0, tope));
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
