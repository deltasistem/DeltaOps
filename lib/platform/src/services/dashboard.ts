/**
 * DeltaOps Plataforma · Dashboard Service.
 * Dashboards, widgets, layouts y preferencias — con configuración por tenant.
 * Solo infraestructura: los widgets referencian fuentes opacas (sin negocio).
 */
import { z } from "zod";
import { fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.dashboard";

const dashboards = crudCommands({
  service: SERVICE,
  recordType: "dashboard",
  resource: "dashboard",
  dataSchema: z.object({
    nombre: z.string().min(1),
    descripcion: z.string().default(""),
    layout: z.array(z.object({
      widgetId: z.string(),
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      w: z.number().int().positive(),
      h: z.number().int().positive(),
    })).default([]),
  }).passthrough(),
  createPermission: "platform.dashboard.manage",
  readPermission: "platform.dashboard.read",
});

const widgets = crudCommands({
  service: SERVICE,
  recordType: "widget",
  resource: "widget",
  dataSchema: z.object({
    nombre: z.string().min(1),
    tipo: z.enum(["kpi", "chart", "table", "text", "status"]),
    fuente: z.string().min(1), // referencia opaca (query/kpi id), sin negocio
    opciones: z.record(z.string(), z.unknown()).default({}),
  }).passthrough(),
  createPermission: "platform.dashboard.manage",
  readPermission: "platform.dashboard.read",
});

export function dashboardService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Dashboards, widgets, layouts y preferencias por tenant",
    capabilities: [
      {
        name: "gestionar-dashboards",
        permissions: ["platform.dashboard.manage", "platform.dashboard.read"],
        description: "Administrar dashboards y widgets",
      },
    ],
    permissions: ["platform.dashboard.manage", "platform.dashboard.read"],
    dependsOn: ["platform.kpi", "platform.config"],
    events: [],
    recordTypes: ["dashboard", "widget", "preference"],
    configDefaults: { "max-widgets-por-dashboard": "24" },
    commands: [
      dashboards.create, dashboards.update, dashboards.remove,
      widgets.create, widgets.update, widgets.remove,
      // Preferencias por usuario (dashboard por defecto, orden, tema)
      (deps) => ({
        name: `${SERVICE}.setPreference`,
        inputSchema: z.object({ clave: z.string().min(1), valor: z.string() }),
        authorization: { permissions: ["platform.dashboard.read"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = `pref:${ctx.principal.id}:${input.clave}`;
          const existing = await deps.store.findById(tenant.value, id);
          if (!existing.ok) return existing;
          if (existing.value) {
            const updated = await deps.store.update(uow, tenant.value, id, existing.value.version, {
              data: { clave: input.clave, valor: input.valor, usuario: ctx.principal.id },
            });
            if (!updated.ok) return updated;
          } else {
            const inserted = await deps.store.insert(uow, {
              id,
              tenantId: tenant.value,
              service: SERVICE,
              recordType: "preference",
              status: "active",
              data: { clave: input.clave, valor: input.valor, usuario: ctx.principal.id },
              createdBy: ctx.principal.id,
            });
            if (!inserted.ok) return inserted;
          }
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "setPreference", id, {});
          if (!audited.ok) return audited;
          return ok({ id });
        },
      }),
    ],
    queries: [
      dashboards.get, dashboards.list, widgets.get, widgets.list,
      (deps) => ({
        name: `${SERVICE}.preferences`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.dashboard.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "preference", limit: 200 });
          if (!rows.ok) return rows;
          return ok(rows.value.filter((r) => r.data["usuario"] === ctx.principal.id));
        },
      }),
      // Composición: dashboard + widgets resueltos
      (deps) => ({
        name: `${SERVICE}.compose`,
        inputSchema: z.object({ dashboardId: z.string() }),
        authorization: { permissions: ["platform.dashboard.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const dash = await deps.store.findById(tenant.value, input.dashboardId);
          if (!dash.ok) return dash;
          if (!dash.value) return fail(KernelErrors.notFound("dashboard", input.dashboardId));
          const layout = (dash.value.data["layout"] as { widgetId: string }[] | undefined) ?? [];
          const widgetsRes = [];
          for (const cell of layout) {
            const w = await deps.store.findById(tenant.value, cell.widgetId);
            if (!w.ok) return w;
            widgetsRes.push({ ...cell, widget: w.value });
          }
          return ok({ dashboard: dash.value, widgets: widgetsRes });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
