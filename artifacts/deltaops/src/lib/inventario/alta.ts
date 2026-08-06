/**
 * DGP-011.3 · Constructores del input de los comandos de alta a partir de los
 * valores de los formularios dinámicos + persistencia de borrador por tenant.
 *
 * Puras y exportadas para pruebas deterministas. Cada builder produce EXACTAMENTE
 * las propiedades del esquema del contrato congelado (sin extras).
 */
import type { ValoresFormulario } from "../forms/tipos";

const PREFIJO = "deltaops:inventario:borrador:";

function clave(tenant: string, form: string): string {
  return `${PREFIJO}${form}:${tenant}`;
}

export function leerBorrador(tenant: string, form: string): ValoresFormulario {
  try {
    const raw = localStorage.getItem(clave(tenant, form));
    return raw ? (JSON.parse(raw) as ValoresFormulario) : {};
  } catch {
    return {};
  }
}

export function guardarBorrador(tenant: string, form: string, valores: ValoresFormulario): void {
  try {
    localStorage.setItem(clave(tenant, form), JSON.stringify(valores));
  } catch {
    /* almacenamiento no disponible: ignorar */
  }
}

export function borrarBorrador(tenant: string, form: string): void {
  try {
    localStorage.removeItem(clave(tenant, form));
  } catch {
    /* ignorar */
  }
}

function texto(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Input del comando `crear-item`. */
export function construirInputItem(valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = {
    sku: texto(valores.sku),
    nombre: texto(valores.nombre),
    tipoItem: texto(valores.tipoItem),
    modoTrazabilidad: texto(valores.modoTrazabilidad) ?? "ninguna",
    unidadBase: { clave: texto(valores.unidadClave) ?? "u", ...(texto(valores.unidadEtiqueta) ? { etiqueta: texto(valores.unidadEtiqueta) } : {}) },
  };
  const descripcion = texto(valores.descripcion);
  if (descripcion) input.descripcion = descripcion;
  for (const k of ["categoria", "familia", "subcategoria", "marca", "proyecto"] as const) {
    const v = texto(valores[k]);
    if (v) input[k] = v;
  }
  if (valores.controlaVencimiento != null) input.controlaVencimiento = Boolean(valores.controlaVencimiento);
  const rep: Record<string, number> = {};
  const min = num(valores.minimo); if (min != null) rep.minimo = min;
  const max = num(valores.maximo); if (max != null) rep.maximo = max;
  const pr = num(valores.puntoReorden); if (pr != null) rep.puntoReorden = pr;
  if (Object.keys(rep).length) input.reposicion = rep;
  const lead = num(valores.leadTimeDias);
  if (lead != null) input.leadTimeDias = lead;
  return input;
}

/** Input del comando `mover`. */
export function construirInputMovimiento(itemId: string, valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = {
    itemId,
    bodegaId: texto(valores.bodegaId),
    ubicacionId: texto(valores.ubicacionId),
    tipo: texto(valores.tipo),
    cantidad: num(valores.cantidad),
  };
  const lote = texto(valores.loteId); if (lote) input.loteId = lote;
  const serie = texto(valores.serieId); if (serie) input.serieId = serie;
  const ref = texto(valores.referencia); if (ref) input.referencia = ref;
  return input;
}

/** Input del comando `reservar`. */
export function construirInputReserva(itemId: string, valores: ValoresFormulario): Record<string, unknown> {
  return {
    itemId,
    bodegaId: texto(valores.bodegaId),
    ubicacionId: texto(valores.ubicacionId),
    cantidad: num(valores.cantidad),
    demanda: { tipo: texto(valores.demandaTipo) ?? "", id: texto(valores.demandaId) ?? "" },
  };
}

/** Input del comando `transferir` (una línea desde el formulario). */
export function construirInputTransferencia(valores: ValoresFormulario): {
  origen: Record<string, unknown>;
  destino: Record<string, unknown>;
  lineas: Array<Record<string, unknown>>;
} {
  const linea: Record<string, unknown> = {
    itemId: texto(valores.itemId),
    cantidad: num(valores.cantidad),
  };
  const loteCodigo = texto(valores.loteCodigo); if (loteCodigo) linea.loteCodigo = loteCodigo;
  const serieNumero = texto(valores.serieNumero); if (serieNumero) linea.serieNumero = serieNumero;
  return {
    origen: { bodegaId: texto(valores.origenBodega), ubicacionId: texto(valores.origenUbicacion) },
    destino: { bodegaId: texto(valores.destinoBodega), ubicacionId: texto(valores.destinoUbicacion) },
    lineas: [linea],
  };
}

/** Input del comando `ajustar`. */
export function construirInputAjuste(itemId: string, valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = {
    itemId,
    bodegaId: texto(valores.bodegaId),
    ubicacionId: texto(valores.ubicacionId),
    tipo: texto(valores.tipo),
    cantidad: num(valores.cantidad),
    motivo: texto(valores.motivo),
  };
  const lote = texto(valores.loteId); if (lote) input.loteId = lote;
  return input;
}

/**
 * Input del comando `iniciar-conteo`. El contrato exige `tipo` + `lineas`
 * (existencias a contar, `{inventarioId}`); la bodega se traduce a `alcance`
 * opcional `{tipo:"bodega", id}`. Las `lineas` provienen de la selección de la
 * UI (`inventarioIds`).
 */
export function construirInputConteo(
  valores: ValoresFormulario,
  inventarioIds: string[],
): { tipo: string; lineas: Array<{ inventarioId: string }>; alcance?: { tipo: string; id: string } } {
  const salida: { tipo: string; lineas: Array<{ inventarioId: string }>; alcance?: { tipo: string; id: string } } = {
    tipo: texto(valores.tipo) ?? "",
    lineas: inventarioIds.map((inventarioId) => ({ inventarioId })),
  };
  const bodega = texto(valores.bodegaId);
  if (bodega) salida.alcance = { tipo: "bodega", id: bodega };
  return salida;
}

/** Input del comando `crear-lote`. */
export function construirInputLote(itemId: string, valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = { itemId, codigo: texto(valores.codigo) };
  const venc = texto(valores.vencimiento); if (venc) input.vencimiento = venc;
  return input;
}

/** Input del comando `registrar-serie`. */
export function construirInputSerie(itemId: string, valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = { itemId, numero: texto(valores.numero) };
  const lote = texto(valores.loteId); if (lote) input.loteId = lote;
  return input;
}

/** Input del comando `crear-bodega`. */
export function construirInputBodega(valores: ValoresFormulario): Record<string, unknown> {
  return { codigo: texto(valores.codigo), nombre: texto(valores.nombre), tipo: texto(valores.tipo) };
}

/** Input del comando `crear-ubicacion`. */
export function construirInputUbicacion(bodegaId: string, valores: ValoresFormulario): Record<string, unknown> {
  const input: Record<string, unknown> = { bodegaId, nivel: texto(valores.nivel), valor: texto(valores.valor) };
  const padre = texto(valores.padreId); if (padre) input.padreId = padre;
  return input;
}
