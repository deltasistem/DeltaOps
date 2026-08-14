/**
 * DELTAOPS LITE-05 · Runtime de composición del BUCLE «Hallazgo → OT → Cierre».
 *
 * NO es un módulo de dominio nuevo (§21): es una superficie de COMPOSICIÓN
 * (mismo espíritu que `preoperacional-runtime` / `correctivo-runtime`) que:
 *   - Reutiliza el motor de Órdenes (OT) y el orquestador idempotente de
 *     Correctivo (`generar-orden-correctiva`) SIN duplicar entidades ni estados.
 *   - Persiste ÚNICAMENTE el estado adicional que la Dirección aprobó (L5-4): el
 *     DESCARTE registrado de un hallazgo («No requiere mantenimiento»), como un
 *     recordType en el Record Store genérico `deltaops.platform_records` (patrón
 *     LITE-04, SIN migración). Sello inmutable con usuario canónico + tiempo de
 *     servidor + motivo opcional; REVERSIBLE con acción igualmente auditada;
 *     idempotente por `opId`.
 *
 * El VÍNCULO hallazgo→OT NO vive aquí: vive en Correctivo
 * (`cor_generacion_materializaciones`) vía la solicitud con `origen=preoperacional`
 * + `fuenteId=hallazgoId` y un `solicitudId` DETERMINISTA derivado del hallazgo
 * (L5-1, unicidad por composición sin estructura nueva). Este runtime sólo añade
 * el sub-estado «descartado», que el dominio de Órdenes/Correctivo no representa.
 */
import { pool } from "@workspace/db";
import {
  createDomainEvent,
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import {
  audit,
  createPlatformRuntime,
  officialServices,
  storeHealthCheck,
  type PlatformRuntime,
  type PlatformServiceDefinition,
} from "@workspace/platform";
import { z } from "zod";
import { DELTAOPS_TENANT } from "./reference-runtime";

/* --------------------------- Servicio de plataforma ---------------------- */

export const SERVICIO_HALLAZGO = "modulo.hallazgo";
const RECORD_DESCARTE = "hallazgo-descarte";

export const PERMISOS_HALLAZGO = {
  read: `${SERVICIO_HALLAZGO}.read`,
  write: `${SERVICIO_HALLAZGO}.write`,
} as const;

const HALLAZGO_DESCARTADO = `${SERVICIO_HALLAZGO}.descartado`;
const HALLAZGO_REABIERTO = `${SERVICIO_HALLAZGO}.reabierto`;

/** Estados del descarte (histórico conservado; jamás borrado físico). */
const ESTADO_DESCARTADO = "DESCARTADO";
const ESTADO_REABIERTO = "REABIERTO";

/**
 * Servicio de plataforma del descarte de hallazgo. Sólo gobierna la
 * PERSISTENCIA del descarte/reversión (identidad canónica de sesión + motivo +
 * tiempo de servidor). La ORQUESTACIÓN del bucle (validar procedencia, generar
 * OT vía Correctivo) vive en la capa HTTP de composición, que jamás anida
 * comandos entre runtimes.
 */
export function hallazgoService(): PlatformServiceDefinition {
  return {
    name: SERVICIO_HALLAZGO,
    version: "1.0.0",
    description: "Descarte registrado y reversible de hallazgos preoperacionales (no requieren OT)",
    capabilities: [
      {
        name: "operar-hallazgo",
        permissions: [PERMISOS_HALLAZGO.write, PERMISOS_HALLAZGO.read],
        description: "Descartar/reabrir hallazgos y consultar su estado",
      },
    ],
    permissions: [PERMISOS_HALLAZGO.read, PERMISOS_HALLAZGO.write],
    dependsOn: [],
    events: [HALLAZGO_DESCARTADO, HALLAZGO_REABIERTO],
    recordTypes: [RECORD_DESCARTE],
    configDefaults: {},
    commands: [
      /* --------------------- descartar hallazgo (idempotente) -------------- */
      (deps) => ({
        name: `${SERVICIO_HALLAZGO}.descartar`,
        inputSchema: z.object({
          // id determinista del descarte = `descarte:<hallazgoId>`.
          id: z.string().min(1),
          opId: z.string().min(1),
          hallazgoId: z.string().min(1),
          ejecucionId: z.string().min(1),
          itemClave: z.string().min(1),
          activoId: z.string().min(1),
          motivo: z.string().max(2000).optional(),
          descartadoAt: z.string().min(1),
        }),
        authorization: { permissions: [PERMISOS_HALLAZGO.write] },
        async handle(ctx, input, uow) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const existente = await deps.store.findById(tenant, input.id);
          if (!existente.ok) return existente;

          if (existente.value) {
            const opIds = (existente.value.data["_opIds"] as string[] | undefined) ?? [];
            if (opIds.includes(input.opId)) {
              return ok({ id: input.id, estado: existente.value.status, idempotente: true });
            }
            // Ya existe registro: re-descartar (tras una reversión) es una
            // transición explícita, no un no-op. Sólo se permite si NO está ya
            // descartado (exclusión: un descarte activo no se re-descarta).
            if (existente.value.status === ESTADO_DESCARTADO) {
              return fail(KernelErrors.conflict(`El hallazgo ya está descartado: ${input.hallazgoId}`));
            }
            const historial = [
              ...((existente.value.data["historial"] as unknown[] | undefined) ?? []),
              { accion: "descartar", por: ctx.principal.id, at: input.descartadoAt, motivo: input.motivo ?? null },
            ];
            const opIdsNuevos = [...opIds, input.opId].slice(-50);
            const patch = {
              ...existente.value.data,
              motivo: input.motivo ?? null,
              descartadoPor: ctx.principal.id,
              descartadoAt: input.descartadoAt,
              historial,
              _opIds: opIdsNuevos,
            };
            const upd = await deps.store.update(uow, tenant, input.id, existente.value.version, {
              status: ESTADO_DESCARTADO,
              data: patch,
            });
            if (!upd.ok) return upd;
            const audited = await audit(deps.audit, uow, ctx, tenant, SERVICIO_HALLAZGO, "descartar", input.id, { hallazgoId: input.hallazgoId });
            if (!audited.ok) return audited;
            uow.registerEvent(createDomainEvent(HALLAZGO_DESCARTADO, { tenantId: tenant, id: input.id, hallazgoId: input.hallazgoId, activoId: input.activoId, actorId: ctx.principal.id }, ctx.correlationId));
            return ok({ id: input.id, estado: ESTADO_DESCARTADO, idempotente: false });
          }

          const data = {
            hallazgoId: input.hallazgoId,
            ejecucionId: input.ejecucionId,
            itemClave: input.itemClave,
            activoId: input.activoId,
            motivo: input.motivo ?? null,
            descartadoPor: ctx.principal.id,
            descartadoAt: input.descartadoAt,
            historial: [{ accion: "descartar", por: ctx.principal.id, at: input.descartadoAt, motivo: input.motivo ?? null }],
            _opIds: [input.opId],
          };
          const inserted = await deps.store.insert(uow, {
            id: input.id,
            tenantId: tenant,
            service: SERVICIO_HALLAZGO,
            recordType: RECORD_DESCARTE,
            status: ESTADO_DESCARTADO,
            data,
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant, SERVICIO_HALLAZGO, "descartar", input.id, { hallazgoId: input.hallazgoId, activoId: input.activoId });
          if (!audited.ok) return audited;
          uow.registerEvent(createDomainEvent(HALLAZGO_DESCARTADO, { tenantId: tenant, id: input.id, hallazgoId: input.hallazgoId, activoId: input.activoId, actorId: ctx.principal.id }, ctx.correlationId));
          return ok({ id: input.id, estado: ESTADO_DESCARTADO, idempotente: false });
        },
      }),
      /* ---------------------- reabrir hallazgo (idempotente) --------------- */
      (deps) => ({
        name: `${SERVICIO_HALLAZGO}.reabrir`,
        inputSchema: z.object({
          id: z.string().min(1),
          opId: z.string().min(1),
          hallazgoId: z.string().min(1),
          motivo: z.string().max(2000).optional(),
          reabiertoAt: z.string().min(1),
        }),
        authorization: { permissions: [PERMISOS_HALLAZGO.write] },
        async handle(ctx, input, uow) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const existente = await deps.store.findById(tenant, input.id);
          if (!existente.ok) return existente;
          if (!existente.value) return fail(KernelErrors.notFound(RECORD_DESCARTE, input.id));

          const opIds = (existente.value.data["_opIds"] as string[] | undefined) ?? [];
          if (opIds.includes(input.opId)) {
            return ok({ id: input.id, estado: existente.value.status, idempotente: true });
          }
          if (existente.value.status === ESTADO_REABIERTO) {
            // Ya reabierto: converge (no vuelve a reabrir).
            return ok({ id: input.id, estado: ESTADO_REABIERTO, idempotente: true });
          }
          const historial = [
            ...((existente.value.data["historial"] as unknown[] | undefined) ?? []),
            { accion: "reabrir", por: ctx.principal.id, at: input.reabiertoAt, motivo: input.motivo ?? null },
          ];
          const patch = {
            ...existente.value.data,
            reabiertoPor: ctx.principal.id,
            reabiertoAt: input.reabiertoAt,
            historial,
            _opIds: [...opIds, input.opId].slice(-50),
          };
          const upd = await deps.store.update(uow, tenant, input.id, existente.value.version, {
            status: ESTADO_REABIERTO,
            data: patch,
          });
          if (!upd.ok) return upd;
          const audited = await audit(deps.audit, uow, ctx, tenant, SERVICIO_HALLAZGO, "reabrir", input.id, { hallazgoId: input.hallazgoId });
          if (!audited.ok) return audited;
          uow.registerEvent(createDomainEvent(HALLAZGO_REABIERTO, { tenantId: tenant, id: input.id, hallazgoId: input.hallazgoId, actorId: ctx.principal.id }, ctx.correlationId));
          return ok({ id: input.id, estado: ESTADO_REABIERTO, idempotente: false });
        },
      }),
    ],
    queries: [
      /* ------------------------------ obtener ------------------------------- */
      (deps) => ({
        name: `${SERVICIO_HALLAZGO}.obtener`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [PERMISOS_HALLAZGO.read] },
        async handle(ctx, input) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const r = await deps.store.findById(tenant, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound(RECORD_DESCARTE, input.id));
          return ok(r.value);
        },
      }),
      /* ------------------------------- listar ------------------------------- */
      (deps) => ({
        name: `${SERVICIO_HALLAZGO}.listar`,
        inputSchema: z.object({
          activoId: z.string().optional(),
          estado: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
        authorization: { permissions: [PERMISOS_HALLAZGO.read] },
        async handle(ctx, input) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          // `activoId` se empuja al almacén (igualdad JSONB) para no depender de
          // una ventana global de `limit` filas cuando el volumen crece; `estado`
          // se mapea al filtro de estado nativo del almacén.
          const rows = await deps.store.list(tenant, {
            service: SERVICIO_HALLAZGO,
            recordType: RECORD_DESCARTE,
            ...(input.activoId ? { dataEquals: { activoId: input.activoId } } : {}),
            ...(input.estado ? { status: input.estado } : {}),
            limit: input.limit ?? 500,
          });
          if (!rows.ok) return rows;
          return ok(rows.value);
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICIO_HALLAZGO),
  };
}

/* ------------------------------- Runtime --------------------------------- */

export interface HallazgoRuntime {
  readonly platform: PlatformRuntime;
}

let runtime: HallazgoRuntime | null = null;

/** Runtime singleton del descarte de hallazgo (Record Store PostgreSQL real). */
export function hallazgoRuntime(): HallazgoRuntime {
  if (!runtime) {
    const platform = createPlatformRuntime({
      pool,
      extraServices: [hallazgoService()],
    });
    runtime = { platform };
  }
  return runtime;
}

/** Runtime aislado del descarte (pruebas). Sin `pool` usa adaptadores Fake. */
export function crearHallazgoRuntime(
  opts: Parameters<typeof createPlatformRuntime>[0] = {},
): HallazgoRuntime {
  const platform = createPlatformRuntime({
    ...opts,
    extraServices: [hallazgoService()],
  });
  return { platform };
}

/* ------------------------------ Contexto --------------------------------- */

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];

/**
 * Principal del hallazgo por rol CANÓNICO (fail-closed). CONSULTA jamás escribe:
 * sólo lectura. No introduce roles nuevos ni cambia RBAC estructural: mapea los
 * 6 roles existentes a lectura/escritura de esta superficie (mismo criterio que
 * el preoperacional que origina los hallazgos).
 */
export function principalHallazgo(userId: string, rol: string): Principal {
  const esConsulta = rol === "CONSULTA" || rol === "lector";
  if (esConsulta) {
    return {
      id: userId,
      rol,
      permisos: [PERMISOS_HALLAZGO.read, "platform.config.read"],
      capacidades: [],
    };
  }
  return {
    id: userId,
    rol,
    permisos: [...PLATFORM_PERMISSIONS, PERMISOS_HALLAZGO.read, PERMISOS_HALLAZGO.write],
    capacidades: ["operar-hallazgo"],
  };
}

export function contextForHallazgo(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  return createExecutionContext({
    principal: principalHallazgo(userId, rol),
    metadata: { tenantId: tenant, ...(identityId ? { identityId } : {}) },
  });
}
