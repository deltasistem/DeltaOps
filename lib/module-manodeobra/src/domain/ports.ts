/**
 * DGP-020.3 · Puertos del Módulo Mano de Obra.
 *
 * El módulo NUNCA lee tablas `ord_*` ni `idn_*` por SQL directo (§4/§13). Toda
 * información ajena entra por PUERTOS fail-closed:
 *  - `IdentidadPort`: resuelve el NOMBRE de presentación desde la identidad
 *    canónica (adaptador en api-server sobre el servicio público de Identidad).
 *  - `OrdenesSesionPort`: consume las queries PÚBLICAS de Órdenes
 *    (`modulo.ordenes.sesion.duraciones` / `modulo.ordenes.sesiones`) con
 *    contexto de servicio; `efectivo_ms` es la AUTORIDAD del tiempo.
 * La persistencia PROPIA del módulo (recursos/tarifas/valoraciones + read models)
 * vive en puertos de repositorio con adaptadores PG (RLS) y Fake (memoria).
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";
import type { EstadoRecurso, RecursoHumano } from "./recurso";
import type { Tarifa } from "./tarifa";
import type { EstadoValoracion, Valoracion } from "./valoracion";

export type TenantId = string;

/* --------------------------------- Identidad ----------------------------- */

export interface IdentidadResuelta {
  readonly identityId: string;
  readonly nombre: string;
}

/** Puerto fail-closed hacia la Identidad canónica (sólo resuelve nombre). */
export interface IdentidadPort {
  /** Nombre de presentación de una identidad tenant-scoped (null si no existe). */
  resolver(tenantId: TenantId, identityId: string): Promise<Result<IdentidadResuelta | null, KernelError>>;
  /** Resolución en lote (para listados). Devuelve un mapa identityId→nombre. */
  resolverVarios(tenantId: TenantId, identityIds: readonly string[]): Promise<Result<Record<string, string>, KernelError>>;
}

/* ------------------------------ Órdenes/Sesión --------------------------- */

/** Snapshot de duración de una sesión (proyección pública de Órdenes). */
export interface DuracionSesion {
  readonly sesionId: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly estado: string; // 'ABIERTA' | 'PAUSADA' | 'CERRADA'
  readonly efectivoMs: number; // AUTORIDAD del tiempo (§2)
  readonly abierta: boolean;
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
}

/** Puerto de SOLO LECTURA hacia el contrato público de sesiones de Órdenes. */
export interface OrdenesSesionPort {
  /** Duración de UNA sesión (query `modulo.ordenes.sesion.duraciones`). */
  duracionesDeSesion(tenantId: TenantId, sesionId: string): Promise<Result<DuracionSesion | null, KernelError>>;
  /** Duraciones de TODAS las sesiones de una OT. */
  duracionesPorOrden(tenantId: TenantId, ordenId: string): Promise<Result<DuracionSesion[], KernelError>>;
  /**
   * DGP-020.3 fix · Duraciones de TODAS las sesiones del ACTIVO (hoja de vida).
   * Habilita mostrar horas por activo aunque no haya valoración monetaria.
   */
  duracionesPorActivo(tenantId: TenantId, activoId: string): Promise<Result<DuracionSesion[], KernelError>>;
}

/* ------------------------------- Repositorios ---------------------------- */

export interface RecursoRepository {
  buscar(tenantId: TenantId, identityId: string): Promise<Result<RecursoHumano | null, KernelError>>;
  upsert(uow: UnitOfWork, recurso: RecursoHumano): Promise<Result<void, KernelError>>;
  listar(tenantId: TenantId, filtro?: { estado?: EstadoRecurso }): Promise<Result<RecursoHumano[], KernelError>>;
}

export interface TarifaRepository {
  buscarPorId(tenantId: TenantId, id: string): Promise<Result<Tarifa | null, KernelError>>;
  /** Todas las tarifas de un sujeto (historial completo, ordenadas por vigencia). */
  listarPorSujeto(tenantId: TenantId, sujetoTipo: string, sujetoId: string): Promise<Result<Tarifa[], KernelError>>;
  insertar(uow: UnitOfWork, tarifa: Tarifa): Promise<Result<void, KernelError>>;
  /** Persiste el cierre de vigencia (update in place de una fila existente). */
  actualizar(uow: UnitOfWork, tarifa: Tarifa): Promise<Result<void, KernelError>>;
}

export interface ValoracionRepository {
  buscar(tenantId: TenantId, sesionId: string): Promise<Result<Valoracion | null, KernelError>>;
  /**
   * Inserta la valoración de forma idempotente por (tenant, sesionId). Devuelve
   * `insertada=false` si ya existía (guarda durable — índice único).
   */
  registrar(uow: UnitOfWork, valoracion: Valoracion): Promise<Result<{ insertada: boolean }, KernelError>>;
  /** Reemplaza una valoración revalorable (SIN_TARIFA/SIN_RECURSO). */
  reemplazar(uow: UnitOfWork, valoracion: Valoracion): Promise<Result<void, KernelError>>;
  listarPorOrden(tenantId: TenantId, ordenId: string): Promise<Result<Valoracion[], KernelError>>;
  listarPorActivo(tenantId: TenantId, activoId: string): Promise<Result<Valoracion[], KernelError>>;
  listarPorIdentidad(tenantId: TenantId, identityId: string): Promise<Result<Valoracion[], KernelError>>;
  /** Valoraciones por estado (para 'pendientes'/red de seguridad). */
  listarPorEstado(tenantId: TenantId, estados: readonly EstadoValoracion[]): Promise<Result<Valoracion[], KernelError>>;
}

/* ------------------------------- Recibos opId ---------------------------- */

export interface Recibo {
  readonly opId: string;
  readonly comando: string;
  readonly resultado?: Record<string, unknown>;
}
export interface ReciboClaim {
  readonly duenio: boolean;
  readonly pendiente?: boolean;
  readonly resultado?: Record<string, unknown>;
}
export interface ReciboPort {
  buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>>;
  reclamar(uow: UnitOfWork, tenantId: TenantId, comando: string, opId: string, actorId: string): Promise<Result<ReciboClaim, KernelError>>;
  sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>>;
}
