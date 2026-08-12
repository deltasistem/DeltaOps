/**
 * DGP-021.1 · Runtime de la Fundación del Módulo de Costos en el API Server.
 * Singleton Kernel + Plataforma + Módulo Costos con adaptadores PostgreSQL
 * reales. Mismo patrón que manodeobra-runtime (DGP-020.3).
 *
 * INTEGRACIÓN (SOLO LECTURA, contratos públicos): el módulo NUNCA lee tablas
 * ajenas. Compone:
 *  - `modulo.ordenes.detalle` (Órdenes): existencia de la OT + relación canónica
 *    OT→activo (el `activoId` se DERIVA, jamás del frontend).
 *  - `modulo.abastecimiento.costos-exactos` (DGP-021.0): costo unitario EXACTO de
 *    un artículo por moneda (numeric(18,6) como cadena, string-safe). PROHIBIDO
 *    `abs_costos_read` o el endpoint float legacy.
 *
 * GANCHO de orquestación inventario→costos: `hecho.materializar-material` es
 * idempotente por opId y disparable fail-safe desde el api-server. La
 * orquestación real (evento de recepción → hecho de costo) llega en DGP-021.2.
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
  costosModule,
  crearCostosRuntime,
  MODULO,
  type CostoExactoArticulo,
  type CostoExactoPort,
  type CostosRuntime,
  type IdentidadPort,
  type IdentidadResuelta,
  type OrdenesPort,
  type OrdenSnapshot,
} from "@workspace/module-costos";
import { membresia, obtenerIdentidad } from "../../deltaops/identity/service";
import { aRolCanonico, esAdminDeTenant } from "../../deltaops/identity/rbac";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";
import { abastecimientoRuntime, contextForAbastecimiento } from "./abastecimiento-runtime";

/* --------------------------------- Identidad ----------------------------- */

const identidadPort: IdentidadPort = {
  async resolver(tenantId: string, identityId: string): Promise<Result<IdentidadResuelta | null, KernelError>> {
    try {
      const m = await membresia(identityId, tenantId);
      if (!m) return ok(null);
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

/* --------------------------------- Órdenes ------------------------------- */

/**
 * Adaptador de SOLO LECTURA hacia el contrato público de Órdenes. Un LECTOR de
 * servicio ejecuta `modulo.ordenes.detalle` en el runtime de Órdenes y se
 * NORMALIZA la OT a su snapshot público mínimo: existencia + relación canónica
 * OT→activo (`activoPrincipalId`). El módulo de Costos DERIVA de aquí el activo.
 */
const ordenesPort: OrdenesPort = {
  async obtener(tenantId: string, ordenId: string): Promise<Result<OrdenSnapshot | null, KernelError>> {
    const ctx = contextForOrdenes("system", "lector", tenantId);
    const r = await ordenesRuntime().platform.kernel.queries.execute(ctx, "modulo.ordenes.detalle", { id: ordenId });
    if (!r.ok) {
      // Órdenes devuelve notFound cuando la OT no existe (o es de otro tenant): se
      // traduce a `null` para que Costos emita su propio 404 uniforme.
      if (r.error.code.startsWith("KRN-NF")) return ok(null);
      return r as Result<never, KernelError>;
    }
    const orden = (r.value as { orden?: Record<string, unknown> }).orden;
    if (!orden) return ok(null);
    const activo = orden["activoPrincipalId"] ?? orden["activoPrincipal"];
    const activoId =
      typeof activo === "string"
        ? activo
        : activo && typeof activo === "object" && typeof (activo as Record<string, unknown>)["activoId"] === "string"
          ? String((activo as Record<string, unknown>)["activoId"])
          : null;
    return ok({
      ordenId: String(orden["id"] ?? ordenId),
      estado: String(orden["estado"] ?? ""),
      activoPrincipalId: activoId,
    });
  },
};

/* ----------------------------- Abastecimiento ---------------------------- */

/**
 * Adaptador de SOLO LECTURA hacia el costo exacto de Abastecimiento (DGP-021.0).
 * Ejecuta `modulo.abastecimiento.costos-exactos` con un LECTOR de servicio y
 * normaliza sus filas (montos crudos numeric(18,6) como CADENA — SIN Number).
 * Ausencia total ⇒ lista vacía (SIN COSTO ≠ 0), que Costos rechaza.
 */
const costoExactoPort: CostoExactoPort = {
  async costosDeArticulo(tenantId: string, articuloId: string): Promise<Result<CostoExactoArticulo[], KernelError>> {
    const ctx = contextForAbastecimiento("system", "lector", tenantId);
    const r = await abastecimientoRuntime().platform.kernel.queries.execute(ctx, "modulo.abastecimiento.costos-exactos", { articuloId });
    if (!r.ok) return r as Result<never, KernelError>;
    const costos = (r.value as { costos?: Array<Record<string, unknown>> }).costos ?? [];
    return ok(
      costos.map((c) => ({
        articuloId: String(c["articuloId"] ?? articuloId),
        moneda: String(c["moneda"]),
        metodoValoracion: String(c["metodoValoracion"] ?? ""),
        // CADENA cruda del contrato (numeric(18,6)); jamás Number/parseFloat.
        costoUnitario: String(c["costoUnitario"]),
        cantidadAcumulada: String(c["cantidadAcumulada"] ?? "0.000000"),
        actualizadoAt: c["actualizadoAt"] instanceof Date ? (c["actualizadoAt"] as Date).toISOString() : String(c["actualizadoAt"] ?? ""),
      })),
    );
  },
};

let runtime: CostosRuntime | null = null;

export function costosRuntime(): CostosRuntime {
  if (!runtime) runtime = crearCostosRuntime({ pool, identidad: identidadPort, ordenes: ordenesPort, costoExacto: costoExactoPort });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...costosModule({
    hechos: null as never, recibos: null as never, identidad: null as never,
    ordenes: null as never, costoExacto: null as never, eventLog: null as never,
  }).permissions,
];

const P_READ = `${MODULO}.read`;
const P_MATERIALIZAR = `${MODULO}.materializar`;
const P_ANULAR = `${MODULO}.anular`;
const P_ADMIN = `${MODULO}.admin`;

/**
 * Mapa rol CANÓNICO → permisos del Módulo de Costos (DGP-021.1). RBAC SEPARADO
 * por operación (consulta ≠ materializar ≠ anular ≠ administrar):
 *  - TENANT_ADMIN/SUPER_ADMIN: todo (read + materializar + anular + admin).
 *  - SUPERVISOR/PLANIFICADOR: consulta + materializar + anular (operación), sin admin.
 *  - TECNICO: NO obtiene administración NI materialización de costos (sólo lectura
 *    tenant-scoped, decisión documentada: el costo es supervisión, no captura técnica).
 *  - CONSULTA / otros: sólo lectura.
 */
export function principalCostos(userId: string, rol: string): Principal {
  const canonico = aRolCanonico(rol);
  if (esAdminDeTenant(rol)) {
    return {
      id: userId, rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: ["consultar-costos", "materializar-costos", "anular-costos", "administrar-costos"],
    };
  }
  if (canonico === "SUPERVISOR" || canonico === "PLANIFICADOR") {
    return {
      id: userId, rol,
      permisos: [P_READ, P_MATERIALIZAR, P_ANULAR, "platform.timeline.read", "platform.config.read"],
      capacidades: ["consultar-costos", "materializar-costos", "anular-costos"],
    };
  }
  // TECNICO, CONSULTA y cualquier otro: sólo lectura tenant-scoped.
  void P_ADMIN;
  return { id: userId, rol, permisos: [P_READ, "platform.config.read"], capacidades: ["consultar-costos"] };
}

/**
 * Contexto del Módulo de Costos. `userId` alimenta `principal.id` (permisos/
 * recibos); la IDENTIDAD CANÓNICA autenticada se propaga en `metadata.identityId`
 * (única fuente del autorizante en costos manuales OTROS; nunca del frontend).
 */
export function contextForCostos(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  const metadata: Record<string, unknown> = { tenantId: tenant };
  if (identityId) metadata["identityId"] = identityId;
  return createExecutionContext({ principal: principalCostos(userId, rol), metadata });
}
