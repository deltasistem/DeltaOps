/**
 * DeltaOps Plataforma · KPI Service.
 * Catálogo, definiciones versionadas, snapshots y resultados.
 * NO calcula KPIs de negocio: las definiciones son declarativas y los valores
 * llegan mediante comandos de snapshot (fuentes opacas).
 */
import { z } from "zod";
import { fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.kpi";

const definitions = crudCommands({
  service: SERVICE,
  recordType: "definition",
  resource: "definition",
  dataSchema: z.object({
    codigo: z.string().min(1),
    nombre: z.string().min(1),
    descripcion: z.string().default(""),
    unidad: z.string().default(""),
    formula: z.string().default(""), // declarativa/opaca — no se evalúa aquí
    definicionVersion: z.number().int().positive().default(1),
  }).passthrough(),
  createPermission: "platform.kpi.manage",
  readPermission: "platform.kpi.read",
});

export function kpiService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Catálogo de KPIs con definiciones versionadas y snapshots",
    capabilities: [
      {
        name: "gestionar-kpis",
        permissions: ["platform.kpi.manage"],
        description: "Administrar el catálogo de KPIs",
      },
      {
        name: "consultar-kpis",
        permissions: ["platform.kpi.read", "platform.kpi.snapshot"],
        description: "Registrar snapshots y consultar resultados",
      },
    ],
    permissions: ["platform.kpi.manage", "platform.kpi.read", "platform.kpi.snapshot"],
    dependsOn: ["platform.config"],
    events: [],
    recordTypes: ["definition", "snapshot"],
    configDefaults: { "retencion-snapshots": "365" },
    commands: [
      definitions.create, definitions.update, definitions.remove,
      // Nueva versión de una definición (versionado explícito)
      (deps) => ({
        name: `${SERVICE}.definition.newVersion`,
        inputSchema: z.object({ id: z.string(), cambios: z.record(z.string(), z.unknown()).default({}) }),
        authorization: { permissions: ["platform.kpi.manage"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const current = await deps.store.findById(tenant.value, input.id);
          if (!current.ok) return current;
          if (!current.value) return fail(KernelErrors.notFound("kpi-definition", input.id));
          const nextVersion = Number(current.value.data["definicionVersion"] ?? 1) + 1;
          const updated = await deps.store.update(uow, tenant.value, input.id, current.value.version, {
            data: { ...current.value.data, ...input.cambios, definicionVersion: nextVersion },
          });
          if (!updated.ok) return updated;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "newVersion", input.id, {
            definicionVersion: nextVersion,
          });
          if (!audited.ok) return audited;
          return ok({ id: input.id, definicionVersion: nextVersion });
        },
      }),
      // Snapshot: el valor viene de fuera (fuentes opacas), no se calcula aquí
      (deps) => ({
        name: `${SERVICE}.snapshot`,
        inputSchema: z.object({
          definitionId: z.string(),
          valor: z.number(),
          periodo: z.string().min(1),
          dimensiones: z.record(z.string(), z.string()).default({}),
        }),
        authorization: { permissions: ["platform.kpi.snapshot"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const def = await deps.store.findById(tenant.value, input.definitionId);
          if (!def.ok) return def;
          if (!def.value || def.value.recordType !== "definition") {
            return fail(KernelErrors.notFound("kpi-definition", input.definitionId));
          }
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "snapshot",
            status: "recorded",
            data: {
              definitionId: input.definitionId,
              definicionVersion: def.value.data["definicionVersion"] ?? 1,
              valor: input.valor,
              periodo: input.periodo,
              dimensiones: input.dimensiones,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "snapshot", id, {
            definitionId: input.definitionId,
            periodo: input.periodo,
          });
          if (!audited.ok) return audited;
          return ok({ id });
        },
      }),
    ],
    queries: [
      definitions.get, definitions.list,
      (deps) => ({
        name: `${SERVICE}.results`,
        inputSchema: z.object({ definitionId: z.string(), periodo: z.string().optional() }),
        authorization: { permissions: ["platform.kpi.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const snaps = await deps.store.list(tenant.value, { service: SERVICE, recordType: "snapshot", limit: 500 });
          if (!snaps.ok) return snaps;
          return ok(
            snaps.value.filter(
              (s) =>
                s.data["definitionId"] === input.definitionId &&
                (!input.periodo || s.data["periodo"] === input.periodo),
            ),
          );
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
