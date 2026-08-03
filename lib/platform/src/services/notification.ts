/**
 * DeltaOps Plataforma · Notification Service.
 * Canales, prioridades, destinatarios, preferencias, plantillas, agrupación,
 * cola con reintentos y dead letter (vía outbox del Kernel), auditoría.
 * NO envía correos reales: la entrega es infraestructura (evento + registro).
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { crudCommands, storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.notification";
export const NOTIFICATION_QUEUED = "platform.notification.queued";
export const NOTIFICATION_DELIVERED = "platform.notification.delivered";

const CHANNELS = ["inapp", "email", "sms", "push"] as const;
const PRIORITIES = ["low", "normal", "high", "critical"] as const;

const templates = crudCommands({
  service: SERVICE,
  recordType: "template",
  resource: "template",
  dataSchema: z.object({
    nombre: z.string().min(1),
    canal: z.enum(CHANNELS),
    asunto: z.string(),
    cuerpo: z.string(),
  }).passthrough(),
  createPermission: "platform.notification.manage",
  readPermission: "platform.notification.read",
});

const preferences = crudCommands({
  service: SERVICE,
  recordType: "preference",
  resource: "preference",
  dataSchema: z.object({
    destinatarioId: z.string(),
    canal: z.enum(CHANNELS),
    habilitado: z.boolean(),
  }).passthrough(),
  createPermission: "platform.notification.manage",
  readPermission: "platform.notification.read",
});

export function notificationService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Notificaciones multicanal con colas, reintentos y dead letter",
    capabilities: [
      {
        name: "notificar",
        permissions: ["platform.notification.send", "platform.notification.read"],
        description: "Encolar y consultar notificaciones",
      },
      {
        name: "gestionar-notificaciones",
        permissions: ["platform.notification.manage"],
        description: "Plantillas y preferencias",
      },
    ],
    permissions: [
      "platform.notification.send",
      "platform.notification.read",
      "platform.notification.manage",
    ],
    dependsOn: ["platform.config"],
    events: [NOTIFICATION_QUEUED, NOTIFICATION_DELIVERED],
    recordTypes: ["notification", "template", "preference"],
    configDefaults: { "max-reintentos": "3", "agrupacion-ventana-seg": "60" },
    commands: [
      templates.create, templates.update, templates.remove,
      preferences.create, preferences.update, preferences.remove,
      // Encolar notificación (respeta preferencias; agrupa por groupKey)
      (deps) => ({
        name: `${SERVICE}.queue`,
        inputSchema: z.object({
          destinatarios: z.array(z.string()).min(1),
          canal: z.enum(CHANNELS),
          prioridad: z.enum(PRIORITIES).default("normal"),
          plantillaId: z.string().optional(),
          asunto: z.string().min(1),
          cuerpo: z.string(),
          groupKey: z.string().optional(),
        }),
        authorization: { permissions: ["platform.notification.send"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;

          if (input.plantillaId) {
            const tpl = await deps.store.findById(tenant.value, input.plantillaId);
            if (!tpl.ok) return tpl;
            if (!tpl.value || tpl.value.recordType !== "template") {
              return fail(KernelErrors.notFound("template", input.plantillaId));
            }
          }

          // Preferencias: filtra destinatarios con el canal deshabilitado
          const prefs = await deps.store.list(tenant.value, {
            service: SERVICE,
            recordType: "preference",
            limit: 500,
          });
          if (!prefs.ok) return prefs;
          const bloqueados = new Set(
            prefs.value
              .filter((p) => p.data["canal"] === input.canal && p.data["habilitado"] === false)
              .map((p) => String(p.data["destinatarioId"])),
          );
          const efectivos = (input.destinatarios as string[]).filter((d: string) => !bloqueados.has(d));

          // Agrupación: si hay groupKey con notificación pendiente, se agrupa
          if (input.groupKey) {
            const abiertas = await deps.store.list(tenant.value, {
              service: SERVICE,
              recordType: "notification",
              status: "queued",
              limit: 500,
            });
            if (!abiertas.ok) return abiertas;
            const grupo = abiertas.value.find((n) => n.data["groupKey"] === input.groupKey);
            if (grupo) {
              const updated = await deps.store.update(uow, tenant.value, grupo.id, grupo.version, {
                data: {
                  ...grupo.data,
                  agrupadas: Number(grupo.data["agrupadas"] ?? 1) + 1,
                },
              });
              if (!updated.ok) return updated;
              return ok({ id: grupo.id, agrupada: true, destinatarios: efectivos.length });
            }
          }

          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "notification",
            status: "queued",
            data: {
              destinatarios: efectivos,
              canal: input.canal,
              prioridad: input.prioridad,
              asunto: input.asunto,
              cuerpo: input.cuerpo,
              plantillaId: input.plantillaId ?? null,
              groupKey: input.groupKey ?? null,
              agrupadas: 1,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "queue", id, {
            canal: input.canal,
            prioridad: input.prioridad,
          });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(NOTIFICATION_QUEUED, { tenantId: tenant.value, id }, ctx.correlationId),
          );
          return ok({ id, agrupada: false, destinatarios: efectivos.length });
        },
      }),
      // Marcar entregada (la entrega real ocurre fuera de este DGP)
      (deps) => ({
        name: `${SERVICE}.markDelivered`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.notification.send"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { queued: ["delivered", "failed"], failed: ["queued"] },
            to: "delivered",
            event: NOTIFICATION_DELIVERED,
          });
        },
      }),
    ],
    queries: [
      templates.get, templates.list, preferences.list,
      (deps) => ({
        name: `${SERVICE}.pending`,
        inputSchema: z.object({ limit: z.number().int().positive().max(500).optional() }),
        authorization: { permissions: ["platform.notification.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.list(tenant.value, {
            service: SERVICE,
            recordType: "notification",
            status: "queued",
            limit: input.limit,
          });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
