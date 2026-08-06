/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Aggregate `CalendarioOperacional`.
 *
 * Modela días laborales, festivos, turnos, ventanas, paradas, bloqueos y
 * exclusiones por empresa/proyecto/activo. Provee resolución DETERMINISTA de la
 * próxima fecha hábil. Dominio PURO: la fecha objetivo llega como INPUT (jamás
 * reloj interno).
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Días de la semana (0=domingo … 6=sábado), neutro y determinista. */
export const DiaSemanaSchema = z.number().int().min(0).max(6);

export const TurnoSchema = z
  .object({
    /** Clave del catálogo `turnos`. */
    clave: z.string().min(1).max(40),
    /** Hora de inicio (minutos desde medianoche, 0..1439). */
    inicioMin: z.number().int().min(0).max(1439),
    /** Hora de fin (minutos desde medianoche, 1..1440). */
    finMin: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine((t) => t.finMin > t.inicioMin, { message: "El turno debe terminar después de iniciar" });
export type Turno = Readonly<z.infer<typeof TurnoSchema>>;

/** Ventana/parada/bloqueo/exclusión: rango de fechas ISO (inclusive). */
export const RangoFechasSchema = z
  .object({
    /** Clave del catálogo `tipos-parada` cuando aplica (o etiqueta libre). */
    tipo: z.string().min(1).max(40),
    desde: z.string().min(1),
    hasta: z.string().min(1),
    etiqueta: z.string().max(200).optional(),
  })
  .strict();
export type RangoFechas = Readonly<z.infer<typeof RangoFechasSchema>>;

export const CalendarioOperacionalSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    /** Clave del catálogo `tipos-calendario` (empresa/proyecto/activo). */
    tipo: z.string().min(1).max(40),
    /** Ámbito al que aplica (empresaId/proyectoId/activoId). */
    ambito: z.string().min(1).max(120),
    nombre: z.string().min(1).max(200),
    /** Días laborales de la semana (0..6). */
    diasLaborales: z.array(DiaSemanaSchema).min(1),
    /** Festivos como fechas ISO (yyyy-mm-dd) — no hábiles. */
    festivos: z.array(z.string().min(1)).default([]),
    turnos: z.array(TurnoSchema).default([]),
    /** Ventanas de mantenimiento permitidas (si vacío, todo día hábil vale). */
    ventanas: z.array(RangoFechasSchema).default([]),
    /** Paradas/bloqueos/exclusiones donde NO se puede programar. */
    exclusiones: z.array(RangoFechasSchema).default([]),
    version: z.number().int().nonnegative().default(0),
  })
  .strict();
export type CalendarioOperacional = Readonly<z.infer<typeof CalendarioOperacionalSchema>>;

export function crearCalendarioOperacional(input: unknown): Result<CalendarioOperacional, KernelError> {
  const p = CalendarioOperacionalSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Calendario operacional inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }) as CalendarioOperacional);
}

const MS_DIA = 86_400_000;

/** Normaliza un instante ISO a la fecha yyyy-mm-dd en UTC. */
function fechaUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function estaEnRango(fecha: string, rangos: readonly RangoFechas[]): boolean {
  const t = Date.parse(fecha);
  for (const r of rangos) {
    const d = Date.parse(fechaUTC(r.desde));
    const h = Date.parse(fechaUTC(r.hasta));
    if (t >= d && t <= h) return true;
  }
  return false;
}

/** ¿La fecha (ISO) es hábil según el calendario? */
export function esDiaHabil(cal: CalendarioOperacional, iso: string): boolean {
  const dia = fechaUTC(iso);
  const dow = new Date(dia).getUTCDay();
  if (!cal.diasLaborales.includes(dow)) return false;
  if (cal.festivos.map(fechaUTC).includes(dia)) return false;
  if (estaEnRango(dia, cal.exclusiones)) return false;
  // Si hay ventanas declaradas, la fecha debe caer dentro de alguna.
  if (cal.ventanas.length > 0 && !estaEnRango(dia, cal.ventanas)) return false;
  return true;
}

/**
 * Resuelve la próxima fecha hábil (ISO yyyy-mm-dd) a partir de `desdeISO`
 * inclusive. Determinista: recorre día a día hasta un máximo de `maxDias`
 * (defensa contra calendarios sin días hábiles). Devuelve `null` si no encuentra
 * ninguna dentro del horizonte.
 */
export function proximaFechaHabil(cal: CalendarioOperacional, desdeISO: string, maxDias = 3650): string | null {
  let cursor = Date.parse(fechaUTC(desdeISO));
  if (Number.isNaN(cursor)) return null;
  for (let i = 0; i < maxDias; i++) {
    const iso = new Date(cursor).toISOString().slice(0, 10);
    if (esDiaHabil(cal, iso)) return iso;
    cursor += MS_DIA;
  }
  return null;
}
