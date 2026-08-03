/**
 * DGP-006 · Business Foundation Framework — Generic Approval Runtime.
 *
 * Flujo de aprobación declarativo y neutro. Una `DefinicionAprobacion` describe
 * los pasos ({nombre, permiso, minAprobaciones}); el runtime deriva:
 *   - Comando  `<servicio>.<entidad>.solicitar-aprobacion`
 *   - Comando  `<servicio>.<entidad>.aprobar`
 *   - Comando  `<servicio>.<entidad>.rechazar`
 *   - Eventos  `<prefijo>.aprobacion-solicitada|aprobada|rechazada|paso-aprobado`
 *
 * Estado en `data._aprobacion { paso, aprobaciones:[{actorId,fecha}], estado }`.
 * Guard: no auto-aprobación (actor ≠ solicitante) salvo que el TenantConfig
 * `<servicio>.aprobacion-permitir-autor` === "true".
 *
 * Todo por Kernel (authorize, Zod, UoW, outbox, auditoría) y RecordStorePort.
 * Offline First vía `opId` (_opIds). El progreso multipaso avanza cuando el
 * paso alcanza `minAprobaciones` (default 1).
 */
import { z } from "zod";
import {
  fail,
  KernelErrors,
  KernelTokens,
  type CommandDefinition,
} from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type { DefinicionEntidad } from "../nucleo/definicion";
import type { RegistroEntidad } from "../nucleo/entidad";
import {
  auditarOperacion,
  baseOperaciones,
  conOpId,
  configBooleano,
  emitirEvento,
  eventoOperacion,
  ok,
  opIdAplicado,
  payloadOperacion,
  repoDe,
} from "./comun";

/** Clave-metadato con el estado del flujo de aprobación. */
export const APROBACION_KEY = "_aprobacion";

/** Un paso del flujo declarativo de aprobación. */
export interface PasoAprobacion {
  readonly nombre: string;
  /** Permiso exigido para aprobar/rechazar este paso. */
  readonly permiso: string;
  /** Aprobaciones necesarias para completar el paso (default 1). */
  readonly minAprobaciones?: number;
}

/** Definición declarativa del flujo de aprobación de una entidad. */
export interface DefinicionAprobacion {
  readonly pasos: readonly PasoAprobacion[];
}

export type EstadoAprobacion = "pendiente" | "aprobada" | "rechazada";

export interface Aprobacion {
  readonly actorId: string;
  readonly fecha: string;
}

/** Estructura persistida en `data._aprobacion`. */
export interface EstadoFlujoAprobacion {
  readonly paso: number;
  readonly solicitante: string;
  readonly aprobaciones: readonly Aprobacion[];
  readonly estado: EstadoAprobacion;
}

/** Clave (SIN prefijo) del default de auto-aprobación del autor. */
export const CONFIG_PERMITIR_AUTOR = "aprobacion-permitir-autor";
/** Valor por defecto: NO se permite auto-aprobación. */
export const PERMITIR_AUTOR_DEFAULT = "false";

/** Clave de configuración (YA prefijada) para permitir auto-aprobación del autor. */
export function clavePermitirAutor(def: DefinicionEntidad): string {
  return `${def.servicio}.${CONFIG_PERMITIR_AUTOR}`;
}

/** Capacidad dedicada de aprobación de una entidad (agrupa permisos de pasos). */
export function capacidadAprobar(
  def: DefinicionEntidad,
  flujoDef: DefinicionAprobacion,
): { name: string; permissions: readonly string[]; description: string } {
  const permisos = [...new Set([def.permisos.editar, ...flujoDef.pasos.map((p) => p.permiso)])];
  return {
    name: `aprobar-${def.nombre}`,
    permissions: permisos,
    description: `Flujo de aprobación de ${def.etiqueta}`,
  };
}

/** Permisos que introduce el flujo de aprobación (uno por paso). */
export function permisosAprobacion(flujoDef: DefinicionAprobacion): readonly string[] {
  return [...new Set(flujoDef.pasos.map((p) => p.permiso))];
}

function flujoDe(data: Record<string, unknown>): EstadoFlujoAprobacion | undefined {
  const raw = data[APROBACION_KEY];
  if (!raw || typeof raw !== "object") return undefined;
  return raw as EstadoFlujoAprobacion;
}

/** Nombres canónicos de las operaciones de aprobación de una entidad. */
export function nombresAprobacion(def: DefinicionEntidad): {
  solicitar: string;
  aprobar: string;
  rechazar: string;
} {
  const base = baseOperaciones(def);
  return {
    solicitar: `${base}.solicitar-aprobacion`,
    aprobar: `${base}.aprobar`,
    rechazar: `${base}.rechazar`,
  };
}

/** Nombres de los eventos de aprobación de una entidad. */
export function eventosAprobacion(def: DefinicionEntidad): readonly string[] {
  return [
    eventoOperacion(def, "aprobacion-solicitada"),
    eventoOperacion(def, "aprobacion-aprobada"),
    eventoOperacion(def, "aprobacion-rechazada"),
    eventoOperacion(def, "aprobacion-paso-aprobado"),
  ];
}

function guardarFlujo(
  registro: RegistroEntidad,
  flujo: EstadoFlujoAprobacion,
  opId?: string,
): RegistroEntidad {
  const data = conOpId({ ...registro.data, [APROBACION_KEY]: flujo }, opId);
  return { ...registro, data, version: registro.version + 1, updatedAt: new Date() };
}

/**
 * Genera los comandos de aprobación (solicitar/aprobar/rechazar) de una
 * entidad a partir de su flujo declarativo. Devuelve fábricas
 * `(deps) => CommandDefinition` para `extras.comandos`.
 */
export function crearComandosAprobacion(
  def: DefinicionEntidad,
  flujoDef: DefinicionAprobacion,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  if (flujoDef.pasos.length === 0) {
    throw new Error(`DefinicionAprobacion de ${def.nombre} requiere al menos un paso`);
  }
  const nombres = nombresAprobacion(def);
  const eventos = {
    solicitada: eventoOperacion(def, "aprobacion-solicitada"),
    aprobada: eventoOperacion(def, "aprobacion-aprobada"),
    rechazada: eventoOperacion(def, "aprobacion-rechazada"),
    pasoAprobado: eventoOperacion(def, "aprobacion-paso-aprobado"),
  };

  // Permiso base para solicitar: el de edición de la entidad.
  const solicitar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.solicitar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps, def);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, aprobacion: flujoDe(actual.value.data), idempotente: true });
      }
      const existente = flujoDe(actual.value.data);
      if (existente && existente.estado === "pendiente") {
        return fail(KernelErrors.conflict(`Ya existe una aprobación pendiente para ${input.id}`));
      }

      const flujo: EstadoFlujoAprobacion = {
        paso: 0,
        solicitante: ctx.principal.id,
        aprobaciones: [],
        estado: "pendiente",
      };
      const registro = guardarFlujo(actual.value, flujo, input.opId);
      const updated = await repo.actualizar(uow, registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "solicitar-aprobacion", input.id, {
        paso: flujoDef.pasos[0]!.nombre,
      });
      if (!audited.ok) return audited;
      emitirEvento(uow, ctx, eventos.solicitada, payloadOperacion(def, updated.value, ctx.principal.id, {
        aprobacion: flujo,
        pasoNombre: flujoDef.pasos[0]!.nombre,
      }));
      return ok({ id: input.id, version: updated.value.version, aprobacion: flujo, idempotente: false });
    },
  });

  const aprobar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.aprobar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    // Autorización base: edición. El permiso del paso se comprueba dentro.
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps, def);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, aprobacion: flujoDe(actual.value.data), idempotente: true });
      }
      const flujo = flujoDe(actual.value.data);
      if (!flujo || flujo.estado !== "pendiente") {
        return fail(KernelErrors.conflict(`No hay aprobación pendiente para ${input.id}`));
      }
      const paso = flujoDef.pasos[flujo.paso];
      if (!paso) return fail(KernelErrors.conflict(`Paso de aprobación inexistente: ${flujo.paso}`));

      // Permiso específico del paso.
      const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
      const authz = authorization.authorize(ctx, { permissions: [paso.permiso] });
      if (!authz.ok) return authz;

      // Guard: no auto-aprobación salvo config del tenant.
      const permitirAutor = await configBooleano(deps, tenant.value, clavePermitirAutor(def));
      if (!permitirAutor && ctx.principal.id === flujo.solicitante) {
        return fail(KernelErrors.forbidden("auto-aprobacion: el autor no puede aprobar su propia solicitud"));
      }
      // No aprobar dos veces el mismo paso el mismo actor.
      if (flujo.aprobaciones.some((a) => a.actorId === ctx.principal.id)) {
        return fail(KernelErrors.conflict("El actor ya aprobó este paso"));
      }

      const aprobaciones = [...flujo.aprobaciones, { actorId: ctx.principal.id, fecha: new Date().toISOString() }];
      const min = paso.minAprobaciones ?? 1;
      const pasoCompleto = aprobaciones.length >= min;
      const esUltimoPaso = flujo.paso >= flujoDef.pasos.length - 1;

      let siguiente: EstadoFlujoAprobacion;
      if (pasoCompleto && esUltimoPaso) {
        siguiente = { ...flujo, aprobaciones, estado: "aprobada" };
      } else if (pasoCompleto) {
        siguiente = { ...flujo, paso: flujo.paso + 1, aprobaciones: [], estado: "pendiente" };
      } else {
        siguiente = { ...flujo, aprobaciones };
      }

      const registro = guardarFlujo(actual.value, siguiente, input.opId);
      const updated = await repo.actualizar(uow, registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "aprobar", input.id, {
        paso: paso.nombre,
        estado: siguiente.estado,
      });
      if (!audited.ok) return audited;

      const base = payloadOperacion(def, updated.value, ctx.principal.id, { aprobacion: siguiente, pasoNombre: paso.nombre });
      if (siguiente.estado === "aprobada") {
        emitirEvento(uow, ctx, eventos.aprobada, base);
      } else if (pasoCompleto) {
        emitirEvento(uow, ctx, eventos.pasoAprobado, base);
      }
      return ok({ id: input.id, version: updated.value.version, aprobacion: siguiente, idempotente: false });
    },
  });

  const rechazar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.rechazar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      motivo: z.string().optional(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = repoDe(deps, def);
      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, aprobacion: flujoDe(actual.value.data), idempotente: true });
      }
      const flujo = flujoDe(actual.value.data);
      if (!flujo || flujo.estado !== "pendiente") {
        return fail(KernelErrors.conflict(`No hay aprobación pendiente para ${input.id}`));
      }
      const paso = flujoDef.pasos[flujo.paso];
      if (!paso) return fail(KernelErrors.conflict(`Paso de aprobación inexistente: ${flujo.paso}`));

      const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
      const authz = authorization.authorize(ctx, { permissions: [paso.permiso] });
      if (!authz.ok) return authz;

      const permitirAutor = await configBooleano(deps, tenant.value, clavePermitirAutor(def));
      if (!permitirAutor && ctx.principal.id === flujo.solicitante) {
        return fail(KernelErrors.forbidden("auto-aprobacion: el autor no puede rechazar su propia solicitud"));
      }

      const siguiente: EstadoFlujoAprobacion = { ...flujo, estado: "rechazada" };
      const registro = guardarFlujo(actual.value, siguiente, input.opId);
      const updated = await repo.actualizar(uow, registro, input.version);
      if (!updated.ok) return updated;
      const audited = await auditarOperacion(deps, uow, ctx, def, tenant.value, "rechazar", input.id, {
        paso: paso.nombre,
        motivo: input.motivo ?? "",
      });
      if (!audited.ok) return audited;
      emitirEvento(uow, ctx, eventos.rechazada, payloadOperacion(def, updated.value, ctx.principal.id, {
        aprobacion: siguiente,
        pasoNombre: paso.nombre,
        motivo: input.motivo ?? "",
      }));
      return ok({ id: input.id, version: updated.value.version, aprobacion: siguiente, idempotente: false });
    },
  });

  return [solicitar, aprobar, rechazar];
}
