/**
 * DeltaOps Plataforma · Search Service.
 * Índice de documentos alimentado por comandos de indexación y por eventos —
 * NUNCA consulta módulos de negocio. Soporta búsqueda global, contextual,
 * reconstrucción y reindexación.
 */
import { z } from "zod";
import { ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";
import { COMMENT_CREATED } from "./comment";
import { TASK_CREATED } from "./task";

const SERVICE = "platform.search";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export function searchService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Índice de búsqueda global y contextual alimentado por eventos",
    capabilities: [
      {
        name: "buscar",
        permissions: ["platform.search.read"],
        description: "Búsqueda global y contextual",
      },
      {
        name: "indexar",
        permissions: ["platform.search.index"],
        description: "Indexar y reindexar documentos",
      },
    ],
    permissions: ["platform.search.read", "platform.search.index"],
    dependsOn: [],
    events: [],
    recordTypes: ["document"],
    configDefaults: { "max-resultados": "50" },
    commands: [
      (deps) => ({
        name: `${SERVICE}.indexDocument`,
        inputSchema: z.object({
          documentId: z.string().min(1),
          entityType: z.string().min(1),
          entityRef: z.string().min(1),
          titulo: z.string(),
          contenido: z.string(),
        }),
        authorization: { permissions: ["platform.search.index"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const id = `doc:${input.documentId}`;
          const tokens = tokenize(`${input.titulo} ${input.contenido}`);
          const existing = await deps.store.findById(tenant.value, id);
          if (!existing.ok) return existing;
          if (existing.value) {
            const updated = await deps.store.update(uow, tenant.value, id, existing.value.version, {
              data: { ...input, tokens },
            });
            if (!updated.ok) return updated;
          } else {
            const inserted = await deps.store.insert(uow, {
              id,
              tenantId: tenant.value,
              service: SERVICE,
              recordType: "document",
              status: "indexed",
              data: { ...input, tokens },
              createdBy: ctx.principal.id,
            });
            if (!inserted.ok) return inserted;
          }
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "index", id, {});
          if (!audited.ok) return audited;
          return ok({ id, tokens: tokens.length });
        },
      }),
      // Reconstrucción total del índice del tenant
      (deps) => ({
        name: `${SERVICE}.rebuild`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.search.index"] },
        async handle(ctx, _input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const docs = await deps.store.list(tenant.value, { service: SERVICE, recordType: "document", limit: 500 });
          if (!docs.ok) return docs;
          let reindexed = 0;
          for (const d of docs.value) {
            const tokens = tokenize(`${d.data["titulo"] ?? ""} ${d.data["contenido"] ?? ""}`);
            const updated = await deps.store.update(uow, tenant.value, d.id, d.version, {
              data: { ...d.data, tokens },
              status: "indexed",
            });
            if (!updated.ok) return updated;
            reindexed += 1;
          }
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "rebuild", null, { reindexed });
          if (!audited.ok) return audited;
          return ok({ reindexed });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.global`,
        inputSchema: z.object({ q: z.string().min(1), limit: z.number().int().positive().max(200).optional() }),
        authorization: { permissions: ["platform.search.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const docs = await deps.store.list(tenant.value, { service: SERVICE, recordType: "document", limit: 500 });
          if (!docs.ok) return docs;
          const qTokens = tokenize(input.q);
          const scored = docs.value
            .map((d) => {
              const tokens = new Set((d.data["tokens"] as string[] | undefined) ?? []);
              const score = qTokens.filter((t) => tokens.has(t)).length;
              return { d, score };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, input.limit ?? 50);
          return ok(scored.map((x) => ({ id: x.d.id, score: x.score, ...x.d.data })));
        },
      }),
      (deps) => ({
        name: `${SERVICE}.contextual`,
        inputSchema: z.object({ q: z.string().min(1), entityType: z.string().min(1) }),
        authorization: { permissions: ["platform.search.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const docs = await deps.store.list(tenant.value, { service: SERVICE, recordType: "document", limit: 500 });
          if (!docs.ok) return docs;
          const qTokens = tokenize(input.q);
          return ok(
            docs.value
              .filter((d) => d.data["entityType"] === input.entityType)
              .map((d) => {
                const tokens = new Set((d.data["tokens"] as string[] | undefined) ?? []);
                return { d, score: qTokens.filter((t) => tokens.has(t)).length };
              })
              .filter((x) => x.score > 0)
              .sort((a, b) => b.score - a.score)
              .map((x) => ({ id: x.d.id, score: x.score, ...x.d.data })),
          );
        },
      }),
    ],
    // Indexación automática desde eventos de plataforma (no de negocio)
    eventHandlers: [COMMENT_CREATED, TASK_CREATED].map((eventType) => ({
      eventType,
      handlerName: `autoindex:${eventType}`,
      handle: (deps) => async (event) => {
        const tenantId = String(event.payload["tenantId"] ?? "");
        if (!tenantId) return ok(undefined);
        const { KernelTokens, createExecutionContext, SYSTEM_PRINCIPAL } = await import("@workspace/kernel");
        const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
        const ctx = createExecutionContext({
          principal: SYSTEM_PRINCIPAL,
          correlationId: event.correlationId,
          metadata: { tenantId },
        });
        const result = await uowPort.execute(ctx, async (uow) => {
          const id = `doc:evt:${event.id}`;
          const existing = await deps.store.findById(tenantId, id);
          if (!existing.ok) return existing;
          if (existing.value) return ok(undefined); // idempotente
          return deps.store.insert(uow, {
            id,
            tenantId,
            service: SERVICE,
            recordType: "document",
            status: "indexed",
            data: {
              documentId: `evt:${event.id}`,
              entityType: event.type,
              entityRef: String(event.payload["entityRef"] ?? event.payload["id"] ?? ""),
              titulo: event.type,
              contenido: JSON.stringify(event.payload),
              tokens: tokenize(JSON.stringify(event.payload)),
            },
            createdBy: "system",
          });
        });
        return result.ok ? ok(undefined) : result;
      },
    })),
    healthCheck: storeHealthCheck(SERVICE),
  };
}
