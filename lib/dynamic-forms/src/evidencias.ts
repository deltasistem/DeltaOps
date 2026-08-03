/**
 * DGP-007 · Dynamic Forms Engine — Evidence Runtime.
 *
 * Evidencias declaradas por campo o por ítem de checklist: adjuntos
 * (platform.attachment), comentarios (platform.comment), firma (dataURL +
 * firmante + timestamp), fotografía, geolocalización {lat,lng,precision}.
 * TODA evidencia queda SELLADA con {usuarioId, timestamp ISO, dispositivo?}
 * tomados del contexto de ejecución. Offline First: cada evidencia lleva `opId`.
 */
import { z } from "zod";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Result,
} from "@workspace/kernel";

export type TipoEvidencia =
  | "adjunto"
  | "comentario"
  | "firma"
  | "fotografia"
  | "geolocalizacion";

/** Sello inmutable de trazabilidad de una evidencia. */
export interface SelloEvidencia {
  readonly usuarioId: string;
  readonly timestamp: string;
  readonly dispositivo?: string;
}

export interface EvidenciaAdjunto {
  readonly tipo: "adjunto";
  readonly campo: string;
  readonly attachmentId: string;
  readonly sello: SelloEvidencia;
  readonly opId?: string;
}
export interface EvidenciaComentario {
  readonly tipo: "comentario";
  readonly campo: string;
  readonly texto: string;
  readonly sello: SelloEvidencia;
  readonly opId?: string;
}
export interface EvidenciaFirma {
  readonly tipo: "firma";
  readonly campo: string;
  readonly dataUrl: string;
  readonly firmante: string;
  readonly sello: SelloEvidencia;
  readonly opId?: string;
}
export interface EvidenciaFotografia {
  readonly tipo: "fotografia";
  readonly campo: string;
  readonly attachmentId: string;
  readonly sello: SelloEvidencia;
  readonly opId?: string;
}
export interface EvidenciaGeolocalizacion {
  readonly tipo: "geolocalizacion";
  readonly campo: string;
  readonly lat: number;
  readonly lng: number;
  readonly precision?: number;
  readonly sello: SelloEvidencia;
  readonly opId?: string;
}

export type Evidencia =
  | EvidenciaAdjunto
  | EvidenciaComentario
  | EvidenciaFirma
  | EvidenciaFotografia
  | EvidenciaGeolocalizacion;

/** Entrada declarativa de una evidencia (antes de sellar). */
export type EntradaEvidencia =
  | { readonly tipo: "adjunto"; readonly campo: string; readonly attachmentId: string; readonly opId?: string }
  | { readonly tipo: "comentario"; readonly campo: string; readonly texto: string; readonly opId?: string }
  | { readonly tipo: "firma"; readonly campo: string; readonly dataUrl: string; readonly firmante: string; readonly opId?: string }
  | { readonly tipo: "fotografia"; readonly campo: string; readonly attachmentId: string; readonly opId?: string }
  | {
      readonly tipo: "geolocalizacion";
      readonly campo: string;
      readonly lat: number;
      readonly lng: number;
      readonly precision?: number;
      readonly opId?: string;
    };

export const selloSchema: z.ZodType<SelloEvidencia> = z
  .object({
    usuarioId: z.string().min(1),
    timestamp: z.string().min(1),
    dispositivo: z.string().optional(),
  })
  .strict();

export const entradaEvidenciaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("adjunto"), campo: z.string().min(1), attachmentId: z.string().min(1), opId: z.string().optional() }),
  z.object({ tipo: z.literal("comentario"), campo: z.string().min(1), texto: z.string().min(1), opId: z.string().optional() }),
  z.object({ tipo: z.literal("firma"), campo: z.string().min(1), dataUrl: z.string().min(1), firmante: z.string().min(1), opId: z.string().optional() }),
  z.object({ tipo: z.literal("fotografia"), campo: z.string().min(1), attachmentId: z.string().min(1), opId: z.string().optional() }),
  z.object({ tipo: z.literal("geolocalizacion"), campo: z.string().min(1), lat: z.number(), lng: z.number(), precision: z.number().optional(), opId: z.string().optional() }),
]);

/**
 * Sella una evidencia con la identidad y el momento del contexto de ejecución.
 * El sello NO puede provenir del cliente: siempre se toma del `ctx`.
 */
export function sellarEvidencia(
  entrada: EntradaEvidencia,
  ctx: ExecutionContext,
  ahora: Date,
  dispositivo?: string,
): Result<Evidencia, KernelError> {
  const parsed = entradaEvidenciaSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail(
      KernelErrors.validation("Evidencia inválida", {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      }),
    );
  }
  const sello: SelloEvidencia = {
    usuarioId: ctx.principal.id,
    timestamp: ahora.toISOString(),
    ...(dispositivo ? { dispositivo } : {}),
  };
  const e = parsed.data;
  return ok({ ...e, sello } as Evidencia);
}

/** Sella un lote de evidencias en una sola operación. */
export function sellarEvidencias(
  entradas: readonly EntradaEvidencia[],
  ctx: ExecutionContext,
  ahora: Date,
  dispositivo?: string,
): Result<Evidencia[], KernelError> {
  const out: Evidencia[] = [];
  for (const entrada of entradas) {
    const sellada = sellarEvidencia(entrada, ctx, ahora, dispositivo);
    if (!sellada.ok) return sellada;
    out.push(sellada.value);
  }
  return ok(out);
}

/**
 * Persiste el efecto lateral de una evidencia en la plataforma compartida
 * (comentario → platform.comment). Los adjuntos/fotos referencian ids ya
 * subidos vía platform.attachment; la geolocalización/firma se guardan como
 * payload del evento de respuesta (autosuficiente). Se ejecuta como sistema
 * dentro del correlationId del comando; idempotente por `opId`.
 */
export async function registrarComentarioEvidencia(
  deps: ServiceDeps,
  ctx: ExecutionContext,
  evidencia: EvidenciaComentario,
  entityRef: string,
): Promise<Result<unknown, KernelError>> {
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return tenant;
  return deps.runtime.commands.execute(ctx, "platform.comment.create", {
    entityRef,
    texto: evidencia.texto,
  });
}
