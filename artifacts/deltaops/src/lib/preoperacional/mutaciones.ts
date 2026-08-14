/**
 * DGP-LITE-04 · Mutaciones del PREOPERACIONAL con degradación Offline First.
 *
 * Reutiliza la ÚNICA cola offline existente (`mutarConOffline` + `ColaSync`).
 * El registro es UN comando orquestador idempotente por `opId`: intenta el POST
 * directo; si falla por red, encola para replay vía `/sync`. NO contiene lógica
 * de negocio: el veredicto y la criticidad los decide y sella el backend.
 */
import { preoperacionalFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO, aContratoMotor } from "./constantes";
import type { EjecucionSellada, PlantillaPreoperacional, RespuestaLocal, ResultadoRegistro } from "./tipos";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/** Consulta la plantilla ACTIVA (o versión concreta) por clave. */
export async function obtenerPlantilla(clave: string, version?: number): Promise<PlantillaPreoperacional | null> {
  const qs = new URLSearchParams({ clave });
  if (version != null) qs.set("version", String(version));
  const rec = await preoperacionalFetch<{
    data?: {
      clave?: string; version?: number;
      contenido?: {
        definicion?: { titulo?: string };
        checklist?: { items?: Array<Record<string, unknown>> };
        aplicabilidad?: { vigenciaDias?: number };
      };
    };
  } | null>(`/plantilla?${qs.toString()}`, { toleraNoEncontrado: true });
  const c = rec?.data?.contenido;
  if (!rec?.data || !c?.definicion) return null;
  const items = (c.checklist?.items ?? []).map((it) => ({
    clave: String(it.clave),
    etiqueta: String(it.etiqueta),
    obligatorio: it.obligatorio === true,
    critico: it.critico === true,
    ...(typeof it.categoria === "string" ? { categoria: it.categoria } : {}),
    ...(Array.isArray(it.evidenciasRequeridas) ? { evidenciasRequeridas: it.evidenciasRequeridas.map(String) } : {}),
  }));
  return {
    clave: String(rec.data.clave ?? clave),
    version: Number(rec.data.version ?? version ?? 0),
    titulo: String(c.definicion.titulo ?? ""),
    items,
    ...(c.aplicabilidad?.vigenciaDias != null ? { vigenciaDias: c.aplicabilidad.vigenciaDias } : {}),
  };
}

/** Ejecuciones selladas de un activo (fuente honesta; sin datos falsos). */
export async function listarEjecuciones(activoId: string, signal?: AbortSignal): Promise<EjecucionSellada[]> {
  const qs = new URLSearchParams({ activoId });
  const r = await preoperacionalFetch<EjecucionSellada[]>(`/ejecuciones?${qs.toString()}`, { toleraNoEncontrado: true, signal });
  return Array.isArray(r) ? r : [];
}

/** Detalle de una ejecución sellada (procedencia completa). */
export async function obtenerEjecucion(id: string, signal?: AbortSignal): Promise<EjecucionSellada | null> {
  return preoperacionalFetch<EjecucionSellada | null>(`/ejecuciones/${encodeURIComponent(id)}`, { toleraNoEncontrado: true, signal });
}

/**
 * Registra un preoperacional: mapea el estado de presentación de cada ítem al
 * contrato del motor (`estado` boolean|"na" + comentario) SIN romperlo, y envía
 * el orquestador. El backend valida activo+plantilla, captura la respuesta,
 * calcula y SELLA el veredicto. Idempotente por `opId`.
 */
export async function registrarPreoperacional(
  cola: ColaSync,
  entrada: {
    activoId: string;
    plantillaClave: string;
    plantillaVersion?: number;
    respuestas: Record<string, RespuestaLocal>;
    evidencias?: string[];
  },
  ids: { opId?: string } = {},
): Promise<ResultadoMutacion & { resultado?: ResultadoRegistro }> {
  const opId = ids.opId ?? nuevoOpId();
  const datos: Record<string, unknown> = {};
  for (const [clave, r] of Object.entries(entrada.respuestas)) {
    if (!r.estado) continue;
    const mapeado = aContratoMotor(r.estado, r.comentario);
    datos[clave] = {
      ...mapeado,
      ...(r.evidencias && r.evidencias.length > 0 ? { evidencias: r.evidencias } : {}),
    };
  }
  const cuerpo: Record<string, unknown> = {
    opId,
    activoId: entrada.activoId,
    plantillaClave: entrada.plantillaClave,
    ...(entrada.plantillaVersion != null ? { plantillaVersion: entrada.plantillaVersion } : {}),
    datos,
    ...(entrada.evidencias && entrada.evidencias.length > 0 ? { evidencias: entrada.evidencias } : {}),
  };
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar`,
    input: cuerpo,
    descripcion: `Preoperacional del activo ${entrada.activoId}`,
    directo: () => preoperacionalFetch<ResultadoRegistro>("/registrar", { method: "POST", body: cuerpo }),
  }) as Promise<ResultadoMutacion & { resultado?: ResultadoRegistro }>;
}
