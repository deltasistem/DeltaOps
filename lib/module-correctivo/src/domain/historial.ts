/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Historial/bitácora de hitos.
 *
 * Registro auditable append-only de los hitos del ciclo de vida de cada entidad
 * (solicitud/intervención/generación). Dominio PURO: fecha/actor por INPUT.
 * Alimenta la proyección de historial y el shared timeline en la etapa 2.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

export interface HistorialCorrectivo {
  readonly id: string;
  /** Referencia opaca de la entidad (p. ej. `solicitud-correctiva:<id>`). */
  readonly entityRef: string;
  /** Hito neutro (creada/triage/diagnostico/aprobada/materializada/cerrada/…). */
  readonly hito: string;
  readonly version: number;
  readonly detalle: Record<string, unknown>;
  readonly ocurridoEn: string;
  readonly actorId: string;
}

export interface CrearHistorialInput {
  readonly id: string;
  readonly entityRef: string;
  readonly hito: string;
  readonly version: number;
  readonly detalle?: Record<string, unknown>;
  readonly ocurridoEn: string;
  readonly actorId: string;
}

export function crearHistorial(input: CrearHistorialInput): Result<HistorialCorrectivo, KernelError> {
  if (input.hito.trim() === "") return fail(KernelErrors.validation("El hito del historial es obligatorio"));
  if (input.entityRef.trim() === "") return fail(KernelErrors.validation("La referencia de entidad es obligatoria"));
  if (Number.isNaN(Date.parse(input.ocurridoEn))) return fail(KernelErrors.validation("La fecha del hito no es ISO válida"));
  return ok(
    Object.freeze({
      id: input.id,
      entityRef: input.entityRef,
      hito: input.hito,
      version: input.version,
      detalle: Object.freeze({ ...(input.detalle ?? {}) }),
      ocurridoEn: input.ocurridoEn,
      actorId: input.actorId,
    }),
  );
}
