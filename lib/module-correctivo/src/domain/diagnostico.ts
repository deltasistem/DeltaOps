/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — `Diagnostico` (Dynamic Forms).
 *
 * El diagnóstico se captura mediante Dynamic Forms (DGP-003): sus respuestas se
 * ANCLAN a una plantilla+versión (referencia sólo-lectura). El aggregate del
 * diagnóstico NO redefine el vocabulario de formularios; sólo guarda la
 * referencia a la plantilla, las respuestas capturadas y la clasificación
 * resultante (causa reportada/encontrada/raíz, modo de falla, efecto, criticidad,
 * impacto, recomendaciones) — todas por CLAVE DE CATÁLOGO.
 *
 * Dominio PURO: fecha/actor por INPUT (validados).
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { DIAGNOSTICO_REGISTRADO } from "./events";
import type { Clasificacion } from "./value-objects";

/** Referencia inmutable a la plantilla de Dynamic Forms del diagnóstico. */
export interface ReferenciaPlantilla {
  readonly plantillaId: string;
  readonly version: number;
}

export interface Diagnostico {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  /** Plantilla+versión de Dynamic Forms a la que se anclan las respuestas. */
  readonly plantilla: ReferenciaPlantilla;
  /** Respuestas capturadas (opacas para el dominio; las valida Dynamic Forms). */
  readonly respuestas: Record<string, unknown>;
  /** Causa REPORTADA por quien solicita (clave de catálogo `causas`, opcional). */
  readonly causaReportada: string | null;
  /** Causa ENCONTRADA en la inspección (clave de catálogo `causas`, opcional). */
  readonly causaEncontrada: string | null;
  /** Causa RAÍZ (clave de catálogo `causas`, opcional). */
  readonly causaRaiz: string | null;
  /** Clasificación resultante (modo/efecto/severidad/impacto/tipoFalla). */
  readonly clasificacion: Clasificacion;
  /** Recomendaciones (texto libre). */
  readonly recomendaciones: string | null;
  readonly registradoEn: string;
  readonly registradoPor: string;
  readonly version: number;
}

export interface CambioDiagnostico {
  readonly diagnostico: Diagnostico;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

export interface RegistrarDiagnosticoInput {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly plantilla: ReferenciaPlantilla;
  readonly respuestas: Record<string, unknown>;
  readonly causaReportada?: string | null;
  readonly causaEncontrada?: string | null;
  readonly causaRaiz?: string | null;
  readonly clasificacion: Clasificacion;
  readonly recomendaciones?: string | null;
  readonly registradoPor: string;
  readonly ahora: string;
}

export function registrarDiagnostico(input: RegistrarDiagnosticoInput): Result<CambioDiagnostico, KernelError> {
  if (input.plantilla.plantillaId.trim() === "") {
    return fail(KernelErrors.validation("El diagnóstico requiere una plantilla de Dynamic Forms"));
  }
  if (!Number.isInteger(input.plantilla.version) || input.plantilla.version <= 0) {
    return fail(KernelErrors.validation("La versión de la plantilla debe ser un entero positivo"));
  }
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));

  const d: Diagnostico = {
    id: input.id,
    tenantId: input.tenantId,
    solicitudId: input.solicitudId,
    plantilla: Object.freeze({ ...input.plantilla }),
    respuestas: Object.freeze({ ...input.respuestas }),
    causaReportada: input.causaReportada ?? null,
    causaEncontrada: input.causaEncontrada ?? null,
    causaRaiz: input.causaRaiz ?? null,
    clasificacion: input.clasificacion,
    recomendaciones: input.recomendaciones ?? null,
    registradoEn: input.ahora,
    registradoPor: input.registradoPor,
    version: 1,
  };
  return ok({
    diagnostico: Object.freeze(d),
    evento: {
      tipo: DIAGNOSTICO_REGISTRADO,
      payload: {
        tenantId: d.tenantId,
        id: d.id,
        entityRef: `diagnostico-correctivo:${d.id}`,
        solicitudId: d.solicitudId,
        plantillaId: d.plantilla.plantillaId,
        plantillaVersion: d.plantilla.version,
        causaRaiz: d.causaRaiz,
        version: d.version,
        actualizadoAt: d.registradoEn,
        actorId: d.registradoPor,
        eventoTipo: DIAGNOSTICO_REGISTRADO,
        snapshot: d,
      },
    },
  });
}
