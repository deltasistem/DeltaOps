/**
 * DELTAOPS LITE-08 §21 · Runtime de composición de VISIBILIDAD de navegación.
 *
 * NO es un módulo de dominio ni un segundo RBAC: es una superficie de COMPOSICIÓN
 * (mismo espíritu que `hallazgo-runtime`) que persiste ÚNICAMENTE una PREFERENCIA
 * de PRESENTACIÓN por tenant: qué GRUPOS de la navegación se OCULTAN en la UI.
 * Visibilidad ≠ seguridad: el backend sigue siendo la autoridad (403), y ocultar
 * un grupo JAMÁS revela un módulo no habilitado ni concede permisos. Se guarda
 * como un recordType en el Record Store genérico `platform_records` (patrón
 * LITE-04/05, SIN migración). Idempotente por `opId`; sello con usuario canónico
 * + tiempo de servidor; histórico conservado.
 */
import { pool } from "@workspace/db";
import {
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

export const SERVICIO_VISIBILIDAD = "modulo.visibilidad-nav";
const RECORD_VISIBILIDAD = "nav-visibilidad";

export const PERMISOS_VISIBILIDAD = {
  read: `${SERVICIO_VISIBILIDAD}.read`,
  write: `${SERVICIO_VISIBILIDAD}.write`,
} as const;

const VISIBILIDAD_ACTUALIZADA = `${SERVICIO_VISIBILIDAD}.actualizada`;

/** Claves de grupo de navegación que la preferencia puede ocultar (§22). */
const CLAVES_GRUPO = [
  "mantenimiento",
  "equipos",
  "preoperacional",
  "inventario",
  "indicadores",
  "referencia",
] as const;

/** id DETERMINISTA del registro de preferencia por tenant (uno por tenant). */
function idDe(tenant: string): string {
  return `nav-visibilidad:${tenant}`;
}

/**
 * Servicio de plataforma de la preferencia de visibilidad. Gobierna sólo la
 * PERSISTENCIA (lista de grupos ocultos + identidad canónica + tiempo de
 * servidor). La decisión de composición del nav vive en el frontend (rbac.ts);
 * aquí sólo se guarda/lee la preferencia.
 */
export function visibilidadService(): PlatformServiceDefinition {
  return {
    name: SERVICIO_VISIBILIDAD,
    version: "1.0.0",
    description: "Preferencia de visibilidad de módulos en la navegación por tenant (no es seguridad)",
    capabilities: [
      {
        name: "configurar-visibilidad",
        permissions: [PERMISOS_VISIBILIDAD.write, PERMISOS_VISIBILIDAD.read],
        description: "Configurar qué grupos de navegación se muestran por tenant",
      },
    ],
    permissions: [PERMISOS_VISIBILIDAD.read, PERMISOS_VISIBILIDAD.write],
    dependsOn: [],
    events: [VISIBILIDAD_ACTUALIZADA],
    recordTypes: [RECORD_VISIBILIDAD],
    configDefaults: {},
    commands: [
      (deps) => ({
        name: `${SERVICIO_VISIBILIDAD}.guardar`,
        inputSchema: z.object({
          opId: z.string().min(1),
          // Sólo se aceptan claves de grupo conocidas (frontera estricta): nunca
          // se persiste basura ni algo que pudiera interpretarse como permiso.
          ocultos: z.array(z.enum(CLAVES_GRUPO)).max(CLAVES_GRUPO.length),
          actualizadoAt: z.string().min(1),
        }),
        authorization: { permissions: [PERMISOS_VISIBILIDAD.write] },
        async handle(ctx, input, uow) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const id = idDe(tenant);
          // Deduplicar y estabilizar el orden (determinismo del snapshot).
          const ocultos = [...new Set(input.ocultos)].sort();
          const existente = await deps.store.findById(tenant, id);
          if (!existente.ok) return existente;

          if (existente.value) {
            const opIds = (existente.value.data["_opIds"] as string[] | undefined) ?? [];
            if (opIds.includes(input.opId)) {
              return ok({ id, ocultos: existente.value.data["ocultos"] ?? [], idempotente: true });
            }
            const patch = {
              ...existente.value.data,
              ocultos,
              actualizadoPor: ctx.principal.id,
              actualizadoAt: input.actualizadoAt,
              _opIds: [...opIds, input.opId].slice(-50),
            };
            const upd = await deps.store.update(uow, tenant, id, existente.value.version, {
              status: "ACTIVA",
              data: patch,
            });
            if (!upd.ok) return upd;
            const audited = await audit(deps.audit, uow, ctx, tenant, SERVICIO_VISIBILIDAD, "guardar", id, { ocultos });
            if (!audited.ok) return audited;
            return ok({ id, ocultos, idempotente: false });
          }

          const data = {
            ocultos,
            actualizadoPor: ctx.principal.id,
            actualizadoAt: input.actualizadoAt,
            _opIds: [input.opId],
          };
          const inserted = await deps.store.insert(uow, {
            id,
            tenantId: tenant,
            service: SERVICIO_VISIBILIDAD,
            recordType: RECORD_VISIBILIDAD,
            status: "ACTIVA",
            data,
            createdBy: ctx.principal.id,
          });
          if (!inserted.ok) return inserted;
          const audited = await audit(deps.audit, uow, ctx, tenant, SERVICIO_VISIBILIDAD, "guardar", id, { ocultos });
          if (!audited.ok) return audited;
          return ok({ id, ocultos, idempotente: false });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICIO_VISIBILIDAD}.obtener`,
        inputSchema: z.object({}),
        authorization: { permissions: [PERMISOS_VISIBILIDAD.read] },
        async handle(ctx) {
          const tenant = ctx.metadata["tenantId"];
          if (typeof tenant !== "string" || tenant.length === 0) {
            return fail(KernelErrors.validation("Contexto sin tenantId"));
          }
          const r = await deps.store.findById(tenant, idDe(tenant));
          if (!r.ok) return r;
          const ocultos = (r.value?.data["ocultos"] as string[] | undefined) ?? [];
          return ok({ ocultos });
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICIO_VISIBILIDAD),
  };
}

/* ------------------------------- Runtime --------------------------------- */

export interface VisibilidadRuntime {
  readonly platform: PlatformRuntime;
}

let runtime: VisibilidadRuntime | null = null;

export function visibilidadRuntime(): VisibilidadRuntime {
  if (!runtime) {
    const platform = createPlatformRuntime({ pool, extraServices: [visibilidadService()] });
    runtime = { platform };
  }
  return runtime;
}

/** Runtime aislado (pruebas). Sin `pool` usa adaptadores Fake. */
export function crearVisibilidadRuntime(
  opts: Parameters<typeof createPlatformRuntime>[0] = {},
): VisibilidadRuntime {
  const platform = createPlatformRuntime({ ...opts, extraServices: [visibilidadService()] });
  return { platform };
}

/* ------------------------------ Contexto --------------------------------- */

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];

/**
 * Principal por rol CANÓNICO (fail-closed). La ESCRITURA de la preferencia de
 * visibilidad es potestad EXCLUSIVA del administrador de empresa (TENANT_ADMIN)
 * o SUPER_ADMIN: el resto de roles sólo LEE la preferencia efectiva. Esto NO es
 * un permiso de negocio nuevo: gobierna una preferencia de presentación.
 */
export function principalVisibilidad(userId: string, rol: string): Principal {
  const esAdmin = rol === "TENANT_ADMIN" || rol === "SUPER_ADMIN" || rol === "admin" || rol === "superadmin";
  if (esAdmin) {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, PERMISOS_VISIBILIDAD.read, PERMISOS_VISIBILIDAD.write],
      capacidades: ["configurar-visibilidad"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: [PERMISOS_VISIBILIDAD.read, "platform.config.read"],
    capacidades: [],
  };
}

export function contextForVisibilidad(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  return createExecutionContext({
    principal: principalVisibilidad(userId, rol),
    metadata: { tenantId: tenant, ...(identityId ? { identityId } : {}) },
  });
}
