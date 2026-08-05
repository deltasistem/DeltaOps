/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregate `ItemInventario`.
 *
 * Aggregate PURO (sin IO). Modela el CATÁLOGO MAESTRO de un item: su
 * clasificación (claves de catálogo, validadas en la aplicación), modo de
 * trazabilidad (sin lote / con lote / con serie / lote+serie), unidad base,
 * costos y política de reposición. NO contiene existencias: esas viven en el
 * aggregate `Inventario` (existencias por bodega/ubicación), gobernadas SÓLO por
 * movimientos-evento.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ITEM_CREADO, ITEM_ELIMINADO, ITEM_MODIFICADO } from "./events";
import type {
  CostoEstandar,
  CostoPromedio,
  CostoUltimaCompra,
  LeadTime,
  PoliticaReposicion,
  ProveedorPreferido,
  Sku,
  UnidadMedida,
  CodigoInventario,
} from "./value-objects";

/**
 * Modo de trazabilidad del item. Es fijo por semántica (no es clasificación de
 * negocio): determina qué dimensiones de trazabilidad exige cada movimiento.
 */
export const MODOS_TRAZABILIDAD = ["sin-lote", "con-lote", "con-serie", "lote-y-serie"] as const;
export type ModoTrazabilidad = (typeof MODOS_TRAZABILIDAD)[number];

export function requiereLote(m: ModoTrazabilidad): boolean {
  return m === "con-lote" || m === "lote-y-serie";
}
export function requiereSerie(m: ModoTrazabilidad): boolean {
  return m === "con-serie" || m === "lote-y-serie";
}

export interface Clasificacion {
  readonly tipoItem: string;
  readonly categoria: string | null;
  readonly familia: string | null;
  readonly subfamilia: string | null;
  readonly marca: string | null;
  readonly fabricante: string | null;
  readonly modelo: string | null;
  readonly empresa: string | null;
  readonly centroCosto: string | null;
  readonly proyecto: string | null;
}

export interface ItemInventario {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: CodigoInventario;
  readonly sku: Sku;
  readonly nombre: string;
  readonly descripcion: string;
  readonly estado: string; // clave de catálogo `estados-item`
  readonly clasificacion: Clasificacion;
  readonly unidadBase: UnidadMedida;
  readonly modoTrazabilidad: ModoTrazabilidad;
  /** ¿El item controla vencimientos? (sólo aplica con lote). */
  readonly controlaVencimiento: boolean;
  readonly reposicion: PoliticaReposicion;
  readonly leadTime: LeadTime | null;
  readonly proveedorPreferido: ProveedorPreferido | null;
  readonly costoPromedio: CostoPromedio | null;
  readonly costoUltimaCompra: CostoUltimaCompra | null;
  readonly costoEstandar: CostoEstandar | null;
  readonly eliminado: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioItem {
  readonly item: ItemInventario;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(i: ItemInventario, tipo: string, actorId: string): CambioItem["evento"] {
  return {
    tipo,
    payload: {
      tenantId: i.tenantId,
      id: i.id,
      entityRef: `inventario-item:${i.id}`,
      codigo: i.codigo,
      sku: i.sku,
      nombre: i.nombre,
      descripcion: i.descripcion,
      estado: i.estado,
      clasificacion: i.clasificacion,
      unidadBase: i.unidadBase,
      modoTrazabilidad: i.modoTrazabilidad,
      controlaVencimiento: i.controlaVencimiento,
      reposicion: i.reposicion,
      leadTime: i.leadTime,
      proveedorPreferido: i.proveedorPreferido,
      costoPromedio: i.costoPromedio,
      costoUltimaCompra: i.costoUltimaCompra,
      costoEstandar: i.costoEstandar,
      eliminado: i.eliminado,
      version: i.version,
      createdBy: i.createdBy,
      actualizadoAt: i.updatedAt.toISOString(),
      actorId,
      eventoTipo: tipo,
    },
  };
}

export interface DatosNuevoItem {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: CodigoInventario;
  readonly sku: Sku;
  readonly nombre: string;
  readonly descripcion?: string;
  readonly estado: string;
  readonly clasificacion: Clasificacion;
  readonly unidadBase: UnidadMedida;
  readonly modoTrazabilidad: ModoTrazabilidad;
  readonly controlaVencimiento?: boolean;
  readonly reposicion: PoliticaReposicion;
  readonly leadTime?: LeadTime | null;
  readonly proveedorPreferido?: ProveedorPreferido | null;
  readonly costoEstandar?: CostoEstandar | null;
  readonly actorId: string;
  readonly maxLongitudNombre: number;
  readonly ahora: Date;
}

export function crearItem(d: DatosNuevoItem): Result<CambioItem, KernelError> {
  const nombre = d.nombre.trim();
  if (nombre.length === 0) return fail(KernelErrors.validation("El nombre del item es obligatorio"));
  if (nombre.length > d.maxLongitudNombre) {
    return fail(KernelErrors.validation(`El nombre excede ${d.maxLongitudNombre} caracteres`));
  }
  if (!d.clasificacion.tipoItem) return fail(KernelErrors.validation("El tipo de item es obligatorio"));
  const controla = d.controlaVencimiento ?? false;
  if (controla && !requiereLote(d.modoTrazabilidad)) {
    return fail(KernelErrors.validation("El control de vencimiento requiere trazabilidad por lote"));
  }
  const item: ItemInventario = {
    id: d.id,
    tenantId: d.tenantId,
    codigo: d.codigo,
    sku: d.sku,
    nombre,
    descripcion: (d.descripcion ?? "").trim(),
    estado: d.estado,
    clasificacion: d.clasificacion,
    unidadBase: d.unidadBase,
    modoTrazabilidad: d.modoTrazabilidad,
    controlaVencimiento: controla,
    reposicion: d.reposicion,
    leadTime: d.leadTime ?? null,
    proveedorPreferido: d.proveedorPreferido ?? null,
    costoPromedio: null,
    costoUltimaCompra: null,
    costoEstandar: d.costoEstandar ?? null,
    eliminado: false,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ item, evento: eventoDe(item, ITEM_CREADO, d.actorId) });
}

export type PatchItem = Partial<
  Pick<
    ItemInventario,
    | "nombre"
    | "descripcion"
    | "estado"
    | "clasificacion"
    | "reposicion"
    | "leadTime"
    | "proveedorPreferido"
    | "costoEstandar"
  >
>;

export function editarItem(
  item: ItemInventario,
  patch: PatchItem,
  actorId: string,
  maxLongitudNombre: number,
  ahora: Date,
): Result<CambioItem, KernelError> {
  if (item.eliminado) return fail(KernelErrors.conflict("El item está eliminado y no puede modificarse"));
  const nombre = (patch.nombre ?? item.nombre).trim();
  if (nombre.length === 0) return fail(KernelErrors.validation("El nombre del item es obligatorio"));
  if (nombre.length > maxLongitudNombre) {
    return fail(KernelErrors.validation(`El nombre excede ${maxLongitudNombre} caracteres`));
  }
  const siguiente: ItemInventario = {
    ...item,
    nombre,
    descripcion: (patch.descripcion ?? item.descripcion).trim(),
    estado: patch.estado ?? item.estado,
    clasificacion: patch.clasificacion ?? item.clasificacion,
    reposicion: patch.reposicion ?? item.reposicion,
    leadTime: patch.leadTime === undefined ? item.leadTime : patch.leadTime,
    proveedorPreferido:
      patch.proveedorPreferido === undefined ? item.proveedorPreferido : patch.proveedorPreferido,
    costoEstandar: patch.costoEstandar === undefined ? item.costoEstandar : patch.costoEstandar,
    version: item.version + 1,
    updatedAt: ahora,
  };
  return ok({ item: siguiente, evento: eventoDe(siguiente, ITEM_MODIFICADO, actorId) });
}

/**
 * Refleja los costos recalculados tras una entrada (promedio + última compra).
 * NO decide la política de valuación: la aplica la capa de aplicación con los VO
 * de costo; aquí sólo se persiste el resultado en el aggregate.
 */
export function aplicarCostos(
  item: ItemInventario,
  costos: { promedio: CostoPromedio; ultimaCompra: CostoUltimaCompra },
  actorId: string,
  ahora: Date,
): CambioItem {
  const siguiente: ItemInventario = {
    ...item,
    costoPromedio: costos.promedio,
    costoUltimaCompra: costos.ultimaCompra,
    version: item.version + 1,
    updatedAt: ahora,
  };
  return { item: siguiente, evento: eventoDe(siguiente, ITEM_MODIFICADO, actorId) };
}

export function eliminarItem(item: ItemInventario, actorId: string, ahora: Date): Result<CambioItem, KernelError> {
  if (item.eliminado) return fail(KernelErrors.conflict("El item ya está eliminado"));
  const siguiente: ItemInventario = { ...item, eliminado: true, version: item.version + 1, updatedAt: ahora };
  return ok({ item: siguiente, evento: eventoDe(siguiente, ITEM_ELIMINADO, actorId) });
}
