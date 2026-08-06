/**
 * DGP-011.3 · Mutaciones del módulo Inventario con degradación Offline First.
 *
 * Cada mutación intenta el POST directo; si falla por red, encola la operación
 * (mismo comando del módulo que consume `/sync`, entrada COMPLETA + opId) para
 * replay idempotente posterior. NO contiene lógica de negocio: sólo transporta
 * el comando. Las operaciones gobernadas por Workflow (transferencias/ajustes)
 * NUNCA hacen bypass: envían la decisión explícita del usuario al motor.
 *
 * Los cuerpos coinciden EXACTAMENTE con los esquemas del contrato OpenAPI
 * congelado (verificado por `inventario-contract.test.ts`). Los comandos de
 * CREACIÓN acuñan el `id` en cliente (UUID) para idempotencia del alta.
 */
import { inventarioFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO } from "./constantes";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/* -------------------------------- Items --------------------------------- */

/** Crea un item de inventario. Acuña `id` en cliente. */
export async function crearItem(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-item`,
    input: cuerpo,
    descripcion: `Crear item ${String(input.nombre ?? input.sku ?? "")}`,
    directo: () => inventarioFetch("", { method: "POST", body: cuerpo }),
  });
}

/** Edita un item (anclado a expectedVersion). */
export async function editarItem(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  cambios: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, ...cambios, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-item`,
    input: cuerpo,
    descripcion: `Editar item ${id}`,
    directo: () => inventarioFetch(`/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/* ------------------------------ Movimientos ----------------------------- */

/**
 * Registra un movimiento de stock (entrada/salida/consumo/…). El movimiento
 * proyecta automáticamente en Timeline (sin escritura directa desde cliente).
 */
export async function mover(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.mover`,
    input: cuerpo,
    descripcion: `Movimiento ${String(input.tipo ?? "")} de ${String(input.itemId ?? "")}`,
    directo: () => inventarioFetch("/mover", { method: "POST", body: cuerpo }),
  });
}

/* -------------------------------- Reservas ------------------------------ */

/** Crea una reserva de existencias para una demanda. Acuña `id` en cliente. */
export async function reservar(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.reservar`,
    input: cuerpo,
    descripcion: `Reservar ${String(input.cantidad ?? "")} de ${String(input.itemId ?? "")}`,
    directo: () => inventarioFetch("/reservas", { method: "POST", body: cuerpo }),
  });
}

/** Libera (o consume, según motivo) una reserva. Anclada a expectedVersion. */
export async function liberarReserva(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  motivo?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  if (motivo) cuerpo.motivo = motivo;
  return mutarConOffline(cola, {
    comando: `${MODULO}.liberar-reserva`,
    input: cuerpo,
    descripcion: `Liberar reserva ${id}`,
    directo: () => inventarioFetch(`/reservas/${id}/liberar`, { method: "POST", body: cuerpo }),
  });
}

/* ----------------------------- Transferencias --------------------------- */

/** Crea una transferencia (queda gobernada por el Workflow). Acuña `id`. */
export async function transferir(
  cola: ColaSync,
  input: { origen: Record<string, unknown>; destino: Record<string, unknown>; lineas: unknown[]; id?: string; opId?: string },
): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo = { id, origen: input.origen, destino: input.destino, lineas: input.lineas, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.transferir`,
    input: cuerpo,
    descripcion: `Transferencia con ${input.lineas.length} línea(s)`,
    directo: () => inventarioFetch("/transferencias", { method: "POST", body: cuerpo }),
  });
}

/** Acciones válidas de transición de transferencia (contrato del dominio). */
export type AccionTransferencia = "recibir" | "completar" | "cancelar" | "rechazar";

/**
 * Aplica una transición REAL del Workflow a la transferencia. La UI envía SU
 * acción concreta (`recibir`/`completar`/`cancelar`/`rechazar`) — nunca se mapea
 * todo a "completar". El motor resuelve el efecto autoritativo sobre el stock:
 * `recibir`/`completar` ingresan a destino; `cancelar`/`rechazar` restituyen al
 * origen. Endpoint gobernado: `POST /transferencias/:id/transicion`.
 */
export async function transicionarTransferencia(
  cola: ColaSync,
  id: string,
  accion: AccionTransferencia,
  expectedVersion: number,
  motivo?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, expectedVersion, opId };
  if (motivo !== undefined && motivo !== "") cuerpo.motivo = motivo;
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-transferencia`,
    input: cuerpo,
    descripcion: `Transferencia ${id}: ${accion}`,
    directo: () => inventarioFetch(`/transferencias/${id}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/* -------------------------------- Ajustes ------------------------------- */

/**
 * Registra un ajuste positivo/negativo con motivo. Gobernado por Workflow:
 * `aprobado` es una decisión explícita (nunca auto-aprobación). Acuña `id`.
 */
export async function ajustar(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.ajustar`,
    input: cuerpo,
    descripcion: `Ajuste ${String(input.tipo ?? "")} de ${String(input.itemId ?? "")}`,
    directo: () => inventarioFetch("/ajustes", { method: "POST", body: cuerpo }),
  });
}

/* -------------------------------- Conteos ------------------------------- */

/**
 * Programa/inicia un conteo. El contrato exige `tipo` + `lineas` (selección de
 * existencias a contar, cada una `{inventarioId}`); `alcance` es opcional.
 * Acuña `id`.
 */
export async function iniciarConteo(
  cola: ColaSync,
  input: { tipo: string; lineas: Array<{ inventarioId: string }>; alcance?: { tipo: string; id: string }; id?: string; opId?: string },
): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, tipo: input.tipo, lineas: input.lineas };
  if (input.alcance) cuerpo.alcance = input.alcance;
  return mutarConOffline(cola, {
    comando: `${MODULO}.iniciar-conteo`,
    input: cuerpo,
    descripcion: `Iniciar conteo ${input.tipo} (${input.lineas.length} línea(s))`,
    directo: () => inventarioFetch("/conteos", { method: "POST", body: cuerpo }),
  });
}

/**
 * Registra las cantidades contadas (ejecución/reconteo). El contrato exige
 * `contados:[{inventarioId,cantidad}]`. Anclado a versión.
 */
export async function registrarConteo(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  contados: Array<{ inventarioId: string; cantidad: number }>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, contados, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-conteo`,
    input: cuerpo,
    descripcion: `Registrar ${contados.length} conteo(s) en ${id}`,
    directo: () => inventarioFetch(`/conteos/${id}/registrar`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Cierra el conteo con decisión explícita y AUTORITATIVA `aplicarDiferencias`:
 * `false` ⇒ cierra sin mutar stock; `true` ⇒ aplica las diferencias como
 * ajustes. Anclado a versión. La respuesta trae `{diferencias, aplicadas}`.
 */
export async function cerrarConteo(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  aplicarDiferencias: boolean,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, aplicarDiferencias, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.cerrar-conteo`,
    input: cuerpo,
    descripcion: `Cerrar conteo ${id} (${aplicarDiferencias ? "aplicar" : "sin aplicar"} diferencias)`,
    directo: () => inventarioFetch(`/conteos/${id}/cerrar`, { method: "POST", body: cuerpo }),
  });
}

/* ---------------------------- Lotes y series ---------------------------- */

/** Crea un lote de un item. Acuña `id`. */
export async function crearLote(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-lote`,
    input: cuerpo,
    descripcion: `Crear lote ${String(input.codigo ?? "")}`,
    directo: () => inventarioFetch("/lotes", { method: "POST", body: cuerpo }),
  });
}

/** Registra una serie de un item. Acuña `id`. */
export async function registrarSerie(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-serie`,
    input: cuerpo,
    descripcion: `Registrar serie ${String(input.numero ?? "")}`,
    directo: () => inventarioFetch("/series", { method: "POST", body: cuerpo }),
  });
}

/* ---------------------------- Bodegas / ubic. --------------------------- */

/** Crea una bodega. Acuña `id`. */
export async function crearBodega(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-bodega`,
    input: cuerpo,
    descripcion: `Crear bodega ${String(input.nombre ?? "")}`,
    directo: () => inventarioFetch("/bodegas", { method: "POST", body: cuerpo }),
  });
}

/** Crea una ubicación jerárquica dentro de una bodega. Acuña `id`. */
export async function crearUbicacion(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-ubicacion`,
    input: cuerpo,
    descripcion: `Crear ubicación ${String(input.valor ?? "")}`,
    directo: () => inventarioFetch("/ubicaciones", { method: "POST", body: cuerpo }),
  });
}
