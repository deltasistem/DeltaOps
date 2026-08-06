/**
 * DGP-012.2 · Runtime del Módulo Enterprise Maintenance Plans en el API Server.
 * Singleton Kernel + Plataforma + Workflow Engine + Módulo Planes con
 * adaptadores PostgreSQL reales. Mismo patrón que inventario-runtime (DGP-011.2).
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  planesModule,
  crearPlanesRuntimeOperacional,
  type PlanesRuntimeOperacional,
  type ModuleAdapters,
  type MaterializadorOrdenes,
  type OrdenAMaterializar,
  type ResultadoMaterializacion,
} from "@workspace/module-planes";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { activosRuntime, contextForActivos } from "./activos-runtime";

let runtime: PlanesRuntimeOperacional | null = null;

/**
 * MATERIALIZADOR OFICIAL (capa de integración): compone el comando OFICIAL
 * `modulo.ordenes.crear` del runtime de Órdenes con `opId = claveDedup`
 * (idempotencia determinista) y lee horómetro/odómetro con la consulta OFICIAL
 * `modulo.activos.detalle`. NUNCA comandos anidados ni INSERT directo: cada
 * runtime gestiona su propia UoW. El vínculo generación→OT lo persiste
 * ATÓMICAMENTE el comando del módulo Planes.
 */
const materializadorOficial: MaterializadorOrdenes = {
  async crearOrden(tenantId, actorId, orden: OrdenAMaterializar): Promise<Result<ResultadoMaterializacion, KernelError>> {
    // El contexto de Órdenes se deriva del actor/tenant (rol admin heredado del
    // principal que invoca la generación; el pipeline valida sus permisos).
    const ctxO = contextForOrdenes(actorId, "admin", tenantId);
    const creada = await ordenesRuntime().platform.kernel.commands.execute(ctxO, "modulo.ordenes.crear", {
      opId: orden.opId,
      titulo: `Mantenimiento preventivo · ${orden.planCodigo} · ${orden.activoId}`,
      descripcion: `Generada por plan ${orden.planCodigo} (ocurrencia ${orden.ocurrencia}).`,
      tipo: orden.tipoOrden,
      prioridad: orden.prioridad,
      activoPrincipal: { activoId: orden.activoId, entityRef: `activo:${orden.activoId}`, rol: "principal" },
      fechaProgramada: orden.fechaObjetivo,
      observaciones: JSON.stringify({ planId: orden.planId, claveDedup: orden.claveDedup, medidores: orden.medidores }),
    });
    if (!creada.ok) return creada;
    await ordenesRuntime().platform.kernel.outboxProcessor.processPending();
    const r = creada.value as { id?: string; idempotente?: boolean };
    if (!r.id) return fail(KernelErrors.infrastructure("modulo.ordenes.crear no devolvió id de OT", {}));
    return ok({ ordenTrabajoId: String(r.id), idempotente: r.idempotente === true });
  },
  async medidoresDeActivo(tenantId, actorId, activoId): Promise<Record<string, unknown> | null> {
    const ctxA = contextForActivos(actorId, "admin", tenantId);
    const det = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
    if (det.ok && det.value && typeof det.value === "object") {
      const d = det.value as Record<string, unknown>;
      return { horometro: d["horometro"] ?? null, odometro: d["odometro"] ?? null };
    }
    return null;
  },
};

export function planesRuntime(): PlanesRuntimeOperacional {
  if (!runtime) runtime = crearPlanesRuntimeOperacional({ pool, materializador: materializadorOficial });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...planesModule({
    planes: null as never,
    calendarios: null as never,
    generaciones: null as never,
    historial: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    eventLog: null as never,
    readModel: null as never,
    syncReceipts: null as never,
    consola: null as never,
  } as ModuleAdapters).permissions,
];

/** Mapa rol → permisos (admin: todo; operador: sin admin; lector: lectura). */
export function principalPlanes(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["gestionar-planes", "gobernar-planes", "generar-ordenes", "administrar-planes"],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.planes.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: ["gestionar-planes", "gobernar-planes", "generar-ordenes"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.planes.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForPlanes(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalPlanes(userId, rol),
    metadata: { tenantId: tenant },
  });
}
