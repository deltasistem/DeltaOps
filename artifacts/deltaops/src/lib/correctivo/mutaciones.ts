/**
 * DGP-015 · Mutaciones del módulo correctivo con degradación Offline First.
 *
 * Cada mutación intenta el POST/PUT directo; si falla por red, encola la
 * operación (mismo comando que consume `/sync`, entrada COMPLETA + opId) para
 * replay idempotente posterior. NO contiene lógica de negocio: sólo transporta
 * el comando. Las operaciones gobernadas por Workflow (transiciones) NUNCA hacen
 * bypass: envían SU acción explícita al motor. Los conflictos 409 propagan (no
 * se encolan). Los cuerpos coinciden EXACTAMENTE con los esquemas del contrato
 * OpenAPI congelado (verificado por `correctivo-contract.test.ts`). Las
 * creaciones acuñan el `id` en cliente (UUID) para idempotencia del alta.
 */
import { correctivoFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO, type AccionSolicitud, type AccionIntervencion } from "./constantes";
import type {
  EntradaSolicitud, EntradaDiagnostico, EntradaEventoActivo,
} from "./alta";
import type { Cuadrilla, LineaRepuesto, Evidencia } from "./tipos";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/* ------------------------------ Solicitudes ----------------------------- */

/** Crea una solicitud correctiva (queda en BORRADOR/REGISTRADA). Acuña id+opId. */
export async function crearSolicitud(cola: ColaSync, input: EntradaSolicitud, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId, titulo: input.titulo, origen: input.origen, objeto: input.objeto,
  };
  if (input.descripcion !== undefined) cuerpo.descripcion = input.descripcion;
  if (input.prioridad !== undefined) cuerpo.prioridad = input.prioridad;
  if (input.sintoma !== undefined) cuerpo.sintoma = input.sintoma;
  if (input.clasificacion !== undefined) cuerpo.clasificacion = input.clasificacion;
  if (input.evidencias !== undefined) cuerpo.evidencias = input.evidencias;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-solicitud`,
    input: cuerpo,
    descripcion: `Crear solicitud ${input.titulo}`,
    directo: () => correctivoFetch("/solicitudes", { method: "POST", body: cuerpo }),
  });
}

export interface EntradaEditarSolicitud {
  titulo?: string;
  descripcion?: string | null;
  prioridad?: string | null;
  clasificacion?: EntradaSolicitud["clasificacion"];
}

/**
 * Edita una solicitud. El contrato `EditarSolicitud` requiere sólo `id` (no
 * declara expectedVersion; el bloqueo optimista lo resuelve el backend).
 */
export async function editarSolicitud(cola: ColaSync, id: string, cambios: EntradaEditarSolicitud): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId };
  for (const [k, val] of Object.entries(cambios)) if (val !== undefined) cuerpo[k] = val;
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-solicitud`,
    input: cuerpo,
    descripcion: `Editar solicitud ${id}`,
    directo: () => correctivoFetch(`/solicitudes/${encodeURIComponent(id)}`, { method: "PUT", body: cuerpo }),
  });
}

/** Adjunta una evidencia REFERENCIA-ONLY (attachmentId ya registrado). */
export async function adjuntarEvidencia(cola: ColaSync, id: string, evidencia: Evidencia): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, opId, evidencia };
  return mutarConOffline(cola, {
    comando: `${MODULO}.adjuntar-evidencia`,
    input: cuerpo,
    descripcion: `Adjuntar evidencia a ${id}`,
    directo: () => correctivoFetch(`/solicitudes/${encodeURIComponent(id)}/evidencia`, { method: "POST", body: cuerpo }),
  });
}

/** Añade un comentario a la solicitud. */
export async function comentarSolicitud(cola: ColaSync, id: string, texto: string, actorId?: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, texto };
  if (actorId) cuerpo.actorId = actorId;
  return mutarConOffline(cola, {
    comando: `${MODULO}.comentar-solicitud`,
    input: cuerpo,
    descripcion: `Comentar solicitud ${id}`,
    directo: () => correctivoFetch(`/solicitudes/${encodeURIComponent(id)}/comentario`, { method: "POST", body: cuerpo }),
  });
}

/** Registra el diagnóstico anclado a plantilla+versión. Acuña id + opId. */
export async function registrarDiagnostico(cola: ColaSync, input: EntradaDiagnostico, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId, solicitudId: input.solicitudId, plantilla: input.plantilla,
  };
  if (input.respuestas !== undefined) cuerpo.respuestas = input.respuestas;
  if (input.causaRaiz !== undefined) cuerpo.causaRaiz = input.causaRaiz;
  if (input.clasificacion !== undefined) cuerpo.clasificacion = input.clasificacion;
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-diagnostico`,
    input: cuerpo,
    descripcion: `Diagnóstico de solicitud ${input.solicitudId}`,
    directo: () => correctivoFetch(`/solicitudes/${encodeURIComponent(input.solicitudId)}/diagnostico`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow a la solicitud. La UI envía SU acción
 * concreta (enviarTriage|iniciarDiagnostico|enviarValidacion|aprobar|rechazar).
 * El motivo es opcional en el contrato (obligatorio en la UI para rechazar).
 * Endpoint gobernado: `POST /solicitudes/:id/transicion`.
 */
export async function transicionarSolicitud(cola: ColaSync, id: string, accion: AccionSolicitud, extra: { motivo?: string } = {}): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, opId };
  if (extra.motivo) cuerpo.motivo = extra.motivo;
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-solicitud`,
    input: cuerpo,
    descripcion: `Solicitud ${id}: ${accion}`,
    directo: () => correctivoFetch(`/solicitudes/${encodeURIComponent(id)}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Genera la OT correctiva desde una solicitud aprobada. Acuña `id` de la OT y
 * `opId` para idempotencia. Devuelve materializada|pendiente + ordenTrabajoId.
 */
export async function generarOrden(cola: ColaSync, solicitudId: string, extra: { titulo?: string; prioridad?: string } = {}, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, solicitudId };
  if (extra.titulo) cuerpo.titulo = extra.titulo;
  if (extra.prioridad) cuerpo.prioridad = extra.prioridad;
  return mutarConOffline(cola, {
    comando: `${MODULO}.generar-orden-correctiva`,
    input: cuerpo,
    descripcion: `Generar OT correctiva de ${solicitudId}`,
    directo: () => correctivoFetch(`/generar`, { method: "POST", body: cuerpo }),
  });
}

/* ----------------------------- Intervención ----------------------------- */

/** Crea la intervención correctiva de una solicitud. Acuña id + opId. */
export async function crearIntervencion(cola: ColaSync, solicitudId: string, extra: { mayor?: boolean; cuadrillas?: Cuadrilla[] } = {}, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, solicitudId };
  if (extra.mayor !== undefined) cuerpo.mayor = extra.mayor;
  if (extra.cuadrillas && extra.cuadrillas.length > 0) cuerpo.cuadrillas = extra.cuadrillas;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-intervencion`,
    input: cuerpo,
    descripcion: `Crear intervención de ${solicitudId}`,
    directo: () => correctivoFetch(`/intervenciones`, { method: "POST", body: cuerpo }),
  });
}

/** Asigna/actualiza las cuadrillas de la intervención (correctivo mayor). */
export async function asignarCuadrillas(cola: ColaSync, id: string, cuadrillas: Cuadrilla[]): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, opId, cuadrillas };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asignar-cuadrillas`,
    input: cuerpo,
    descripcion: `Asignar cuadrillas a intervención ${id}`,
    directo: () => correctivoFetch(`/intervenciones/${encodeURIComponent(id)}/cuadrillas`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow a la intervención. La UI envía SU
 * acción concreta (asignar|iniciarEjecucion|enviarVerificacion|cerrar).
 */
export async function transicionarIntervencion(cola: ColaSync, id: string, accion: AccionIntervencion, extra: { motivo?: string } = {}): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, opId };
  if (extra.motivo) cuerpo.motivo = extra.motivo;
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-intervencion`,
    input: cuerpo,
    descripcion: `Intervención ${id}: ${accion}`,
    directo: () => correctivoFetch(`/intervenciones/${encodeURIComponent(id)}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Repuestos ------------------------------- */

/** Reserva líneas de repuesto en la intervención (integración Inventario). */
export async function reservarRepuestos(cola: ColaSync, intervencionId: string, lineas: LineaRepuesto[]): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { intervencionId, opId, lineas };
  return mutarConOffline(cola, {
    comando: `${MODULO}.reservar-repuestos`,
    input: cuerpo,
    descripcion: `Reservar repuestos en ${intervencionId}`,
    directo: () => correctivoFetch(`/intervenciones/${encodeURIComponent(intervencionId)}/reservar`, { method: "POST", body: cuerpo }),
  });
}

/** Consume una línea de repuesto (consumo parcial permitido). */
export async function consumirRepuesto(cola: ColaSync, intervencionId: string, linea: LineaRepuesto): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { intervencionId, opId, linea };
  return mutarConOffline(cola, {
    comando: `${MODULO}.consumir-repuesto`,
    input: cuerpo,
    descripcion: `Consumir repuesto en ${intervencionId}`,
    directo: () => correctivoFetch(`/intervenciones/${encodeURIComponent(intervencionId)}/consumir`, { method: "POST", body: cuerpo }),
  });
}

/** Devuelve una línea de repuesto reservada/consumida en exceso. */
export async function devolverRepuesto(cola: ColaSync, intervencionId: string, linea: LineaRepuesto): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { intervencionId, opId, linea };
  return mutarConOffline(cola, {
    comando: `${MODULO}.devolver-repuesto`,
    input: cuerpo,
    descripcion: `Devolver repuesto en ${intervencionId}`,
    directo: () => correctivoFetch(`/intervenciones/${encodeURIComponent(intervencionId)}/devolver`, { method: "POST", body: cuerpo }),
  });
}

/* ---------------------------- Evento de activo -------------------------- */

/**
 * Registra un evento de activo (historial de fallas / reincidencias). El
 * contrato `RegistrarEventoActivo` declara `id` pero NO `opId` (la idempotencia
 * del evento la ancla el `id` de cliente; la cola offline lo reenvía por /sync).
 */
export async function registrarEventoActivo(cola: ColaSync, input: EntradaEventoActivo, ids: { id?: string } = {}): Promise<ResultadoMutacion> {
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, activoId: input.activoId, tipo: input.tipo };
  if (input.solicitudId !== undefined) cuerpo.solicitudId = input.solicitudId;
  if (input.ordenTrabajoId !== undefined) cuerpo.ordenTrabajoId = input.ordenTrabajoId;
  if (input.modoFalla !== undefined) cuerpo.modoFalla = input.modoFalla;
  if (input.ocurridoEn !== undefined) cuerpo.ocurridoEn = input.ocurridoEn;
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-evento-activo`,
    input: cuerpo,
    descripcion: `Evento ${input.tipo} de activo ${input.activoId}`,
    directo: () => correctivoFetch(`/eventos-activo`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Catálogos ------------------------------- */

export interface EntradaCatalogoUpsert {
  catalogo: string;
  clave: string;
  etiqueta?: string;
  habilitado?: boolean;
  datos?: Record<string, unknown>;
}

export async function upsertCatalogo(cola: ColaSync, input: EntradaCatalogoUpsert): Promise<ResultadoMutacion> {
  // CatalogoUpsert NO declara opId (la cola offline lo reenvía por /sync).
  const cuerpo: Record<string, unknown> = { catalogo: input.catalogo, clave: input.clave };
  if (input.etiqueta !== undefined) cuerpo.etiqueta = input.etiqueta;
  if (input.habilitado !== undefined) cuerpo.habilitado = input.habilitado;
  if (input.datos !== undefined) cuerpo.datos = input.datos;
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-upsert`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.clave}`,
    directo: () => correctivoFetch(`/catalogos`, { method: "POST", body: cuerpo }),
  });
}

export async function habilitarCatalogo(cola: ColaSync, input: { catalogo: string; clave: string; habilitado: boolean }): Promise<ResultadoMutacion> {
  // CatalogoHabilitar NO declara opId (la cola offline lo reenvía por /sync).
  const cuerpo = { catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado };
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-habilitar`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.clave} (${input.habilitado ? "on" : "off"})`,
    directo: () => correctivoFetch(`/catalogos/habilitar`, { method: "POST", body: cuerpo }),
  });
}
