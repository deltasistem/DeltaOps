/**
 * DGP-013 · Constructores de entrada (Dynamic Forms → cuerpos del contrato).
 *
 * Funciones PURAS que transforman los valores planos del renderer de Dynamic
 * Forms en los cuerpos anidados EXACTOS del OpenAPI congelado. Omiten campos
 * vacíos/indefinidos (los esquemas son `additionalProperties:false`), convierten
 * a número donde procede y numeran líneas de forma determinista.
 */
import type {
  EntradaCrearArticulo,
  EntradaCrearProveedor,
  EntradaCrearSolicitud,
  EntradaCotizacion,
  EntradaCrearOC,
  EntradaRegistrarRecepcion,
} from "./mutaciones";
import type {
  LineaSolicitud,
  LineaCotizacion,
  LineaOrdenCompra,
  LineaRecepcion,
  OrigenSolicitud,
  Contacto,
  Certificacion,
} from "./tipos";

type Valores = Record<string, unknown>;

function txt(v: unknown): string { return String(v ?? "").trim(); }
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && txt(v) !== "" ? n : undefined;
}
function filas(v: unknown): Valores[] {
  return Array.isArray(v) ? (v as Valores[]) : [];
}

/* -------------------------------- Artículo ------------------------------ */

export function construirInputArticulo(v: Valores): EntradaCrearArticulo {
  return {
    nombre: txt(v.nombre),
    descripcion: txt(v.descripcion) || undefined,
    tipo: txt(v.tipo),
    unidad: txt(v.unidad),
    familia: txt(v.familia) || undefined,
    metodoValoracion: txt(v.metodoValoracion),
    moneda: txt(v.moneda),
    costoEstandar: num(v.costoEstandar),
    toleranciaSobreRecepcion: num(v.toleranciaSobreRecepcion),
    inventarioItemId: txt(v.inventarioItemId) || undefined,
  };
}

/* -------------------------------- Proveedor ----------------------------- */

export function construirInputProveedor(v: Valores): EntradaCrearProveedor {
  const contactos: Contacto[] = filas(v.contactos)
    .map((c) => ({ nombre: txt(c.nombre) || undefined, cargo: txt(c.cargo) || undefined, email: txt(c.email) || undefined, telefono: txt(c.telefono) || undefined }))
    .filter((c) => c.nombre || c.email || c.telefono);
  const certificaciones: Certificacion[] = filas(v.certificaciones)
    .map((c) => ({ nombre: txt(c.nombre) || undefined, emisor: txt(c.emisor) || undefined, vigenteHasta: txt(c.vigenteHasta) || undefined }))
    .filter((c) => c.nombre);
  const sla: { tiempoRespuestaHoras?: number; plazoEntregaDias?: number; nivelServicio?: number } = {};
  const tr = num(v.slaTiempoRespuestaHoras); if (tr !== undefined) sla.tiempoRespuestaHoras = tr;
  const pe = num(v.slaPlazoEntregaDias); if (pe !== undefined) sla.plazoEntregaDias = pe;
  const ns = num(v.slaNivelServicio); if (ns !== undefined) sla.nivelServicio = ns;
  return {
    razonSocial: txt(v.razonSocial),
    nombreComercial: txt(v.nombreComercial) || undefined,
    identificacionTributaria: txt(v.identificacionTributaria) || undefined,
    tipo: txt(v.tipo),
    monedaPreferida: txt(v.monedaPreferida) || undefined,
    contactos: contactos.length ? contactos : undefined,
    certificaciones: certificaciones.length ? certificaciones : undefined,
    sla: Object.keys(sla).length ? sla : undefined,
  };
}

/* ------------------------------- Solicitud ------------------------------ */

export function construirOrigen(v: Valores): OrigenSolicitud {
  const origen: OrigenSolicitud = { tipo: txt(v.origenTipo) || "usuario" };
  const refId = txt(v.origenReferenciaId);
  const refTipo = txt(v.origenReferenciaTipo);
  const etiqueta = txt(v.origenEtiqueta);
  if (refId) (origen as { referenciaId?: string }).referenciaId = refId;
  if (refTipo) (origen as { referenciaTipo?: string }).referenciaTipo = refTipo;
  if (etiqueta) (origen as { etiqueta?: string }).etiqueta = etiqueta;
  return origen;
}

export function construirInputSolicitud(v: Valores): EntradaCrearSolicitud {
  const lineas: LineaSolicitud[] = filas(v.lineas).map((l, i) => {
    const linea: LineaSolicitud = {
      numero: i + 1,
      descripcion: txt(l.descripcion),
      cantidad: { valor: num(l.cantidad) ?? 0, unidad: txt(l.unidad) || "unidad" },
    };
    const articuloId = txt(l.articuloId);
    if (articuloId) (linea as { articuloId?: string }).articuloId = articuloId;
    const notas = txt(l.notas);
    if (notas) (linea as { notas?: string }).notas = notas;
    return linea;
  });
  return {
    titulo: txt(v.titulo),
    descripcion: txt(v.descripcion) || undefined,
    prioridad: txt(v.prioridad),
    origen: construirOrigen(v),
    lineas,
  };
}

/* ------------------------------ Cotización ------------------------------ */

export function construirInputCotizacion(v: Valores): EntradaCotizacion {
  const moneda = txt(v.moneda) || "USD";
  const lineas: LineaCotizacion[] = filas(v.lineas).map((l, i) => {
    const linea: LineaCotizacion = {
      numeroLineaSolicitud: num(l.numeroLineaSolicitud) ?? i + 1,
      descripcion: txt(l.descripcion),
      cantidad: { valor: num(l.cantidad) ?? 0, unidad: txt(l.unidad) || "unidad" },
      precioUnitario: { monto: num(l.precioUnitario) ?? 0, moneda },
    };
    const plazo = num(l.plazoEntregaDias);
    if (plazo !== undefined) (linea as { plazoEntregaDias?: number }).plazoEntregaDias = plazo;
    const articuloId = txt(l.articuloId);
    if (articuloId) (linea as { articuloId?: string }).articuloId = articuloId;
    return linea;
  });
  return {
    solicitudId: txt(v.solicitudId),
    proveedorId: txt(v.proveedorId),
    moneda,
    condicionesPago: txt(v.condicionesPago) || undefined,
    vigenteHasta: txt(v.vigenteHasta) || undefined,
    lineas,
  };
}

/* --------------------------- Orden de compra ---------------------------- */

export function construirInputOrdenCompra(v: Valores): EntradaCrearOC {
  const moneda = txt(v.moneda) || "USD";
  const lineas: LineaOrdenCompra[] = filas(v.lineas).map((l, i) => {
    const linea: LineaOrdenCompra = {
      numero: i + 1,
      descripcion: txt(l.descripcion),
      cantidad: { valor: num(l.cantidad) ?? 0, unidad: txt(l.unidad) || "unidad" },
      precioUnitario: { monto: num(l.precioUnitario) ?? 0, moneda },
    };
    const articuloId = txt(l.articuloId);
    if (articuloId) (linea as { articuloId?: string }).articuloId = articuloId;
    const bodegaId = txt(l.bodegaId);
    if (bodegaId) (linea as { bodega?: { tipo: string; id: string } }).bodega = { tipo: "bodega", id: bodegaId };
    return linea;
  });
  return {
    proveedorId: txt(v.proveedorId),
    solicitudId: txt(v.solicitudId) || undefined,
    cotizacionId: txt(v.cotizacionId) || undefined,
    moneda,
    condicionesPago: txt(v.condicionesPago) || undefined,
    condicionesEntrega: txt(v.condicionesEntrega) || undefined,
    lineas,
  };
}

/* ------------------------------ Recepción ------------------------------- */

export function construirInputRecepcion(v: Valores, ordenCompraId: string, expectedVersion: number): EntradaRegistrarRecepcion {
  const lineas: LineaRecepcion[] = filas(v.lineas)
    .filter((l) => num(l.cantidad) !== undefined && (num(l.cantidad) ?? 0) > 0)
    .map((l) => {
      const linea: LineaRecepcion = {
        numeroLineaOC: num(l.numeroLineaOC) ?? 1,
        cantidad: { valor: num(l.cantidad) ?? 0, unidad: txt(l.unidad) || "unidad" },
      };
      const novedad = txt(l.novedad);
      if (novedad) (linea as { novedad?: string }).novedad = novedad;
      const bodegaId = txt(l.bodegaId);
      if (bodegaId) (linea as { bodega?: { tipo: string; id: string } }).bodega = { tipo: "bodega", id: bodegaId };
      const lote = txt(l.lote);
      if (lote) (linea as { lote?: string }).lote = lote;
      const serie = txt(l.serie);
      if (serie) (linea as { serie?: string }).serie = serie;
      return linea;
    });
  return {
    ordenCompraId,
    expectedVersion,
    nota: txt(v.nota) || undefined,
    lineas,
  };
}
