/**
 * DGP-013 · Tipos del read model del módulo de Abastecimiento (CQRS query side).
 *
 * Reflejan la forma de las proyecciones del backend. Los campos opcionales
 * absorben la tolerancia de forma del read model (no se asume presencia). Los
 * cuerpos de escritura se validan aparte contra el OpenAPI congelado.
 */

/* ------------------------------ Compartidos ----------------------------- */

export interface Cantidad {
  readonly valor: number;
  readonly unidad: string;
}

export interface Precio {
  readonly monto: number;
  readonly moneda: string;
}

export interface ReferenciaExterna {
  readonly tipo: string;
  readonly id: string;
  readonly etiqueta?: string;
}

/* ------------------------------- Artículos ------------------------------ */

export interface ArticuloRow {
  readonly id: string;
  readonly tenantId?: string;
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
  readonly activo?: boolean;
  readonly version?: number;
  readonly actualizadoEn?: string;
  readonly creadoEn?: string;
}

/** Costos del artículo (promedio/último/estándar) desde /articulos/:id/costos. */
export interface Costo {
  readonly articuloId: string;
  readonly moneda: string;
  readonly metodoValoracion?: string;
  readonly costoUnitario?: number;
  readonly cantidadAcumulada?: number;
}

export interface CostosArticulo {
  readonly promedio?: number;
  readonly ultimo?: number;
  readonly estandar?: number;
  readonly moneda?: string;
  readonly historial?: Array<{ fecha?: string; costoUnitario?: number; metodoValoracion?: string; origen?: string }>;
}

/* ------------------------------ Proveedores ----------------------------- */

export interface Contacto {
  readonly nombre?: string;
  readonly cargo?: string;
  readonly email?: string;
  readonly telefono?: string;
}

export interface Certificacion {
  readonly nombre?: string;
  readonly emisor?: string;
  readonly vigenteHasta?: string;
}

export interface SlaProveedor {
  readonly tiempoRespuestaHoras?: number;
  readonly plazoEntregaDias?: number;
  readonly nivelServicio?: number;
}

export interface Calificacion {
  readonly calidad?: number;
  readonly tiempo?: number;
  readonly precio?: number;
  readonly servicio?: number;
  readonly promedio?: number;
  readonly nota?: string | null;
  readonly fecha?: string;
}

export interface ProveedorRow {
  readonly id: string;
  readonly tenantId?: string;
  readonly razonSocial: string;
  readonly nombreComercial?: string | null;
  readonly identificacionTributaria?: string | null;
  readonly tipo: string;
  readonly monedaPreferida?: string | null;
  readonly contactos?: Contacto[];
  readonly certificaciones?: Certificacion[];
  readonly sla?: SlaProveedor;
  readonly calificacion?: Calificacion;
  readonly activo?: boolean;
  readonly version?: number;
  readonly actualizadoEn?: string;
}

/* ------------------------------ Solicitudes ----------------------------- */

export interface OrigenSolicitud {
  readonly tipo: string;
  readonly referenciaId?: string | null;
  readonly referenciaTipo?: string | null;
  readonly etiqueta?: string | null;
}

export interface LineaSolicitud {
  readonly numero?: number;
  readonly descripcion: string;
  readonly articuloId?: string | null;
  readonly referencia?: ReferenciaExterna;
  readonly cantidad: Cantidad;
  readonly unidad?: string;
  readonly notas?: string | null;
}

export interface SolicitudRow {
  readonly id: string;
  readonly tenantId?: string;
  readonly titulo: string;
  readonly descripcion?: string | null;
  readonly prioridad: string;
  readonly origen?: OrigenSolicitud;
  readonly estado: string;
  readonly version?: number;
  readonly lineas?: LineaSolicitud[];
  readonly cotizacionSeleccionadaId?: string | null;
  readonly motivoRechazo?: string | null;
  readonly actualizadoEn?: string;
  readonly creadoEn?: string;
}

/* ------------------------------ Cotizaciones ---------------------------- */

export interface LineaCotizacion {
  readonly numeroLineaSolicitud?: number;
  readonly descripcion: string;
  readonly articuloId?: string | null;
  readonly cantidad: Cantidad;
  readonly precioUnitario: Precio;
  readonly plazoEntregaDias?: number;
}

export interface CotizacionRow {
  readonly id: string;
  readonly solicitudId: string;
  readonly proveedorId: string;
  readonly proveedorNombre?: string;
  readonly moneda: string;
  readonly condicionesPago?: string | null;
  readonly vigenteHasta?: string | null;
  readonly lineas?: LineaCotizacion[];
  readonly total?: number;
  readonly plazoEntregaMaxDias?: number;
  readonly seleccionada?: boolean;
  readonly creadoEn?: string;
}

/* ---------------------------- Órdenes de compra ------------------------- */

export interface LineaOrdenCompra {
  readonly numero?: number;
  readonly descripcion: string;
  readonly articuloId?: string | null;
  readonly referencia?: ReferenciaExterna;
  readonly bodega?: ReferenciaExterna;
  readonly cantidad: Cantidad;
  readonly precioUnitario: Precio;
  readonly cantidadRecibida?: number;
}

export interface OrdenCompraRow {
  readonly id: string;
  readonly tenantId?: string;
  readonly codigo?: string;
  readonly proveedorId: string;
  readonly proveedorNombre?: string;
  readonly solicitudId?: string | null;
  readonly cotizacionId?: string | null;
  readonly moneda: string;
  readonly condicionesPago?: string | null;
  readonly condicionesEntrega?: string | null;
  readonly estado: string;
  readonly version?: number;
  readonly lineas?: LineaOrdenCompra[];
  readonly total?: number;
  readonly actualizadoEn?: string;
  readonly creadoEn?: string;
}

/* ------------------------------ Recepciones ----------------------------- */

export interface LineaRecepcion {
  readonly numeroLineaOC: number;
  readonly cantidad: Cantidad;
  readonly novedad?: string;
  readonly bodega?: ReferenciaExterna;
  readonly lote?: string | null;
  readonly serie?: string | null;
}

export interface RecepcionRow {
  readonly id: string;
  readonly ordenCompraId: string;
  readonly estado?: string;
  readonly nota?: string | null;
  readonly lineas?: LineaRecepcion[];
  readonly materializada?: boolean;
  readonly creadoEn?: string;
}

/** Movimiento de inventario creado (o idempotente) al materializar una recepción. */
export interface MovimientoMaterializado {
  readonly movimientoId: string;
  readonly itemId?: string;
  readonly bodegaId?: string;
  readonly ubicacionId?: string;
  readonly cantidad?: number;
  readonly idempotente: boolean;
}

/** Resultado de materializar una recepción a inventario. */
export interface ResultadoMaterializacion {
  readonly recepcionId?: string;
  readonly movimientos?: MovimientoMaterializado[];
  readonly costosActualizados?: Array<{ articuloId: string; costoPromedio?: number; ultimoCosto?: number }>;
  readonly idempotente?: boolean;
}

/* ------------------------------- Comunes -------------------------------- */

export interface EntradaHistorial {
  readonly id?: string;
  readonly tipo: string;
  readonly descripcion?: string;
  readonly actor?: string;
  readonly motivo?: string;
  readonly fecha?: string;
  readonly version?: number;
  readonly entityRef?: string;
}

export interface EventoAbastecimiento {
  readonly tipo: string;
  readonly entityRef?: string;
  readonly fecha?: string;
  readonly descripcion?: string;
  readonly datos?: Record<string, unknown>;
}

export interface OpcionCatalogo {
  readonly valor: string;
  readonly etiqueta: string;
  readonly clave?: string;
  readonly padre?: string | null;
}
