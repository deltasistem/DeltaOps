/**
 * DeltaOps Plataforma · Task Service.
 * Tareas genéricas de plataforma: asignaciones, prioridades, vencimientos,
 * recordatorios e historial — todo generado mediante eventos (el historial
 * queda en auditoría y en el Timeline; los recordatorios se encolan como
 * notificaciones vía evento).
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.task";
export const TASK_CREATED = "platform.task.created";
export const TASK_ASSIGNED = "platform.task.assigned";
export const TASK_COMPLETED = "platform.task.completed";
export const TASK_REMINDER_DUE = "platform.task.reminder-due";

const PRIORITIES = ["low", "normal", "high", "critical"] as const;

export function taskService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Tareas de plataforma con asignación, vencimiento y recordatorios por eventos",
    capabilities: [
      {
        name: "gestionar-tareas",
        permissions: ["platform.task.write", "platform.task.read"],
        description: "Crear, asignar y completar tareas",
      },
    ],
    permissions: ["platform.task.write", "platform.task.read"],
    dependsOn: ["platform.notification"],
    events: [TASK_CREATED, TASK_ASSIGNED, TASK_COMPLETED, TASK_REMINDER_DUE],
    recordTypes: ["task"],
    configDefaults: { "recordatorio-antelacion-horas": "24" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.create`,
        inputSchema: z.object({
          titulo: z.string().min(1),
          descripcion: z.string().default(""),
          prioridad: z.enum(PRIORITIES).default("normal"),
          venceEl: z.string().datetime().optional(),
          entityRef: z.string().optional(),
        }),
        authorization: { permissions: ["platform.task.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "task",
            status: "open",
            data: {
              titulo: input.titulo,
              descripcion: input.descripcion,
              prioridad: input.prioridad,
              venceEl: input.venceEl ?? null,
              entityRef: input.entityRef ?? null,
              asignadoA: null,
              recordatorioEnviado: false,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "create", id, {
            prioridad: input.prioridad,
          });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(
              TASK_CREATED,
              { tenantId: tenant.value, id, entityRef: input.entityRef ?? id, actorId: ctx.principal.id },
              ctx.correlationId,
            ),
          );
          return ok({ id });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.assign`,
        inputSchema: z.object({ id: z.string(), asignadoA: z.string().min(1) }),
        authorization: { permissions: ["platform.task.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const current = await deps.store.findById(tenant.value, input.id);
          if (!current.ok) return current;
          if (!current.value) return fail(KernelErrors.notFound("task", input.id));
          if (current.value.status === "done") {
            return fail(KernelErrors.conflict("No se puede asignar una tarea completada"));
          }
          const updated = await deps.store.update(uow, tenant.value, input.id, current.value.version, {
            status: "assigned",
            data: { ...current.value.data, asignadoA: input.asignadoA },
          });
          if (!updated.ok) return updated;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "assign", input.id, {
            asignadoA: input.asignadoA,
          });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(
              TASK_ASSIGNED,
              { tenantId: tenant.value, id: input.id, entityRef: current.value.data["entityRef"] ?? input.id, asignadoA: input.asignadoA, actorId: ctx.principal.id },
              ctx.correlationId,
            ),
          );
          return ok(updated.value);
        },
      }),
      (deps) => ({
        name: `${SERVICE}.complete`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.task.write"] },
        async handle(ctx, input, uow) {
          const done = await transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { open: ["done"], assigned: ["done"] },
            to: "done",
            event: TASK_COMPLETED,
          });
          return done;
        },
      }),
      // Barrido de recordatorios: emite eventos para tareas por vencer
      (deps) => ({
        name: `${SERVICE}.sweepReminders`,
        inputSchema: z.object({ ahora: z.string().datetime().optional() }),
        authorization: { permissions: ["platform.task.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const horas = await deps.tenantConfig.get(tenant.value, `${SERVICE}.recordatorio-antelacion-horas`);
          const antelacionMs = (horas.ok ? Number(horas.value) : 24) * 3600_000;
          const ahora = input.ahora ? new Date(input.ahora).getTime() : Date.now();
          const abiertas = await deps.store.list(tenant.value, { service: SERVICE, recordType: "task", limit: 500 });
          if (!abiertas.ok) return abiertas;
          let emitidos = 0;
          for (const t of abiertas.value) {
            const vence = t.data["venceEl"] ? new Date(String(t.data["venceEl"])).getTime() : null;
            if (
              t.status !== "done" &&
              vence !== null &&
              !t.data["recordatorioEnviado"] &&
              vence - ahora <= antelacionMs
            ) {
              const updated = await deps.store.update(uow, tenant.value, t.id, t.version, {
                data: { ...t.data, recordatorioEnviado: true },
              });
              if (!updated.ok) return updated;
              uow.registerEvent(
                createDomainEvent(
                  TASK_REMINDER_DUE,
                  { tenantId: tenant.value, id: t.id, asignadoA: t.data["asignadoA"], venceEl: t.data["venceEl"] },
                  ctx.correlationId,
                ),
              );
              emitidos += 1;
            }
          }
          return ok({ emitidos });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.get`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.task.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.findById(tenant.value, input.id);
        },
      }),
      (deps) => ({
        name: `${SERVICE}.list`,
        inputSchema: z.object({
          status: z.string().optional(),
          asignadoA: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
        authorization: { permissions: ["platform.task.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, {
            service: SERVICE,
            recordType: "task",
            status: input.status,
            limit: input.limit,
          });
          if (!rows.ok) return rows;
          return ok(
            input.asignadoA
              ? rows.value.filter((r) => r.data["asignadoA"] === input.asignadoA)
              : rows.value,
          );
        },
      }),
      // Historial: derivado de auditoría (generado por eventos, nunca a mano)
      (deps) => ({
        name: `${SERVICE}.history`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.task.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.audit.list(tenant.value, { service: SERVICE, subjectId: input.id });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
