/**
 * DeltaOps Plataforma · Attachment Service.
 * Metadatos, versiones, hashes, estados, permisos, URLs firmadas y retención.
 * Los binarios NUNCA salen del servicio: solo metadatos + URLs firmadas.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck, transition } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.attachment";
export const ATTACHMENT_REGISTERED = "platform.attachment.registered";
export const ATTACHMENT_DELETED = "platform.attachment.deleted";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function attachmentService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Metadatos de adjuntos con versiones, hashes, URLs firmadas y retención",
    capabilities: [
      {
        name: "adjuntar",
        permissions: ["platform.attachment.write", "platform.attachment.read"],
        description: "Registrar y consultar adjuntos",
      },
    ],
    permissions: ["platform.attachment.write", "platform.attachment.read"],
    dependsOn: ["platform.config"],
    events: [ATTACHMENT_REGISTERED, ATTACHMENT_DELETED],
    recordTypes: ["attachment"],
    configDefaults: { "retencion-dias": "365", "url-firmada-ttl-seg": "300" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.register`,
        inputSchema: z.object({
          entityRef: z.string().min(1),
          nombreArchivo: z.string().min(1),
          mimeType: z.string().min(1),
          tamanoBytes: z.number().int().nonnegative(),
          hashSha256: z.string().length(64),
          attachmentId: z.string().optional(),
        }),
        authorization: { permissions: ["platform.attachment.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;

          // Nueva versión si attachmentId existe; si no, versión 1
          let fileVersion = 1;
          if (input.attachmentId) {
            const prev = await deps.store.findById(tenant.value, input.attachmentId);
            if (!prev.ok) return prev;
            if (!prev.value) return fail(KernelErrors.notFound("attachment", input.attachmentId));
            fileVersion = Number(prev.value.data["fileVersion"] ?? 1) + 1;
            const superseded = await deps.store.update(uow, tenant.value, input.attachmentId, prev.value.version, {
              status: "superseded",
            });
            if (!superseded.ok) return superseded;
          }

          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "attachment",
            status: "active",
            data: {
              entityRef: input.entityRef,
              nombreArchivo: input.nombreArchivo,
              mimeType: input.mimeType,
              tamanoBytes: input.tamanoBytes,
              hashSha256: input.hashSha256,
              fileVersion,
              previousId: input.attachmentId ?? null,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "register", id, {
            hash: input.hashSha256,
            fileVersion,
          });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(ATTACHMENT_REGISTERED, { tenantId: tenant.value, id, entityRef: input.entityRef }, ctx.correlationId),
          );
          return ok({ id, fileVersion });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.delete`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.attachment.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const deleted = await deps.store.softDelete(uow, tenant.value, input.id);
          if (!deleted.ok) return deleted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "delete", input.id, {});
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(ATTACHMENT_DELETED, { tenantId: tenant.value, id: input.id }, ctx.correlationId),
          );
          return ok({ id: input.id });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.applyRetention`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.attachment.write"] },
        async handle(ctx, input, uow) {
          return transition(deps, ctx, uow, {
            service: SERVICE,
            id: input.id,
            allowed: { active: ["retained"], superseded: ["retained"] },
            to: "retained",
          });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.get`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.attachment.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.store.findById(tenant.value, input.id);
        },
      }),
      (deps) => ({
        name: `${SERVICE}.byEntity`,
        inputSchema: z.object({ entityRef: z.string() }),
        authorization: { permissions: ["platform.attachment.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "attachment", limit: 500 });
          if (!rows.ok) return rows;
          return ok(rows.value.filter((r) => r.data["entityRef"] === input.entityRef));
        },
      }),
      // URL firmada (HMAC + expiración) — infraestructura, sin binarios
      (deps) => ({
        name: `${SERVICE}.signedUrl`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.attachment.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const record = await deps.store.findById(tenant.value, input.id);
          if (!record.ok) return record;
          if (!record.value) return fail(KernelErrors.notFound("attachment", input.id));
          const ttl = await deps.tenantConfig.get(tenant.value, `${SERVICE}.url-firmada-ttl-seg`);
          const seconds = ttl.ok ? Number(ttl.value) : 300;
          const expiresAt = Date.now() + seconds * 1000;
          const secret = process.env.SESSION_SECRET;
          if (!secret) {
            return fail(
              KernelErrors.infrastructure(
                "SESSION_SECRET no configurado: no se pueden emitir URLs firmadas",
              ),
            );
          }
          const payload = `${tenant.value}:${input.id}:${expiresAt}`;
          return ok({
            url: `/api/deltaops/platform/attachments/${input.id}?tenant=${tenant.value}&expires=${expiresAt}&signature=${sign(secret, payload)}`,
            expiresAt,
          });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
