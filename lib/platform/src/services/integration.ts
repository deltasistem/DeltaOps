/**
 * DeltaOps Plataforma · Integration Service.
 * Conectores, webhooks, credenciales (solo referencias — NUNCA secretos en
 * claro), reintentos, estados y dead letter (vía outbox del Kernel).
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.integration";
export const WEBHOOK_DISPATCH_REQUESTED = "platform.integration.webhook-dispatch";

const connectors = crudCommands({
  service: SERVICE,
  recordType: "connector",
  resource: "connector",
  dataSchema: z.object({
    nombre: z.string().min(1),
    tipo: z.string().min(1),
    baseUrl: z.string().url().optional(),
    /** Referencia a credencial gestionada externamente (nunca el secreto). */
    credencialRef: z.string().default(""),
    opciones: z.record(z.string(), z.unknown()).default({}),
  }).passthrough(),
  createPermission: "platform.integration.manage",
  readPermission: "platform.integration.read",
  initialStatus: "disabled",
});

export function integrationService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Conectores y webhooks con reintentos, estados y dead letter",
    capabilities: [
      {
        name: "integrar",
        permissions: ["platform.integration.manage", "platform.integration.read"],
        description: "Administrar conectores y webhooks",
      },
    ],
    permissions: ["platform.integration.manage", "platform.integration.read"],
    dependsOn: ["platform.config"],
    events: [WEBHOOK_DISPATCH_REQUESTED],
    recordTypes: ["connector", "webhook"],
    configDefaults: { "webhook-max-reintentos": "3" },
    commands: [
      connectors.create, connectors.update, connectors.remove,
      (deps) => ({
        name: `${SERVICE}.connector.enable`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.integration.manage"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { disabled: ["enabled"], error: ["enabled"] },
            to: "enabled",
          });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.connector.disable`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.integration.manage"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { enabled: ["disabled"], error: ["disabled"] },
            to: "disabled",
          });
        },
      }),
      // Registrar webhook saliente sobre un conector habilitado
      (deps) => ({
        name: `${SERVICE}.webhook.register`,
        inputSchema: z.object({
          connectorId: z.string(),
          eventoTipo: z.string().min(1),
          targetPath: z.string().min(1),
        }),
        authorization: { permissions: ["platform.integration.manage"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const conn = await deps.store.findById(tenant.value, input.connectorId);
          if (!conn.ok) return conn;
          if (!conn.value || conn.value.recordType !== "connector") {
            return fail(KernelErrors.notFound("connector", input.connectorId));
          }
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "webhook",
            status: "active",
            data: {
              connectorId: input.connectorId,
              eventoTipo: input.eventoTipo,
              targetPath: input.targetPath,
              entregas: 0,
              fallos: 0,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "webhook.register", id, {
            eventoTipo: input.eventoTipo,
          });
          if (!audited.ok) return audited;
          return ok({ id });
        },
      }),
      // Encolar despacho de webhook: el envío real viaja por outbox
      // (reintentos + dead letter del Kernel)
      (deps) => ({
        name: `${SERVICE}.webhook.dispatch`,
        inputSchema: z.object({ webhookId: z.string(), payload: z.record(z.string(), z.unknown()).default({}) }),
        authorization: { permissions: ["platform.integration.manage"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const wh = await deps.store.findById(tenant.value, input.webhookId);
          if (!wh.ok) return wh;
          if (!wh.value || wh.value.recordType !== "webhook") {
            return fail(KernelErrors.notFound("webhook", input.webhookId));
          }
          if (wh.value.status !== "active") {
            return fail(KernelErrors.conflict(`Webhook ${input.webhookId} en estado ${wh.value.status}`));
          }
          uow.registerEvent(
            createDomainEvent(
              WEBHOOK_DISPATCH_REQUESTED,
              { tenantId: tenant.value, webhookId: input.webhookId, payload: input.payload },
              ctx.correlationId,
            ),
          );
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "webhook.dispatch", input.webhookId, {});
          if (!audited.ok) return audited;
          return ok({ webhookId: input.webhookId, encolado: true });
        },
      }),
    ],
    queries: [
      connectors.get, connectors.list,
      (deps) => ({
        name: `${SERVICE}.webhooks`,
        inputSchema: z.object({ connectorId: z.string().optional() }),
        authorization: { permissions: ["platform.integration.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "webhook", limit: 500 });
          if (!rows.ok) return rows;
          return ok(
            input.connectorId
              ? rows.value.filter((w) => w.data["connectorId"] === input.connectorId)
              : rows.value,
          );
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
