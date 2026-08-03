/**
 * DeltaOps Plataforma · QR / Barcode / NFC Service.
 * Etiquetas de identificación con tipos, validaciones, resolución y acciones.
 * Solo infraestructura: la etiqueta apunta a un entityRef opaco.
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.qr";
export const TAG_RESOLVED = "platform.qr.resolved";

const TAG_TYPES = ["qr", "barcode", "nfc"] as const;

export function qrService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Etiquetas QR/Barcode/NFC con resolución, validación y acciones",
    capabilities: [
      {
        name: "etiquetar",
        permissions: ["platform.qr.write", "platform.qr.read"],
        description: "Emitir y resolver etiquetas",
      },
    ],
    permissions: ["platform.qr.write", "platform.qr.read"],
    dependsOn: [],
    events: [TAG_RESOLVED],
    recordTypes: ["tag"],
    configDefaults: { "prefijo-codigo": "DOP" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.issue`,
        inputSchema: z.object({
          tipo: z.enum(TAG_TYPES),
          entityRef: z.string().min(1),
          codigo: z.string().min(4).optional(),
          acciones: z.array(z.string()).default(["open"]),
        }),
        authorization: { permissions: ["platform.qr.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const prefijo = await deps.tenantConfig.get(tenant.value, `${SERVICE}.prefijo-codigo`);
          const codigo = input.codigo ?? `${prefijo.ok ? prefijo.value : "DOP"}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

          // Validación: código único por tenant
          const existentes = await deps.store.list(tenant.value, { service: SERVICE, recordType: "tag", limit: 500 });
          if (!existentes.ok) return existentes;
          if (existentes.value.some((t) => t.data["codigo"] === codigo)) {
            return fail(KernelErrors.conflict(`Código de etiqueta duplicado: ${codigo}`));
          }

          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "tag",
            status: "active",
            data: { tipo: input.tipo, codigo, entityRef: input.entityRef, acciones: input.acciones },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "issue", id, { codigo, tipo: input.tipo });
          if (!audited.ok) return audited;
          return ok({ id, codigo });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.revoke`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.qr.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const current = await deps.store.findById(tenant.value, input.id);
          if (!current.ok) return current;
          if (!current.value) return fail(KernelErrors.notFound("tag", input.id));
          const updated = await deps.store.update(uow, tenant.value, input.id, current.value.version, {
            status: "revoked",
          });
          if (!updated.ok) return updated;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "revoke", input.id, {});
          if (!audited.ok) return audited;
          return ok({ id: input.id });
        },
      }),
      // Resolución con registro de evento (para trazabilidad de escaneos)
      (deps) => ({
        name: `${SERVICE}.resolve`,
        inputSchema: z.object({ codigo: z.string().min(1) }),
        authorization: { permissions: ["platform.qr.read"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const tags = await deps.store.list(tenant.value, { service: SERVICE, recordType: "tag", limit: 500 });
          if (!tags.ok) return tags;
          const tag = tags.value.find((t) => t.data["codigo"] === input.codigo);
          if (!tag) return fail(KernelErrors.notFound("tag", input.codigo));
          if (tag.status !== "active") {
            return fail(KernelErrors.conflict(`Etiqueta ${input.codigo} en estado ${tag.status}`));
          }
          uow.registerEvent(
            createDomainEvent(
              TAG_RESOLVED,
              { tenantId: tenant.value, id: tag.id, codigo: input.codigo, entityRef: tag.data["entityRef"], actorId: ctx.principal.id },
              ctx.correlationId,
            ),
          );
          return ok({
            id: tag.id,
            tipo: tag.data["tipo"],
            entityRef: tag.data["entityRef"],
            acciones: tag.data["acciones"],
          });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.list`,
        inputSchema: z.object({ tipo: z.enum(TAG_TYPES).optional() }),
        authorization: { permissions: ["platform.qr.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const tags = await deps.store.list(tenant.value, { service: SERVICE, recordType: "tag", limit: 500 });
          if (!tags.ok) return tags;
          return ok(input.tipo ? tags.value.filter((t) => t.data["tipo"] === input.tipo) : tags.value);
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
