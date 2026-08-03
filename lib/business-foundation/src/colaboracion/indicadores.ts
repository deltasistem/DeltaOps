/**
 * DGP-006 · Business Foundation Framework — Generic KPI Runtime.
 *
 * Indicadores declarativos sobre una DefinicionEntidad. Cada DefinicionKpi
 * describe un indicador ('contador' o 'porEstado') que se mantiene como un
 * snapshot vivo en el Record Store del propio servicio (recordType `kpi`).
 *
 * Decisión de diseño: `platform.kpi` está pensado para catálogos versionados y
 * snapshots periódicos con fuentes opacas — no para un valor corriente
 * incremental idempotente por evento. Por eso el runtime persiste los snapshots
 * en el RecordStore del servicio (multitenant + RLS), con dedupe por `eventId`
 * (patrón `_eventIds`) para que la reentrega del outbox nunca duplique el conteo.
 *
 * Consulta `<servicio>.<entidad>.kpis` → valores actuales de todos los KPIs.
 */
import { z } from "zod";
import {
  createExecutionContext,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type KernelError,
  type QueryDefinition,
  type Result,
} from "@workspace/kernel";
import { tenantOf, type EventHandlerDefinition, type ServiceDeps } from "@workspace/platform";
import { eventosDeEntidad, type DefinicionEntidad } from "../nucleo/definicion";

const KPI_RECORD_TYPE = "kpi";
const EVENT_IDS_KEY = "_eventIds";
const MAX_EVENT_IDS = 200;

/** Definición declarativa de un indicador. */
export interface DefinicionKpi {
  readonly nombre: string;
  readonly descripcion: string;
  readonly tipo: "contador" | "porEstado";
  /** Campo de `data` a agrupar cuando `tipo === "porEstado"` (default: estado). */
  readonly campo?: string;
}

/** Nombre canónico de la consulta de KPIs de una entidad. */
export function nombreKpis(def: DefinicionEntidad): string {
  return `${def.servicio}.${def.nombre}.kpis`;
}

/** Capacidad dedicada de indicadores de una entidad. */
export function capacidadIndicadores(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `indicadores-${def.nombre}`,
    permissions: [def.permisos.leer],
    description: `Consultar indicadores (KPIs) de ${def.etiqueta}`,
  };
}

function idKpi(def: DefinicionEntidad, kpi: DefinicionKpi): string {
  return `kpi:${def.nombre}:${kpi.nombre}`;
}

function eventIdsDe(data: Record<string, unknown>): string[] {
  const raw = data[EVENT_IDS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Recalcula el valor del KPI a partir del payload del evento y el estado previo. */
function nuevoValor(
  kpi: DefinicionKpi,
  previo: { valor?: number; porEstado?: Record<string, number> },
  payload: Record<string, unknown>,
  esCreacion: boolean,
  esEliminacion: boolean,
): { valor: number; porEstado: Record<string, number> } {
  if (kpi.tipo === "contador") {
    let valor = previo.valor ?? 0;
    if (esCreacion) valor += 1;
    if (esEliminacion) valor = Math.max(0, valor - 1);
    return { valor, porEstado: {} };
  }
  // porEstado: cuenta registros por el valor de un campo (default: estado).
  const porEstado: Record<string, number> = { ...(previo.porEstado ?? {}) };
  const campo = kpi.campo ?? "estado";
  const data = (payload["data"] as Record<string, unknown> | undefined) ?? {};
  const clave =
    campo === "estado"
      ? String(payload["estado"] ?? "")
      : String(data[campo] ?? "");
  if (esEliminacion) {
    const anterior = String(payload["estadoAnterior"] ?? clave);
    porEstado[anterior] = Math.max(0, (porEstado[anterior] ?? 0) - 1);
  } else if (esCreacion) {
    if (clave) porEstado[clave] = (porEstado[clave] ?? 0) + 1;
  } else {
    // Transición/actualización: mueve del estado anterior al nuevo.
    const anterior = String(payload["estadoAnterior"] ?? "");
    if (anterior && anterior !== clave) {
      porEstado[anterior] = Math.max(0, (porEstado[anterior] ?? 0) - 1);
      if (clave) porEstado[clave] = (porEstado[clave] ?? 0) + 1;
    } else if (clave && !(clave in porEstado)) {
      porEstado[clave] = (porEstado[clave] ?? 0) + 1;
    }
  }
  const total = Object.values(porEstado).reduce((a, b) => a + b, 0);
  return { valor: total, porEstado };
}

/**
 * Aplica un evento a un KPI de forma idempotente (dedupe por eventId). El
 * snapshot vive en el RecordStore del servicio bajo un id estable por KPI.
 */
async function aplicarKpi(
  def: DefinicionEntidad,
  kpi: DefinicionKpi,
  deps: ServiceDeps,
  event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
): Promise<Result<void, KernelError>> {
  const tenantId = String(event.payload["tenantId"] ?? "");
  if (!tenantId) return ok(undefined);
  const eventos = eventosDeEntidad(def);
  const esCreacion = event.type === eventos.creada;
  const esEliminacion = event.type === eventos.eliminada;

  const recordId = idKpi(def, kpi);
  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  const ctx = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId: event.correlationId,
    metadata: { tenantId },
  });

  const result = await uowPort.execute(ctx, async (uow) => {
    const existing = await deps.store.findById(tenantId, recordId);
    if (!existing.ok) return existing;

    if (existing.value) {
      const data = existing.value.data;
      // Dedupe idempotente: si el eventId ya se aplicó, no repetir efecto.
      if (eventIdsDe(data).includes(event.id)) return ok(undefined);
      const previo = {
        valor: Number(data["valor"] ?? 0),
        porEstado: (data["porEstado"] as Record<string, number> | undefined) ?? {},
      };
      const siguiente = nuevoValor(kpi, previo, event.payload, esCreacion, esEliminacion);
      const eventIds = [...eventIdsDe(data), event.id].slice(-MAX_EVENT_IDS);
      const updated = await deps.store.update(uow, tenantId, recordId, existing.value.version, {
        data: {
          nombre: kpi.nombre,
          descripcion: kpi.descripcion,
          tipo: kpi.tipo,
          campo: kpi.campo ?? null,
          valor: siguiente.valor,
          porEstado: siguiente.porEstado,
          [EVENT_IDS_KEY]: eventIds,
        },
      });
      return updated.ok ? ok(undefined) : updated;
    }

    const siguiente = nuevoValor(kpi, {}, event.payload, esCreacion, esEliminacion);
    const inserted = await deps.store.insert(uow, {
      id: recordId,
      tenantId,
      service: def.servicio,
      recordType: KPI_RECORD_TYPE,
      status: "active",
      data: {
        nombre: kpi.nombre,
        descripcion: kpi.descripcion,
        tipo: kpi.tipo,
        campo: kpi.campo ?? null,
        valor: siguiente.valor,
        porEstado: siguiente.porEstado,
        [EVENT_IDS_KEY]: [event.id],
      },
      createdBy: "system",
    });
    return inserted.ok ? ok(undefined) : inserted;
  });
  return result.ok ? ok(undefined) : result;
}

/**
 * Event handlers de proyección de KPIs: cada evento del núcleo (creada,
 * actualizada, transicionada, eliminada) actualiza todos los KPIs declarados.
 */
export function handlersKpis(
  def: DefinicionEntidad,
  kpis: readonly DefinicionKpi[],
): readonly EventHandlerDefinition[] {
  const eventos = eventosDeEntidad(def);
  const handlers: EventHandlerDefinition[] = [];
  for (const kpi of kpis) {
    for (const eventType of eventos.todos) {
      handlers.push({
        eventType,
        handlerName: `kpi:${kpi.nombre}:${eventType}`,
        handle: (deps: ServiceDeps) => (event) => aplicarKpi(def, kpi, deps, event),
      });
    }
  }
  return handlers;
}

/** Genera la consulta de KPIs de una entidad. */
export function crearIndicadores(
  def: DefinicionEntidad,
  kpis: readonly DefinicionKpi[],
): {
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombre = nombreKpis(def);

  const kpisQuery = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({}),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const rows = await deps.store.list(tenant.value, {
        service: def.servicio,
        recordType: KPI_RECORD_TYPE,
        limit: 500,
      });
      if (!rows.ok) return rows;
      const porId = new Map(rows.value.map((r) => [r.id, r]));
      const valores = kpis.map((kpi) => {
        const r = porId.get(idKpi(def, kpi));
        return {
          nombre: kpi.nombre,
          descripcion: kpi.descripcion,
          tipo: kpi.tipo,
          valor: r ? Number(r.data["valor"] ?? 0) : 0,
          porEstado: r ? ((r.data["porEstado"] as Record<string, number>) ?? {}) : {},
        };
      });
      return ok({ kpis: valores });
    },
  });

  return { queries: [kpisQuery] };
}
