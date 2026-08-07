/**
 * DGP-015 · Constructores PUROS de los cuerpos de comando del módulo correctivo.
 *
 * Traducen los valores de los formularios dinámicos (Dynamic Forms) a los
 * cuerpos EXACTOS de los esquemas del OpenAPI congelado. No añaden campos no
 * declarados (additionalProperties:false); omiten los opcionales vacíos. La
 * idempotencia (`id`/`opId`) la acuñan las mutaciones. Verificado por el test de
 * contrato.
 */
import type { ValoresFormulario } from "../forms/tipos";
import type { Clasificacion, Cuadrilla, LineaRepuesto, Evidencia } from "./tipos";

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

/** Construye el sub-objeto de clasificación (todo opcional, se omite si vacío). */
export function construirClasificacion(v: ValoresFormulario): Clasificacion | undefined {
  const c: Clasificacion = {};
  const tipoFalla = txt(v.tipoFalla);
  const modoFalla = txt(v.modoFalla);
  const causa = txt(v.causa);
  const efecto = txt(v.efecto);
  const severidad = txt(v.severidad);
  const impacto = txt(v.impacto);
  if (tipoFalla) c.tipoFalla = tipoFalla;
  if (modoFalla) c.modoFalla = modoFalla;
  if (causa) c.causa = causa;
  if (efecto) c.efecto = efecto;
  if (severidad) c.severidad = severidad;
  if (impacto) c.impacto = impacto;
  return Object.keys(c).length > 0 ? c : undefined;
}

/* ------------------------------ Solicitud ------------------------------- */

export interface EntradaSolicitud {
  titulo: string;
  origen: string;
  objeto: { activoId: string; componenteId?: string | null; ubicacionId?: string | null };
  descripcion?: string | null;
  prioridad?: string | null;
  sintoma?: { clave?: string | null; texto?: string | null };
  clasificacion?: Clasificacion;
  evidencias?: Evidencia[];
}

/** Construye la entrada de `CrearSolicitud` desde los valores del wizard. */
export function construirInputSolicitud(v: ValoresFormulario): EntradaSolicitud {
  const activoId = txt(v.activoId);
  const objeto: EntradaSolicitud["objeto"] = { activoId };
  const componenteId = txt(v.componenteId);
  const ubicacionId = txt(v.ubicacionId);
  if (componenteId) objeto.componenteId = componenteId;
  if (ubicacionId) objeto.ubicacionId = ubicacionId;

  const entrada: EntradaSolicitud = {
    titulo: txt(v.titulo),
    origen: txt(v.origen),
    objeto,
  };
  const descripcion = txt(v.descripcion);
  if (descripcion) entrada.descripcion = descripcion;
  const prioridad = txt(v.prioridad);
  if (prioridad) entrada.prioridad = prioridad;

  const sintomaClave = txt(v.sintomaClave);
  const sintomaTexto = txt(v.sintomaTexto);
  if (sintomaClave || sintomaTexto) {
    entrada.sintoma = {};
    if (sintomaClave) entrada.sintoma.clave = sintomaClave;
    if (sintomaTexto) entrada.sintoma.texto = sintomaTexto;
  }

  const clasificacion = construirClasificacion(v);
  if (clasificacion) entrada.clasificacion = clasificacion;

  const evidencias = filas(v.evidencias)
    .map((f) => ({ attachmentId: txt(f.attachmentId), tipo: txt(f.tipo) || "documento", etiqueta: txt(f.etiqueta) || undefined }))
    .filter((e) => e.attachmentId !== "");
  if (evidencias.length > 0) entrada.evidencias = evidencias as Evidencia[];

  return entrada;
}

/* ------------------------------ Diagnóstico ----------------------------- */

export interface EntradaDiagnostico {
  solicitudId: string;
  plantilla: { plantillaId: string; version: number };
  respuestas?: Record<string, unknown>;
  causaRaiz?: string | null;
  clasificacion?: Clasificacion;
}

/**
 * Construye la entrada de `RegistrarDiagnostico`. El contrato requiere
 * `solicitudId` + `plantilla{plantillaId,version}`; `respuestas` es opaco y la
 * causa raíz + clasificación viajan como campos declarados. Los demás campos de
 * captura (causa reportada/encontrada, modo, efecto, criticidad, impacto,
 * recomendaciones) se conservan dentro de `respuestas` (objeto libre del
 * contrato) para no perder información sin violar additionalProperties.
 */
export function construirInputDiagnostico(
  solicitudId: string,
  plantilla: { plantillaId: string; version: number },
  v: ValoresFormulario,
): EntradaDiagnostico {
  const entrada: EntradaDiagnostico = { solicitudId, plantilla };

  const respuestas: Record<string, unknown> = {};
  for (const clave of [
    "causaReportada", "causaEncontrada", "modoFalla", "efecto",
    "criticidad", "impacto", "recomendaciones",
  ]) {
    const valor = txt(v[clave]);
    if (valor) respuestas[clave] = valor;
  }
  // Respuestas libres adicionales del formulario (prefijo respuesta_*).
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith("respuesta_")) {
      const valor = txt(val);
      if (valor) respuestas[k] = valor;
    }
  }
  if (Object.keys(respuestas).length > 0) entrada.respuestas = respuestas;

  const causaRaiz = txt(v.causaRaiz);
  if (causaRaiz) entrada.causaRaiz = causaRaiz;

  const clasificacion = construirClasificacion(v);
  if (clasificacion) entrada.clasificacion = clasificacion;

  return entrada;
}

/* ------------------------------ Cuadrillas ------------------------------ */

/**
 * Construye la lista de cuadrillas (correctivo mayor) desde las filas del
 * formulario. Cada cuadrilla exige `cuadrillaId` + al menos un responsable
 * (`responsableId` + `rol`). Los responsables llegan como texto separado por
 * comas en formato `id:rol`.
 */
export function construirCuadrillas(v: ValoresFormulario): Cuadrilla[] {
  return filas(v.cuadrillas)
    .map((f) => {
      const cuadrillaId = txt(f.cuadrillaId);
      const responsables = parseResponsables(f.responsables);
      const recursos = parseRecursos(f.recursos);
      const etiqueta = txt(f.etiqueta);
      const cuadrilla: Cuadrilla = {
        cuadrillaId,
        responsables,
        ...(etiqueta ? { etiqueta } : {}),
        ...(recursos.length > 0 ? { recursos } : {}),
      };
      return cuadrilla;
    })
    .filter((c) => c.cuadrillaId !== "" && c.responsables.length > 0);
}

function parseResponsables(v: unknown): { responsableId: string; rol: string }[] {
  return txt(v)
    .split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [id, rol] = par.split(":").map((s) => s.trim());
      return { responsableId: id ?? "", rol: rol || "responsable" };
    })
    .filter((r) => r.responsableId !== "");
}

function parseRecursos(v: unknown): { tipo: string; referencia: { tipo: string; id: string }; cantidad?: number }[] {
  return txt(v)
    .split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [tipo, id] = par.split(":").map((s) => s.trim());
      return { tipo: tipo || "equipo", referencia: { tipo: tipo || "equipo", id: id ?? "" } };
    })
    .filter((r) => r.referencia.id !== "");
}

/* ------------------------------ Repuestos ------------------------------- */

/** Construye las líneas de repuesto desde una tabla del formulario. */
export function construirLineasRepuesto(v: ValoresFormulario): LineaRepuesto[] {
  return filas(v.lineas)
    .map((f) => ({
      inventarioId: txt(f.inventarioId),
      articuloId: txt(f.articuloId),
      cantidad: num(f.cantidad) ?? 0,
      unidad: txt(f.unidad) || "unidad",
    }))
    .filter((l) => l.inventarioId !== "" && l.articuloId !== "" && l.cantidad > 0);
}

/** Construye una sola línea de repuesto (consumir/devolver). */
export function construirLineaRepuesto(v: ValoresFormulario): LineaRepuesto | null {
  const linea: LineaRepuesto = {
    inventarioId: txt(v.inventarioId),
    articuloId: txt(v.articuloId),
    cantidad: num(v.cantidad) ?? 0,
    unidad: txt(v.unidad) || "unidad",
  };
  if (linea.inventarioId === "" || linea.articuloId === "" || linea.cantidad <= 0) return null;
  return linea;
}

/* ---------------------------- Evento de activo -------------------------- */

export interface EntradaEventoActivo {
  activoId: string;
  tipo: string;
  solicitudId?: string | null;
  ordenTrabajoId?: string | null;
  modoFalla?: string | null;
  ocurridoEn?: string;
}

/** Construye la entrada de `RegistrarEventoActivo`. */
export function construirInputEventoActivo(v: ValoresFormulario, activoId: string): EntradaEventoActivo {
  const entrada: EntradaEventoActivo = { activoId, tipo: txt(v.tipo) };
  const solicitudId = txt(v.solicitudId);
  const ordenTrabajoId = txt(v.ordenTrabajoId);
  const modoFalla = txt(v.modoFalla);
  const ocurridoEn = txt(v.ocurridoEn);
  if (solicitudId) entrada.solicitudId = solicitudId;
  if (ordenTrabajoId) entrada.ordenTrabajoId = ordenTrabajoId;
  if (modoFalla) entrada.modoFalla = modoFalla;
  if (ocurridoEn) entrada.ocurridoEn = ocurridoEn;
  return entrada;
}
