/**
 * DGP-006 · Business Foundation Framework — Generic Catalog Runtime.
 *
 * Fábrica de entidades "catálogo" sobre el núcleo genérico: una entidad con
 * clave única, etiqueta, posición y estado habilitado/deshabilitado, junto con
 * una consulta `<servicio>.<entidad>.opciones` que lista los habilitados
 * ordenados como `{ value, label }` (formato universal para selects de UI).
 *
 * Vocabulario 100% NEUTRO (DGP-006): estados `habilitado`/`deshabilitado`
 * (comandos `habilitar`/`deshabilitar`) y campo de ordenación `posicion` — sin
 * palabras reservadas de negocio (p. ej. "activo"/"orden").
 *
 * Devuelve una DefinicionEntidad estándar (compatible con crearComandosCrud /
 * crearQueriesCrud) más la query extra para pasar por ExtrasModulo.
 */
import { z } from "zod";
import { ok, type QueryDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type {
  DefinicionCampo,
  DefinicionEntidad,
  DefinicionMaquinaEstados,
  PermisosEntidad,
} from "../nucleo/definicion";
import { RepositorioGenerico } from "../nucleo/repositorio";

/** Campos canónicos de un catálogo (además de los adicionales opcionales). */
export const CAMPO_CLAVE = "clave";
export const CAMPO_ETIQUETA = "etiqueta";
export const CAMPO_POSICION = "posicion";

export const ESTADO_HABILITADO = "habilitado";
export const ESTADO_DESHABILITADO = "deshabilitado";

/** Máquina de estados estándar de un catálogo: habilitado ⇄ deshabilitado. */
export function maquinaCatalogo(permisos: PermisosEntidad): DefinicionMaquinaEstados {
  return {
    estados: [{ nombre: ESTADO_HABILITADO, inicial: true }, { nombre: ESTADO_DESHABILITADO }],
    transiciones: [
      { de: ESTADO_HABILITADO, a: ESTADO_DESHABILITADO, comando: "deshabilitar", permiso: permisos.editar },
      { de: ESTADO_DESHABILITADO, a: ESTADO_HABILITADO, comando: "habilitar", permiso: permisos.editar },
    ],
  };
}

export interface OpcionesCatalogo {
  /** Nombre técnico de la entidad (recordType). */
  readonly nombre: string;
  readonly etiqueta: string;
  readonly servicio: string;
  readonly permisos: PermisosEntidad;
  readonly capacidades: DefinicionEntidad["capacidades"];
  /** Campos adicionales al conjunto canónico (clave, etiqueta, posicion). */
  readonly camposExtra?: readonly DefinicionCampo[];
  readonly configuracionDefaults?: Record<string, string>;
  readonly eventos?: string;
}

/**
 * Construye una DefinicionEntidad de catálogo preconfigurada: clave única
 * (texto requerido, filtrable), etiqueta (texto requerido, buscable), posicion
 * (número filtrable) + máquina habilitado/deshabilitado.
 */
export function crearDefinicionCatalogo(opciones: OpcionesCatalogo): DefinicionEntidad {
  const camposBase: DefinicionCampo[] = [
    { nombre: CAMPO_CLAVE, tipo: "texto", requerido: true, longitudMax: 120, filtrable: true, buscable: true },
    { nombre: CAMPO_ETIQUETA, tipo: "texto", requerido: true, longitudMax: 200, buscable: true },
    { nombre: CAMPO_POSICION, tipo: "numero", filtrable: true },
  ];
  return {
    nombre: opciones.nombre,
    etiqueta: opciones.etiqueta,
    servicio: opciones.servicio,
    campos: [...camposBase, ...(opciones.camposExtra ?? [])],
    maquinaEstados: maquinaCatalogo(opciones.permisos),
    permisos: opciones.permisos,
    capacidades: opciones.capacidades,
    configuracionDefaults: opciones.configuracionDefaults,
    eventos: opciones.eventos,
  };
}

/** Ordena por el campo `posicion` (asc, faltantes al final) y luego por etiqueta. */
function ordenarOpciones(
  registros: readonly { data: Record<string, unknown> }[],
): { data: Record<string, unknown> }[] {
  return [...registros].sort((a, b) => {
    const pa = typeof a.data[CAMPO_POSICION] === "number" ? (a.data[CAMPO_POSICION] as number) : Number.MAX_SAFE_INTEGER;
    const pb = typeof b.data[CAMPO_POSICION] === "number" ? (b.data[CAMPO_POSICION] as number) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return String(a.data[CAMPO_ETIQUETA] ?? "").localeCompare(String(b.data[CAMPO_ETIQUETA] ?? ""));
  });
}

/**
 * Query `<servicio>.<entidad>.opciones`: lista los registros HABILITADOS
 * ordenados como `{ value: clave, label: etiqueta }`. Lee vía RecordStore
 * (multitenant).
 */
export function crearQueryOpciones(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => QueryDefinition<any, any> {
  const nombre = `${def.servicio}.${def.nombre}.opciones`;
  return (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({}),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = new RepositorioGenerico(deps.store, def);
      const rows = await repo.listar(tenant.value, { estado: ESTADO_HABILITADO, limit: 500 });
      if (!rows.ok) return rows;
      const opciones = ordenarOpciones(rows.value).map((r) => ({
        value: String(r.data[CAMPO_CLAVE] ?? ""),
        label: String(r.data[CAMPO_ETIQUETA] ?? ""),
      }));
      return ok(opciones);
    },
  });
}
