/**
 * DELTAOPS LITE-05 · Mutaciones del bucle Hallazgo→OT con degradación Offline
 * First. Reutiliza la ÚNICA cola offline existente (`mutarConOffline` + la misma
 * `ColaSync`). Cada operación (generar / descartar / reabrir) es un comando
 * ORQUESTADOR idempotente por `opId` derivado del hallazgo: doble-click, refresh
 * o replay convergen a UNA sola OT o UN solo descarte. El cliente NO decide el
 * estado terminal sin sello del servidor.
 */
import { hallazgoFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import type { EstadoHallazgoResuelto } from "./tipos";

export interface ResultadoMutacionHallazgo {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/** Estado + procedencia (resueltos SERVER-SIDE) de un hallazgo del preoperacional. */
export async function obtenerEstadoHallazgo(
  ejecucionId: string,
  itemClave: string,
  signal?: AbortSignal,
): Promise<EstadoHallazgoResuelto> {
  const qs = new URLSearchParams({ ejecucionId, itemClave });
  return hallazgoFetch<EstadoHallazgoResuelto>(`/estado?${qs.toString()}`, { signal });
}

/** GENERAR mantenimiento (OT) desde el hallazgo. Idempotente end-to-end. */
export async function generarMantenimiento(
  cola: ColaSync,
  args: { ejecucionId: string; itemClave: string; etiqueta: string },
): Promise<ResultadoMutacionHallazgo> {
  const input = { ejecucionId: args.ejecucionId, itemClave: args.itemClave, opId: nuevoOpId() };
  return mutarConOffline(cola, {
    comando: "generar",
    input,
    descripcion: `Generar mantenimiento: ${args.etiqueta}`,
    directo: () => hallazgoFetch("/generar", { method: "POST", body: input }),
  });
}

/** DESCARTAR el hallazgo («No requiere mantenimiento»); reversible y auditado. */
export async function descartarHallazgo(
  cola: ColaSync,
  args: { ejecucionId: string; itemClave: string; etiqueta: string; motivo?: string },
): Promise<ResultadoMutacionHallazgo> {
  const input = {
    ejecucionId: args.ejecucionId,
    itemClave: args.itemClave,
    opId: nuevoOpId(),
    ...(args.motivo ? { motivo: args.motivo } : {}),
  };
  return mutarConOffline(cola, {
    comando: "descartar",
    input,
    descripcion: `No requiere mantenimiento: ${args.etiqueta}`,
    directo: () => hallazgoFetch("/descartar", { method: "POST", body: input }),
  });
}

/** REABRIR un hallazgo descartado (vuelve a pendiente). */
export async function reabrirHallazgo(
  cola: ColaSync,
  args: { ejecucionId: string; itemClave: string; etiqueta: string; motivo?: string },
): Promise<ResultadoMutacionHallazgo> {
  const input = {
    ejecucionId: args.ejecucionId,
    itemClave: args.itemClave,
    opId: nuevoOpId(),
    ...(args.motivo ? { motivo: args.motivo } : {}),
  };
  return mutarConOffline(cola, {
    comando: "reabrir",
    input,
    descripcion: `Reabrir hallazgo: ${args.etiqueta}`,
    directo: () => hallazgoFetch("/reabrir", { method: "POST", body: input }),
  });
}
