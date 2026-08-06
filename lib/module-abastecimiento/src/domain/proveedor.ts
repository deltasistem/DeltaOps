/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `Proveedor`.
 *
 * Proveedor empresarial: información comercial, contactos, certificaciones, SLA,
 * calificación acumulada e historial de calificaciones. El `tipo` de proveedor
 * referencia el catálogo `tipos-proveedor` (jamás enum). Dominio PURO: la fecha
 * llega como INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { PROVEEDOR_ACTUALIZADO, PROVEEDOR_CALIFICADO, PROVEEDOR_CREADO } from "./events";
import {
  calificacionGlobal,
  crearCalificacion,
  redondear,
  type Calificacion,
  type Certificacion,
  type ContactoProveedor,
  type Sla,
} from "./value-objects";

/* --------------------------------- Aggregate ----------------------------- */
export interface Proveedor {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly razonSocial: string;
  readonly nombreComercial: string | null;
  readonly identificacionTributaria: string | null;
  /** Clave del catálogo `tipos-proveedor`. */
  readonly tipo: string;
  /** Clave del catálogo `monedas` de operación por defecto. */
  readonly monedaPreferida: string | null;
  readonly contactos: readonly ContactoProveedor[];
  readonly certificaciones: readonly Certificacion[];
  readonly sla: Sla | null;
  readonly calificaciones: readonly Calificacion[];
  /** Calificación global acumulada (promedio de las globales) 0..5. */
  readonly calificacionPromedio: number;
  readonly activo: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioProveedor {
  readonly proveedor: Proveedor;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(p: Proveedor, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioProveedor["evento"] {
  return {
    tipo,
    payload: {
      tenantId: p.tenantId,
      id: p.id,
      entityRef: `proveedor:${p.id}`,
      codigo: p.codigo,
      nombre: p.razonSocial,
      tipo: p.tipo,
      calificacionPromedio: p.calificacionPromedio,
      activo: p.activo,
      version: p.version,
      actualizadoAt: p.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: p,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearProveedorInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly razonSocial: string;
  readonly nombreComercial?: string | null;
  readonly identificacionTributaria?: string | null;
  readonly tipo: string;
  readonly monedaPreferida?: string | null;
  readonly contactos?: readonly ContactoProveedor[];
  readonly certificaciones?: readonly Certificacion[];
  readonly sla?: Sla | null;
  readonly actorId: string;
  readonly ahora: string;
  readonly maxLongitudNombre?: number;
}

export function crearProveedor(input: CrearProveedorInput): Result<CambioProveedor, KernelError> {
  if (input.razonSocial.trim() === "") return fail(KernelErrors.validation("La razón social es obligatoria"));
  const max = input.maxLongitudNombre ?? 200;
  if (input.razonSocial.length > max) return fail(KernelErrors.validation(`La razón social supera ${max} caracteres`));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  const contactos = input.contactos ?? [];
  if (contactos.filter((c) => c.principal).length > 1) {
    return fail(KernelErrors.validation("Sólo puede haber un contacto principal"));
  }
  const proveedor: Proveedor = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    razonSocial: input.razonSocial.trim(),
    nombreComercial: input.nombreComercial ?? null,
    identificacionTributaria: input.identificacionTributaria ?? null,
    tipo: input.tipo,
    monedaPreferida: input.monedaPreferida ?? null,
    contactos: Object.freeze([...contactos]),
    certificaciones: Object.freeze([...(input.certificaciones ?? [])]),
    sla: input.sla ?? null,
    calificaciones: Object.freeze([]),
    calificacionPromedio: 0,
    activo: true,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ proveedor: Object.freeze(proveedor), evento: eventoDe(proveedor, PROVEEDOR_CREADO, input.actorId) });
}

/* -------------------------------- Editar --------------------------------- */
export interface EditarProveedorInput {
  readonly razonSocial?: string;
  readonly nombreComercial?: string | null;
  readonly identificacionTributaria?: string | null;
  readonly tipo?: string;
  readonly monedaPreferida?: string | null;
  readonly contactos?: readonly ContactoProveedor[];
  readonly certificaciones?: readonly Certificacion[];
  readonly sla?: Sla | null;
  readonly activo?: boolean;
}

export function editarProveedor(p: Proveedor, cambios: EditarProveedorInput, actorId: string, ahora: string): Result<CambioProveedor, KernelError> {
  if (cambios.contactos && cambios.contactos.filter((c) => c.principal).length > 1) {
    return fail(KernelErrors.validation("Sólo puede haber un contacto principal"));
  }
  const actualizado: Proveedor = {
    ...p,
    razonSocial: cambios.razonSocial?.trim() ?? p.razonSocial,
    nombreComercial: cambios.nombreComercial !== undefined ? cambios.nombreComercial : p.nombreComercial,
    identificacionTributaria: cambios.identificacionTributaria !== undefined ? cambios.identificacionTributaria : p.identificacionTributaria,
    tipo: cambios.tipo ?? p.tipo,
    monedaPreferida: cambios.monedaPreferida !== undefined ? cambios.monedaPreferida : p.monedaPreferida,
    contactos: cambios.contactos ? Object.freeze([...cambios.contactos]) : p.contactos,
    certificaciones: cambios.certificaciones ? Object.freeze([...cambios.certificaciones]) : p.certificaciones,
    sla: cambios.sla !== undefined ? cambios.sla : p.sla,
    activo: cambios.activo ?? p.activo,
    version: p.version + 1,
    updatedAt: ahora,
  };
  return ok({ proveedor: Object.freeze(actualizado), evento: eventoDe(actualizado, PROVEEDOR_ACTUALIZADO, actorId) });
}

/* ------------------------------ Calificar -------------------------------- */
/**
 * Agrega una calificación al historial del proveedor y recalcula el promedio
 * acumulado (promedio de las calificaciones globales). Determinista y auditable.
 */
export function calificarProveedor(p: Proveedor, calificacionInput: unknown, actorId: string): Result<CambioProveedor, KernelError> {
  const cal = crearCalificacion(calificacionInput);
  if (!cal.ok) return cal;
  const historial = [...p.calificaciones, cal.value];
  const promedio = redondear(historial.reduce((acc, c) => acc + calificacionGlobal(c), 0) / historial.length, 2);
  const actualizado: Proveedor = {
    ...p,
    calificaciones: Object.freeze(historial),
    calificacionPromedio: promedio,
    version: p.version + 1,
    updatedAt: cal.value.calificadoEn,
  };
  return ok({
    proveedor: Object.freeze(actualizado),
    evento: eventoDe(actualizado, PROVEEDOR_CALIFICADO, actorId, { global: calificacionGlobal(cal.value), promedio }),
  });
}
