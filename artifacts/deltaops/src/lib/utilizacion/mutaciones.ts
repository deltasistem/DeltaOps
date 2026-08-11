/**
 * DGP-019.1 · Mutaciones del módulo Utilización con degradación Offline First.
 *
 * Cada mutación intenta el POST directo; si falla por red, encola la operación
 * (mismo comando que consume `/sync`, entrada COMPLETA + `opId`) para replay
 * idempotente posterior (DGP-008.1/009.3/012). NO contiene lógica de negocio:
 * sólo transporta el comando. Los conflictos (409) propagan (no se encolan). Los
 * cuerpos coinciden EXACTAMENTE con los esquemas del contrato OpenAPI congelado
 * (`RegistrarLectura`, `AnularLectura`, `ReinicioMedidor`, `RegistrarTanqueo`,
 * `AnularTanqueo`; verificado por `utilizacion-contract.test.ts`). Las creaciones
 * acuñan el `id` en cliente (UUID) para idempotencia del alta y SIEMPRE envían
 * `opId`. El `origen` de una lectura manual es `"manual"`.
 */
import { utilizacionFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO } from "./constantes";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/* ------------------------------ Lecturas -------------------------------- */

export interface EntradaLectura {
  activoId: string;
  tipoMedidor: string; // "horometro" | "odometro"
  valor: number;
  unidad?: string; // derivada del tipo si se omite
  fechaHora: string; // ISO-8601
  observacion?: string | null;
  origen?: string; // por defecto "manual"
}

/** Registra una lectura de medidor. Acuña id+opId; origen manual por defecto. */
export async function registrarLectura(cola: ColaSync, input: EntradaLectura, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id,
    opId,
    activoId: input.activoId,
    tipoMedidor: input.tipoMedidor,
    valor: input.valor,
    fechaHora: input.fechaHora,
    origen: input.origen ?? "manual",
  };
  if (input.unidad !== undefined && input.unidad !== "") cuerpo.unidad = input.unidad;
  if (input.observacion !== undefined && input.observacion !== null && input.observacion !== "") cuerpo.observacion = input.observacion;
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-lectura`,
    input: cuerpo,
    descripcion: `Lectura ${input.tipoMedidor} de ${input.activoId}`,
    directo: () => utilizacionFetch("/lecturas", { method: "POST", body: cuerpo }),
  });
}

/** Anula (corrige) una lectura. El motivo es OBLIGATORIO (contrato). */
export async function anularLectura(cola: ColaSync, id: string, motivo: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { opId, motivo };
  return mutarConOffline(cola, {
    comando: `${MODULO}.anular-lectura`,
    input: { id, ...cuerpo },
    descripcion: `Anular lectura ${id}`,
    directo: () => utilizacionFetch(`/lecturas/${encodeURIComponent(id)}/anular`, { method: "POST", body: cuerpo }),
  });
}

/* --------------------------- Reinicio medidor --------------------------- */

export interface EntradaReinicio {
  activoId: string;
  tipoMedidor: string;
  valorNuevo: number;
  fechaHora: string;
  motivo: string; // OBLIGATORIO
  observacion?: string | null;
}

/**
 * Regulariza un medidor (reinicio de tramo auditado). Gated por la capacidad
 * `medidores.regularizar` en la UI; el backend vuelve a exigirla (403). El
 * `motivo` es OBLIGATORIO (justificación auditable). Acuña id+opId.
 */
export async function reiniciarMedidor(cola: ColaSync, input: EntradaReinicio, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id,
    opId,
    activoId: input.activoId,
    tipoMedidor: input.tipoMedidor,
    valorNuevo: input.valorNuevo,
    fechaHora: input.fechaHora,
    motivo: input.motivo,
  };
  if (input.observacion !== undefined && input.observacion !== null && input.observacion !== "") cuerpo.observacion = input.observacion;
  return mutarConOffline(cola, {
    comando: `${MODULO}.reinicio-medidor`,
    input: cuerpo,
    descripcion: `Reinicio ${input.tipoMedidor} de ${input.activoId}`,
    directo: () => utilizacionFetch("/reinicio-medidor", { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Tanqueos -------------------------------- */

export interface EntradaTanqueo {
  activoId: string;
  fechaHora: string;
  litros: number;
  tipoCombustible: string;
  precioUnitario?: number | null;
  costoTotal?: number | null;
  moneda?: string | null;
  lecturaMedidorRef?: string | null;
  proveedorId?: string | null;
  observacion?: string | null;
}

/** Registra un tanqueo de combustible. Acuña id+opId. */
export async function registrarTanqueo(cola: ColaSync, input: EntradaTanqueo, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id,
    opId,
    activoId: input.activoId,
    fechaHora: input.fechaHora,
    litros: input.litros,
    tipoCombustible: input.tipoCombustible,
  };
  const opcional = (clave: keyof EntradaTanqueo) => {
    const v = input[clave];
    if (v !== undefined && v !== null && v !== "") cuerpo[clave] = v;
  };
  opcional("precioUnitario");
  opcional("costoTotal");
  opcional("moneda");
  opcional("lecturaMedidorRef");
  opcional("proveedorId");
  opcional("observacion");
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-tanqueo`,
    input: cuerpo,
    descripcion: `Tanqueo ${input.litros} L de ${input.activoId}`,
    directo: () => utilizacionFetch("/tanqueos", { method: "POST", body: cuerpo }),
  });
}

/** Anula un tanqueo. El motivo es OBLIGATORIO (contrato). */
export async function anularTanqueo(cola: ColaSync, id: string, motivo: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { opId, motivo };
  return mutarConOffline(cola, {
    comando: `${MODULO}.anular-tanqueo`,
    input: { id, ...cuerpo },
    descripcion: `Anular tanqueo ${id}`,
    directo: () => utilizacionFetch(`/tanqueos/${encodeURIComponent(id)}/anular`, { method: "POST", body: cuerpo }),
  });
}
