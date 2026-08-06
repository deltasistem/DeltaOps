/**
 * DGP-014 · Lógica PURA del calendario preventivo y del Gantt.
 *
 * Agrupa las programaciones (ocurrencias) por vista (anual/mensual/semanal/
 * diaria) y calcula la densidad por día. Construye las barras del Gantt por
 * actividad respetando el ORDEN DE DEPENDENCIAS (topológico) sobre las
 * actividades del programa. Sin efectos ni fechas implícitas: todas las fechas
 * entran como ISO (`YYYY-MM-DD` o ISO datetime) para ser testeable de forma
 * determinista.
 */
import type { Programacion, ActividadRow } from "./tipos";

/* ------------------------------ Fechas puras ---------------------------- */

/** Extrae `YYYY-MM-DD` de una fecha ISO (día). */
export function claveDia(fechaIso: string): string {
  return fechaIso.slice(0, 10);
}
/** Extrae `YYYY-MM` (mes). */
export function claveMes(fechaIso: string): string {
  return fechaIso.slice(0, 7);
}
/** Año `YYYY`. */
export function claveAnio(fechaIso: string): string {
  return fechaIso.slice(0, 4);
}
/**
 * Número de semana ISO-8601 y año. Devuelve `YYYY-Www`. Determinista a partir
 * del `YYYY-MM-DD` (usa UTC para evitar deriva por zona horaria).
 */
export function claveSemana(fechaIso: string): string {
  const dia = fechaIso.slice(0, 10);
  const [y, m, d] = dia.split("-").map((x) => parseInt(x, 10));
  const fecha = new Date(Date.UTC(y!, (m! - 1), d!));
  const dow = (fecha.getUTCDay() + 6) % 7; // lunes=0
  fecha.setUTCDate(fecha.getUTCDate() - dow + 3); // jueves de esa semana
  const primerJueves = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 4));
  const dowJ = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - dowJ + 3);
  const semana = 1 + Math.round((fecha.getTime() - primerJueves.getTime()) / (7 * 24 * 3600 * 1000));
  return `${fecha.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

export type Vista = "anual" | "mensual" | "semanal" | "diaria";

function claveDeVista(vista: Vista, fechaIso: string): string {
  switch (vista) {
    case "anual": return claveMes(fechaIso); // el año se agrupa por meses
    case "mensual": return claveDia(fechaIso);
    case "semanal": return claveDia(fechaIso);
    case "diaria": return claveDia(fechaIso);
  }
}

export interface GrupoCalendario {
  clave: string;
  ocurrencias: Programacion[];
  densidad: number;
}

export interface FiltroCalendario {
  programaId?: string;
  activoId?: string;
  estado?: string;
}

/** Aplica los filtros de calendario (programa/activo/estado) a las ocurrencias. */
export function filtrarProgramaciones(ocurrencias: Programacion[], filtro: FiltroCalendario): Programacion[] {
  return ocurrencias.filter((o) => {
    if (filtro.programaId && o.programaId !== filtro.programaId) return false;
    if (filtro.activoId && o.activoId !== filtro.activoId) return false;
    if (filtro.estado && (o.estado ?? "") !== filtro.estado) return false;
    return true;
  });
}

/**
 * Agrupa las ocurrencias por la clave temporal de la vista y calcula la
 * densidad (nº de ocurrencias). Devuelve los grupos ORDENADOS por clave
 * ascendente. Ignora ocurrencias sin fecha.
 */
export function agruparPorVista(ocurrencias: Programacion[], vista: Vista, filtro: FiltroCalendario = {}): GrupoCalendario[] {
  const filtradas = filtrarProgramaciones(ocurrencias, filtro).filter((o) => Boolean(o.fecha));
  const mapa = new Map<string, Programacion[]>();
  for (const o of filtradas) {
    const clave = claveDeVista(vista, o.fecha);
    const arr = mapa.get(clave) ?? [];
    arr.push(o);
    mapa.set(clave, arr);
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([clave, ocurrenciasGrupo]) => ({ clave, ocurrencias: ocurrenciasGrupo, densidad: ocurrenciasGrupo.length }));
}

/* -------------------------------- Gantt --------------------------------- */

export interface BarraGantt {
  actividadId: string;
  nombre: string;
  orden: number;
  /** Índice de inicio (0..N) según el orden topológico por dependencias. */
  inicio: number;
  /** Duración en "carriles" (por tiempo estimado normalizado, mínimo 1). */
  duracion: number;
  dependencias: string[];
  tiempoEstimado?: { valor: number; unidad: string };
  sla?: Record<string, unknown> | null;
}

/**
 * Ordena las actividades topológicamente por sus dependencias (una actividad
 * empieza tras la última de sus dependencias). En caso de ciclo o dependencia
 * ausente degrada de forma estable al orden declarado (`orden`). El resultado
 * es el conjunto de barras del Gantt con inicio/duración por carriles.
 */
export function construirGantt(actividades: ActividadRow[]): BarraGantt[] {
  const porId = new Map(actividades.map((a) => [a.id, a]));
  const inicioPorId = new Map<string, number>();
  const visitando = new Set<string>();

  function inicioDe(id: string): number {
    if (inicioPorId.has(id)) return inicioPorId.get(id)!;
    if (visitando.has(id)) return 0; // ciclo → corta en 0 (degradación estable)
    const a = porId.get(id);
    if (!a) return 0;
    visitando.add(id);
    const deps = (a.dependencias ?? []).filter((d) => porId.has(d));
    let inicio = 0;
    for (const d of deps) {
      const finDep = inicioDe(d) + duracionDe(porId.get(d)!);
      if (finDep > inicio) inicio = finDep;
    }
    visitando.delete(id);
    inicioPorId.set(id, inicio);
    return inicio;
  }

  const ordenadas = [...actividades].sort((a, b) => a.orden - b.orden || (a.nombre < b.nombre ? -1 : 1));
  for (const a of ordenadas) inicioDe(a.id);

  return ordenadas.map((a) => ({
    actividadId: a.id,
    nombre: a.nombre,
    orden: a.orden,
    inicio: inicioPorId.get(a.id) ?? 0,
    duracion: duracionDe(a),
    dependencias: (a.dependencias ?? []).slice(),
    tiempoEstimado: a.tiempoEstimado,
    sla: a.sla ?? null,
  }))
  // Presentación: por inicio y luego por orden (dependencias primero).
  .sort((x, y) => x.inicio - y.inicio || x.orden - y.orden);
}

/** Duración en carriles a partir del tiempo estimado (mínimo 1). */
function duracionDe(a: ActividadRow): number {
  const valor = a.tiempoEstimado?.valor ?? 0;
  if (!Number.isFinite(valor) || valor <= 0) return 1;
  // Normaliza a carriles enteros; horas→1 carril por cada 8h, mínimo 1.
  const unidad = (a.tiempoEstimado?.unidad ?? "h").toLowerCase();
  const enHoras = unidad.startsWith("d") ? valor * 8 : unidad.startsWith("min") ? valor / 60 : valor;
  return Math.max(1, Math.ceil(enHoras / 8));
}

/**
 * Valida las dependencias declaradas de una actividad respecto al conjunto del
 * programa: detecta referencias inexistentes y ciclos (para el aviso visual del
 * editor). Devuelve la lista de problemas (vacía si es válido).
 */
export function validarDependencias(actividades: ActividadRow[], objetivoId: string, dependencias: string[]): string[] {
  const problemas: string[] = [];
  const ids = new Set(actividades.map((a) => a.id));
  for (const d of dependencias) {
    if (d === objetivoId) { problemas.push("Una actividad no puede depender de sí misma."); continue; }
    if (!ids.has(d)) problemas.push(`La dependencia "${d}" no existe en el programa.`);
  }
  // Detección de ciclo simple: si alguna dependencia (transitiva) alcanza el objetivo.
  const porId = new Map(actividades.map((a) => [a.id, a]));
  const visto = new Set<string>();
  function alcanza(desde: string): boolean {
    if (desde === objetivoId) return true;
    if (visto.has(desde)) return false;
    visto.add(desde);
    const a = porId.get(desde);
    return (a?.dependencias ?? []).some((x) => alcanza(x));
  }
  if (dependencias.some((d) => alcanza(d))) problemas.push("Las dependencias crean un ciclo.");
  return problemas;
}
