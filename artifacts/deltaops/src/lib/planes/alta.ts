/**
 * DGP-012 · Constructores de payloads de creación (Dynamic Forms → contrato).
 *
 * Transforman los valores capturados por `FormularioDinamico` en los cuerpos
 * EXACTOS que exige el contrato OpenAPI congelado. No hacen IO ni validación de
 * negocio (eso es del backend). Toda cadena vacía/valor ausente se OMITE para
 * respetar `additionalProperties:false` y los opcionales nullable.
 */
import type { EntradaCrearPlan, EntradaEvaluar, EntradaCalendario } from "./mutaciones";
import type { Alcance, Rutina, Actividad, ReferenciaActividad, Frecuencia, Programa, ReglaFrecuencia } from "./tipos";
import { nuevoOpId } from "../offline/cola";
import { TIPOS_FRECUENCIA } from "./constantes";

type Valores = Record<string, unknown>;

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

/** Divide una cadena separada por comas en una lista de ids no vacíos. */
function csv(v: unknown): string[] {
  return txt(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Convierte ids en referencias `{tipo,id}` con el tipo declarado. */
function refs(tipo: string, v: unknown): ReferenciaActividad[] {
  return csv(v).map((id) => ({ tipo, id }));
}

function num(v: unknown): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ------------------------------- Alcance -------------------------------- */

/** Construye el `Alcance` declarativo (omite listas vacías). */
export function construirAlcance(valores: Valores): Alcance {
  const a: Record<string, string[]> = {};
  const mapa: Record<string, string> = {
    alcanceActivos: "activos",
    alcanceCategorias: "categorias",
    alcanceFamilias: "familias",
    alcanceSubfamilias: "subfamilias",
    alcanceEmpresas: "empresas",
    alcanceProyectos: "proyectos",
    alcanceUbicaciones: "ubicaciones",
    alcanceClases: "clases",
  };
  for (const [clave, prop] of Object.entries(mapa)) {
    const lista = csv(valores[clave]);
    if (lista.length) a[prop] = lista;
  }
  return a as Alcance;
}

/* ------------------------------ Frecuencia ------------------------------ */

/** Construye la `Frecuencia` a partir de la tabla de reglas + modo. */
export function construirFrecuencia(valores: Valores): Frecuencia {
  const filas = Array.isArray(valores.reglas) ? (valores.reglas as Valores[]) : [];
  const reglas: ReglaFrecuencia[] = filas
    .filter((f) => txt(f.tipo))
    .map((f) => {
      const meta = TIPOS_FRECUENCIA.find((t) => t.valor === txt(f.tipo));
      const r: ReglaFrecuencia = { tipo: txt(f.tipo) };
      const cada = num(f.cada);
      if (cada !== undefined) (r as { cada?: number }).cada = cada;
      const unidad = txt(f.unidad);
      if (unidad && !meta?.usaEvento) (r as { unidad?: string }).unidad = unidad;
      const evento = txt(f.evento);
      if (evento) (r as { evento?: string }).evento = evento;
      return r;
    });
  const f: Frecuencia = { reglas };
  const modo = txt(valores.frecuenciaModo);
  if (modo) (f as { modo?: string }).modo = modo;
  const ta = num(valores.toleranciaAntes);
  if (ta !== undefined) (f as { toleranciaAntes?: number }).toleranciaAntes = ta;
  const td = num(valores.toleranciaDespues);
  if (td !== undefined) (f as { toleranciaDespues?: number }).toleranciaDespues = td;
  return f;
}

/* -------------------------------- Rutina -------------------------------- */

/** Construye la `Rutina` a partir de la tabla de actividades. */
export function construirRutina(valores: Valores): Rutina {
  const filas = Array.isArray(valores.actividades) ? (valores.actividades as Valores[]) : [];
  const actividades: Actividad[] = filas
    .filter((f) => txt(f.titulo))
    .map((f, i) => {
      const act: Record<string, unknown> = {
        id: nuevoOpId(),
        orden: i,
        tipo: txt(f.tipo) || "actividad",
        titulo: txt(f.titulo),
      };
      const desc = txt(f.descripcion);
      if (desc) act.descripcion = desc;
      const disc = txt(f.disciplina);
      if (disc) act.disciplina = disc;
      const dur = num(f.duracionMin);
      if (dur !== undefined) act.duracion = { minutos: dur };
      const listas: Array<[string, string]> = [
        ["herramientas", "herramienta"],
        ["epp", "epp"],
        ["materiales", "material"],
        ["repuestos", "repuesto"],
        ["checklists", "checklist"],
        ["documentacion", "documento"],
      ];
      for (const [campo, tipoRef] of listas) {
        const r = refs(tipoRef, f[campo]);
        if (r.length) act[campo] = r;
      }
      const riesgos = csv(f.riesgos).map((categoria) => ({ categoria }));
      if (riesgos.length) act.riesgos = riesgos;
      const obs = txt(f.observaciones);
      if (obs) act.observaciones = obs;
      return act as unknown as Actividad;
    });
  const rutina: Record<string, unknown> = {
    id: nuevoOpId(),
    nombre: txt(valores.rutinaNombre) || "Rutina",
    actividades,
  };
  const dt = num(valores.duracionTotalMin);
  if (dt !== undefined) rutina.duracionTotal = { minutos: dt };
  return rutina as unknown as Rutina;
}

/* ------------------------------ Programa -------------------------------- */

/** Construye el `Programa` (frecuencia + vigencia + calendario opcional). */
export function construirPrograma(valores: Valores): Programa {
  const prog: Record<string, unknown> = {
    frecuencia: construirFrecuencia(valores),
    vigenteDesde: txt(valores.vigenteDesde),
  };
  const hasta = txt(valores.vigenteHasta);
  if (hasta) prog.vigenteHasta = hasta;
  const cal = txt(valores.calendarioId);
  if (cal) prog.calendarioId = cal;
  return prog as unknown as Programa;
}

/* -------------------------- Plan completo (alta) ------------------------ */

/** Ensambla el `EntradaCrearPlan` completo desde los valores del wizard. */
export function construirInputPlan(valores: Valores): EntradaCrearPlan {
  const entrada: EntradaCrearPlan = {
    nombre: txt(valores.nombre),
    tipoPlan: txt(valores.tipoPlan),
    estrategia: txt(valores.estrategia),
    prioridad: txt(valores.prioridad),
    alcance: construirAlcance(valores),
    rutina: construirRutina(valores),
    programa: construirPrograma(valores),
  };
  const desc = txt(valores.descripcion);
  if (desc) entrada.descripcion = desc;
  return entrada;
}

/* -------------------------------- Calendario ---------------------------- */

/** Ensambla el `EntradaCalendario` desde el formulario de calendario. */
export function construirInputCalendario(valores: Valores): EntradaCalendario {
  const entrada: EntradaCalendario = {
    tipo: txt(valores.tipo),
    ambito: txt(valores.ambito),
    nombre: txt(valores.nombre),
  };
  const filas = Array.isArray(valores.ventanas) ? (valores.ventanas as Valores[]) : [];
  const ventanas = filas
    .filter((f) => txt(f.tipo) && txt(f.desde) && txt(f.hasta))
    .map((f) => {
      const v: { tipo: string; desde: string; hasta: string; etiqueta?: string } = {
        tipo: txt(f.tipo),
        desde: txt(f.desde),
        hasta: txt(f.hasta),
      };
      const et = txt(f.etiqueta);
      if (et) v.etiqueta = et;
      return v;
    });
  if (ventanas.length) entrada.ventanas = ventanas;
  return entrada;
}

/* -------------------------------- Evaluar ------------------------------- */

/** Ensambla el `EntradaEvaluar` desde el formulario de evaluación. */
export function construirInputEvaluar(valores: Valores, ahoraIso: string): EntradaEvaluar {
  const entrada: EntradaEvaluar = {
    activoId: txt(valores.activoId),
    origen: txt(valores.origen) || "manual",
    ahora: ahoraIso,
    anclaje: { desde: txt(valores.desde) || ahoraIso },
  };
  const oc = txt(valores.ocurrenciaManual);
  if (oc) entrada.ocurrenciaManual = oc;
  return entrada;
}
