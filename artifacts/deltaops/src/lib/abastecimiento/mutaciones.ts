/**
 * DGP-013 · Mutaciones del módulo de Abastecimiento con degradación Offline First.
 *
 * Cada mutación intenta el POST/PUT directo; si falla por red, encola la
 * operación (mismo comando que consume `/sync`, entrada COMPLETA + opId) para
 * replay idempotente posterior. NO contiene lógica de negocio: sólo transporta
 * el comando. Las operaciones gobernadas por Workflow (transiciones de solicitud
 * y de OC) NUNCA hacen bypass: envían la decisión explícita del usuario (SU
 * acción concreta y el motivo de rechazo cuando aplica) al motor.
 *
 * Los cuerpos coinciden EXACTAMENTE con los esquemas del contrato OpenAPI
 * congelado (verificado por `abastecimiento-contract.test.ts`). Los comandos de
 * CREACIÓN acuñan el `id` (UUID) en cliente para idempotencia del alta.
 */
import { abastecimientoFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO, type AccionSolicitud, type AccionOC } from "./constantes";
import type {
  LineaSolicitud,
  LineaCotizacion,
  LineaOrdenCompra,
  LineaRecepcion,
  OrigenSolicitud,
  Contacto,
  Certificacion,
  SlaProveedor,
} from "./tipos";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

function limpiar(cuerpo: Record<string, unknown>, opcionales: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(opcionales)) {
    if (v !== undefined && v !== "" && v !== null) cuerpo[k] = v;
  }
}

/* -------------------------------- Artículos ----------------------------- */

export interface EntradaCrearArticulo {
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  unidad: string;
  familia?: string | null;
  metodoValoracion: string;
  moneda: string;
  costoEstandar?: number;
  toleranciaSobreRecepcion?: number;
  inventarioItemId?: string | null;
  id?: string;
  opId?: string;
}

export async function crearArticulo(cola: ColaSync, input: EntradaCrearArticulo): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    nombre: input.nombre,
    tipo: input.tipo,
    unidad: input.unidad,
    metodoValoracion: input.metodoValoracion,
    moneda: input.moneda,
  };
  limpiar(cuerpo, {
    descripcion: input.descripcion,
    familia: input.familia,
    costoEstandar: input.costoEstandar,
    toleranciaSobreRecepcion: input.toleranciaSobreRecepcion,
    inventarioItemId: input.inventarioItemId,
  });
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-articulo`,
    input: cuerpo,
    descripcion: `Crear artículo ${input.nombre}`,
    directo: () => abastecimientoFetch("/articulos", { method: "POST", body: cuerpo }),
  });
}

export interface EntradaEditarArticulo {
  nombre?: string;
  descripcion?: string | null;
  familia?: string | null;
  unidad?: string;
  metodoValoracion?: string;
  toleranciaSobreRecepcion?: number;
  inventarioItemId?: string | null;
  activo?: boolean;
  costoEstandar?: number;
}

export async function editarArticulo(cola: ColaSync, id: string, expectedVersion: number, cambios: EntradaEditarArticulo): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  for (const [k, v] of Object.entries(cambios)) {
    if (v !== undefined) cuerpo[k] = v;
  }
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-articulo`,
    input: cuerpo,
    descripcion: `Editar artículo ${id}`,
    directo: () => abastecimientoFetch(`/articulos/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/* ------------------------------ Proveedores ----------------------------- */

export interface EntradaCrearProveedor {
  razonSocial: string;
  nombreComercial?: string | null;
  identificacionTributaria?: string | null;
  tipo: string;
  monedaPreferida?: string | null;
  contactos?: Contacto[];
  certificaciones?: Certificacion[];
  sla?: SlaProveedor;
  id?: string;
  opId?: string;
}

export async function crearProveedor(cola: ColaSync, input: EntradaCrearProveedor): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, razonSocial: input.razonSocial, tipo: input.tipo };
  limpiar(cuerpo, {
    nombreComercial: input.nombreComercial,
    identificacionTributaria: input.identificacionTributaria,
    monedaPreferida: input.monedaPreferida,
  });
  if (input.contactos?.length) cuerpo.contactos = input.contactos;
  if (input.certificaciones?.length) cuerpo.certificaciones = input.certificaciones;
  if (input.sla && Object.keys(input.sla).length) cuerpo.sla = input.sla;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-proveedor`,
    input: cuerpo,
    descripcion: `Crear proveedor ${input.razonSocial}`,
    directo: () => abastecimientoFetch("/proveedores", { method: "POST", body: cuerpo }),
  });
}

export interface EntradaEditarProveedor {
  razonSocial?: string;
  nombreComercial?: string | null;
  identificacionTributaria?: string | null;
  tipo?: string;
  monedaPreferida?: string | null;
  contactos?: Contacto[];
  certificaciones?: Certificacion[];
  sla?: SlaProveedor;
  activo?: boolean;
}

export async function editarProveedor(cola: ColaSync, id: string, expectedVersion: number, cambios: EntradaEditarProveedor): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  for (const [k, v] of Object.entries(cambios)) {
    if (v !== undefined) cuerpo[k] = v;
  }
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-proveedor`,
    input: cuerpo,
    descripcion: `Editar proveedor ${id}`,
    directo: () => abastecimientoFetch(`/proveedores/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/** Registra una calificación multi-criterio del proveedor. Anclada a versión. */
export async function calificarProveedor(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  calif: { calidad: number; tiempo: number; precio: number; servicio: number; nota?: string | null },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, expectedVersion, opId,
    calidad: calif.calidad, tiempo: calif.tiempo, precio: calif.precio, servicio: calif.servicio,
  };
  limpiar(cuerpo, { nota: calif.nota });
  return mutarConOffline(cola, {
    comando: `${MODULO}.calificar-proveedor`,
    input: cuerpo,
    descripcion: `Calificar proveedor ${id}`,
    directo: () => abastecimientoFetch(`/proveedores/${id}/calificar`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Solicitudes ----------------------------- */

export interface EntradaCrearSolicitud {
  titulo: string;
  descripcion?: string | null;
  prioridad: string;
  origen: OrigenSolicitud;
  lineas: LineaSolicitud[];
  id?: string;
  opId?: string;
}

export async function crearSolicitud(cola: ColaSync, input: EntradaCrearSolicitud): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    titulo: input.titulo,
    prioridad: input.prioridad,
    origen: input.origen,
    lineas: input.lineas,
  };
  limpiar(cuerpo, { descripcion: input.descripcion });
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-solicitud`,
    input: cuerpo,
    descripcion: `Crear solicitud ${input.titulo}`,
    directo: () => abastecimientoFetch("/solicitudes", { method: "POST", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow a la solicitud. La UI envía SU acción
 * concreta (`enviar`/`aprobar`/`rechazar`/`cerrar`) — nunca se colapsa en un
 * comando único. `rechazar` exige `motivoRechazo`.
 * Endpoint gobernado: `POST /solicitudes/:id/transicion`.
 */
export async function transicionarSolicitud(
  cola: ColaSync,
  id: string,
  accion: AccionSolicitud,
  expectedVersion: number,
  opciones: { motivoRechazo?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, expectedVersion, opId };
  if (opciones.motivoRechazo !== undefined && opciones.motivoRechazo !== "") cuerpo.motivoRechazo = opciones.motivoRechazo;
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-solicitud`,
    input: cuerpo,
    descripcion: `Solicitud ${id}: ${accion}`,
    directo: () => abastecimientoFetch(`/solicitudes/${id}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/** Selecciona una cotización ganadora de una solicitud (decisión explícita). */
export async function seleccionarCotizacion(
  cola: ColaSync,
  solicitudId: string,
  opciones: { cotizacionId?: string; pesos?: { precio?: number; plazoEntrega?: number; calificacion?: number } } = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { solicitudId, opId };
  if (opciones.cotizacionId) cuerpo.cotizacionId = opciones.cotizacionId;
  if (opciones.pesos) {
    const pesos: Record<string, number> = {};
    for (const [k, v] of Object.entries(opciones.pesos)) if (typeof v === "number") pesos[k] = v;
    if (Object.keys(pesos).length) cuerpo.pesos = pesos;
  }
  return mutarConOffline(cola, {
    comando: `${MODULO}.seleccionar-cotizacion`,
    input: cuerpo,
    descripcion: `Seleccionar cotización de la solicitud ${solicitudId}`,
    directo: () => abastecimientoFetch(`/solicitudes/${solicitudId}/seleccionar-cotizacion`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Cotizaciones ---------------------------- */

export interface EntradaCotizacion {
  solicitudId: string;
  proveedorId: string;
  moneda: string;
  condicionesPago?: string | null;
  vigenteHasta?: string | null;
  lineas: LineaCotizacion[];
  id?: string;
  opId?: string;
}

export async function registrarCotizacion(cola: ColaSync, input: EntradaCotizacion): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    solicitudId: input.solicitudId,
    proveedorId: input.proveedorId,
    moneda: input.moneda,
    lineas: input.lineas,
  };
  limpiar(cuerpo, { condicionesPago: input.condicionesPago, vigenteHasta: input.vigenteHasta });
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-cotizacion`,
    input: cuerpo,
    descripcion: `Registrar cotización de la solicitud ${input.solicitudId}`,
    directo: () => abastecimientoFetch("/cotizaciones", { method: "POST", body: cuerpo }),
  });
}

/* ---------------------------- Órdenes de compra ------------------------- */

export interface EntradaCrearOC {
  proveedorId: string;
  solicitudId?: string | null;
  cotizacionId?: string | null;
  moneda: string;
  condicionesPago?: string | null;
  condicionesEntrega?: string | null;
  lineas: LineaOrdenCompra[];
  id?: string;
  opId?: string;
}

export async function crearOrdenCompra(cola: ColaSync, input: EntradaCrearOC): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    proveedorId: input.proveedorId,
    moneda: input.moneda,
    lineas: input.lineas,
  };
  limpiar(cuerpo, {
    solicitudId: input.solicitudId,
    cotizacionId: input.cotizacionId,
    condicionesPago: input.condicionesPago,
    condicionesEntrega: input.condicionesEntrega,
  });
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-orden-compra`,
    input: cuerpo,
    descripcion: `Crear orden de compra para ${input.proveedorId}`,
    directo: () => abastecimientoFetch("/ordenes-compra", { method: "POST", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow a la OC. La UI envía SU acción
 * concreta (`aprobar`/`enviar`/`cancelar`). Endpoint: `POST /ordenes-compra/:id/transicion`.
 */
export async function transicionarOrdenCompra(
  cola: ColaSync,
  id: string,
  accion: AccionOC,
  expectedVersion: number,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, expectedVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-orden-compra`,
    input: cuerpo,
    descripcion: `OC ${id}: ${accion}`,
    directo: () => abastecimientoFetch(`/ordenes-compra/${id}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Recepciones ----------------------------- */

export interface EntradaRegistrarRecepcion {
  ordenCompraId: string;
  expectedVersion: number;
  nota?: string | null;
  lineas: LineaRecepcion[];
  id?: string;
  opId?: string;
}

/** Registra una recepción (parcial/total/con novedades) contra una OC. Acuña `id`. */
export async function registrarRecepcion(cola: ColaSync, input: EntradaRegistrarRecepcion): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    ordenCompraId: input.ordenCompraId,
    expectedVersion: input.expectedVersion,
    lineas: input.lineas,
  };
  limpiar(cuerpo, { nota: input.nota });
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-recepcion`,
    input: cuerpo,
    descripcion: `Registrar recepción de la OC ${input.ordenCompraId}`,
    directo: () => abastecimientoFetch("/recepciones", { method: "POST", body: cuerpo }),
  });
}

/**
 * Materializa una recepción a INVENTARIO (entrada automática + actualización de
 * costos). Idempotente por `opId` (UUID cliente): la respuesta distingue
 * movimientos creados vs idempotentes. Comando oficial de `/sync`.
 * Endpoint: `POST /recepciones/:id/materializar`.
 */
export async function materializarRecepcion(
  cola: ColaSync,
  recepcionId: string,
  opciones: { bodegaId?: string | null; ubicacionId?: string | null; opId?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = opciones.opId ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { recepcionId, opId };
  limpiar(cuerpo, { bodegaId: opciones.bodegaId, ubicacionId: opciones.ubicacionId });
  return mutarConOffline(cola, {
    comando: `${MODULO}.materializar-recepcion`,
    input: cuerpo,
    descripcion: `Materializar recepción ${recepcionId} a inventario`,
    directo: () => abastecimientoFetch(`/recepciones/${recepcionId}/materializar`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------- Catálogos ------------------------------ */

export interface EntradaCatalogoUpsert {
  catalogo: string;
  clave: string;
  etiqueta: string;
  posicion?: number;
  padre?: string | null;
}

export async function upsertCatalogo(cola: ColaSync, input: EntradaCatalogoUpsert): Promise<ResultadoMutacion> {
  const cuerpo: Record<string, unknown> = { catalogo: input.catalogo, clave: input.clave, etiqueta: input.etiqueta };
  if (input.posicion !== undefined) cuerpo.posicion = input.posicion;
  if (input.padre !== undefined) cuerpo.padre = input.padre;
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-upsert`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.clave}`,
    directo: () => abastecimientoFetch("/catalogos", { method: "POST", body: cuerpo }),
  });
}

export async function habilitarCatalogo(
  cola: ColaSync,
  input: { catalogo: string; clave: string; habilitado: boolean },
): Promise<ResultadoMutacion> {
  const cuerpo = { catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado };
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-habilitar`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.habilitado ? "habilitar" : "deshabilitar"} ${input.clave}`,
    directo: () => abastecimientoFetch("/catalogos/habilitar", { method: "POST", body: cuerpo }),
  });
}
