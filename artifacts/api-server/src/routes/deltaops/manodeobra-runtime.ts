/**
 * DGP-020.3 · Runtime de la Fundación de Mano de Obra en el API Server.
 * Singleton Kernel + Plataforma + Módulo Mano de Obra con adaptadores
 * PostgreSQL reales. Mismo patrón que ordenes-runtime (DGP-009.2/020.2) y
 * analytics-runtime (DGP-016.2).
 *
 * INTEGRACIÓN (Opción B · orquestación, ver docs/decisiones.md §2): el tiempo
 * efectivo es autoridad de DGP-020.2, leído por el CONTRATO PÚBLICO de sesiones
 * de Órdenes (`modulo.ordenes.sesion.duraciones`). El módulo NUNCA lee tablas de
 * otros módulos: compone sus queries. La valoración se dispara desde el
 * api-server tras el cierre de sesión (FAIL-SAFE: nunca rompe el cierre).
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearManodeobraRuntime,
  manodeobraModule,
  MODULO,
  type DuracionSesion,
  type IdentidadPort,
  type IdentidadResuelta,
  type ManodeobraRuntime,
  type OrdenesSesionPort,
} from "@workspace/module-manodeobra";
import { membresia, obtenerIdentidad } from "../../deltaops/identity/service";
import { aRolCanonico, esAdminDeTenant } from "../../deltaops/identity/rbac";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";

/**
 * Adaptador de PRODUCCIÓN del puerto de Identidad (fail-closed). El módulo sólo
 * necesita el NOMBRE de presentación de una identidad canónica; NUNCA accede a
 * tablas de Identidad, usa las consultas públicas del servicio (DGP-017). El
 * aislamiento cross-tenant es por `membresia(identityId, tenantId)`.
 */
const identidadPort: IdentidadPort = {
  async resolver(tenantId: string, identityId: string): Promise<Result<IdentidadResuelta | null, KernelError>> {
    try {
      const m = await membresia(identityId, tenantId);
      if (!m) return ok(null); // inexistente o de otro tenant ⇒ null (aislamiento)
      const idn = await obtenerIdentidad(identityId);
      if (!idn) return ok(null);
      return ok({ identityId: idn.identityId, nombre: idn.nombre });
    } catch (err) {
      return { ok: false, error: KernelErrors.infrastructure("resolución de identidad falló", err) } as Result<never, KernelError>;
    }
  },
  async resolverVarios(tenantId: string, identityIds: readonly string[]): Promise<Result<Record<string, string>, KernelError>> {
    const out: Record<string, string> = {};
    for (const id of new Set(identityIds)) {
      const r = await this.resolver(tenantId, id);
      if (!r.ok) return r as Result<never, KernelError>;
      if (r.value) out[id] = r.value.nombre;
    }
    return ok(out);
  },
};

/**
 * Adaptador de SOLO LECTURA hacia el contrato público de sesiones de Órdenes.
 * Compone `modulo.ordenes.sesion.duraciones` (autoridad del tiempo). Un LECTOR
 * de servicio ("system") ejecuta la query en el runtime de Órdenes. Se normaliza
 * la fila del read model `Duraciones` al `DuracionSesion` del módulo.
 */
function normalizarDuracion(row: Record<string, unknown>): DuracionSesion | null {
  const sesionId = String(row["sesionId"] ?? "");
  const ordenId = String(row["ordenId"] ?? "");
  const identityId = String(row["identityId"] ?? "");
  if (sesionId === "" || ordenId === "" || identityId === "") return null;
  const iniIso = row["iniciadoAt"];
  const cerIso = row["cerradoAt"];
  return {
    sesionId,
    ordenId,
    activoId: row["activoId"] == null ? null : String(row["activoId"]),
    identityId,
    estado: String(row["estado"] ?? ""),
    efectivoMs: Number(row["efectivoMs"] ?? 0),
    abierta: Boolean(row["abierta"] ?? false),
    iniciadoAt: iniIso instanceof Date ? iniIso : new Date(String(iniIso)),
    cerradoAt: cerIso == null ? null : cerIso instanceof Date ? cerIso : new Date(String(cerIso)),
  };
}

function filasDuraciones(valor: unknown): Record<string, unknown>[] {
  if (valor && typeof valor === "object") {
    const d = (valor as Record<string, unknown>)["duraciones"];
    if (Array.isArray(d)) return d as Record<string, unknown>[];
  }
  return [];
}

const ordenesSesionPort: OrdenesSesionPort = {
  async duracionesDeSesion(tenantId: string, sesionId: string): Promise<Result<DuracionSesion | null, KernelError>> {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.sesion.duraciones", { sesionId });
    if (!r.ok) return r as Result<never, KernelError>;
    const filas = filasDuraciones(r.value);
    if (filas.length === 0) return ok(null);
    return ok(normalizarDuracion(filas[0]!));
  },
  async duracionesPorOrden(tenantId: string, ordenId: string): Promise<Result<DuracionSesion[], KernelError>> {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.sesion.duraciones", { ordenId });
    if (!r.ok) return r as Result<never, KernelError>;
    const out: DuracionSesion[] = [];
    for (const fila of filasDuraciones(r.value)) {
      const d = normalizarDuracion(fila);
      if (d) out.push(d);
    }
    return ok(out);
  },
};

let runtime: ManodeobraRuntime | null = null;

export function manodeobraRuntime(): ManodeobraRuntime {
  if (!runtime) runtime = crearManodeobraRuntime({ pool, identidad: identidadPort, ordenes: ordenesSesionPort });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...manodeobraModule({
    recursos: null as never, tarifas: null as never, valoraciones: null as never, recibos: null as never,
    identidad: null as never, ordenes: null as never, catalogos: null as never, eventLog: null as never,
  }).permissions,
];

const P_READ = `${MODULO}.read`;
const P_CONFIG = `${MODULO}.config`;
const P_TARIFAS = `${MODULO}.tarifas`;
const P_VALORAR = `${MODULO}.valorar`;
const P_MIAS = `${MODULO}.mias`;

/**
 * Mapa rol CANÓNICO → permisos/capacidades del Módulo Mano de Obra (DGP-020.3).
 *  - TENANT_ADMIN/SUPER_ADMIN: catálogo + recursos + tarifas + valorar/revalorar.
 *  - SUPERVISOR/PLANIFICADOR: consulta completa (lectura), sin configuración.
 *  - TECNICO: SÓLO sus valoraciones (P_MIAS), atado a su identidad canónica.
 *  - CONSULTA / otros: lectura tenant-scoped.
 */
export function principalManodeobra(userId: string, rol: string): Principal {
  const canonico = aRolCanonico(rol);
  if (esAdminDeTenant(rol)) {
    return {
      id: userId, rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["consultar-manodeobra", "configurar-manodeobra", "gestionar-tarifas-manodeobra", "valorar-manodeobra"],
    };
  }
  if (canonico === "SUPERVISOR" || canonico === "PLANIFICADOR") {
    return {
      id: userId, rol,
      permisos: [P_READ, "platform.timeline.read", "platform.config.read"],
      capacidades: ["consultar-manodeobra"],
    };
  }
  if (canonico === "TECNICO") {
    return {
      id: userId, rol,
      permisos: [P_MIAS, P_READ, "platform.config.read"],
      capacidades: ["consultar-mis-manodeobra"],
    };
  }
  // CONSULTA y cualquier otro: sólo lectura tenant-scoped.
  return { id: userId, rol, permisos: [P_READ, "platform.config.read"], capacidades: [] };
}

/**
 * Contexto del Módulo Mano de Obra. `userId` alimenta `principal.id` (permisos/
 * recibos); la IDENTIDAD CANÓNICA autenticada se propaga en `metadata.identityId`
 * (única fuente para el modo técnico "mías", match canónico estricto).
 */
export function contextForManodeobra(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  const metadata: Record<string, unknown> = { tenantId: tenant };
  if (identityId) metadata["identityId"] = identityId;
  return createExecutionContext({ principal: principalManodeobra(userId, rol), metadata });
}

/**
 * Principal de SERVICIO para la valoración orquestada (patrón DGP-019.1: un
 * principal de servicio explícito, no un admin fabricado). Porta SÓLO el permiso
 * de valorar. Se usa exclusivamente en el disparo fail-safe tras el cierre de
 * sesión.
 */
export function contextServicioManodeobra(tenant: string): ExecutionContext {
  return createExecutionContext({
    principal: { id: "system:manodeobra", rol: "servicio", permisos: [P_VALORAR, P_READ], capacidades: ["valorar-manodeobra"] },
    metadata: { tenantId: tenant, servicio: true },
  });
}

/**
 * Disparo FAIL-SAFE de la valoración tras el cierre de una sesión de trabajo.
 * Idempotente por (tenant, sesionId). NUNCA lanza ni propaga error: si la
 * valoración falla, la sesión ya quedó cerrada y la valoración es recuperable
 * (reintento manual `procesar-sesion` o consulta `valoraciones.pendientes`).
 */
export async function valorarSesionFailSafe(tenant: string, sesionId: string, ordenId?: string): Promise<void> {
  try {
    if (!sesionId) return;
    const ctx = contextServicioManodeobra(tenant);
    const r = await manodeobraRuntime().platform.kernel.commands.execute(ctx, `${MODULO}.valoracion.procesar-sesion`, {
      sesionId,
      ...(ordenId ? { ordenId } : {}),
    });
    if (!r.ok) {
      // Fail-safe: log y continuar. La valoración es regenerable.
      console.warn(`[manodeobra] valoración diferida de sesión ${sesionId} (tenant ${tenant}): ${r.error.code} ${r.error.message}`);
    }
    await manodeobraRuntime().platform.kernel.outboxProcessor.processPending().catch(() => undefined);
  } catch (err) {
    console.warn(`[manodeobra] valoración fail-safe lanzó excepción para sesión ${sesionId} (tenant ${tenant}):`, err);
  }
}
