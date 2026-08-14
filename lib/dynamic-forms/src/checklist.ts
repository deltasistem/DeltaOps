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
  /**
   * Criticidad DECLARADA por quien diseña la plantilla (motor neutro; jamás
   * inferida por nombre/texto/categoría). Un ítem `critico:true` con estado
   * `false` (no conforme) fuerza el veredicto NO APTO en las capas de negocio
   * que consuman este checklist. Ausente/`false` ⇒ NO crítico. La criticidad
   * queda anclada a la VERSIÓN de la plantilla (inmutabilidad N/N-1), de modo
   * que un cambio posterior jamás altera el resultado de ejecuciones históricas.
   */
  readonly critico?: boolean;
  /** Agrupación de presentación del ítem (mobile-first, no afecta la validación). */
  readonly categoria?: string;
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
    critico: z.boolean().optional(),
    categoria: z.string().optional(),
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

/* ------------------------------- Veredicto -------------------------------- */

/**
 * Veredicto de instancia de un checklist (regla de negocio de Dirección):
 *   - APTO: todos los obligatorios cumplen y no hay incumplimientos.
 *   - APTO_CON_OBSERVACIONES: sin incumplimientos CRÍTICOS, pero hay
 *     observaciones o incumplimientos NO críticos que requieren seguimiento.
 *   - NO_APTO: al menos un ítem CRÍTICO con estado NO CUMPLE (false).
 * NO_APLICA nunca cuenta como incumplimiento ni cambia el estado por sí solo.
 */
export type Veredicto = "APTO" | "APTO_CON_OBSERVACIONES" | "NO_APTO";

/** Ítem incumplido con su criticidad (procedencia para el hallazgo). */
export interface IncumplimientoItem {
  readonly clave: string;
  readonly etiqueta: string;
  readonly critico: boolean;
  readonly comentario?: string;
  readonly evidencias?: readonly string[];
}

/** Resultado completo del cálculo del veredicto. */
export interface ResultadoVeredicto {
  readonly veredicto: Veredicto;
  /** Ítems con estado `false` (no cumple), críticos primero. */
  readonly incumplimientos: readonly IncumplimientoItem[];
  /** Ítems con observación (comentario) que no son incumplimientos. */
  readonly observaciones: readonly IncumplimientoItem[];
  readonly hayCriticoIncumplido: boolean;
  readonly puntaje: PuntajeChecklist;
}

/**
 * Calcula el VEREDICTO de un checklist a partir de su definición (que declara la
 * criticidad por ítem) y las respuestas. Función PURA y DETERMINISTA; la capa de
 * negocio la ejecuta en el servidor y SELLA el resultado contra la versión de la
 * plantilla usada (no se recalcula retroactivamente). La criticidad proviene
 * EXCLUSIVAMENTE de `item.critico` (declarada en la plantilla); jamás se infiere.
 */
export function calcularVeredicto(
  def: DefinicionChecklist,
  respuestas: readonly RespuestaItem[],
): ResultadoVeredicto {
  const porClave = new Map(respuestas.map((r) => [r.clave, r]));
  const incumplimientos: IncumplimientoItem[] = [];
  const observaciones: IncumplimientoItem[] = [];
  let hayCriticoIncumplido = false;

  for (const item of def.items) {
    const r = porClave.get(item.clave);
    if (!r) continue; // sin respuesta: no es incumplimiento (obligatoriedad la valida itemsPendientes)
    if (r.estado === "na") continue; // NO APLICA nunca cuenta como incumplimiento

    const critico = item.critico === true;
    if (r.estado === false) {
      const inc: IncumplimientoItem = {
        clave: item.clave,
        etiqueta: item.etiqueta,
        critico,
        ...(r.comentario ? { comentario: r.comentario } : {}),
        ...(r.evidencias && r.evidencias.length > 0 ? { evidencias: r.evidencias } : {}),
      };
      incumplimientos.push(inc);
      if (critico) hayCriticoIncumplido = true;
    } else if (r.estado === true && r.comentario && r.comentario.trim().length > 0) {
      // Cumple pero con observación → requiere seguimiento (no incumplimiento).
      observaciones.push({ clave: item.clave, etiqueta: item.etiqueta, critico, comentario: r.comentario });
    }
  }

  // Críticos primero en la lista de incumplimientos (procedencia priorizada).
  incumplimientos.sort((a, b) => Number(b.critico) - Number(a.critico));

  let veredicto: Veredicto;
  if (hayCriticoIncumplido) {
    veredicto = "NO_APTO";
  } else if (incumplimientos.length > 0 || observaciones.length > 0) {
    veredicto = "APTO_CON_OBSERVACIONES";
  } else {
    veredicto = "APTO";
  }

  return {
    veredicto,
    incumplimientos,
    observaciones,
    hayCriticoIncumplido,
    puntaje: calcularPuntaje(def, respuestas),
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
