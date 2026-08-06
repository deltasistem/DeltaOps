/**
 * DGP-014 · Constructores PUROS de los cuerpos de comando del módulo preventivo.
 *
 * Traducen los valores de los formularios dinámicos (Dynamic Forms) a los
 * cuerpos EXACTOS de los esquemas del OpenAPI congelado. No añaden campos no
 * declarados (additionalProperties:false); omiten los opcionales vacíos. La
 * idempotencia (`id`/`opId`) la acuñan las mutaciones. Verificado por el test de
 * contrato.
 */
import type { ValoresFormulario } from "../forms/tipos";
import type { ReferenciaPlan, Vigencia, Checklist, TiempoEstimado } from "./tipos";

export function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}
export function num(v: unknown): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
/** Lee las filas de un campo tabla (Dynamic Forms) de forma tolerante. */
export function filas(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/* ------------------------------ Programa -------------------------------- */

export interface EntradaPrograma {
  nombre: string;
  tipo: string;
  descripcion?: string | null;
  codigo?: string | null;
  clasificacion?: string | null;
  padreId?: string | null;
  planes?: ReferenciaPlan[];
  activos?: string[];
  vigencia?: Vigencia;
  sla?: Record<string, unknown> | null;
}

/** Construye la entrada de `CrearPrograma` desde los valores del wizard. */
export function construirInputPrograma(v: ValoresFormulario): EntradaPrograma {
  const planes = filas(v.planes)
    .map((f) => ({ planId: txt(f.planId), version: num(f.version) ?? 1 }))
    .filter((p) => p.planId !== "");
  const activos = filas(v.activos)
    .map((f) => txt(f.activoId ?? f.activo ?? f.id))
    .filter((a) => a !== "");
  const desde = txt(v.vigenciaDesde);
  const hasta = txt(v.vigenciaHasta);

  const entrada: EntradaPrograma = {
    nombre: txt(v.nombre),
    tipo: txt(v.tipo),
  };
  const descripcion = txt(v.descripcion);
  if (descripcion !== "") entrada.descripcion = descripcion;
  const codigo = txt(v.codigo);
  if (codigo !== "") entrada.codigo = codigo;
  const clasificacion = txt(v.clasificacion);
  if (clasificacion !== "") entrada.clasificacion = clasificacion;
  const padreId = txt(v.padreId);
  if (padreId !== "") entrada.padreId = padreId;
  if (planes.length > 0) entrada.planes = planes;
  if (activos.length > 0) entrada.activos = activos;
  if (desde !== "") entrada.vigencia = hasta !== "" ? { desde, hasta } : { desde };
  return entrada;
}

/* ------------------------------ Actividad ------------------------------- */

export interface EntradaActividad {
  programaId: string;
  nombre: string;
  orden: number;
  checklist: Checklist;
  tiempoEstimado: TiempoEstimado;
  moneda: string;
  descripcion?: string | null;
  dependencias?: string[];
  recursos?: Record<string, unknown>;
  sla?: Record<string, unknown> | null;
}

/**
 * Construye la entrada de `DefinirActividad`. `recursos` y `sla` son objetos
 * libres del contrato (el módulo los valida internamente): se pasan como
 * pass-through estructurado (personal/herramientas/repuestos/costoEstimado).
 */
export function construirInputActividad(programaId: string, v: ValoresFormulario): EntradaActividad {
  const personal = filas(v.personal)
    .map((f) => {
      const rol = txt(f.rol);
      const o: Record<string, unknown> = { rol };
      const cantidad = num(f.cantidad);
      const horas = num(f.horas);
      if (cantidad !== undefined) o.cantidad = cantidad;
      if (horas !== undefined) o.horas = horas;
      return o;
    })
    .filter((f) => f.rol !== "");
  const herramientas = filas(v.herramientas)
    .map((f) => material(f))
    .filter((f) => f.referenciaId !== "");
  const repuestos = filas(v.repuestos)
    .map((f) => material(f))
    .filter((f) => f.referenciaId !== "");
  const dependencias = filas(v.dependencias)
    .map((f) => txt(f.actividadId ?? f.id))
    .filter((d) => d !== "");

  const recursos: Record<string, unknown> = {};
  if (personal.length > 0) recursos.personal = personal;
  if (herramientas.length > 0) recursos.herramientas = herramientas;
  if (repuestos.length > 0) recursos.repuestos = repuestos;
  const costoEstimado = num(v.costoEstimado);
  if (costoEstimado !== undefined) recursos.costoEstimado = costoEstimado;

  const entrada: EntradaActividad = {
    programaId,
    nombre: txt(v.nombre),
    orden: num(v.orden) ?? 0,
    checklist: { plantillaId: txt(v.checklistPlantillaId), version: num(v.checklistVersion) ?? 1 },
    tiempoEstimado: { valor: num(v.tiempoValor) ?? 0, unidad: txt(v.tiempoUnidad) || "h" },
    moneda: txt(v.moneda) || "USD",
  };
  const descripcion = txt(v.descripcion);
  if (descripcion !== "") entrada.descripcion = descripcion;
  if (dependencias.length > 0) entrada.dependencias = dependencias;
  if (Object.keys(recursos).length > 0) entrada.recursos = recursos;
  return entrada;
}

function material(f: Record<string, unknown>): Record<string, unknown> {
  const referenciaId = txt(f.referenciaId ?? f.itemId ?? f.articuloId ?? f.id);
  const o: Record<string, unknown> = { referenciaId };
  const descripcion = txt(f.descripcion);
  if (descripcion !== "") o.descripcion = descripcion;
  const cantidad = num(f.cantidad);
  if (cantidad !== undefined) o.cantidad = cantidad;
  const unidad = txt(f.unidad);
  if (unidad !== "") o.unidad = unidad;
  const fuente = txt(f.fuente);
  if (fuente !== "") o.fuente = fuente;
  return o;
}

/* ------------------------------ Generar --------------------------------- */

export interface EntradaGenerar {
  programaId: string;
  actividadId: string;
  activoId: string;
  ventana: string;
  origen: string;
  fechaObjetivo: string;
  corresponde?: boolean;
}

/** Construye la entrada de `Generar` (los 6 requeridos + corresponde opcional). */
export function construirInputGenerar(v: {
  programaId: string;
  actividadId: string;
  activoId: string;
  ventana: string;
  origen: string;
  fechaObjetivo: string;
  corresponde?: boolean;
}): EntradaGenerar {
  const e: EntradaGenerar = {
    programaId: v.programaId,
    actividadId: v.actividadId,
    activoId: v.activoId,
    ventana: v.ventana,
    origen: v.origen,
    fechaObjetivo: v.fechaObjetivo,
  };
  if (v.corresponde !== undefined) e.corresponde = v.corresponde;
  return e;
}
