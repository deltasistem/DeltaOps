/**
 * DGP-006 · Business Foundation Framework — Generic CRUD/Command/Query Runtime.
 *
 * Fábricas crearComandosCrud(def) y crearQueriesCrud(def) que derivan los
 * CommandDefinition/QueryDefinition de una entidad a partir de su definición:
 *   - <servicio>.<entidad>.crear | editar | eliminar | transicionar
 *   - <servicio>.<entidad>.obtener | listar
 *
 * Todo pasa por el Kernel: authorize (permisos/capacidades de la definición),
 * inputSchema Zod (derivado de los campos), UoW, outbox y auditoría implícita.
 *
 * Offline First: los comandos aceptan `opId` de cliente. La idempotencia se
 * resuelve por recibo a nivel de contrato: los opId aplicados se guardan en un
 * metadato del propio registro (`data._opIds`), de modo que un reintento con el
 * mismo opId devuelve éxito idempotente sin duplicar efectos ni SQL nuevo.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  KernelTokens,
  ok,
  type CommandDefinition,
  type ExecutionContext,
  type QueryDefinition,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  camposAZod,
  nombresOperaciones,
  type DefinicionEntidad,
} from "./definicion";
import { RuntimeEntidad, type RegistroEntidad } from "./entidad";
import { RepositorioGenerico } from "./repositorio";

const OP_IDS_KEY = "_opIds";
const MAX_OP_IDS = 50;

function opIdsDe(data: Record<string, unknown>): string[] {
  const raw = data[OP_IDS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}

function conOpId(data: Record<string, unknown>, opId?: string): Record<string, unknown> {
  if (!opId) return data;
  const previos = opIdsDe(data);
  if (previos.includes(opId)) return data;
  return { ...data, [OP_IDS_KEY]: [...previos, opId].slice(-MAX_OP_IDS) };
}

/** Genera los comandos CRUD (crear/editar/eliminar/transicionar) de una entidad. */
export function crearComandosCrud(
  def: DefinicionEntidad,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  const runtime = new RuntimeEntidad(def);
  const ops = nombresOperaciones(def);
  const servicio = def.servicio;
  const dataSchema = camposAZod(def.campos);

  const repoDe = (deps: ServiceDeps) => new RepositorioGenerico(deps.store, def);

  const auditar = (
    deps: ServiceDeps,
    uow: UnitOfWork,
    ctx: ExecutionContext,
    tenantId: string,
    accion: string,
    id: string,
    detalle: Record<string, unknown>,
  ) => audit(deps.audit, uow, ctx, tenantId, servicio, accion, id, detalle);

  // ---- crear ----
  const crear = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: ops.crear,
    inputSchema: z.object({
      id: z.string().optional(),
      opId: z.string().optional(),
      data: dataSchema,
    }),
    authorization: { permissions: [def.permisos.crear] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const id = input.id ?? crypto.randomUUID();

      // Idempotencia offline por id de cliente.
      if (input.id) {
        const previo = await repoDe(deps).porId(tenant.value, id);
        if (!previo.ok) return previo;
        if (previo.value) {
          return ok({ id, version: previo.value.version, estado: previo.value.estado, idempotente: true });
        }
      }

      const cambio = runtime.crear({
        id,
        tenantId: tenant.value,
        data: conOpId(input.data, input.opId),
        actorId: ctx.principal.id,
        ahora: new Date(),
      });
      if (!cambio.ok) return cambio;

      const repo = repoDe(deps);
      const inserted = await repo.insertar(uow, cambio.value.registro);
      if (!inserted.ok) return inserted;
      const audited = await auditar(deps, uow, ctx, tenant.value, "crear", id, {
        estado: inserted.value.estado,
        version: inserted.value.version,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(createDomainEvent(cambio.value.evento.tipo, cambio.value.evento.payload, ctx.correlationId));
      return ok({ id, version: inserted.value.version, estado: inserted.value.estado, idempotente: false });
    },
  });

  // ---- editar ----
  const editar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: ops.editar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      opId: z.string().optional(),
      data: dataSchema.partial(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      // Idempotencia offline por opId (recibo en el propio registro).
      if (input.opId && opIdsDe(actual.value.data).includes(input.opId)) {
        return ok({ id: input.id, version: actual.value.version, estado: actual.value.estado, idempotente: true });
      }

      const patch = conOpId(input.data as Record<string, unknown>, input.opId);
      const cambio = runtime.actualizar(actual.value, patch, ctx.principal.id, new Date());
      if (!cambio.ok) return cambio;
      const updated = await repo.actualizar(uow, cambio.value.registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditar(deps, uow, ctx, tenant.value, "editar", input.id, {
        version: updated.value.version,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(createDomainEvent(cambio.value.evento.tipo, cambio.value.evento.payload, ctx.correlationId));
      return ok({ id: input.id, version: updated.value.version, estado: updated.value.estado, idempotente: false });
    },
  });

  // ---- eliminar (borrado suave) ----
  const eliminar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: ops.eliminar,
    inputSchema: z.object({ id: z.string(), opId: z.string().optional() }),
    authorization: { permissions: [def.permisos.eliminar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) {
        // Idempotencia: eliminar algo ya inexistente es un no-op exitoso.
        return ok({ id: input.id, eliminado: true, idempotente: true });
      }
      const deleted = await repo.eliminarSuave(uow, tenant.value, input.id);
      if (!deleted.ok) return deleted;
      const audited = await auditar(deps, uow, ctx, tenant.value, "eliminar", input.id, {});
      if (!audited.ok) return audited;
      const evento = runtime.eventoEliminacion(actual.value, ctx.principal.id);
      uow.registerEvent(createDomainEvent(evento.tipo, evento.payload, ctx.correlationId));
      return ok({ id: input.id, eliminado: true, idempotente: false });
    },
  });

  // ---- transicionar (solo si hay máquina de estados) ----
  const comandos: ((deps: ServiceDeps) => CommandDefinition<any, any>)[] = [crear, editar, eliminar];

  if (def.maquinaEstados) {
    const permisosPorComando = new Map<string, string | undefined>();
    for (const t of def.maquinaEstados.transiciones) {
      if (!permisosPorComando.has(t.comando)) permisosPorComando.set(t.comando, t.permiso);
    }
    const transicionar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
      name: ops.transicionar,
      inputSchema: z.object({
        id: z.string(),
        version: z.number().int().positive(),
        comando: z.string().min(1),
        opId: z.string().optional(),
      }),
      // Autorización base: permiso de edición. El permiso específico de la
      // transición se comprueba dentro del handler (depende del comando).
      authorization: { permissions: [def.permisos.editar] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const repo = repoDe(deps);
        const actual = await repo.porId(tenant.value, input.id);
        if (!actual.ok) return actual;
        if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

        if (input.opId && opIdsDe(actual.value.data).includes(input.opId)) {
          return ok({ id: input.id, version: actual.value.version, estado: actual.value.estado, idempotente: true });
        }

        // Permiso específico de la transición (si la definición lo exige).
        const permisoTransicion = permisosPorComando.get(input.comando);
        if (permisoTransicion) {
          const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
          const authz = authorization.authorize(ctx, { permissions: [permisoTransicion] });
          if (!authz.ok) return authz;
        }

        const conRecibo: RegistroEntidad = input.opId
          ? { ...actual.value, data: conOpId(actual.value.data, input.opId) }
          : actual.value;
        const cambio = runtime.transicionar(conRecibo, input.comando, ctx.principal.id, new Date());
        if (!cambio.ok) return cambio;
        const updated = await repo.actualizar(uow, cambio.value.registro, input.version);
        if (!updated.ok) return updated;
        const audited = await auditar(deps, uow, ctx, tenant.value, `transicionar:${input.comando}`, input.id, {
          estado: updated.value.estado,
          version: updated.value.version,
        });
        if (!audited.ok) return audited;
        uow.registerEvent(createDomainEvent(cambio.value.evento.tipo, cambio.value.evento.payload, ctx.correlationId));
        return ok({ id: input.id, estado: updated.value.estado, version: updated.value.version, idempotente: false });
      },
    });
    comandos.push(transicionar);
  }

  return comandos;
}

/** Genera las consultas CRUD (obtener/listar) de una entidad. */
export function crearQueriesCrud(
  def: DefinicionEntidad,
): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  const ops = nombresOperaciones(def);
  const repoDe = (deps: ServiceDeps) => new RepositorioGenerico(deps.store, def);

  const obtener = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: ops.obtener,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const found = await repoDe(deps).porId(tenant.value, input.id);
      if (!found.ok) return found;
      if (!found.value) return fail(KernelErrors.notFound(def.nombre, input.id));
      return ok(found.value);
    },
  });

  const listar = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: ops.listar,
    inputSchema: z.object({
      estado: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return repoDe(deps).listar(tenant.value, {
        estado: input.estado,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });

  return [obtener, listar];
}
