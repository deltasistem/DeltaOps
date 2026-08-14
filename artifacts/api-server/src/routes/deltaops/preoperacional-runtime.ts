/**
 * DGP-LITE-04 · Runtime de composición del PREOPERACIONAL / Checklist Operacional.
 *
 * NO es un módulo de dominio nuevo: es una superficie de COMPOSICIÓN (mismo
 * espíritu que `correctivo-runtime`) que orquesta motores YA existentes:
 *   - Dynamic Forms (DGP-007): captura de la respuesta (guardarBorrador→enviar),
 *     resolución de plantilla ACTIVA por versión y checklist con criticidad.
 *   - Activos (DGP-008): validación del activo ancla vía `modulo.activos.detalle`
 *     (autoridad backend; el frontend jamás afirma la existencia del activo).
 *
 * Persistencia ADITIVA y MÍNIMA (§22): un servicio de plataforma
 * `modulo.preoperacional` con un ÚNICO recordType `preoperacional-ejecucion`
 * sobre el Record Store existente (`deltaops.platform_records`). NO requiere
 * migración: el Record Store es una tabla JSONB genérica multitenant con RLS y
 * auditoría YA vigentes (mismo mecanismo que `plantilla-formulario` y
 * `respuesta-formulario`). El VEREDICTO se calcula en el servidor y se SELLA en
 * el registro, anclado a la VERSIÓN de la plantilla; nunca se recalcula
 * retroactivamente. Idempotencia por `opId` (recibos en `data._opIds`).
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

export const SERVICIO_PREOP = "modulo.preoperacional";
const RECORD_EJECUCION = "preoperacional-ejecucion";

export const PERMISOS_PREOP = {
  read: `${SERVICIO_PREOP}.read`,
  write: `${SERVICIO_PREOP}.write`,
} as const;

const PREOP_EJECUCION_SELLADA = `${SERVICIO_PREOP}.ejecucion.sellada`;

/** Máximo de recibos idempotentes conservados por ejecución (misma política que respuestas). */

const veredictoSchema = z.enum(["APTO", "APTO_CON_OBSERVACIONES", "NO_APTO"]);

const incumplimientoSchema = z.object({
  clave: z.string(),
  etiqueta: z.string(),
  critico: z.boolean(),
  comentario: z.string().optional(),
  evidencias: z.array(z.string()).optional(),
});

/**
 * Servicio de plataforma del preoperacional. Sólo gobierna la PERSISTENCIA
 * SELLADA de la ejecución (identidad canónica de sesión + veredicto + versión de
 * plantilla). La ORQUESTACIÓN (validar activo, componer Dynamic Forms) vive en
 * la capa HTTP de composición, que jamás anida comandos entre runtimes.
 */
export function preoperacionalService(): PlatformServiceDefinition {
  return {
    name: SERVICIO_PREOP,
    version: "1.0.0",
    description: "Ejecuciones de preoperacional/checklist operacional selladas por activo",
    capabilities: [
      {
        name: "operar-preoperacional",
        permissions: [PERMISOS_PREOP.write, PERMISOS_PREOP.read],
        description: "Sellar y consultar ejecuciones de preoperacional",
      },
    ],
    permissions: [PERMISOS_PREOP.read, PERMISOS_PREOP.write],
    dependsOn: [],
    events: [PREOP_EJECUCION_SELLADA],
    recordTypes: [RECORD_EJECUCION],
    configDefaults: {},
    commands: [
      /* ---------------------- sellar ejecución (idempotente) ---------------- */
      (deps) => ({
        name: `${SERVICIO_PREOP}.sellar`,
        inputSchema: z.object({
          id: z.string().min(1),
          opId: z.string().min(1),
          activoId: z.string().min(1),
          plantillaClave: z.string().min(1),
          plantillaVersion: z.number().int().positive(),
          respuestaId: z.string().min(1),
          veredicto: veredictoSchema,
          incumplimientos: z.array(incumplimientoSchema).default([]),
          observaciones: z.array(incumplimientoSchema).default([]),
          puntaje: z.record(z.string(), z.unknown()).optional(),
          // Contexto de ancla (procedencia); backend-autoritativo, nunca del cliente.
          contexto: z.record(z.string(), z.unknown()).optional(),
          // Momento de sellado (tiempo de servidor, provisto por la capa HTTP).
          selladoAt: z.string().min(1),
        }),
        authorization: { permissions: [PERMISOS_PREOP.write] },
        async handle(ctx, input, uow) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          // Idempotencia terminal por opId: si la ejecución ya existe y su opId
          // fue sellado, devolvemos el resultado sin re-aplicar (converge /sync).
          const existente = await deps.store.findById(tenant, input.id);
          if (!existente.ok) return existente;
          if (existente.value) {
            const opIds = (existente.value.data["_opIds"] as string[] | undefined) ?? [];
            if (opIds.includes(input.opId)) {
              return ok({
                id: input.id,
                veredicto: existente.value.data["veredicto"],
                idempotente: true,
              });
            }
            // Ejecución sellada es INMUTABLE: no se re-sella con otro opId.
            return fail(
              KernelErrors.conflict(
                `Ejecución de preoperacional ya sellada: ${input.id}`,
              ),
            );
          }

          const data = {
            activoId: input.activoId,
            plantillaClave: input.plantillaClave,
            plantillaVersion: input.plantillaVersion,
            respuestaId: input.respuestaId,
            veredicto: input.veredicto,
            incumplimientos: input.incumplimientos,
            observaciones: input.observaciones,
            puntaje: input.puntaje ?? null,
            contexto: input.contexto ?? {},
            selladoPor: ctx.principal.id,
            selladoAt: input.selladoAt,
            _opIds: [input.opId],
          };
          const inserted = await deps.store.insert(uow, {
            id: input.id,
            tenantId: tenant,
            service: SERVICIO_PREOP,
            recordType: RECORD_EJECUCION,
            status: "SELLADA",
            data,
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(
            deps.audit,
            uow,
            ctx,
            tenant,
            SERVICIO_PREOP,
            "sellar",
            input.id,
            { veredicto: input.veredicto, activoId: input.activoId, plantillaVersion: input.plantillaVersion },
          );
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(
              PREOP_EJECUCION_SELLADA,
              {
                tenantId: tenant,
                id: input.id,
                activoId: input.activoId,
                veredicto: input.veredicto,
                actorId: ctx.principal.id,
              },
              ctx.correlationId,
            ),
          );
          return ok({ id: input.id, veredicto: input.veredicto, idempotente: false });
        },
      }),
    ],
    queries: [
      /* ------------------------------ obtener ------------------------------- */
      (deps) => ({
        name: `${SERVICIO_PREOP}.obtener`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [PERMISOS_PREOP.read] },
        async handle(ctx, input) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const r = await deps.store.findById(tenant, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound(RECORD_EJECUCION, input.id));
          return ok(r.value);
        },
      }),
      /* ------------------------------- listar ------------------------------- */
      (deps) => ({
        name: `${SERVICIO_PREOP}.listar`,
        inputSchema: z.object({
          activoId: z.string().optional(),
          veredicto: veredictoSchema.optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
        authorization: { permissions: [PERMISOS_PREOP.read] },
        async handle(ctx, input) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          // `activoId`/`veredicto` (identidad de la fila) se empujan al almacén
          // como igualdad JSONB para NO depender de una ventana global de `limit`
          // filas: con volúmenes históricos (miles de ejecuciones selladas) el
          // filtrado en memoria sobre las primeras N dejaba fuera activos enteros.
          const dataEquals: Record<string, string> = {};
          if (input.activoId) dataEquals["activoId"] = input.activoId;
          if (input.veredicto) dataEquals["veredicto"] = input.veredicto;
          const rows = await deps.store.list(tenant, {
            service: SERVICIO_PREOP,
            recordType: RECORD_EJECUCION,
            ...(Object.keys(dataEquals).length > 0 ? { dataEquals } : {}),
            limit: input.limit ?? 200,
          });
          if (!rows.ok) return rows;
          return ok(rows.value);
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICIO_PREOP),
  };
}

/* ------------------------------- Runtime --------------------------------- */

export interface PreoperacionalRuntime {
  readonly platform: PlatformRuntime;
}

let runtime: PreoperacionalRuntime | null = null;

/** Runtime singleton del preoperacional (Record Store PostgreSQL real). */
export function preoperacionalRuntime(): PreoperacionalRuntime {
  if (!runtime) {
    const platform = createPlatformRuntime({
      pool,
      extraServices: [preoperacionalService()],
    });
    runtime = { platform };
  }
  return runtime;
}

/**
 * Construye un runtime aislado del preoperacional (para pruebas). Sin `pool`
 * usa los adaptadores Fake en memoria (mismo mecanismo que Dynamic Forms).
 */
export function crearPreoperacionalRuntime(
  opts: Parameters<typeof createPlatformRuntime>[0] = {},
): PreoperacionalRuntime {
  const platform = createPlatformRuntime({
    ...opts,
    extraServices: [preoperacionalService()],
  });
  return { platform };
}

/* ------------------------------ Contexto --------------------------------- */

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];

/**
 * Principal del preoperacional por rol canónico. CONSULTA jamás escribe: sólo
 * lectura. No introduce roles nuevos ni cambia RBAC estructural: mapea los 6
 * roles existentes a los permisos de lectura/escritura de esta superficie.
 */
export function principalPreoperacional(userId: string, rol: string): Principal {
  const esConsulta = rol === "CONSULTA" || rol === "lector";
  if (esConsulta) {
    return {
      id: userId,
      rol,
      permisos: [PERMISOS_PREOP.read, "platform.config.read"],
      capacidades: [],
    };
  }
  return {
    id: userId,
    rol,
    permisos: [...PLATFORM_PERMISSIONS, PERMISOS_PREOP.read, PERMISOS_PREOP.write],
    capacidades: ["operar-preoperacional"],
  };
}

export function contextForPreoperacional(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  return createExecutionContext({
    principal: principalPreoperacional(userId, rol),
    metadata: { tenantId: tenant, ...(identityId ? { identityId } : {}) },
  });
}
