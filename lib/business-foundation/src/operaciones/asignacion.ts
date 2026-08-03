/**
 * DGP-006 · Business Foundation Framework — Generic Assignment Runtime.
 *
 * Asigna/desasigna un principal (usuarioId) a CUALQUIER registro de una
 * entidad, sin ningún concepto de negocio. Deriva de la definición:
 *   - Comando  `<servicio>.<entidad>.asignar`     → añade a `data._asignados`
 *   - Comando  `<servicio>.<entidad>.desasignar`  → quita de `data._asignados`
 *   - Consulta `<servicio>.<entidad>.asignaciones`→ lista los asignados
 *   - Eventos  `<prefijo>.asignada` / `<prefijo>.desasignada`
 *
 * Permiso dedicado `asignar` de la entidad (PermisosEntidad admite claves
 * libres). Todo pasa por el Kernel (authorize, Zod, UoW, outbox, auditoría) y
 * el RecordStorePort (multitenancy + RLS). Offline First vía `opId` (_opIds).
 */
import { z } from "zod";
import {
  fail,
  KernelErrors,
  type CommandDefinition,
  type QueryDefinition,
} from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type { DefinicionEntidad } from "../nucleo/definicion";
import type { RegistroEntidad } from "../nucleo/entidad";
import {
  auditarOperacion,
  baseOperaciones,
  conOpId,
  emitirEvento,
  eventoOperacion,
  ok,
  opIdAplicado,
  payloadOperacion,
  repoDe,
} from "./comun";

/** Clave-metadato con la lista de principals asignados. */
export const ASIGNADOS_KEY = "_asignados";

/** Permiso efectivo para asignar (dedicado o, si falta, el de edición). */
export function permisoAsignar(def: DefinicionEntidad): string {
  return def.permisos["asignar"] ?? def.permisos.editar;
}

/** Capacidad dedicada de asignación de una entidad. */
export function capacidadAsignar(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `asignar-${def.nombre}`,
    permissions: [permisoAsignar(def), def.permisos.leer],
    description: `Asignar/desasignar principals a ${def.etiqueta}`,
  };
}

function asignadosDe(data: Record<string, unknown>): string[] {
  const raw = data[ASIGNADOS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Nombres canónicos de las operaciones de asignación de una entidad. */
export function nombresAsignacion(def: DefinicionEntidad): {
  asignar: string;
  desasignar: string;
  asignaciones: string;
} {
  const base = baseOperaciones(def);
  return {
    asignar: `${base}.asignar`,
    desasignar: `${base}.desasignar`,
    asignaciones: `${base}.asignaciones`,
  };
}

/**
 * Genera los comandos de asignación (asignar/desasignar) de una entidad.
 * Devuelve fábricas `(deps) => CommandDefinition` para `extras.comandos`.
 */
export function crearComandosAsignacion(
  def: DefinicionEntidad,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  const nombres = nombresAsignacion(def);
  const permiso = permisoAsignar(def);
  const eventos = {
    asignada: eventoOperacion(def, "asignada"),
    desasignada: eventoOperacion(def, "desasignada"),
  };

  const asignar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.asignar,
    inputSchema: z.object({
      id: z.string(),
      usuarioId: z.string().min(1),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [permiso] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps, def);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      // Idempotencia offline por opId (recibo en el propio registro).
      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, asignados: asignadosDe(actual.value.data), idempotente: true });
      }

      const previos = asignadosDe(actual.value.data);
      // Idempotencia semántica: asignar a alguien ya asignado no duplica.
      if (previos.includes(input.usuarioId)) {
        return ok({ id: input.id, version: actual.value.version, asignados: previos, idempotente: true });
      }

      const nuevos = [...previos, input.usuarioId];
      const data = conOpId({ ...actual.value.data, [ASIGNADOS_KEY]: nuevos }, input.opId);
      const registro: RegistroEntidad = { ...actual.value, data, version: actual.value.version + 1, updatedAt: new Date() };
      const updated = await repo.actualizar(uow, registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "asignar", input.id, {
        usuarioId: input.usuarioId,
      });
      if (!audited.ok) return audited;
      emitirEvento(uow, ctx, eventos.asignada, payloadOperacion(def, updated.value, ctx.principal.id, {
        usuarioId: input.usuarioId,
        asignados: nuevos,
      }));
      return ok({ id: input.id, version: updated.value.version, asignados: nuevos, idempotente: false });
    },
  });

  const desasignar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.desasignar,
    inputSchema: z.object({
      id: z.string(),
      usuarioId: z.string().min(1),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [permiso] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps, def);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, asignados: asignadosDe(actual.value.data), idempotente: true });
      }

      const previos = asignadosDe(actual.value.data);
      // Idempotencia semántica: desasignar a alguien no asignado es no-op.
      if (!previos.includes(input.usuarioId)) {
        return ok({ id: input.id, version: actual.value.version, asignados: previos, idempotente: true });
      }

      const nuevos = previos.filter((u) => u !== input.usuarioId);
      const data = conOpId({ ...actual.value.data, [ASIGNADOS_KEY]: nuevos }, input.opId);
      const registro: RegistroEntidad = { ...actual.value, data, version: actual.value.version + 1, updatedAt: new Date() };
      const updated = await repo.actualizar(uow, registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "desasignar", input.id, {
        usuarioId: input.usuarioId,
      });
      if (!audited.ok) return audited;
      emitirEvento(uow, ctx, eventos.desasignada, payloadOperacion(def, updated.value, ctx.principal.id, {
        usuarioId: input.usuarioId,
        asignados: nuevos,
      }));
      return ok({ id: input.id, version: updated.value.version, asignados: nuevos, idempotente: false });
    },
  });

  return [asignar, desasignar];
}

/** Genera la consulta `.asignaciones` (lista de principals de un registro). */
export function crearQueriesAsignacion(
  def: DefinicionEntidad,
): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  const nombres = nombresAsignacion(def);
  const asignaciones = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombres.asignaciones,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const found = await repoDe(deps, def).porId(tenant.value, input.id);
      if (!found.ok) return found;
      if (!found.value) return fail(KernelErrors.notFound(def.nombre, input.id));
      return ok({ id: input.id, asignados: asignadosDe(found.value.data) });
    },
  });
  return [asignaciones];
}

/** Nombres de los eventos de asignación de una entidad. */
export function eventosAsignacion(def: DefinicionEntidad): readonly string[] {
  return [eventoOperacion(def, "asignada"), eventoOperacion(def, "desasignada")];
}
