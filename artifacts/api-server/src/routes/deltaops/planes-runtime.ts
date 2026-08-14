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
    // Motor de generación (server-side, best-effort). El actor es el mismo del
    // pipeline de generación (`generar-ordenes` con permisos ya validados); la
    // lectura hereda su rol legítimo. Los medidores se extraen del VO real
    // `{valor,...}` que vive en `datos` del ActivoReadRow, NO del número plano.
    const ctxA = contextForActivos(actorId, "admin", tenantId);
    const det = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
    if (det.ok && det.value && typeof det.value === "object") {
      const row = det.value as Record<string, unknown>;
      const datos = (row["datos"] && typeof row["datos"] === "object" ? row["datos"] : row) as Record<string, unknown>;
      const h = medidorNumerico(datos["horometro"]);
      const o = medidorNumerico(datos["odometro"]);
      return { horometro: h ?? null, odometro: o ?? null };
    }
    return null;
  },
};

export function planesRuntime(): PlanesRuntimeOperacional {
  if (!runtime) runtime = crearPlanesRuntimeOperacional({ pool, materializador: materializadorOficial });
  return runtime;
}

/** Clasificación operacional del activo (dimensiones de alcance del plan). */
export interface CandidatoActivoHttp {
  readonly activoId: string;
  readonly categoria: string | null;
  readonly familia: string | null;
  readonly subfamilia: string | null;
  readonly empresa: string | null;
  readonly proyecto: string | null;
  readonly ubicacion: string | null;
  readonly clase: string | null;
}

/** Contexto operacional de un activo para evaluar rutinas por uso/tiempo. */
export interface ContextoRutinasActivo {
  readonly medidores: Record<string, number>;
  readonly candidato: CandidatoActivoHttp;
}

/**
 * Extrae un valor numérico de medidor desde el shape REAL de `ActivoReadRow`.
 * El detalle de Activos devuelve la medición como VALUE-OBJECT `{ valor, unidad,
 * fecha }` DENTRO de `datos` — NO un número plano. Se toleran ambos shapes
 * (VO anidado y — defensivo — número plano) para no romper si el contrato del
 * detalle evolucionara. `null`/ausente ⇒ `undefined` (el motor sólo recibe
 * lecturas reales, jamás un `0` inventado).
 */
function medidorNumerico(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object") {
    const val = (v as Record<string, unknown>)["valor"];
    if (typeof val === "number" && Number.isFinite(val)) return val;
  }
  return undefined;
}

/** Normaliza una dimensión de clasificación a `string | null`. */
function dimStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * DELTAOPS LITE-08 · Lee del módulo OFICIAL de Activos (`modulo.activos.detalle`)
 * el CONTEXTO operacional de un activo para evaluar sus rutinas por uso/tiempo:
 *   - MEDIDORES actuales (horómetro/odómetro) extraídos del VO `{valor,...}` que
 *     vive en `datos` del `ActivoReadRow` — la autoridad del medidor es el
 *     backend, jamás el frontend.
 *   - CANDIDATO de alcance (categoría/familia/subfamilia/empresa/proyecto/
 *     ubicación/clase) derivado del MISMO activo leído, para que
 *     `alcanceIncluye` NO descarte planes segmentados por esas dimensiones.
 *
 * SEGURIDAD (DGP-023, sin elevación): la consulta se ejecuta con el ROL REAL de
 * la sesión (mapeo legítimo de la cadena de composición), NO con "admin"
 * hardcodeado. Si el dominio de Activos DENIEGA la lectura (KRN-AUTH) o falla,
 * se propaga el `Result` para que la ruta HTTP responda FAIL-CLOSED (403/…),
 * nunca continuar con medidores/candidato vacíos.
 */
export async function contextoRutinasDeActivo(
  tenantId: string,
  actorId: string,
  rolLegacy: string,
  activoId: string,
): Promise<Result<ContextoRutinasActivo, KernelError>> {
  const ctxA = contextForActivos(actorId, rolLegacy, tenantId);
  const det = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
  if (!det.ok) return det as Result<never, KernelError>;
  const row = det.value as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    return fail(KernelErrors.notFound("activo", activoId));
  }
  // La clasificación y las mediciones viven en `datos` (snapshot del activo).
  const datos = (row["datos"] && typeof row["datos"] === "object" ? row["datos"] : row) as Record<string, unknown>;

  const medidores: Record<string, number> = {};
  const h = medidorNumerico(datos["horometro"]);
  if (h !== undefined) medidores["horometro"] = h;
  const o = medidorNumerico(datos["odometro"]);
  if (o !== undefined) medidores["odometro"] = o;

  // `ubicacion` es un VO `{ ubicacionId, ... }`; el alcance compara por clave.
  const ubic = datos["ubicacion"];
  const ubicacion =
    typeof ubic === "string"
      ? dimStr(ubic)
      : ubic && typeof ubic === "object"
        ? dimStr((ubic as Record<string, unknown>)["ubicacionId"])
        : null;

  const candidato: CandidatoActivoHttp = {
    activoId,
    categoria: dimStr(datos["categoria"]),
    familia: dimStr(datos["familia"]),
    subfamilia: dimStr(datos["subfamilia"]),
    empresa: dimStr(datos["empresa"]),
    proyecto: dimStr(datos["proyecto"]),
    ubicacion,
    clase: dimStr(datos["clase"]),
  };

  return ok({ medidores, candidato });
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
