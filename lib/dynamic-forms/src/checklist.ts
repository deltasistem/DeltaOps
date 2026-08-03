/**
 * DGP-007 · Dynamic Forms Engine — Checklist Runtime.
 *
 * Checklists REUTILIZABLES y VERSIONADOS: cada ítem puede ser obligatorio u
 * opcional, exigir evidencias, exigir firma y aportar un puntaje. El cálculo de
 * puntaje total/porcentaje es DECLARATIVO (ponderado por ítem). Un checklist se
 * instancia dentro de un formulario (campo `checklist`) o de forma autónoma.
 *
 * Neutro: los ejemplos usan "revisión genérica" / ítems demostrativos.
 */
import { z } from "zod";

/** Ítem declarativo de un checklist. */
export interface ItemChecklist {
  readonly clave: string;
  readonly etiqueta: string;
  readonly obligatorio?: boolean;
  /** Tipos de evidencia requeridos para marcar el ítem (ver evidencias.ts). */
  readonly evidenciasRequeridas?: readonly string[];
  readonly firmaRequerida?: boolean;
  /** Puntaje que aporta el ítem cuando se marca como conforme. */
  readonly puntaje?: number;
}

/** Definición de un checklist reutilizable versionado. */
export interface DefinicionChecklist {
  readonly clave: string;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly version: number;
  readonly items: readonly ItemChecklist[];
  /** Puntaje máximo declarado (si no, se suma el de los ítems). */
  readonly puntajeMaximo?: number;
}

export const itemChecklistSchema: z.ZodType<ItemChecklist> = z
  .object({
    clave: z.string().min(1),
    etiqueta: z.string().min(1),
    obligatorio: z.boolean().optional(),
    evidenciasRequeridas: z.array(z.string()).optional(),
    firmaRequerida: z.boolean().optional(),
    puntaje: z.number().optional(),
  })
  .strict();

export const definicionChecklistSchema: z.ZodType<DefinicionChecklist> = z
  .object({
    clave: z.string().min(1),
    titulo: z.string().min(1),
    descripcion: z.string().optional(),
    version: z.number().int().positive(),
    items: z.array(itemChecklistSchema).min(1),
    puntajeMaximo: z.number().optional(),
  })
  .strict() as z.ZodType<DefinicionChecklist>;

/** Respuesta de un ítem al ejecutar un checklist. */
export interface RespuestaItem {
  readonly clave: string;
  /** true = conforme; false = no conforme; "na" = no aplica. */
  readonly estado: boolean | "na";
  readonly comentario?: string;
  /** ids de evidencias aportadas (adjuntos, fotos, etc.). */
  readonly evidencias?: readonly string[];
  readonly firma?: { readonly dataUrl: string; readonly firmante: string; readonly timestamp: string };
}

/** Resultado del cálculo de puntaje de un checklist instanciado. */
export interface PuntajeChecklist {
  readonly puntajeObtenido: number;
  readonly puntajeMaximo: number;
  readonly porcentaje: number;
  readonly itemsConformes: number;
  readonly itemsNoConformes: number;
  readonly itemsNoAplica: number;
}

/** Valida la estructura de un checklist. */
export function validarChecklist(entrada: unknown): DefinicionChecklist {
  return definicionChecklistSchema.parse(entrada);
}

/** Puntaje máximo efectivo (declarado o suma de ítems). */
export function puntajeMaximo(def: DefinicionChecklist): number {
  if (def.puntajeMaximo !== undefined) return def.puntajeMaximo;
  return def.items.reduce((a, it) => a + (it.puntaje ?? 0), 0);
}

/**
 * Calcula el puntaje de un checklist a partir de sus respuestas. Los ítems "na"
 * (no aplica) se excluyen del máximo para no penalizar el porcentaje.
 */
export function calcularPuntaje(
  def: DefinicionChecklist,
  respuestas: readonly RespuestaItem[],
): PuntajeChecklist {
  const porClave = new Map(respuestas.map((r) => [r.clave, r]));
  let puntajeObtenido = 0;
  let maximoAplicable = 0;
  let conformes = 0;
  let noConformes = 0;
  let noAplica = 0;

  for (const item of def.items) {
    const r = porClave.get(item.clave);
    const peso = item.puntaje ?? 0;
    if (!r || r.estado === "na") {
      if (r?.estado === "na") noAplica += 1;
      continue;
    }
    maximoAplicable += peso;
    if (r.estado === true) {
      puntajeObtenido += peso;
      conformes += 1;
    } else {
      noConformes += 1;
    }
  }

  const maximo = maximoAplicable;
  const porcentaje = maximo > 0 ? Math.round((puntajeObtenido / maximo) * 10000) / 100 : 0;

  return {
    puntajeObtenido,
    puntajeMaximo: maximo,
    porcentaje,
    itemsConformes: conformes,
    itemsNoConformes: noConformes,
    itemsNoAplica: noAplica,
  };
}

/** Verifica que todos los ítems obligatorios tengan respuesta válida y evidencias/firma. */
export function itemsPendientes(
  def: DefinicionChecklist,
  respuestas: readonly RespuestaItem[],
): { clave: string; motivo: string }[] {
  const porClave = new Map(respuestas.map((r) => [r.clave, r]));
  const pendientes: { clave: string; motivo: string }[] = [];
  for (const item of def.items) {
    const r = porClave.get(item.clave);
    if (item.obligatorio && (!r || r.estado === undefined)) {
      pendientes.push({ clave: item.clave, motivo: "ítem obligatorio sin responder" });
      continue;
    }
    if (!r || r.estado === "na") continue;
    if ((item.evidenciasRequeridas?.length ?? 0) > 0 && (r.evidencias?.length ?? 0) === 0) {
      pendientes.push({ clave: item.clave, motivo: "evidencia requerida ausente" });
    }
    if (item.firmaRequerida && !r.firma) {
      pendientes.push({ clave: item.clave, motivo: "firma requerida ausente" });
    }
  }
  return pendientes;
}
