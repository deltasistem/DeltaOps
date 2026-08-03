/**
 * DeltaOps Plataforma · Export Service.
 * Trabajos de exportación con estados, progreso, cancelación y auditoría.
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.export";
export const EXPORT_REQUESTED = "platform.export.requested";
export const EXPORT_COMPLETED = "platform.export.completed";

const JOB_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  failed: ["pending"],
};

export function exportService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Trabajos de exportación con progreso y cancelación",
    capabilities: [
      {
        name: "exportar",
        permissions: ["platform.export.write", "platform.export.read"],
        description: "Solicitar y seguir exportaciones",
      },
    ],
    permissions: ["platform.export.write", "platform.export.read"],
    dependsOn: ["platform.notification"],
    events: [EXPORT_REQUESTED, EXPORT_COMPLETED],
    recordTypes: ["job"],
    configDefaults: { "max-filas": "100000", "formatos": "csv,xlsx,pdf" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.request`,
        inputSchema: z.object({
          origen: z.string().min(1),
          formato: z.enum(["csv", "xlsx", "pdf", "json"]),
          filtros: z.record(z.string(), z.unknown()).default({}),
        }),
        authorization: { permissions: ["platform.export.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "job",
            status: "pending",
            data: { origen: input.origen, formato: input.formato, filtros: input.filtros, progreso: 0 },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "request", id, { formato: input.formato });
          if (!audited.ok) return audited;
          uow.registerEvent(createDomainEvent(EXPORT_REQUESTED, { tenantId: tenant.value, id }, ctx.correlationId));
          return ok({ id });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.updateProgress`,
        inputSchema: z.object({ id: z.string(), progreso: z.number().min(0).max(100) }),
        authorization: { permissions: ["platform.export.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const current = await deps.store.findById(tenant.value, input.id);
          if (!current.ok) return current;
          if (!current.value) return fail(KernelErrors.notFound("export-job", input.id));
          if (current.value.status !== "running" && current.value.status !== "pending") {
            return fail(KernelErrors.conflict(`Trabajo en estado ${current.value.status}: progreso no actualizable`));
          }
          const updated = await deps.store.update(uow, tenant.value, input.id, current.value.version, {
            status: "running",
            data: { ...current.value.data, progreso: input.progreso },
          });
          return updated.ok ? ok(updated.value) : updated;
        },
      }),
      (deps) => ({
        name: `${SERVICE}.complete`,
        inputSchema: z.object({ id: z.string(), attachmentId: z.string().optional() }),
        authorization: { permissions: ["platform.export.write"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: JOB_TRANSITIONS,
            to: "completed",
            event: EXPORT_COMPLETED,
            detail: { attachmentId: input.attachmentId ?? null },
          });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.cancel`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.export.write"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: JOB_TRANSITIONS,
            to: "cancelled",
          });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.get`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.export.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.findById(tenant.value, input.id);
        },
      }),
      (deps) => ({
        name: `${SERVICE}.list`,
        inputSchema: z.object({ status: z.string().optional() }),
        authorization: { permissions: ["platform.export.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.list(tenant.value, { service: SERVICE, recordType: "job", status: input.status });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
