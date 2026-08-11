/**
 * DGP-019.1 · Módulo de Utilización — Value Objects y aggregates APPEND-ONLY.
 *
 * `Lectura` y `Tanqueo` son hechos INMUTABLES (append-only): no hay UPDATE
 * destructivo. Una corrección se modela con un comando `anular-*` (motivo,
 * actor, fecha, opId) + un nuevo hecho. La evidencia es REFERENCIA-ONLY a
 * `platform.attachment` (un id opaco; el aggregate no la incrusta).
 *
 * Tipos de medidor CANÓNICOS e inmutables: HOROMETRO (unidad h) y ODOMETRO
 * (unidad km). No hay tipos configurables en esta fase (mandato §1).
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ----------------------------- Tipos canónicos --------------------------- */

export const TIPO_HOROMETRO = "horometro" as const;
export const TIPO_ODOMETRO = "odometro" as const;
export const TIPOS_MEDIDOR = [TIPO_HOROMETRO, TIPO_ODOMETRO] as const;
export type TipoMedidor = (typeof TIPOS_MEDIDOR)[number];

/** Unidad canónica por tipo de medidor (inmutable). */
export const UNIDAD_POR_MEDIDOR: Record<TipoMedidor, string> = {
  [TIPO_HOROMETRO]: "h",
  [TIPO_ODOMETRO]: "km",
};

/** Orígenes de captura admitidos (contrato preparado para QR / sync offline). */
export const ORIGENES_LECTURA = ["manual", "qr", "sync-offline"] as const;
export type OrigenLectura = (typeof ORIGENES_LECTURA)[number];

/** Estado del hecho append-only. */
export const ESTADO_VIGENTE = "vigente" as const;
export const ESTADO_ANULADA = "anulada" as const;
export type EstadoHecho = typeof ESTADO_VIGENTE | typeof ESTADO_ANULADA;

/**
 * Estado de sincronización del ÚLTIMO valor hacia Activos (visible en read
 * model). `pendiente` recién registrada; `confirmada` propagada con éxito;
 * `no-aplica` lectura tardía/inconsistente/anulada que NO debe propagarse;
 * `fallida` agotó reintentos (ruidosa, con evento de fallo).
 */
export const SINC_PENDIENTE = "pendiente" as const;
export const SINC_CONFIRMADA = "confirmada" as const;
export const SINC_NO_APLICA = "no-aplica" as const;
export const SINC_FALLIDA = "fallida" as const;
export type EstadoSincronizacion =
  | typeof SINC_PENDIENTE
  | typeof SINC_CONFIRMADA
  | typeof SINC_NO_APLICA
  | typeof SINC_FALLIDA;

/* ----------------------------- Referencias VO ---------------------------- */

/** Referencia a evidencia en `platform.attachment` (referencia-only). */
export interface EvidenciaRef {
  readonly attachmentId: string;
  readonly etiqueta: string | null;
}

export function crearEvidenciaRef(input: { attachmentId: string; etiqueta?: string | null } | null | undefined): Result<EvidenciaRef | null, KernelError> {
  if (input == null) return ok(null);
  if (!input.attachmentId || input.attachmentId.trim() === "") {
    return fail(KernelErrors.validation("La evidencia exige un attachmentId no vacío"));
  }
  return ok(Object.freeze({ attachmentId: input.attachmentId, etiqueta: input.etiqueta ?? null }));
}

/* -------------------------------- Lectura -------------------------------- */

export interface Lectura {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly tipoMedidor: TipoMedidor;
  readonly valor: number;
  readonly unidad: string;
  readonly fechaHora: string;
  readonly identityId: string;
  readonly origen: OrigenLectura;
  readonly observacion: string | null;
  readonly evidenciaRef: EvidenciaRef | null;
  readonly opId: string | null;
  readonly estado: EstadoHecho;
  /** Marcada inconsistente (menor que la última válida, sin reinicio). */
  readonly inconsistente: boolean;
  readonly motivoInconsistencia: string | null;
  /** Estado de propagación del último valor hacia Activos. */
  readonly sincronizacionActivo: EstadoSincronizacion;
  /** Metadatos de anulación (si estado === anulada). */
  readonly anulacion: { readonly motivo: string; readonly actorId: string; readonly fechaHora: string } | null;
  readonly createdAt: string;
}

export interface CrearLecturaInput {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly tipoMedidor: TipoMedidor;
  readonly valor: number;
  readonly unidad?: string;
  readonly fechaHora: string;
  readonly identityId: string;
  readonly origen: OrigenLectura;
  readonly observacion?: string | null;
  readonly evidenciaRef?: { attachmentId: string; etiqueta?: string | null } | null;
  readonly opId?: string | null;
  readonly createdAt: string;
}

export function crearLectura(input: CrearLecturaInput): Result<Lectura, KernelError> {
  if (!input.id || !input.tenantId || !input.activoId) return fail(KernelErrors.validation("Lectura: id, tenantId y activoId son obligatorios"));
  if (!TIPOS_MEDIDOR.includes(input.tipoMedidor)) return fail(KernelErrors.validation(`Tipo de medidor no canónico: "${input.tipoMedidor}"`));
  if (!Number.isFinite(input.valor)) return fail(KernelErrors.validation("Lectura: valor debe ser numérico"));
  if (input.valor < 0) return fail(KernelErrors.validation("Lectura: valor no puede ser negativo"));
  const unidadCanonica = UNIDAD_POR_MEDIDOR[input.tipoMedidor];
  if (input.unidad != null && input.unidad !== unidadCanonica) {
    return fail(KernelErrors.validation(`Unidad "${input.unidad}" no corresponde al medidor "${input.tipoMedidor}" (esperada "${unidadCanonica}")`));
  }
  if (!ORIGENES_LECTURA.includes(input.origen)) return fail(KernelErrors.validation(`Origen de lectura no admitido: "${input.origen}"`));
  const ev = crearEvidenciaRef(input.evidenciaRef);
  if (!ev.ok) return ev;
  return ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      activoId: input.activoId,
      tipoMedidor: input.tipoMedidor,
      valor: input.valor,
      unidad: unidadCanonica,
      fechaHora: input.fechaHora,
      identityId: input.identityId,
      origen: input.origen,
      observacion: input.observacion ?? null,
      evidenciaRef: ev.value,
      opId: input.opId ?? null,
      estado: ESTADO_VIGENTE,
      inconsistente: false,
      motivoInconsistencia: null,
      sincronizacionActivo: SINC_PENDIENTE,
      anulacion: null,
      createdAt: input.createdAt,
    }),
  );
}

/** Marca una lectura como inconsistente (conserva el hecho; no propaga). */
export function marcarInconsistente(l: Lectura, motivo: string): Lectura {
  return Object.freeze({ ...l, inconsistente: true, motivoInconsistencia: motivo, sincronizacionActivo: SINC_NO_APLICA });
}

/** Fija el estado de sincronización de una lectura (transición no destructiva). */
export function conSincronizacion(l: Lectura, estado: EstadoSincronizacion): Lectura {
  return Object.freeze({ ...l, sincronizacionActivo: estado });
}

/** Anula una lectura de forma no destructiva (motivo/actor/fecha auditados). */
export function anularLectura(l: Lectura, motivo: string, actorId: string, fechaHora: string): Result<Lectura, KernelError> {
  if (l.estado === ESTADO_ANULADA) return fail(KernelErrors.conflict(`La lectura ${l.id} ya está anulada`));
  if (!motivo || motivo.trim() === "") return fail(KernelErrors.validation("La anulación exige un motivo"));
  return ok(
    Object.freeze({
      ...l,
      estado: ESTADO_ANULADA,
      sincronizacionActivo: SINC_NO_APLICA,
      anulacion: { motivo, actorId, fechaHora },
    }),
  );
}

/* -------------------------------- Tanqueo -------------------------------- */

export interface Tanqueo {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly fechaHora: string;
  readonly litros: number;
  readonly tipoCombustible: string;
  readonly precioUnitario: number | null;
  readonly costoTotal: number | null;
  readonly moneda: string | null;
  /** Referencia a la lectura de medidor asociada (id opaco), si la hay. */
  readonly lecturaMedidorRef: string | null;
  readonly identityId: string;
  /** Proveedor de Abastecimiento (string, sin FK dura). */
  readonly proveedorId: string | null;
  readonly observacion: string | null;
  readonly evidenciaRef: EvidenciaRef | null;
  readonly opId: string | null;
  readonly estado: EstadoHecho;
  readonly anulacion: { readonly motivo: string; readonly actorId: string; readonly fechaHora: string } | null;
  readonly createdAt: string;
}

export interface CrearTanqueoInput {
  readonly id: string;
  readonly tenantId: string;
  readonly activoId: string;
  readonly fechaHora: string;
  readonly litros: number;
  readonly tipoCombustible: string;
  readonly precioUnitario?: number | null;
  readonly costoTotal?: number | null;
  readonly moneda?: string | null;
  readonly lecturaMedidorRef?: string | null;
  readonly identityId: string;
  readonly proveedorId?: string | null;
  readonly observacion?: string | null;
  readonly evidenciaRef?: { attachmentId: string; etiqueta?: string | null } | null;
  readonly opId?: string | null;
  readonly createdAt: string;
}

export function crearTanqueo(input: CrearTanqueoInput): Result<Tanqueo, KernelError> {
  if (!input.id || !input.tenantId || !input.activoId) return fail(KernelErrors.validation("Tanqueo: id, tenantId y activoId son obligatorios"));
  if (!Number.isFinite(input.litros) || input.litros <= 0) return fail(KernelErrors.validation("Tanqueo: litros debe ser un número positivo"));
  if (!input.tipoCombustible || input.tipoCombustible.trim() === "") return fail(KernelErrors.validation("Tanqueo: tipoCombustible es obligatorio"));
  if (input.precioUnitario != null && (!Number.isFinite(input.precioUnitario) || input.precioUnitario < 0)) return fail(KernelErrors.validation("Tanqueo: precioUnitario inválido"));
  if (input.costoTotal != null && (!Number.isFinite(input.costoTotal) || input.costoTotal < 0)) return fail(KernelErrors.validation("Tanqueo: costoTotal inválido"));
  const ev = crearEvidenciaRef(input.evidenciaRef);
  if (!ev.ok) return ev;
  // Deriva costoTotal si sólo hay precioUnitario (no inventa datos: sólo compone lo dado).
  const costoTotal = input.costoTotal ?? (input.precioUnitario != null ? input.precioUnitario * input.litros : null);
  return ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      activoId: input.activoId,
      fechaHora: input.fechaHora,
      litros: input.litros,
      tipoCombustible: input.tipoCombustible,
      precioUnitario: input.precioUnitario ?? null,
      costoTotal,
      moneda: input.moneda ?? null,
      lecturaMedidorRef: input.lecturaMedidorRef ?? null,
      identityId: input.identityId,
      proveedorId: input.proveedorId ?? null,
      observacion: input.observacion ?? null,
      evidenciaRef: ev.value,
      opId: input.opId ?? null,
      estado: ESTADO_VIGENTE,
      anulacion: null,
      createdAt: input.createdAt,
    }),
  );
}

export function anularTanqueo(t: Tanqueo, motivo: string, actorId: string, fechaHora: string): Result<Tanqueo, KernelError> {
  if (t.estado === ESTADO_ANULADA) return fail(KernelErrors.conflict(`El tanqueo ${t.id} ya está anulado`));
  if (!motivo || motivo.trim() === "") return fail(KernelErrors.validation("La anulación exige un motivo"));
  return ok(Object.freeze({ ...t, estado: ESTADO_ANULADA, anulacion: { motivo, actorId, fechaHora } }));
}
