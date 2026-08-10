/**
 * DGP-016 · Caché offline por tenant de últimas evaluaciones y dashboards.
 *
 * Namespace: `deltaops:analytics:cache:<tenant>`. Guarda la última respuesta de
 * cada evaluación/dashboard/listado con su timestamp para que, sin red, la UI
 * pueda mostrar DATOS DE CACHÉ con aviso honesto ("datos de caché + timestamp").
 * NUNCA inventa datos: si no hay caché, la lectura falla y la UI muestra el
 * error/vacío correspondiente.
 */
import { CACHE_NAMESPACE } from "./constantes";

/** Entrada del caché: dato + momento en que se guardó (ISO). */
export interface EntradaCache<T = unknown> {
  readonly dato: T;
  readonly guardadoEn: string;
}

function claveTenant(tenant: string): string {
  return `${CACHE_NAMESPACE}:${tenant}`;
}

type Almacen = Record<string, EntradaCache>;

function storage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function leerAlmacen(tenant: string): Almacen {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(claveTenant(tenant));
    return raw ? (JSON.parse(raw) as Almacen) : {};
  } catch {
    return {};
  }
}

function escribirAlmacen(tenant: string, almacen: Almacen): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(claveTenant(tenant), JSON.stringify(almacen));
  } catch {
    /* cuota excedida: se ignora, la app sigue funcionando */
  }
}

/**
 * Caché por tenant. Cada clave lógica (p.ej. `eval:disponibilidad:{...}` o
 * `dashboard:ejecutivo`) referencia su última respuesta con timestamp.
 */
export class CacheAnalytics {
  constructor(
    private readonly tenant: string,
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  /** Guarda un dato bajo una clave lógica con el timestamp actual. */
  guardar<T>(clave: string, dato: T): EntradaCache<T> {
    const almacen = leerAlmacen(this.tenant);
    const entrada: EntradaCache<T> = { dato, guardadoEn: this.nowIso() };
    almacen[clave] = entrada as EntradaCache;
    escribirAlmacen(this.tenant, almacen);
    return entrada;
  }

  /** Recupera la entrada cacheada (con timestamp) o null si no existe. */
  leer<T>(clave: string): EntradaCache<T> | null {
    const almacen = leerAlmacen(this.tenant);
    return (almacen[clave] as EntradaCache<T> | undefined) ?? null;
  }

  /** Elimina una clave. */
  eliminar(clave: string): void {
    const almacen = leerAlmacen(this.tenant);
    if (clave in almacen) {
      delete almacen[clave];
      escribirAlmacen(this.tenant, almacen);
    }
  }

  /** Vacía todo el caché del tenant. */
  vaciar(): void {
    const s = storage();
    if (s) s.removeItem(claveTenant(this.tenant));
  }

  /** Lista las claves cacheadas (para la página de estado). */
  claves(): string[] {
    return Object.keys(leerAlmacen(this.tenant));
  }

  /** Todas las entradas (clave → {dato, guardadoEn}) para diagnóstico. */
  entradas(): { clave: string; guardadoEn: string }[] {
    const almacen = leerAlmacen(this.tenant);
    return Object.entries(almacen).map(([clave, e]) => ({ clave, guardadoEn: e.guardadoEn }));
  }
}

/** Clave lógica canónica de una evaluación (indicador + filtros normalizados). */
export function claveEvaluacion(clave: string, filtros: readonly unknown[]): string {
  return `eval:${clave}:${JSON.stringify(filtros ?? [])}`;
}

/** Clave lógica de un dashboard por id o clave. */
export function claveDashboard(idOClave: string): string {
  return `dashboard:${idOClave}`;
}

/** Clave lógica de un listado (indicadores/dashboards) con sus parámetros. */
export function claveListado(nombre: string, params: Record<string, unknown> = {}): string {
  return `list:${nombre}:${JSON.stringify(params)}`;
}
