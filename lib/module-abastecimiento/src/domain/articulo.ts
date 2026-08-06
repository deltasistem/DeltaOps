/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `CatalogoArticulo`.
 *
 * Catálogo MAESTRO de artículos y servicios para mantenimiento (productos,
 * servicios, lubricantes, consumibles, componentes, kits, herramientas y
 * servicios externos). El `tipo` de artículo NUNCA es un enum: referencia el
 * catálogo `tipos-articulo` administrable por tenant.
 *
 * Cada artículo lleva su método de valoración (catálogo `metodos-valoracion`) y
 * un ESTADO DE COSTOS embebido (promedio ponderado / último / estándar), que el
 * motor de costos actualiza de forma pura y determinista al recibir compras.
 * Dominio PURO: la fecha llega como INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ARTICULO_ACTUALIZADO, ARTICULO_CREADO } from "./events";
import { crearDinero, redondear, type Dinero } from "./value-objects";

/* ------------------------------ Estado de costos ------------------------- */
/**
 * Estado de costos de un artículo (valorización de inventario). Se actualiza al
 * recibir compras mediante el motor de costos (cost-engine.ts). Todos los
 * importes comparten la MISMA moneda del artículo.
 */
export interface EstadoCostos {
  readonly moneda: string;
  /** Costo promedio ponderado vigente. */
  readonly costoPromedio: number;
  /** Último costo de compra registrado. */
  readonly ultimoCosto: number;
  /** Costo estándar (fijado por configuración/administración). */
  readonly costoEstandar: number;
  /** Cantidad valorizada acumulada (base del promedio ponderado). */
  readonly cantidadValorizada: number;
}

export function estadoCostosInicial(moneda: string, costoEstandar = 0): EstadoCostos {
  return Object.freeze({
    moneda,
    costoPromedio: redondear(costoEstandar),
    ultimoCosto: redondear(costoEstandar),
    costoEstandar: redondear(costoEstandar),
    cantidadValorizada: 0,
  });
}

/* --------------------------------- Aggregate ----------------------------- */
export interface CatalogoArticulo {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Clave del catálogo `tipos-articulo`. */
  readonly tipo: string;
  /** Clave del catálogo `unidades-medida`. */
  readonly unidad: string;
  /** Clave del catálogo `familias-articulo` (o null). */
  readonly familia: string | null;
  /** Clave del catálogo `metodos-valoracion`. */
  readonly metodoValoracion: string;
  /** Tolerancia de sobre-recepción por defecto (fracción 0..1). */
  readonly toleranciaSobreRecepcion: number;
  /** Referencia opaca al item de inventario correspondiente (o null). */
  readonly inventarioItemId: string | null;
  readonly activo: boolean;
  readonly costos: EstadoCostos;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioArticulo {
  readonly articulo: CatalogoArticulo;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(a: CatalogoArticulo, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioArticulo["evento"] {
  return {
    tipo,
    payload: {
      tenantId: a.tenantId,
      id: a.id,
      entityRef: `catalogo-articulo:${a.id}`,
      codigo: a.codigo,
      nombre: a.nombre,
      tipo: a.tipo,
      unidad: a.unidad,
      metodoValoracion: a.metodoValoracion,
      activo: a.activo,
      version: a.version,
      actualizadoAt: a.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: a,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearArticuloInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly tipo: string;
  readonly unidad: string;
  readonly familia?: string | null;
  readonly metodoValoracion: string;
  readonly moneda: string;
  readonly costoEstandar?: number;
  readonly toleranciaSobreRecepcion?: number;
  readonly inventarioItemId?: string | null;
  readonly actorId: string;
  readonly ahora: string;
  readonly maxLongitudNombre?: number;
}

export function crearArticulo(input: CrearArticuloInput): Result<CambioArticulo, KernelError> {
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre del artículo es obligatorio"));
  const max = input.maxLongitudNombre ?? 200;
  if (input.nombre.length > max) return fail(KernelErrors.validation(`El nombre supera ${max} caracteres`));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  const tol = input.toleranciaSobreRecepcion ?? 0;
  if (tol < 0 || tol > 1) return fail(KernelErrors.validation("La tolerancia debe estar entre 0 y 1"));
  const costoEstandar = input.costoEstandar ?? 0;
  if (costoEstandar < 0) return fail(KernelErrors.validation("El costo estándar no puede ser negativo"));

  const articulo: CatalogoArticulo = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion ?? null,
    tipo: input.tipo,
    unidad: input.unidad,
    familia: input.familia ?? null,
    metodoValoracion: input.metodoValoracion,
    toleranciaSobreRecepcion: tol,
    inventarioItemId: input.inventarioItemId ?? null,
    activo: true,
    costos: estadoCostosInicial(input.moneda, costoEstandar),
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ articulo: Object.freeze(articulo), evento: eventoDe(articulo, ARTICULO_CREADO, input.actorId) });
}

/* -------------------------------- Editar --------------------------------- */
export interface EditarArticuloInput {
  readonly nombre?: string;
  readonly descripcion?: string | null;
  readonly familia?: string | null;
  readonly unidad?: string;
  readonly metodoValoracion?: string;
  readonly toleranciaSobreRecepcion?: number;
  readonly inventarioItemId?: string | null;
  readonly activo?: boolean;
  readonly costoEstandar?: number;
}

export function editarArticulo(a: CatalogoArticulo, cambios: EditarArticuloInput, actorId: string, ahora: string): Result<CambioArticulo, KernelError> {
  if (cambios.toleranciaSobreRecepcion != null && (cambios.toleranciaSobreRecepcion < 0 || cambios.toleranciaSobreRecepcion > 1)) {
    return fail(KernelErrors.validation("La tolerancia debe estar entre 0 y 1"));
  }
  if (cambios.costoEstandar != null && cambios.costoEstandar < 0) {
    return fail(KernelErrors.validation("El costo estándar no puede ser negativo"));
  }
  const costos: EstadoCostos = cambios.costoEstandar != null
    ? Object.freeze({ ...a.costos, costoEstandar: redondear(cambios.costoEstandar) })
    : a.costos;
  const actualizado: CatalogoArticulo = {
    ...a,
    nombre: cambios.nombre?.trim() ?? a.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : a.descripcion,
    familia: cambios.familia !== undefined ? cambios.familia : a.familia,
    unidad: cambios.unidad ?? a.unidad,
    metodoValoracion: cambios.metodoValoracion ?? a.metodoValoracion,
    toleranciaSobreRecepcion: cambios.toleranciaSobreRecepcion ?? a.toleranciaSobreRecepcion,
    inventarioItemId: cambios.inventarioItemId !== undefined ? cambios.inventarioItemId : a.inventarioItemId,
    activo: cambios.activo ?? a.activo,
    costos,
    version: a.version + 1,
    updatedAt: ahora,
  };
  return ok({ articulo: Object.freeze(actualizado), evento: eventoDe(actualizado, ARTICULO_ACTUALIZADO, actorId) });
}

/**
 * Aplica un nuevo estado de costos (resultado del motor de costos) devolviendo el
 * aggregate actualizado. El evento de costos lo emite el comando de recepción.
 */
export function aplicarCostos(a: CatalogoArticulo, costos: EstadoCostos, actorId: string, ahora: string): CambioArticulo {
  const actualizado: CatalogoArticulo = { ...a, costos: Object.freeze(costos), version: a.version + 1, updatedAt: ahora };
  return {
    articulo: Object.freeze(actualizado),
    evento: eventoDe(actualizado, ARTICULO_ACTUALIZADO, actorId, { motivo: "costos" }),
  };
}

/** Construye un `Dinero` con la moneda del artículo. */
export function precioComoDinero(a: CatalogoArticulo, monto: number): Result<Dinero, KernelError> {
  return crearDinero({ moneda: a.costos.moneda, monto });
}
