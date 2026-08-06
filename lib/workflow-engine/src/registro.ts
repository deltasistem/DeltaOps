/**
 * DGP-007 · Workflow Engine — Workflow Designer Runtime (definiciones como datos).
 *
 * Las definiciones de workflow se persisten COMO DATOS (recordType
 * `definicion-workflow`) vía RecordStorePort. Comandos:
 *   - <servicio>.definicion.publicar   (versión N incremental, inmutable)
 *   - <servicio>.definicion.activar    (marca la versión activa)
 *   - <servicio>.definicion.desactivar
 *   - <servicio>.definicion.migrar     (re-mapea estado de instancias N-1 → N)
 * y consultas obtener/listar/activa.
 *
 * Compatibilidad N/N-1: cada instancia recuerda su `_versionDefinicion`; las
 * instancias en N-1 siguen transicionando con SU versión (el motor resuelve la
 * definición por versión). Las instancias nuevas usan la ACTIVA.
 *
 * Validación estructural COMPLETA al publicar (estados alcanzables, transiciones
 * coherentes, sin vocabulario prohibido) reutilizando el patrón de
 * `validacion.ts` del Business Foundation.
 *
 * 100% neutro. Todo por Kernel (authorize, Zod, UoW, outbox, auditoría).
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
import { audit, tenantOf, type ServiceDeps } from "@workspace/platform";
import { RuntimeInstancia, VERSION_DEF_KEY } from "./instancia";
import { operacionesEstandarEfectivas, type DefinicionWorkflow } from "./definicion";
import { DefinicionAprobacionSchema } from "./aprobaciones";
import { validarWorkflow } from "./validacion";
import { RECORD_TYPE_INSTANCIA } from "./motor";

export const RECORD_TYPE_DEFINICION = "definicion-workflow";

export function nombresDefinicion(servicio: string): {
  publicar: string;
  activar: string;
  desactivar: string;
  migrar: string;
  obtener: string;
  listar: string;
  activa: string;
  publicada: string;
  activada: string;
  migrada: string;
} {
  const base = `${servicio}.definicion`;
  return {
    publicar: `${base}.publicar`,
    activar: `${base}.activar`,
    desactivar: `${base}.desactivar`,
    migrar: `${base}.migrar`,
    obtener: `${base}.obtener`,
    listar: `${base}.listar`,
    activa: `${base}.activa`,
    publicada: `${base}.publicada`,
    activada: `${base}.activada`,
    migrada: `${base}.migrada`,
  };
}

export function eventosDefinicion(servicio: string): readonly string[] {
  const n = nombresDefinicion(servicio);
  return [n.publicada, n.activada, n.migrada];
}

/** Mapa de migración: estado en N-1 → estado equivalente en N. */
export interface MapaMigracion {
  readonly [estadoOrigen: string]: string;
}

/* --------------------------- Zod de la definición ------------------------- */

const AccionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("emitirEvento"), evento: z.string().min(1) }),
  z.object({ tipo: z.literal("asignar"), a: z.string().min(1) }),
  z.object({ tipo: z.literal("escalar"), a: z.string().min(1), enMinutos: z.number().int().positive() }),
  z.object({
    tipo: z.literal("notificar"),
    a: z.string().min(1),
    asunto: z.string().min(1),
    cuerpo: z.string(),
    canal: z.enum(["inapp", "email", "sms", "push"]).optional(),
  }),
]);

const ExpresionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ campo: z.string(), operador: z.string(), valor: z.unknown().optional() }),
    z.object({ y: z.array(ExpresionSchema) }),
    z.object({ o: z.array(ExpresionSchema) }),
    z.object({ no: ExpresionSchema }),
  ]),
);

export const DefinicionWorkflowSchema = z.object({
  clave: z.string().min(1),
  etiqueta: z.string().min(1),
  estados: z
    .array(
      z.object({
        nombre: z.string().min(1),
        inicial: z.boolean().optional(),
        final: z.boolean().optional(),
        suspendible: z.boolean().optional(),
        etiqueta: z.string().optional(),
      }),
    )
    .min(1),
  transiciones: z.array(
    z.object({
      de: z.string().min(1),
      a: z.string().min(1),
      comando: z.string().min(1),
      permiso: z.string().optional(),
      capacidad: z.string().optional(),
      policy: z.string().optional(),
      precondiciones: z.array(ExpresionSchema).optional(),
      postcondiciones: z.array(ExpresionSchema).optional(),
      acciones: z.array(AccionSchema).optional(),
      // Aprobación inline que GOBIERNA la transición (gate) + destino de rechazo.
      aprobacion: DefinicionAprobacionSchema.optional(),
      rechazoA: z.string().optional(),
    }),
  ),
  operacionesEstandar: z.unknown().optional(),
});

/* -------------------------------- Helpers --------------------------------- */

interface RegistroDefinicion {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly data: Record<string, unknown>;
}

/** Devuelve la definición y su versión N a partir de un registro persistido. */
function extraerDefinicion(data: Record<string, unknown>): { def: DefinicionWorkflow; versionN: number } {
  return {
    def: data["definicion"] as DefinicionWorkflow,
    versionN: Number(data["versionN"]),
  };
}

/**
 * Resolutor de definición para inyectar en `crearComandosInstancia`. Busca la
 * definición ACTIVA del tenant o una versión concreta (compatibilidad N-1).
 */
export function crearResolverDefinicion(servicio: string) {
  return async (
    deps: ServiceDeps,
    tenantId: string,
    versionN?: number,
    clave?: string,
  ): Promise<Result<{ def: DefinicionWorkflow; version: number }, KernelError>> => {
    const rows = await deps.store.list(tenantId, {
      service: servicio,
      recordType: RECORD_TYPE_DEFINICION,
      limit: 500,
    });
    if (!rows.ok) return rows;
    const todos = rows.value.map((r) => ({
      versionN: Number(r.data["versionN"]),
      status: r.status,
      data: r.data,
    }));
    // Multiplexación de PROCESOS bajo un mismo servicio (p. ej. un módulo con
    // varias definiciones: solicitud/ordenCompra/recepción): si se indica `clave`
    // filtramos por ella para no confundir definiciones homónimas por versión.
    const registros = clave === undefined
      ? todos
      : todos.filter((r) => String(r.data["clave"] ?? (r.data["definicion"] as { clave?: string } | undefined)?.clave) === clave);
    if (registros.length === 0) {
      return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, clave ?? servicio));
    }
    if (versionN !== undefined) {
      const exacta = registros.find((r) => r.versionN === versionN);
      if (!exacta) return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, `v${versionN}`));
      return ok({ def: exacta.data["definicion"] as DefinicionWorkflow, version: exacta.versionN });
    }
    const activa = registros.find((r) => r.status === "activa");
    if (!activa) return fail(KernelErrors.conflict("No hay definición de workflow activa"));
    return ok({ def: activa.data["definicion"] as DefinicionWorkflow, version: activa.versionN });
  };
}

/* -------------------------- Fábrica de comandos --------------------------- */

export interface OpcionesRegistro {
  readonly servicio: string;
  readonly permisoDisenar: string;
  readonly permisoLeer: string;
}

export function crearComandosDefinicion(
  opts: OpcionesRegistro,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  const servicio = opts.servicio;
  const n = nombresDefinicion(servicio);

  async function listarDefiniciones(deps: ServiceDeps, tenantId: string): Promise<Result<RegistroDefinicion[], KernelError>> {
    const rows = await deps.store.list(tenantId, {
      service: servicio,
      recordType: RECORD_TYPE_DEFINICION,
      limit: 500,
    });
    if (!rows.ok) return rows;
    return ok(rows.value.map((r) => ({ id: r.id, version: r.version, status: r.status, data: r.data })));
  }

  /* ------------------------------ publicar ------------------------------- */
  const publicar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.publicar,
    inputSchema: z.object({
      id: z.string(),
      opId: z.string().optional(),
      definicion: DefinicionWorkflowSchema,
    }),
    authorization: { permissions: [opts.permisoDisenar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      // Idempotencia por id de cliente.
      const previo = await deps.store.findById(tenant.value, input.id);
      if (!previo.ok) return previo;
      if (previo.value) {
        return ok({
          id: input.id,
          versionN: Number(previo.value.data["versionN"]),
          idempotente: true,
        });
      }

      const def = input.definicion as DefinicionWorkflow;

      // Validación estructural completa (incluye vocabulario prohibido).
      const val = validarWorkflow(def);
      if (!val.valido) {
        return fail(
          KernelErrors.validation(`Definición de workflow inválida (DGP-007)`, {
            errores: val.errores,
          }),
        );
      }

      // Versión N incremental por clave.
      const existentes = await listarDefiniciones(deps, tenant.value);
      if (!existentes.ok) return existentes;
      const mismaClave = existentes.value.filter((r) => extraerDefinicion(r.data).def.clave === def.clave);
      const versionN = mismaClave.reduce((max, r) => Math.max(max, Number(r.data["versionN"])), 0) + 1;

      const inserted = await deps.store.insert(uow, {
        id: input.id,
        tenantId: tenant.value,
        service: servicio,
        recordType: RECORD_TYPE_DEFINICION,
        status: "publicada", // inmutable; se activa aparte
        data: { clave: def.clave, versionN, definicion: def, ...(input.opId ? { _opId: input.opId } : {}) },
        createdBy: ctx.principal.id,
      });
      if (!inserted.ok) return inserted;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "definicion:publicar", input.id, {
        clave: def.clave,
        versionN,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(
        createDomainEvent(
          n.publicada,
          { tenantId: tenant.value, id: input.id, clave: def.clave, versionN, actorId: ctx.principal.id },
          ctx.correlationId,
        ),
      );
      return ok({ id: input.id, versionN, clave: def.clave, idempotente: false });
    },
  });

  /* ------------------------------ activar -------------------------------- */
  const activar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.activar,
    inputSchema: z.object({ id: z.string(), version: z.number().int().positive(), opId: z.string().optional() }),
    authorization: { permissions: [opts.permisoDisenar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const objetivo = await deps.store.findById(tenant.value, input.id);
      if (!objetivo.ok) return objetivo;
      if (!objetivo.value) return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, input.id));
      if (objetivo.value.status === "activa") {
        return ok({ id: input.id, versionN: Number(objetivo.value.data["versionN"]), idempotente: true });
      }
      const clave = String(objetivo.value.data["clave"]);

      // Desactiva la activa anterior de la MISMA clave (misma UoW).
      const todas = await listarDefiniciones(deps, tenant.value);
      if (!todas.ok) return todas;
      for (const r of todas.value) {
        if (r.status === "activa" && String(r.data["clave"]) === clave) {
          const off = await deps.store.update(uow, tenant.value, r.id, r.version, { status: "inactiva" });
          if (!off.ok) return off;
        }
      }
      const on = await deps.store.update(uow, tenant.value, input.id, input.version, { status: "activa" });
      if (!on.ok) return on;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "definicion:activar", input.id, {
        clave,
        versionN: Number(objetivo.value.data["versionN"]),
      });
      if (!audited.ok) return audited;
      uow.registerEvent(
        createDomainEvent(
          n.activada,
          { tenantId: tenant.value, id: input.id, clave, versionN: Number(objetivo.value.data["versionN"]), actorId: ctx.principal.id },
          ctx.correlationId,
        ),
      );
      return ok({ id: input.id, versionN: Number(objetivo.value.data["versionN"]), idempotente: false });
    },
  });

  /* ----------------------------- desactivar ------------------------------ */
  const desactivar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.desactivar,
    inputSchema: z.object({ id: z.string(), version: z.number().int().positive(), opId: z.string().optional() }),
    authorization: { permissions: [opts.permisoDisenar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const objetivo = await deps.store.findById(tenant.value, input.id);
      if (!objetivo.ok) return objetivo;
      if (!objetivo.value) return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, input.id));
      if (objetivo.value.status !== "activa") {
        return ok({ id: input.id, idempotente: true });
      }
      const off = await deps.store.update(uow, tenant.value, input.id, input.version, { status: "inactiva" });
      if (!off.ok) return off;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "definicion:desactivar", input.id, {});
      if (!audited.ok) return audited;
      return ok({ id: input.id, idempotente: false });
    },
  });

  /* ------------------------------- migrar -------------------------------- */
  const migrar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.migrar,
    inputSchema: z.object({
      instanciaId: z.string(),
      version: z.number().int().positive(),
      versionDestino: z.number().int().positive(),
      mapa: z.record(z.string(), z.string()),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoDisenar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      // Definición destino debe existir.
      const defs = await listarDefiniciones(deps, tenant.value);
      if (!defs.ok) return defs;
      const destino = defs.value.find((r) => Number(r.data["versionN"]) === input.versionDestino);
      if (!destino) return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, `v${input.versionDestino}`));
      const defDestino = destino.data["definicion"] as DefinicionWorkflow;
      const runtime = new RuntimeInstancia(defDestino);

      // Instancia a migrar.
      const inst = await deps.store.findById(tenant.value, input.instanciaId);
      if (!inst.ok) return inst;
      if (!inst.value || inst.value.recordType !== RECORD_TYPE_INSTANCIA) {
        return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.instanciaId));
      }

      const estadoActual = inst.value.status;
      const estadoNuevo = input.mapa[estadoActual] ?? estadoActual;
      if (!runtime.estados().includes(estadoNuevo)) {
        return fail(
          KernelErrors.conflict(
            `El estado "${estadoActual}" no tiene equivalente válido en la versión ${input.versionDestino}`,
          ),
        );
      }
      const data = { ...inst.value.data, [VERSION_DEF_KEY]: input.versionDestino };
      const updated = await deps.store.update(uow, tenant.value, input.instanciaId, input.version, {
        status: estadoNuevo,
        data,
      });
      if (!updated.ok) return updated;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "definicion:migrar", input.instanciaId, {
        de: estadoActual,
        a: estadoNuevo,
        versionDestino: input.versionDestino,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(
        createDomainEvent(
          n.migrada,
          {
            tenantId: tenant.value,
            id: input.instanciaId,
            estadoAnterior: estadoActual,
            estado: estadoNuevo,
            versionDestino: input.versionDestino,
            actorId: ctx.principal.id,
          },
          ctx.correlationId,
        ),
      );
      return ok({ id: input.instanciaId, estado: estadoNuevo, versionDestino: input.versionDestino, idempotente: false });
    },
  });

  return [publicar, activar, desactivar, migrar];
}

/* -------------------------- Fábrica de consultas -------------------------- */

export function crearQueriesDefinicion(
  opts: OpcionesRegistro,
): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  const servicio = opts.servicio;
  const n = nombresDefinicion(servicio);

  const obtener = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: n.obtener,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [opts.permisoLeer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const found = await deps.store.findById(tenant.value, input.id);
      if (!found.ok) return found;
      if (!found.value || found.value.recordType !== RECORD_TYPE_DEFINICION) {
        return fail(KernelErrors.notFound(RECORD_TYPE_DEFINICION, input.id));
      }
      return ok(found.value);
    },
  });

  const listar = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: n.listar,
    inputSchema: z.object({ clave: z.string().optional() }),
    authorization: { permissions: [opts.permisoLeer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const rows = await deps.store.list(tenant.value, {
        service: servicio,
        recordType: RECORD_TYPE_DEFINICION,
        limit: 500,
      });
      if (!rows.ok) return rows;
      const filtradas = input.clave
        ? rows.value.filter((r) => String(r.data["clave"]) === input.clave)
        : rows.value;
      return ok(filtradas);
    },
  });

  const activa = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: n.activa,
    inputSchema: z.object({ clave: z.string().optional() }),
    authorization: { permissions: [opts.permisoLeer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const rows = await deps.store.list(tenant.value, {
        service: servicio,
        recordType: RECORD_TYPE_DEFINICION,
        status: "activa",
        limit: 500,
      });
      if (!rows.ok) return rows;
      const activa = input.clave
        ? rows.value.find((r) => String(r.data["clave"]) === input.clave)
        : rows.value[0];
      if (!activa) return fail(KernelErrors.conflict("No hay definición activa"));
      return ok(activa);
    },
  });

  return [obtener, listar, activa];
}

/** Consumidor de `operacionesEstandarEfectivas` para evitar import sin uso en tipos. */
export function estandarDe(def: DefinicionWorkflow): ReturnType<typeof operacionesEstandarEfectivas> {
  return operacionesEstandarEfectivas(def);
}
