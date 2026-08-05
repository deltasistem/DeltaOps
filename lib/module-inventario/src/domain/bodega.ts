/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregates `Bodega` y `Ubicacion`.
 *
 * La jerarquía de almacenamiento NO tiene estructura fija: `Bodega` puede tener
 * subbodegas (por `padreId`) y `Ubicacion` es un ÁRBOL configurable de niveles
 * (bodega/subbodega/pasillo/estantería/nivel/posición…), donde cada nivel es una
 * clave del catálogo `tipos-ubicacion` del tenant. El dominio sólo garantiza la
 * coherencia del árbol (padre existente, ruta canónica), nunca fija los niveles.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { BODEGA_CREADA, UBICACION_CREADA } from "./events";
import type { SegmentoUbicacion } from "./value-objects";
import { rutaDeSegmentos } from "./value-objects";

export interface Bodega {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  /** Clave del catálogo `tipos-bodega`. */
  readonly tipo: string;
  /** Empresa propietaria (clave del catálogo `empresas`) o null. */
  readonly empresa: string | null;
  /** Bodega padre (subbodega) o null si es raíz. */
  readonly padreId: string | null;
  readonly activa: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Ubicacion {
  readonly id: string;
  readonly tenantId: string;
  readonly bodegaId: string;
  /** Ubicación padre en el árbol, o null si cuelga de la bodega. */
  readonly padreId: string | null;
  /** Segmentos jerárquicos acumulados desde la raíz (raíz→este nodo). */
  readonly segmentos: readonly SegmentoUbicacion[];
  /** Ruta canónica denormalizada. */
  readonly ruta: string;
  readonly activa: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioBodega {
  readonly bodega: Bodega;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}
export interface CambioUbicacion {
  readonly ubicacion: Ubicacion;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

export interface DatosNuevaBodega {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly empresa?: string | null;
  readonly padre?: Bodega | null;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearBodega(d: DatosNuevaBodega): Result<CambioBodega, KernelError> {
  const nombre = d.nombre.trim();
  if (nombre.length === 0) return fail(KernelErrors.validation("El nombre de la bodega es obligatorio"));
  if (!d.tipo) return fail(KernelErrors.validation("El tipo de bodega es obligatorio"));
  if (d.padre && d.padre.tenantId !== d.tenantId) {
    return fail(KernelErrors.validation("La bodega padre pertenece a otro tenant"));
  }
  const bodega: Bodega = {
    id: d.id,
    tenantId: d.tenantId,
    codigo: d.codigo.trim(),
    nombre,
    tipo: d.tipo,
    empresa: d.empresa ?? d.padre?.empresa ?? null,
    padreId: d.padre?.id ?? null,
    activa: true,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({
    bodega,
    evento: {
      tipo: BODEGA_CREADA,
      payload: {
        tenantId: bodega.tenantId,
        id: bodega.id,
        entityRef: `inventario-bodega:${bodega.id}`,
        codigo: bodega.codigo,
        nombre: bodega.nombre,
        tipo: bodega.tipo,
        empresa: bodega.empresa,
        padreId: bodega.padreId,
        activa: bodega.activa,
        version: bodega.version,
        actorId: d.actorId,
        eventoTipo: BODEGA_CREADA,
      },
    },
  });
}

export interface DatosNuevaUbicacion {
  readonly id: string;
  readonly tenantId: string;
  readonly bodega: Bodega;
  readonly padre?: Ubicacion | null;
  /** Segmento que este nodo añade (nivel del catálogo `tipos-ubicacion` + valor). */
  readonly segmento: SegmentoUbicacion;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearUbicacion(d: DatosNuevaUbicacion): Result<CambioUbicacion, KernelError> {
  if (d.bodega.tenantId !== d.tenantId) {
    return fail(KernelErrors.validation("La bodega pertenece a otro tenant"));
  }
  if (d.padre) {
    if (d.padre.tenantId !== d.tenantId) return fail(KernelErrors.validation("La ubicación padre pertenece a otro tenant"));
    if (d.padre.bodegaId !== d.bodega.id) {
      return fail(KernelErrors.validation("La ubicación padre pertenece a otra bodega"));
    }
  }
  const segmentos = [...(d.padre?.segmentos ?? []), d.segmento];
  const ubicacion: Ubicacion = {
    id: d.id,
    tenantId: d.tenantId,
    bodegaId: d.bodega.id,
    padreId: d.padre?.id ?? null,
    segmentos: Object.freeze(segmentos),
    ruta: rutaDeSegmentos(segmentos),
    activa: true,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({
    ubicacion,
    evento: {
      tipo: UBICACION_CREADA,
      payload: {
        tenantId: ubicacion.tenantId,
        id: ubicacion.id,
        entityRef: `inventario-ubicacion:${ubicacion.id}`,
        bodegaId: ubicacion.bodegaId,
        padreId: ubicacion.padreId,
        segmentos: ubicacion.segmentos,
        ruta: ubicacion.ruta,
        activa: ubicacion.activa,
        version: ubicacion.version,
        actorId: d.actorId,
        eventoTipo: UBICACION_CREADA,
      },
    },
  });
}
