/**
 * DGP-008.3 · Hooks de datos del módulo de Activos (React Query-free, ligeros).
 * Usan `activosFetch` con degradación elegante para endpoints opcionales.
 */
import { useCallback, useEffect, useState } from "react";
import { activosFetch, esFuncionNoDisponible } from "./api";
import type {
  ActivoRow,
  DetalleActivo,
  Adjunto,
  Comentario,
  EventoTimeline,
  NodoArbol,
  OpcionCatalogo,
  Relacion,
  CambioHistorico,
} from "./tipos";

export interface EstadoAsync<T> {
  datos: T | null;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}

/** Hook genérico para una consulta GET con recarga. */
export function useConsulta<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): EstadoAsync<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fn(ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDatos(d);
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted && e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { datos, cargando, error, recargar };
}

export function useListado(filtros: Record<string, string | undefined>): EstadoAsync<ActivoRow[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const query = qs.toString();
  return useConsulta<ActivoRow[]>(
    (signal) => activosFetch<ActivoRow[]>(query ? `?${query}` : "", { signal }),
    [query],
  );
}

export function useDetalle(id: string): EstadoAsync<DetalleActivo> {
  return useConsulta<DetalleActivo>((signal) => activosFetch<DetalleActivo>(`/${id}`, { signal }), [id]);
}

/**
 * Forma REAL del read model del backend `activos.catalogo.opciones`
 * (`CatalogoService.opciones`): `{ value, label, posicion, padre }`. El contrato
 * del servidor usa `value/label`; la UI consume `OpcionCatalogo {valor,etiqueta}`.
 * Esta normalización de FRONTERA evita que opciones con `valor/etiqueta`
 * `undefined` lleguen al validador Zod de Dynamic Forms (`z.string().min(1)`),
 * que reventaba el listado con un overlay de runtime. No relaja la validación:
 * mapea el contrato real a la forma esperada por la UI.
 */
interface OpcionCatalogoBackend {
  value?: string;
  label?: string;
  posicion?: number;
  padre?: string | null;
  // Tolerancia: si algún consumidor ya devolviera la forma UI.
  valor?: string;
  etiqueta?: string;
  habilitado?: boolean;
}

/** Normaliza la respuesta del backend (`{value,label}`) a `OpcionCatalogo`. */
export function normalizarOpcionesCatalogo(datos: unknown): OpcionCatalogo[] {
  if (!Array.isArray(datos)) return [];
  const out: OpcionCatalogo[] = [];
  for (const raw of datos as OpcionCatalogoBackend[]) {
    if (raw == null || typeof raw !== "object") continue;
    const valor = String(raw.valor ?? raw.value ?? "");
    const etiqueta = String(raw.etiqueta ?? raw.label ?? valor);
    if (valor === "") continue; // descarta opciones sin clave (no válidas para un <select>)
    out.push({ valor, etiqueta, habilitado: raw.habilitado });
  }
  return out;
}

export interface OpcionesCatalogo {
  /**
   * Trata el 401 como error normal (sin redirigir a /login). Para consumidores de
   * PRESENTACIÓN que se montan pronto (p. ej. el selector de centro del AppShell):
   * un 401 transitorio en el ciclo login/logout→login NO debe navegar el
   * navegador a /login; se degrada a lista vacía. Ver LITE-03 · fix de carrera.
   */
  toleraNoAutorizado?: boolean;
}

export function useCatalogo(nombre: string, opciones?: OpcionesCatalogo): EstadoAsync<OpcionCatalogo[]> {
  const toleraNoAutorizado = opciones?.toleraNoAutorizado ?? false;
  return useConsulta<OpcionCatalogo[]>(
    (signal) =>
      // Nombre vacío = consulta deshabilitada (p. ej. el módulo no aplica): se
      // resuelve a lista vacía sin tocar la red, evitando `/catalogos/` inválido.
      nombre
        ? activosFetch<unknown>(`/catalogos/${nombre}`, { signal, toleraNoAutorizado }).then(normalizarOpcionesCatalogo)
        : Promise.resolve<OpcionCatalogo[]>([]),
    [nombre, toleraNoAutorizado],
  );
}

export function useTimeline(id: string, filtros: Record<string, string | undefined>): EstadoAsync<EventoTimeline[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const query = qs.toString();
  return useConsulta<EventoTimeline[]>(
    (signal) => activosFetch<EventoTimeline[]>(`/${id}/timeline${query ? `?${query}` : ""}`, { signal }),
    [id, query],
  );
}

export function useComentarios(id: string): EstadoAsync<Comentario[]> {
  return useConsulta<Comentario[]>((signal) => activosFetch<Comentario[]>(`/${id}/comentarios`, { signal }), [id]);
}

export function useDocumentacion(id: string): EstadoAsync<Adjunto[]> {
  return useConsulta<Adjunto[]>((signal) => activosFetch<Adjunto[]>(`/${id}/documentacion`, { signal }), [id]);
}

/**
 * Forma REAL del read model del backend `activos.relacionados`:
 * `{ id, salientes: RelacionReadRow[], entrantes: RelacionReadRow[] }`
 * (ver `lib/module-activos/src/module.ts`). El contrato NO cambia; sólo se
 * normaliza en cliente a la lista plana `Relacion[]` que consume la UI.
 */
interface RespuestaRelacionados {
  id?: string;
  salientes?: unknown;
  entrantes?: unknown;
}

/**
 * Normaliza la respuesta de `/{id}/relacionados` a `Relacion[]`.
 *
 * Deuda saldada (DGP-008.x, detectada en DGP-019.2): el endpoint devuelve un
 * OBJETO `{id, salientes, entrantes}`, pero `TabRelaciones` esperaba un arreglo
 * y hacía `datos.map(...)`, lo que reventaba la ficha ENTERA (los `Tabs` del DS
 * montan todos los paneles de forma eager). Se concatenan salientes + entrantes
 * conservando la dirección (cada fila ya trae origen/destino) y se deduplica por
 * `id`. Se toleran además la forma legada (array directo) y respuestas nulas o
 * inesperadas (guardas `Array.isArray`), devolviendo siempre un arreglo.
 */
export function normalizarRelacionados(datos: unknown): Relacion[] {
  if (Array.isArray(datos)) return datos as Relacion[];
  if (datos && typeof datos === "object") {
    const r = datos as RespuestaRelacionados;
    const salientes = Array.isArray(r.salientes) ? (r.salientes as Relacion[]) : [];
    const entrantes = Array.isArray(r.entrantes) ? (r.entrantes as Relacion[]) : [];
    const combinadas = [...salientes, ...entrantes];
    const vistas = new Set<string>();
    const unicas: Relacion[] = [];
    for (const rel of combinadas) {
      const clave = rel && typeof rel === "object" && rel.id != null ? String(rel.id) : "";
      if (clave && vistas.has(clave)) continue;
      if (clave) vistas.add(clave);
      unicas.push(rel);
    }
    return unicas;
  }
  return [];
}

export function useRelacionados(id: string, categoria?: string): EstadoAsync<Relacion[]> {
  const q = categoria ? `?categoria=${categoria}` : "";
  return useConsulta<Relacion[]>(
    async (signal) => {
      const raw = await activosFetch<unknown>(`/${id}/relacionados${q}`, { signal });
      return normalizarRelacionados(raw);
    },
    [id, categoria ?? ""],
  );
}

export function useArbol(id: string): EstadoAsync<NodoArbol> {
  return useConsulta<NodoArbol>((signal) => activosFetch<NodoArbol>(`/${id}/arbol`, { signal }), [id]);
}

export function useComponentes(id: string): EstadoAsync<NodoArbol> {
  return useConsulta<NodoArbol>((signal) => activosFetch<NodoArbol>(`/${id}/componentes`, { signal }), [id]);
}

export function useHistoricoUbicaciones(id: string): EstadoAsync<CambioHistorico[]> {
  return useConsulta<CambioHistorico[]>((signal) => activosFetch<CambioHistorico[]>(`/${id}/historial/ubicaciones`, { signal }), [id]);
}

export function useHistoricoResponsables(id: string): EstadoAsync<CambioHistorico[]> {
  return useConsulta<CambioHistorico[]>((signal) => activosFetch<CambioHistorico[]>(`/${id}/historial/responsables`, { signal }), [id]);
}

/**
 * Filtro de búsqueda local (degradación cliente): coincide por nombre, código
 * o tipo (case-insensitive). Se usa cuando /busqueda no está desplegado.
 */
export function filtrarLocal(activos: ActivoRow[], termino: string): ActivoRow[] {
  const t = termino.trim().toLowerCase();
  if (t.length < 2) return activos;
  return activos.filter(
    (a) =>
      a.nombre.toLowerCase().includes(t) ||
      a.codigoEmpresarial.toLowerCase().includes(t) ||
      a.tipo.toLowerCase().includes(t),
  );
}

/**
 * Búsqueda rápida con degradación: usa /busqueda si existe; si responde 404
 * (feature no desplegada), devuelve `null` para que el llamador filtre en cliente.
 */
export async function buscar(q: string, signal?: AbortSignal): Promise<ActivoRow[] | null> {
  try {
    const r = await activosFetch<ActivoRow[]>(`/busqueda?q=${encodeURIComponent(q)}`, {
      signal,
      toleraNoEncontrado: true,
    });
    return r;
  } catch (e) {
    if (esFuncionNoDisponible(e)) return null;
    throw e;
  }
}
