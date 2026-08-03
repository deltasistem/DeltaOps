/**
 * DeltaOps Plataforma · Helpers comunes de servicios.
 * Fabricadores de comandos/consultas CRUD sobre el Record Store con
 * multitenancy, auditoría, eventos y concurrencia optimista incluidos.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  ok,
  type CommandDefinition,
  type KernelError,
  type QueryDefinition,
  type Result,
} from "@workspace/kernel";
import { audit } from "./audit";
import type { ServiceDeps } from "./service";
import { tenantOf, type PlatformRecord } from "./types";

/** Health check estándar: el store del servicio responde a un list. */
export function storeHealthCheck(service: string) {
  return (deps: ServiceDeps) => async () => {
    const probe = await deps.store.list("__health__", { service, limit: 1 });
    return probe.ok
      ? { healthy: true, detail: "record store operativo" }
      : { healthy: false, detail: probe.error.message };
  };
}

export interface CrudOptions {
  service: string;
  recordType: string;
  /** Nombre corto del recurso para comandos: `${service}.${resource}.create` */
  resource: string;
  dataSchema: z.ZodType<Record<string, unknown>>;
  createPermission: string;
  readPermission: string;
  initialStatus?: string;
  /** Evento emitido al crear (opcional). */
  createdEvent?: string;
  updatedEvent?: string;
  deletedEvent?: string;
}

/** Genera comandos create/update/delete y consultas get/list estándar. */
export function crudCommands(opts: CrudOptions) {
  const base = `${opts.service}.${opts.resource}`;

  const create = (deps: ServiceDeps): CommandDefinition<any, PlatformRecord> => ({
    name: `${base}.create`,
    inputSchema: z.object({ id: z.string().uuid().optional(), data: opts.dataSchema }),
    authorization: { permissions: [opts.createPermission] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const id = input.id ?? crypto.randomUUID();
      const inserted = await deps.store.insert(uow, {
        id,
        tenantId: tenant.value,
        service: opts.service,
        recordType: opts.recordType,
        status: opts.initialStatus ?? "active",
        data: input.data,
        createdBy: ctx.principal.id,
      });
      if (!inserted.ok) return inserted;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, opts.service, `${opts.resource}.create`, id, {});
      if (!audited.ok) return audited;
      if (opts.createdEvent) {
        uow.registerEvent(
          createDomainEvent(opts.createdEvent, { tenantId: tenant.value, id, recordType: opts.recordType }, ctx.correlationId),
        );
      }
      return ok(inserted.value);
    },
  });

  const update = (deps: ServiceDeps): CommandDefinition<any, PlatformRecord> => ({
    name: `${base}.update`,
    inputSchema: z.object({
      id: z.string(),
      expectedVersion: z.number().int().positive(),
      data: opts.dataSchema.optional(),
      status: z.string().optional(),
    }),
    authorization: { permissions: [opts.createPermission] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const updated = await deps.store.update(uow, tenant.value, input.id, input.expectedVersion, {
        data: input.data,
        status: input.status,
      });
      if (!updated.ok) return updated;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, opts.service, `${opts.resource}.update`, input.id, {});
      if (!audited.ok) return audited;
      if (opts.updatedEvent) {
        uow.registerEvent(
          createDomainEvent(opts.updatedEvent, { tenantId: tenant.value, id: input.id }, ctx.correlationId),
        );
      }
      return ok(updated.value);
    },
  });

  const remove = (deps: ServiceDeps): CommandDefinition<any, { id: string }> => ({
    name: `${base}.delete`,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [opts.createPermission] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const deleted = await deps.store.softDelete(uow, tenant.value, input.id);
      if (!deleted.ok) return deleted;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, opts.service, `${opts.resource}.delete`, input.id, {});
      if (!audited.ok) return audited;
      if (opts.deletedEvent) {
        uow.registerEvent(
          createDomainEvent(opts.deletedEvent, { tenantId: tenant.value, id: input.id }, ctx.correlationId),
        );
      }
      return ok({ id: input.id });
    },
  });

  const get = (deps: ServiceDeps): QueryDefinition<any, PlatformRecord | null> => ({
    name: `${base}.get`,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [opts.readPermission] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return deps.store.findById(tenant.value, input.id);
    },
  });

  const list = (deps: ServiceDeps): QueryDefinition<any, PlatformRecord[]> => ({
    name: `${base}.list`,
    inputSchema: z.object({
      status: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    authorization: { permissions: [opts.readPermission] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return deps.store.list(tenant.value, {
        service: opts.service,
        recordType: opts.recordType,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });

  return { create, update, remove, get, list };
}

/** Transición de estado con validación de máquina de estados. */
export async function transition(
  deps: ServiceDeps,
  ctx: import("@workspace/kernel").ExecutionContext,
  uow: import("@workspace/kernel").UnitOfWork,
  opts: {
    service: string;
    id: string;
    allowed: Record<string, readonly string[]>;
    to: string;
    event?: string;
    detail?: Record<string, unknown>;
  },
): Promise<Result<PlatformRecord, KernelError>> {
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return tenant;
  const current = await deps.store.findById(tenant.value, opts.id);
  if (!current.ok) return current;
  if (!current.value) return fail(KernelErrors.notFound("record", opts.id));
  const from = current.value.status;
  if (!(opts.allowed[from] ?? []).includes(opts.to)) {
    return fail(
      KernelErrors.conflict(`Transición inválida ${from} → ${opts.to} en ${opts.service}`),
    );
  }
  const updated = await deps.store.update(uow, tenant.value, opts.id, current.value.version, {
    status: opts.to,
  });
  if (!updated.ok) return updated;
  const audited = await audit(deps.audit, uow, ctx, tenant.value, opts.service, `transition:${from}->${opts.to}`, opts.id, opts.detail ?? {});
  if (!audited.ok) return audited;
  if (opts.event) {
    uow.registerEvent(
      createDomainEvent(opts.event, { tenantId: tenant.value, id: opts.id, from, to: opts.to }, ctx.correlationId),
    );
  }
  return ok(updated.value);
}
