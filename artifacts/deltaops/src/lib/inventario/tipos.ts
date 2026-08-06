/**
 * DGP-011.3 · Tipos del read model de Inventario (CQRS read side).
 *
 * Los proyectores del backend devuelven objetos abiertos (el contrato OpenAPI
 * los declara como objetos libres). Aquí se tipan los campos PROYECTADOS que la
 * experiencia consume, manteniendo `[k]: unknown` para tolerar campos extra sin
 * romper (degradación elegante).
 */

export interface ItemRow {
  id: string;
  tenantId?: string;
  sku: string;
  nombre: string;
  descripcion?: string | null;
  estado?: string;
  tipoItem?: string;
  categoria?: string | null;
  familia?: string | null;
  subcategoria?: string | null;
  marca?: string | null;
  proyecto?: string | null;
  unidadBase?: { clave: string; etiqueta?: string; factorBase?: number };
  modoTrazabilidad?: string;
  controlaVencimiento?: boolean;
  reposicion?: { minimo?: number; maximo?: number; puntoReorden?: number };
  leadTimeDias?: number;
  version?: number;
  actualizadoAt?: string;
  /** Totales agregados si el proyector los expone. */
  disponible?: number;
  reservado?: number;
  enMano?: number;
  [k: string]: unknown;
}

export interface ExistenciaRow {
  id: string;
  itemId: string;
  bodegaId: string;
  ubicacionId: string;
  cantidad?: number;
  disponible?: number;
  reservado?: number;
  loteId?: string | null;
  serieId?: string | null;
  version?: number;
  [k: string]: unknown;
}

export interface MovimientoRow {
  id: string;
  itemId?: string;
  bodegaId?: string;
  ubicacionId?: string;
  tipo?: string;
  cantidad?: number;
  loteId?: string | null;
  serieId?: string | null;
  referencia?: string | null;
  fecha?: string;
  ocurridoAt?: string;
  [k: string]: unknown;
}

export interface ReservaRow {
  id: string;
  itemId?: string;
  bodegaId?: string;
  ubicacionId?: string;
  cantidad?: number;
  estado?: string;
  demanda?: { tipo: string; id: string };
  version?: number;
  actualizadoAt?: string;
  [k: string]: unknown;
}

export interface TransferenciaRow {
  id: string;
  estado?: string;
  origen?: { bodegaId: string; ubicacionId: string; [k: string]: unknown };
  destino?: { bodegaId: string; ubicacionId: string; [k: string]: unknown };
  lineas?: Array<{ itemId: string; cantidad: number; loteCodigo?: string | null; serieNumero?: string | null }>;
  version?: number;
  actualizadoAt?: string;
  [k: string]: unknown;
}

export interface AjusteRow {
  id: string;
  itemId?: string;
  bodegaId?: string;
  ubicacionId?: string;
  tipo?: string;
  cantidad?: number;
  motivo?: string;
  estado?: string;
  aprobado?: boolean;
  version?: number;
  actualizadoAt?: string;
  [k: string]: unknown;
}

export interface ConteoRow {
  id: string;
  tipo?: string;
  bodegaId?: string;
  estado?: string;
  version?: number;
  diferencias?: Array<{ inventarioId: string; contado: number; sistema?: number; diferencia?: number }>;
  actualizadoAt?: string;
  [k: string]: unknown;
}

export interface LoteRow {
  id: string;
  itemId?: string;
  codigo?: string;
  vencimiento?: string | null;
  cantidad?: number;
  version?: number;
  [k: string]: unknown;
}

export interface SerieRow {
  id: string;
  itemId?: string;
  numero?: string;
  loteId?: string | null;
  estado?: string;
  version?: number;
  [k: string]: unknown;
}

export interface BodegaRow {
  id: string;
  codigo?: string;
  nombre?: string;
  tipo?: string;
  empresaId?: string | null;
  capacidad?: number;
  ocupacion?: number;
  version?: number;
  [k: string]: unknown;
}

export interface UbicacionRow {
  id: string;
  bodegaId?: string;
  nivel?: string;
  valor?: string;
  padreId?: string | null;
  version?: number;
  [k: string]: unknown;
}

export interface OpcionCatalogo {
  valor: string;
  etiqueta: string;
  [k: string]: unknown;
}
