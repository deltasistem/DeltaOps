/**
 * DGP-020.3 · Recurso humano de mantenimiento — DOMINIO PURO.
 *
 * Agregado LIGERO: la identidad es SIEMPRE canónica (`identityId`, único por
 * tenant). El NOMBRE nunca se persiste como identificador (§4): se resuelve al
 * mostrar vía el IdentidadPort. Estados mínimos ACTIVO|INACTIVO (§11): un recurso
 * INACTIVO no es seleccionable para NUEVAS configuraciones, pero NUNCA se borra
 * (histórico intacto). Sin reloj interno: fecha/actor llegan como INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

export const ESTADOS_RECURSO = ["ACTIVO", "INACTIVO"] as const;
export type EstadoRecurso = (typeof ESTADOS_RECURSO)[number];

export interface RecursoHumano {
  readonly tenantId: string;
  readonly identityId: string;
  readonly categoriaClave: string;
  readonly estado: EstadoRecurso;
  readonly creadoAt: Date;
  readonly actualizadoAt: Date;
  readonly creadoPor: string;
  readonly actualizadoPor: string;
}

export interface DefinirRecursoInput {
  readonly tenantId: string;
  readonly identityId: string;
  readonly categoriaClave: string;
  readonly actorId: string;
  readonly ahora: Date;
  /** Recurso existente (upsert idempotente por identityId): conserva creadoAt/creadoPor. */
  readonly existente?: RecursoHumano | null;
}

/**
 * Alta/actualización idempotente de un recurso humano (upsert por identityId).
 * Si ya existía, conserva la auditoría de creación y actualiza categoría/actor.
 */
export function definirRecurso(input: DefinirRecursoInput): Result<RecursoHumano, KernelError> {
  if (input.identityId.trim() === "") return fail(KernelErrors.validation("identityId es obligatorio"));
  if (input.categoriaClave.trim() === "") return fail(KernelErrors.validation("categoriaClave es obligatoria"));
  const base = input.existente;
  return ok(
    Object.freeze({
      tenantId: input.tenantId,
      identityId: input.identityId,
      categoriaClave: input.categoriaClave,
      // Al redefinir un recurso INACTIVO se reactiva (queda seleccionable).
      estado: "ACTIVO" as EstadoRecurso,
      creadoAt: base?.creadoAt ?? input.ahora,
      actualizadoAt: input.ahora,
      creadoPor: base?.creadoPor ?? input.actorId,
      actualizadoPor: input.actorId,
    }),
  );
}

/** Cambia el estado operacional (nunca borra). */
export function cambiarEstadoRecurso(
  recurso: RecursoHumano,
  estado: EstadoRecurso,
  actorId: string,
  ahora: Date,
): Result<RecursoHumano, KernelError> {
  if (!ESTADOS_RECURSO.includes(estado)) return fail(KernelErrors.validation(`Estado inválido: ${estado}`));
  return ok(Object.freeze({ ...recurso, estado, actualizadoAt: ahora, actualizadoPor: actorId }));
}
