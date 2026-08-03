/**
 * DeltaOps Plataforma · Report Service.
 * Plantillas de reportes, trabajos de generación, versiones e histórico.
 * Solo infraestructura: no genera reportes de negocio.
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.report";
export const REPORT_GENERATED = "platform.report.generated";

const templates = crudCommands({
  service: SERVICE,
  recordType: "template",
  resource: "template",
  dataSchema: z.object({
    nombre: z.string().min(1),
    descripcion: z.string().default(""),
    definicion: z.record(z.string(), z.unknown()).default({}),
    plantillaVersion: z.number().int().positive().default(1),
  }).passthrough(),
  createPermission: "platform.report.manage",
  readPermission: "platform.report.read",
});

export function reportService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Plantillas, trabajos, versiones e histórico de reportes",
    capabilities: [
      {
        name: "reportar",
        permissions: ["platform.report.run", "platform.report.read"],
        description: "Ejecutar y consultar reportes",
      },
      {
        name: "gestionar-reportes",
        permissions: ["platform.report.manage"],
        description: "Administrar plantillas de reportes",
      },
    ],
    permissions: ["platform.report.manage", "platform.report.run", "platform.report.read"],
    dependsOn: ["platform.export"],
    events: [REPORT_GENERATED],
    recordTypes: ["template", "job"],
    configDefaults: { "historico-max": "100" },
    commands: [
      templates.create, templates.update, templates.remove,
      (deps) => ({
        name: `${SERVICE}.run`,
        inputSchema: z.object({ templateId: z.string(), parametros: z.record(z.string(), z.unknown()).default({}) }),
        authorization: { permissions: ["platform.report.run"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const tpl = await deps.store.findById(tenant.value, input.templateId);
          if (!tpl.ok) return tpl;
          if (!tpl.value || tpl.value.recordType !== "template") {
            return fail(KernelErrors.notFound("report-template", input.templateId));
          }
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "job",
            status: "running",
            data: {
              templateId: input.templateId,
              templateVersion: tpl.value.data["plantillaVersion"] ?? 1,
              parametros: input.parametros,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "run", id, {
            templateId: input.templateId,
          });
          if (!audited.ok) return audited;
          return ok({ id });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.completeJob`,
        inputSchema: z.object({ id: z.string(), resultadoRef: z.string().optional() }),
        authorization: { permissions: ["platform.report.run"] },
        async handle(ctx, input, uow) {
          const done = await transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { running: ["completed", "failed"] },
            to: "completed",
            event: REPORT_GENERATED,
            detail: { resultadoRef: input.resultadoRef ?? null },
          });
          return done;
        },
      }),
    ],
    queries: [
      templates.get, templates.list,
      // Histórico de generaciones (versionado por templateVersion)
      (deps) => ({
        name: `${SERVICE}.history`,
        inputSchema: z.object({ templateId: z.string().optional() }),
        authorization: { permissions: ["platform.report.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const jobs = await deps.store.list(tenant.value, { service: SERVICE, recordType: "job", limit: 200 });
          if (!jobs.ok) return jobs;
          return ok(
            input.templateId
              ? jobs.value.filter((j) => j.data["templateId"] === input.templateId)
              : jobs.value,
          );
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
