/**
 * DGP-013.2 · Runtime del Módulo Enterprise Procurement & Supply Chain en el
 * API Server. Singleton Kernel + Plataforma + Workflow Engine + Módulo
 * Abastecimiento con adaptadores PostgreSQL reales. Mismo patrón que
 * planes-runtime (DGP-012.2) e inventario-runtime (DGP-011.2).
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
  abastecimientoModule,
  crearAbastecimientoRuntimeOperacional,
  type AbastecimientoRuntimeOperacional,
  type ModuleAdapters,
  type MaterializadorInventario,
  type EntradaMaterializacion,
  type ResultadoMaterializacion,
} from "@workspace/module-abastecimiento";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { inventarioRuntime, contextForInventario } from "./inventario-runtime";

let runtime: AbastecimientoRuntimeOperacional | null = null;

/** Movimiento de entrada por defecto al materializar recepciones en Inventario. */
const TIPO_MOVIMIENTO_ENTRADA = "entrada";

/**
 * MATERIALIZADOR OFICIAL (capa de integración): compone el comando OFICIAL
 * `modulo.inventario.mover` del runtime de Inventario con `opId =
 * ${recepcionId}:${numeroLineaOC}` (idempotencia determinista) — NUNCA comandos
 * anidados ni INSERT directo: cada runtime gestiona su propia UoW. El vínculo
 * línea→movimiento lo persiste ATÓMICAMENTE el comando del módulo Abastecimiento
 * (`materializar-recepcion`), no este adaptador.
 *
 * Nota sobre costos: `module-inventario` NO expone un comando OFICIAL de costeo;
 * la valoración se recalcula como EFECTO de `mover` (costo promedio / última
 * compra del item, autoridad de Inventario). `abs_costos_read` es una proyección
 * de REPORTE del módulo Abastecimiento (limitación explícita, ver ETAPA 2).
 */
const materializadorOficial: MaterializadorInventario = {
  async ingresar(tenantId, actorId, entrada: EntradaMaterializacion): Promise<Result<ResultadoMaterializacion, KernelError>> {
    // Sin item de inventario NO hay destino oficial: fallo seguro (no se crean
    // movimientos por vías no oficiales).
    if (!entrada.inventarioItemId) {
      return fail(KernelErrors.conflict(
        `La línea ${entrada.numeroLineaOC} de la recepción ${entrada.recepcionId} no tiene inventarioItemId; no puede materializarse en Inventario.`,
        { motivo: "sin-inventario-item", numeroLineaOC: entrada.numeroLineaOC },
      ));
    }
    if (!entrada.bodegaId || !entrada.ubicacionId) {
      return fail(KernelErrors.validation(
        `La materialización requiere bodegaId y ubicacionId (línea ${entrada.numeroLineaOC}).`,
        { numeroLineaOC: entrada.numeroLineaOC },
      ));
    }
    const ctxI = contextForInventario(actorId, "admin", tenantId);
    const movido = await inventarioRuntime().platform.kernel.commands.execute(ctxI, "modulo.inventario.mover", {
      opId: entrada.opId,
      itemId: entrada.inventarioItemId,
      bodegaId: entrada.bodegaId,
      ubicacionId: entrada.ubicacionId,
      loteCodigo: entrada.lote ?? undefined,
      serieNumero: entrada.serie ?? undefined,
      tipo: TIPO_MOVIMIENTO_ENTRADA,
      cantidad: entrada.cantidad,
      ...(entrada.costoUnitario != null ? { costoUnitario: entrada.costoUnitario } : {}),
      ...(entrada.moneda != null ? { moneda: entrada.moneda } : {}),
      referencia: entrada.referencia ?? { tipo: "recepcion", id: entrada.recepcionId },
    });
    if (!movido.ok) return movido;
    await inventarioRuntime().platform.kernel.outboxProcessor.processPending();
    const r = movido.value as { movimientoId?: string; idempotente?: boolean };
    if (!r.movimientoId) return fail(KernelErrors.infrastructure("modulo.inventario.mover no devolvió movimientoId", {}));
    return ok({ movimientoId: String(r.movimientoId), idempotente: r.idempotente === true });
  },

  async liberarOrigen(tenantId, actorId, vinculo): Promise<Result<void, KernelError>> {
    // Cierre de origen (best-effort) vía COMANDO oficial `platform.timeline.record`
    // en la plataforma de Inventario (NUNCA escritura directa a la línea de tiempo).
    const ctxI = contextForInventario(actorId, "admin", tenantId);
    const rec = await inventarioRuntime().platform.kernel.commands.execute(ctxI, "platform.timeline.record", {
      entryId: crypto.randomUUID(),
      entityRef: `orden-compra:${vinculo.ordenCompraId}`,
      eventType: "modulo.abastecimiento.recepcion.materializada",
      actorId,
      occurredAt: new Date().toISOString(),
      resumen: `Recepción ${vinculo.recepcionId} materializada en Inventario`,
      estado: null,
      entidadRelacionada: vinculo.solicitudId ? `solicitud:${vinculo.solicitudId}` : null,
      payload: { recepcionId: vinculo.recepcionId, ordenCompraId: vinculo.ordenCompraId, solicitudId: vinculo.solicitudId },
    });
    return rec.ok ? ok(undefined) : (rec as Result<void, KernelError>);
  },
};

export function abastecimientoRuntime(): AbastecimientoRuntimeOperacional {
  if (!runtime) runtime = crearAbastecimientoRuntimeOperacional({ pool, materializador: materializadorOficial });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...abastecimientoModule({
    articulos: null as never,
    proveedores: null as never,
    solicitudes: null as never,
    cotizaciones: null as never,
    ordenes: null as never,
    recepciones: null as never,
    historial: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    eventLog: null as never,
  } as ModuleAdapters).permissions,
];

/**
 * Mapa rol → permisos. admin/platform_admin: todo (write/govern/receive/admin);
 * operador: write + govern + receive (sin admin); lector: sólo lectura.
 */
export function principalAbastecimiento(userId: string, rol: string): Principal {
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: [
        "gestionar-catalogo", "gobernar-solicitudes", "gobernar-ordenes",
        "recibir-mercancia", "administrar-abastecimiento",
      ],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.abastecimiento.admin"),
        "platform.timeline.read", "platform.config.read",
      ],
      capacidades: [
        "gestionar-catalogo", "gobernar-solicitudes", "gobernar-ordenes", "recibir-mercancia",
      ],
    };
  }
  return {
    id: userId,
    rol,
    permisos: ["modulo.abastecimiento.read", "platform.timeline.read", "platform.config.read"],
    capacidades: [],
  };
}

export function contextForAbastecimiento(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalAbastecimiento(userId, rol),
    metadata: { tenantId: tenant },
  });
}
