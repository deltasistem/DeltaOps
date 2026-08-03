/**
 * DeltaOps Plataforma · Comment Service.
 * Comentarios, respuestas (hilos), menciones, edición, eliminación lógica,
 * auditoría y proyección hacia el Timeline mediante eventos.
 */
import { z } from "zod";
import { createDomainEvent, fail, KernelErrors, ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.comment";
export const COMMENT_CREATED = "platform.comment.created";
export const COMMENT_EDITED = "platform.comment.edited";
export const COMMENT_DELETED = "platform.comment.deleted";

const MENTION_RE = /@([\w.-]+)/g;

export function commentService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Comentarios con hilos, menciones, edición y borrado lógico",
    capabilities: [
      {
        name: "comentar",
        permissions: ["platform.comment.write", "platform.comment.read"],
        description: "Crear y consultar comentarios",
      },
    ],
    permissions: ["platform.comment.write", "platform.comment.read"],
    dependsOn: ["platform.notification"],
    events: [COMMENT_CREATED, COMMENT_EDITED, COMMENT_DELETED],
    recordTypes: ["comment"],
    configDefaults: { "max-longitud": "5000" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.create`,
        inputSchema: z.object({
          entityRef: z.string().min(1),
          texto: z.string().min(1),
          parentId: z.string().optional(),
        }),
        authorization: { permissions: ["platform.comment.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          if (input.parentId) {
            const parent = await deps.store.findById(tenant.value, input.parentId);
            if (!parent.ok) return parent;
            if (!parent.value) return fail(KernelErrors.notFound("comment", input.parentId));
          }
          const menciones = [...input.texto.matchAll(MENTION_RE)].map((m) => m[1]!);
          const id = crypto.randomUUID();
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant.value,
            service: SERVICE,
            recordType: "comment",
            status: "active",
            data: {
              entityRef: input.entityRef,
              texto: input.texto,
              parentId: input.parentId ?? null,
              menciones,
              editado: false,
            },
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "create", id, { menciones });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(
              COMMENT_CREATED,
              { tenantId: tenant.value, id, entityRef: input.entityRef, actorId: ctx.principal.id, menciones },
              ctx.correlationId,
            ),
          );
          return ok({ id, menciones });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.edit`,
        inputSchema: z.object({
          id: z.string(),
          expectedVersion: z.number().int().positive(),
          texto: z.string().min(1),
        }),
        authorization: { permissions: ["platform.comment.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const current = await deps.store.findById(tenant.value, input.id);
          if (!current.ok) return current;
          if (!current.value) return fail(KernelErrors.notFound("comment", input.id));
          if (current.value.createdBy !== ctx.principal.id && !ctx.principal.permisos.includes("*")) {
            return fail(KernelErrors.forbidden("Solo el autor puede editar su comentario"));
          }
          const updated = await deps.store.update(uow, tenant.value, input.id, input.expectedVersion, {
            data: { ...current.value.data, texto: input.texto, editado: true },
          });
          if (!updated.ok) return updated;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "edit", input.id, {});
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(COMMENT_EDITED, { tenantId: tenant.value, id: input.id, actorId: ctx.principal.id }, ctx.correlationId),
          );
          return ok(updated.value);
        },
      }),
      (deps) => ({
        name: `${SERVICE}.delete`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["platform.comment.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const deleted = await deps.store.softDelete(uow, tenant.value, input.id);
          if (!deleted.ok) return deleted;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "delete", input.id, {});
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(COMMENT_DELETED, { tenantId: tenant.value, id: input.id, actorId: ctx.principal.id }, ctx.correlationId),
          );
          return ok({ id: input.id });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.byEntity`,
        inputSchema: z.object({ entityRef: z.string() }),
        authorization: { permissions: ["platform.comment.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "comment", limit: 500 });
          if (!rows.ok) return rows;
          return ok(rows.value.filter((r) => r.data["entityRef"] === input.entityRef));
        },
      }),
      (deps) => ({
        name: `${SERVICE}.thread`,
        inputSchema: z.object({ parentId: z.string() }),
        authorization: { permissions: ["platform.comment.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rows = await deps.store.list(tenant.value, { service: SERVICE, recordType: "comment", limit: 500 });
          if (!rows.ok) return rows;
          return ok(rows.value.filter((r) => r.data["parentId"] === input.parentId));
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
