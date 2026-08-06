/**
 * DGP-014.2 · Runtime del Módulo Enterprise Preventive Maintenance en el API
 * Server. Singleton Kernel + Plataforma + Workflow Engine + Módulo Preventivo con
 * adaptadores PostgreSQL reales. Mismo patrón que abastecimiento-runtime
 * (DGP-013.2) y planes-runtime (DGP-012.2).
 *
 * COLABORACIÓN CROSS-MÓDULO (capa de integración, jamás comandos anidados):
 *  - `materializadorOrdenes`: compone el comando OFICIAL `modulo.ordenes.crear`
 *    del runtime de Órdenes con idempotencia DETERMINISTA. El puerto recibe
 *    `entrada.opId = claveDedup`; este adaptador DERIVA el id de la OT como
 *    `gen:<generacionId>` (UUIDv5 estable) y usa ese `opId` en la orden para el
 *    recibo idempotente. El vínculo generación→OT lo persiste ATÓMICAMENTE el
 *    comando `generar` del módulo Preventivo (dedup store), no este adaptador.
 *  - `activosPort`: valida EXISTENCIA de activos vía `modulo.activos.detalle`.
 *  - `planesPort`: verifica planes PUBLICADOS vía `modulo.planes.plan`.
 * Todos FAIL-SAFE: ante un fallo del colaborador, la orquestación rechaza (nunca
 * crea OTs ni asume existencia por vías no oficiales).
 */
import crypto from "node:crypto";
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
  preventivoModule,
  crearPreventivoRuntimeOperacional,
  type PreventivoRuntimeOperacional,
  type ModuleAdapters,
  type ActivosPort,
  type PlanesPort,
  type MaterializadorOrdenes,
  type EntradaMaterializacionOrden,
  type ResultadoMaterializacionOrden,
} from "@workspace/module-preventivo";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { activosRuntime, contextForActivos } from "./activos-runtime";
import { planesRuntime, contextForPlanes } from "./planes-runtime";

let runtime: PreventivoRuntimeOperacional | null = null;

/** Espacio de nombres UUIDv5 para derivar ids de OT deterministas por generación. */
const NS_ORDEN_PREVENTIVA = "6f2b1c4e-9d3a-4f6b-8c1d-2e5a7b9c0d1f";

/** Deriva el id de la OT determinísticamente desde la generación (idempotencia). */
function ordenIdDeGeneracion(generacionId: string): string {
  const ns = NS_ORDEN_PREVENTIVA.replace(/-/g, "");
  const nsBytes = Buffer.from(ns, "hex");
  const hash = crypto.createHash("sha1");
  hash.update(nsBytes);
  hash.update(Buffer.from(`gen:${generacionId}`, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC-4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * MATERIALIZADOR OFICIAL de Órdenes de Trabajo. `entrada.opId` es la `claveDedup`
 * (idempotencia end-to-end); el `id` de la OT se deriva de la generación para que
 * reintentos produzcan la MISMA orden. Drena el outbox de Órdenes tras crear.
 */
const materializadorOrdenes: MaterializadorOrdenes = {
  async crearOrden(tenantId, actorId, entrada: EntradaMaterializacionOrden): Promise<Result<ResultadoMaterializacionOrden, KernelError>> {
    const ctxO = contextForOrdenes(actorId, "admin", tenantId);
    const ordenId = ordenIdDeGeneracion(entrada.generacionId);
    const creado = await ordenesRuntime().platform.kernel.commands.execute(ctxO, "modulo.ordenes.crear", {
      id: ordenId,
      opId: entrada.opId,
      titulo: `Mantenimiento preventivo — generación ${entrada.generacionId}`,
      // Tipo CANÓNICO del módulo de Órdenes (DGP-013): "preventiva".
      tipo: "preventiva",
      fechaProgramada: entrada.fechaObjetivo,
      activoPrincipal: { activoId: entrada.activoId, entityRef: `activo:${entrada.activoId}`, rol: "principal" },
      observaciones: `Programa ${entrada.programaId} · actividad ${entrada.actividadId}`,
    });
    if (!creado.ok) return creado;
    await ordenesRuntime().platform.kernel.outboxProcessor.processPending();
    const r = creado.value as { id?: string; idempotente?: boolean };
    if (!r.id) return fail(KernelErrors.infrastructure("modulo.ordenes.crear no devolvió id", {}));
    return ok({ ordenTrabajoId: String(r.id), idempotente: r.idempotente === true });
  },
};

/** Puerto de Activos: valida existencia vía `modulo.activos.detalle` (fail-safe). */
const activosPort: ActivosPort = {
  async existen(tenantId, activoIds): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    const ctxA = contextForActivos("system", "lector", tenantId);
    const inexistentes: string[] = [];
    for (const id of activoIds) {
      const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id });
      if (!r.ok) {
        if (r.error.code === "KRN-NOT-001") { inexistentes.push(id); continue; }
        return r as Result<never, KernelError>;
      }
    }
    return ok({ inexistentes });
  },
};

/**
 * Puerto de Planes: verifica publicación vía `modulo.planes.plan` (fail-safe).
 * En el módulo de Planes (DGP-012) el estado de un plan PUBLICADO/vigente es
 * `vigente`, y su versión publicada activa es `versionActiva`. La referencia
 * `{planId, version}` del programa preventivo compara contra `versionActiva`.
 */
const planesPort: PlanesPort = {
  async verificarPublicados(tenantId, refs): Promise<Result<{ noPublicados: readonly { planId: string; version: number }[] }, KernelError>> {
    const ctxP = contextForPlanes("system", "lector", tenantId);
    const noPublicados: { planId: string; version: number }[] = [];
    for (const ref of refs) {
      const r = await planesRuntime().platform.kernel.queries.execute(ctxP, "modulo.planes.plan", { id: ref.planId });
      if (!r.ok) {
        if (r.error.code === "KRN-NOT-001") { noPublicados.push(ref); continue; }
        return r as Result<never, KernelError>;
      }
      const plan = r.value as { estado?: string; versionActiva?: number } | null;
      if (!plan || plan.estado !== "vigente" || Number(plan.versionActiva) !== ref.version) {
        noPublicados.push(ref);
      }
    }
    return ok({ noPublicados });
  },
};

export function preventivoRuntime(): PreventivoRuntimeOperacional {
  if (!runtime) {
    runtime = crearPreventivoRuntimeOperacional({
      pool,
      materializador: materializadorOrdenes,
      activos: activosPort,
      planes: planesPort,
    });
  }
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...preventivoModule({
    programas: null as never,
    versiones: null as never,
    actividades: null as never,
    generaciones: null as never,
    dedup: null as never,
    historial: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    eventLog: null as never,
  } as ModuleAdapters).permissions,
];

/**
 * Mapa rol → permisos. admin/platform_admin: todo (write/govern/schedule/admin);
 * operador: write + govern + schedule (sin admin); lector: sólo lectura.
 */
export function principalPreventivo(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: [
        "gestionar-programas", "gobernar-programas", "programar-mantenimiento",
        "administrar-preventivo",
      ],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.preventivo.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: ["gestionar-programas", "gobernar-programas", "programar-mantenimiento"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.preventivo.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForPreventivo(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalPreventivo(userId, rol),
    metadata: { tenantId: tenant },
  });
}
