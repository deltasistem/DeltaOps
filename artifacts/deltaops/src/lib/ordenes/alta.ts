/**
 * DGP-009.3 · Utilidades del alta de órdenes: borradores + construcción del
 * input del comando `crear` a partir de los valores del formulario dinámico.
 */
import type { ValoresFormulario } from "../forms/tipos";

const PREFIJO = "deltaops:ordenes:borrador:";

function clave(tenant: string): string {
  return `${PREFIJO}${tenant}`;
}

export function leerBorrador(tenant: string): ValoresFormulario {
  try {
    const raw = localStorage.getItem(clave(tenant));
    return raw ? (JSON.parse(raw) as ValoresFormulario) : {};
  } catch {
    return {};
  }
}

export function guardarBorrador(tenant: string, valores: ValoresFormulario): void {
  try {
    // No se persisten objetos File (adjuntos): sólo datos primitivos del alta.
    localStorage.setItem(clave(tenant), JSON.stringify(valores));
  } catch {
    /* almacenamiento no disponible: ignorar */
  }
}

export function borrarBorrador(tenant: string): void {
  try {
    localStorage.removeItem(clave(tenant));
  } catch {
    /* ignorar */
  }
}

function texto(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/** Construye el input del comando `crear` desde los valores del wizard. */
export function construirInput(valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = {
    titulo: texto(valores.titulo),
    tipo: texto(valores.tipo),
  };
  const categoria = texto(valores.categoria);
  if (categoria) input.categoria = categoria;
  const prioridad = texto(valores.prioridad);
  if (prioridad) input.prioridad = prioridad;
  const severidad = texto(valores.severidad);
  if (severidad) input.severidad = severidad;
  const descripcion = texto(valores.descripcion);
  if (descripcion) input.descripcion = descripcion;
  const responsable = texto(valores.responsable);
  if (responsable) input.responsable = responsable;
  const supervisor = texto(valores.supervisor);
  if (supervisor) input.supervisor = supervisor;

  const activoId = texto(valores.activoId);
  if (activoId) {
    input.activoPrincipal = {
      activoId,
      entityRef: `activo:${activoId}`,
      rol: "principal",
      etiqueta: texto(valores.activoEtiqueta) ?? activoId,
    };
  }
  const ubicacionId = texto(valores.ubicacionId);
  if (ubicacionId) {
    input.ubicacion = {
      ubicacionId,
      etiqueta: texto(valores.ubicacionEtiqueta) ?? ubicacionId,
    };
  }
  const inicioPlanificado = texto(valores.inicioPlanificado);
  const finPlanificado = texto(valores.finPlanificado);
  const observaciones = texto(valores.observaciones);
  if (inicioPlanificado || finPlanificado || observaciones) {
    input.datos = {
      ...(inicioPlanificado ? { inicioPlanificado } : {}),
      ...(finPlanificado ? { finPlanificado } : {}),
      ...(observaciones ? { observaciones } : {}),
    };
  }
  return input;
}
