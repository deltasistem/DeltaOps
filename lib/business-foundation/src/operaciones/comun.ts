/**
 * DGP-006 · Business Foundation Framework — Familia OPERACIONES: utilidades comunes.
 *
 * Helpers neutros compartidos por los runtimes genéricos de operaciones
 * (asignación, aprobación, lote, importación, exportación). Todo pasa por el
 * Kernel y el RecordStorePort; aquí no hay SQL ni ningún concepto de negocio.
 *
 * Offline First: la idempotencia por `opId` reutiliza el mismo patrón `_opIds`
 * del núcleo (crud.ts) — los opId aplicados se guardan como metadato del propio
 * registro, de modo que un reintento con el mismo opId es un no-op exitoso.
 */
import { createDomainEvent, ok, type ExecutionContext, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { audit, type ServiceDeps } from "@workspace/platform";
import { prefijoEventos, type DefinicionEntidad } from "../nucleo/definicion";
import { RepositorioGenerico } from "../nucleo/repositorio";
import type { RegistroEntidad } from "../nucleo/entidad";

/** Clave-metadato de recibos de idempotencia offline (misma que el núcleo). */
export const OP_IDS_KEY = "_opIds";
const MAX_OP_IDS = 50;

/** Lee los opId ya aplicados a un registro. */
export function opIdsDe(data: Record<string, unknown>): string[] {
  const raw = data[OP_IDS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Añade un opId al recibo del registro (no duplica; recorta al máximo). */
export function conOpId(data: Record<string, unknown>, opId?: string): Record<string, unknown> {
  if (!opId) return data;
  const previos = opIdsDe(data);
  if (previos.includes(opId)) return data;
  return { ...data, [OP_IDS_KEY]: [...previos, opId].slice(-MAX_OP_IDS) };
}

/** ¿El registro ya aplicó este opId? */
export function opIdAplicado(data: Record<string, unknown>, opId?: string): boolean {
  return !!opId && opIdsDe(data).includes(opId);
}

/** Nombre base `<servicio>.<entidad>` para derivar comandos/consultas. */
export function baseOperaciones(def: DefinicionEntidad): string {
  return `${def.servicio}.${def.nombre}`;
}

/** Fabrica un repositorio genérico para la entidad. */
export function repoDe(deps: ServiceDeps, def: DefinicionEntidad): RepositorioGenerico {
  return new RepositorioGenerico(deps.store, def);
}

/** Helper de auditoría con el servicio de la entidad ya fijado. */
export function auditarOperacion(
  deps: ServiceDeps,
  uow: UnitOfWork,
  ctx: ExecutionContext,
  def: DefinicionEntidad,
  tenantId: string,
  accion: string,
  subjectId: string | null,
  detalle: Record<string, unknown> = {},
): Promise<Result<void, KernelError>> {
  return audit(deps.audit, uow, ctx, tenantId, def.servicio, accion, subjectId, detalle);
}

/**
 * Construye un payload de evento AUTOSUFICIENTE (proyección solo-desde-payload):
 * incluye tenantId/id/entityRef/recordType para dedupe por eventId aguas abajo.
 */
export function payloadOperacion(
  def: DefinicionEntidad,
  registro: RegistroEntidad,
  actorId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tenantId: registro.tenantId,
    id: registro.id,
    entityRef: `${def.servicio}.${def.nombre}:${registro.id}`,
    recordType: def.nombre,
    estado: registro.estado,
    version: registro.version,
    data: registro.data,
    createdBy: registro.createdBy,
    actualizadoAt: registro.updatedAt.toISOString(),
    actorId,
    ...extra,
  };
}

/** Nombre canónico de un evento de la familia operaciones: `<prefijo>.<sufijo>`. */
export function eventoOperacion(def: DefinicionEntidad, sufijo: string): string {
  return `${prefijoEventos(def)}.${sufijo}`;
}

/** Registra un evento de dominio en la UoW (outbox). */
export function emitirEvento(
  uow: UnitOfWork,
  ctx: ExecutionContext,
  tipo: string,
  payload: Record<string, unknown>,
): void {
  uow.registerEvent(createDomainEvent(tipo, payload, ctx.correlationId));
}

/** Lee un default/override de configuración por tenant como número. */
export async function configNumero(
  deps: ServiceDeps,
  tenantId: string,
  clave: string,
  fallback: number,
): Promise<number> {
  const cfg = await deps.tenantConfig.get(tenantId, clave);
  if (!cfg.ok) return fallback;
  const n = Number(cfg.value);
  return Number.isFinite(n) ? n : fallback;
}

/** Lee un default/override de configuración por tenant como booleano. */
export async function configBooleano(
  deps: ServiceDeps,
  tenantId: string,
  clave: string,
  fallback = false,
): Promise<boolean> {
  const cfg = await deps.tenantConfig.get(tenantId, clave);
  if (!cfg.ok) return fallback;
  return cfg.value === "true";
}

export { ok };
