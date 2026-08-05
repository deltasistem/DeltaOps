/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregate `Reserva`.
 *
 * Una reserva aparta existencias DISPONIBLES para una demanda futura concreta
 * (OT, preventivo, correctivo, proyecto, solicitud, transferencia). El TIPO de
 * demanda es una clave del catálogo `tipos-reserva` (neutro/configurable). La
 * reserva NUNCA rompe la consistencia del stock: su creación/liberación se
 * traduce SIEMPRE a movimientos (`reserva`/`liberacion`) sobre las existencias.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { RESERVA_CREADA, RESERVA_LIBERADA } from "./events";

export const ESTADOS_RESERVA = ["activa", "liberada", "consumida"] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export interface Reserva {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly inventarioId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  /** Clave del catálogo `tipos-reserva`. */
  readonly tipo: string;
  /** Referencia a la demanda que motiva la reserva (OT/proyecto/…). */
  readonly demanda: { tipo: string; id: string };
  readonly cantidad: number;
  readonly cantidadLiberada: number;
  readonly estado: EstadoReserva;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioReserva {
  readonly reserva: Reserva;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(r: Reserva, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioReserva["evento"] {
  return {
    tipo,
    payload: {
      tenantId: r.tenantId,
      id: r.id,
      entityRef: `inventario-reserva:${r.id}`,
      itemId: r.itemId,
      inventarioId: r.inventarioId,
      bodegaId: r.bodegaId,
      ubicacionId: r.ubicacionId,
      tipo: r.tipo,
      demanda: r.demanda,
      cantidad: r.cantidad,
      cantidadLiberada: r.cantidadLiberada,
      estado: r.estado,
      version: r.version,
      createdBy: r.createdBy,
      actualizadoAt: r.updatedAt.toISOString(),
      actorId,
      eventoTipo: tipo,
      ...extra,
    },
  };
}

export interface DatosNuevaReserva {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly inventarioId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly tipo: string;
  readonly demanda: { tipo: string; id: string };
  readonly cantidad: number;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearReserva(d: DatosNuevaReserva): Result<CambioReserva, KernelError> {
  if (!(d.cantidad > 0)) return fail(KernelErrors.validation("La cantidad reservada debe ser positiva"));
  if (!d.tipo) return fail(KernelErrors.validation("El tipo de reserva es obligatorio"));
  if (!d.demanda?.id) return fail(KernelErrors.validation("La reserva requiere una demanda de origen"));
  const reserva: Reserva = {
    id: d.id,
    tenantId: d.tenantId,
    itemId: d.itemId,
    inventarioId: d.inventarioId,
    bodegaId: d.bodegaId,
    ubicacionId: d.ubicacionId,
    tipo: d.tipo,
    demanda: d.demanda,
    cantidad: d.cantidad,
    cantidadLiberada: 0,
    estado: "activa",
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ reserva, evento: eventoDe(reserva, RESERVA_CREADA, d.actorId) });
}

/**
 * Libera (total o parcialmente) una reserva ACTIVA. Devuelve la cantidad
 * efectivamente liberada en el evento, para que la aplicación emita el
 * movimiento `liberacion` correspondiente. Nunca libera más de lo pendiente.
 */
export function liberarReserva(
  reserva: Reserva,
  cantidad: number | null,
  actorId: string,
  ahora: Date,
): Result<CambioReserva, KernelError> {
  if (reserva.estado !== "activa") {
    return fail(KernelErrors.conflict(`La reserva no está activa (estado: ${reserva.estado})`));
  }
  const pendiente = reserva.cantidad - reserva.cantidadLiberada;
  const aLiberar = cantidad ?? pendiente;
  if (!(aLiberar > 0)) return fail(KernelErrors.validation("La cantidad a liberar debe ser positiva"));
  if (aLiberar > pendiente + 1e-9) {
    return fail(KernelErrors.conflict(`No se puede liberar ${aLiberar}: pendiente ${pendiente}`));
  }
  const cantidadLiberada = reserva.cantidadLiberada + aLiberar;
  const estado: EstadoReserva = cantidadLiberada >= reserva.cantidad - 1e-9 ? "liberada" : "activa";
  const siguiente: Reserva = {
    ...reserva,
    cantidadLiberada,
    estado,
    version: reserva.version + 1,
    updatedAt: ahora,
  };
  return ok({ reserva: siguiente, evento: eventoDe(siguiente, RESERVA_LIBERADA, actorId, { liberado: aLiberar }) });
}
