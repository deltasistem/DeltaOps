/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — PROYECCIÓN CQRS.
 *
 * Funciones PURAS payload→row + despacho por tipo de evento. La proyección jamás
 * re-lee el aggregate: el estado completo viaja en el payload del evento
 * (Offline First / autosuficiencia). El handler operacional resuelve la UoW del
 * Kernel y aplica idempotentemente cada evento a los read models. Mismo patrón
 * que module-correctivo (projection.ts).
 */
import {
  createExecutionContext,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { ServiceDeps } from "@workspace/platform";
import {
  DASHBOARD_ACTUALIZADO,
  DASHBOARD_CLONADO,
  DASHBOARD_CREADO,
  DASHBOARD_ELIMINADO,
  INDICADOR_ACTUALIZADO,
  INDICADOR_DEFINIDO,
  INDICADOR_HABILITADO,
  SNAPSHOT_MATERIALIZADO,
} from "./domain/events";
import type {
  DashboardReadRow,
  DefinicionReadRow,
  ReadModelsStore,
  SnapshotReadRow,
} from "./infrastructure/operacional";

type Evento = { id: string; type: string; payload: Record<string, unknown> };

const str = (v: unknown, def = ""): string => (typeof v === "string" ? v : v == null ? def : String(v));
const num = (v: unknown, def = 0): number => (typeof v === "number" ? v : v == null ? def : Number(v));
const bool = (v: unknown): boolean => v === true;
const fecha = (v: unknown): Date => (typeof v === "string" ? new Date(v) : v instanceof Date ? v : new Date());

/* --------------------------- payload → read rows ------------------------- */

export function definicionRow(ev: Evento): DefinicionReadRow {
  const p = ev.payload;
  const fuente = (p["fuente"] as { modulo?: string; dataset?: string } | undefined) ?? {};
  return {
    tenantId: str(p["tenantId"]),
    id: str(p["id"]),
    clave: str(p["clave"]),
    nombre: str(p["nombre"]),
    categoria: str(p["categoria"]),
    fuenteModulo: str(fuente.modulo),
    fuenteDataset: str(fuente.dataset),
    habilitado: p["habilitado"] === undefined ? true : bool(p["habilitado"]),
    delSistema: bool(p["delSistema"]),
    datos: p,
    version: num(p["version"], 1),
    lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"]),
  };
}

export function dashboardRow(ev: Evento): DashboardReadRow {
  const p = ev.payload;
  return {
    tenantId: str(p["tenantId"]),
    id: str(p["id"]),
    clave: str(p["clave"]),
    nombre: str(p["nombre"]),
    delSistema: bool(p["delSistema"]),
    propietarioId: p["propietarioId"] != null ? str(p["propietarioId"]) : null,
    datos: p,
    version: num(p["version"], 1),
    lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"]),
  };
}

export function snapshotRow(ev: Evento): SnapshotReadRow {
  const p = ev.payload;
  return {
    tenantId: str(p["tenantId"]),
    id: str(p["id"]),
    claveSnapshot: str(p["claveSnapshot"]),
    target: str(p["target"]),
    targetClave: str(p["targetClave"]),
    valor: p["valor"] != null ? num(p["valor"]) : null,
    muestras: p["muestras"] != null ? num(p["muestras"]) : null,
    datos: p,
    evaluadoEn: fecha(p["evaluadoEn"]),
    lastEventId: ev.id,
  };
}

/* ----------------------- Aplicación de eventos --------------------------- */

/** Aplica un evento a los read models. IDEMPOTENTE (guarda por lastEventId/version). */
export async function aplicarEventoAggregate(
  adapters: { readModel: ReadModelsStore },
  uow: UnitOfWork,
  ev: Evento,
): Promise<Result<boolean, KernelError>> {
  switch (ev.type) {
    case INDICADOR_DEFINIDO:
    case INDICADOR_ACTUALIZADO:
    case INDICADOR_HABILITADO:
      return adapters.readModel.aplicarDefinicion(uow, definicionRow(ev));
    case DASHBOARD_CREADO:
    case DASHBOARD_ACTUALIZADO:
    case DASHBOARD_CLONADO:
      return adapters.readModel.aplicarDashboard(uow, dashboardRow(ev));
    case DASHBOARD_ELIMINADO:
      return adapters.readModel.eliminarDashboard(uow, str(ev.payload["tenantId"]), str(ev.payload["id"]));
    case SNAPSHOT_MATERIALIZADO:
      return adapters.readModel.aplicarSnapshot(uow, snapshotRow(ev));
    default:
      return ok(false);
  }
}

/* --------------------- Handler de proyección (outbox) -------------------- */

/**
 * Handler de proyección para los event handlers del módulo. Resuelve la UoW del
 * Kernel bajo un contexto de SISTEMA y proyecta el evento a los read models. Sólo
 * disponible en modo operacional (con read models configurados).
 */
export function handlerProyeccion(adapters: { readModel?: ReadModelsStore }) {
  return (deps: ServiceDeps) =>
    async (event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string }): Promise<Result<void, KernelError>> => {
      if (!adapters.readModel) return ok(undefined);
      const readModel = adapters.readModel;
      const tenantId = str(event.payload["tenantId"]);
      if (!tenantId) return ok(undefined);
      const sys = createExecutionContext({ principal: SYSTEM_PRINCIPAL, correlationId: event.correlationId, metadata: { tenantId } });
      const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
      const r = await uowPort.execute(sys, (uow) =>
        aplicarEventoAggregate({ readModel }, uow, { id: event.id, type: event.type, payload: event.payload }),
      );
      return r.ok ? ok(undefined) : (r as Result<void, KernelError>);
    };
}
