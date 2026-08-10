/**
 * DGP-016 · Materialización del catálogo CANÓNICO como definiciones/dashboards
 * concretos por tenant (sin IO). Convierte las ESPECIFICACIONES (datos) del
 * sistema en aggregates validados por el dominio.
 */
import { type KernelError, type Result, ok } from "@workspace/kernel";
import { CATALOGO_INDICADORES, type EspecIndicador } from "./catalogo-indicadores";
import { CATALOGO_DASHBOARDS, type EspecDashboard } from "./catalogo-dashboards";
import { crearExpresion } from "./expresion";
import { crearFiltro, type Filtro } from "./filtros";
import { crearDefinicion, type DefinicionIndicador } from "./definicion-indicador";
import { crearDashboard, crearWidget, type Dashboard } from "./dashboard";

function construirFiltros(
  arr: { dimension: string; campo?: string; operador: string; valor: unknown }[] | undefined,
): Result<Filtro[], KernelError> {
  const out: Filtro[] = [];
  for (const f of arr ?? []) {
    const r = crearFiltro({ dimension: f.dimension, campo: f.campo, operador: f.operador, valor: f.valor as never });
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

/** Construye una DefinicionIndicador (versión 1, delSistema) desde una espec. */
export function definicionDesdeEspec(
  espec: EspecIndicador,
  tenantId: string,
  id: string,
  actorId: string,
  ahora: string,
): Result<{ definicion: DefinicionIndicador; evento: { tipo: string; payload: Record<string, unknown> } }, KernelError> {
  const filtros = construirFiltros(espec.expresion.filtros);
  if (!filtros.ok) return filtros;
  const filtrosDen = construirFiltros(espec.expresion.filtrosDenominador);
  if (!filtrosDen.ok) return filtrosDen;
  const exp = crearExpresion({
    tipo: espec.expresion.tipo,
    campo: espec.expresion.campo,
    filtros: filtros.value,
    filtrosDenominador: espec.expresion.filtrosDenominador ? filtrosDen.value : undefined,
    factor: espec.expresion.factor,
    ventana: espec.expresion.ventana,
    agrupadores: espec.expresion.agrupadores,
    campoTiempoOperativo: espec.expresion.campoTiempoOperativo,
    campoTiempoReparacion: espec.expresion.campoTiempoReparacion,
    campoEsFalla: espec.expresion.campoEsFalla,
  });
  if (!exp.ok) return exp;
  return crearDefinicion({
    id,
    tenantId,
    clave: espec.clave,
    nombre: espec.nombre,
    descripcion: espec.descripcion,
    categoria: espec.categoria,
    fuente: { modulo: espec.fuente.modulo, dataset: espec.fuente.dataset },
    expresion: exp.value,
    unidad: espec.unidad,
    formato: espec.formato,
    umbrales: espec.umbrales,
    delSistema: true,
    actorId,
    ahora,
  });
}

/** Construye un Dashboard del sistema desde una espec. */
export function dashboardDesdeEspec(
  espec: EspecDashboard,
  tenantId: string,
  id: string,
  widgetIdBase: (i: number) => string,
  actorId: string,
  ahora: string,
): Result<{ dashboard: Dashboard; evento: { tipo: string; payload: Record<string, unknown> } }, KernelError> {
  const widgets = [];
  let i = 0;
  for (const w of espec.widgets) {
    const rw = crearWidget({
      id: widgetIdBase(i),
      tipo: w.tipo,
      titulo: w.titulo,
      indicadorClave: w.indicadorClave,
      presentacion: w.presentacion,
      ranking: w.ranking ?? null,
      posicion: i,
    });
    if (!rw.ok) return rw;
    widgets.push(rw.value);
    i += 1;
  }
  return crearDashboard({
    id,
    tenantId,
    clave: espec.clave,
    nombre: espec.nombre,
    descripcion: espec.descripcion,
    widgets,
    delSistema: true,
    propietarioId: null,
    actorId,
    ahora,
  });
}

export { CATALOGO_INDICADORES, CATALOGO_DASHBOARDS };
