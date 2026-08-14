/**
 * DeltaOps Plataforma · Tipos base de los Shared Platform Services (DGP-003).
 * Todo registro de plataforma es multitenant, versionado y auditable.
 * Cero dominio: la plataforma solo conoce servicios, registros y eventos.
 */
import type { ExecutionContext } from "@workspace/kernel";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

export type TenantId = string;

/** Registro genérico de plataforma (unidad de persistencia de los servicios). */
export interface PlatformRecord<TData = Record<string, unknown>> {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly service: string;
  readonly recordType: string;
  readonly status: string;
  readonly data: TData;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface RecordFilter {
  readonly service: string;
  readonly recordType?: string;
  readonly status?: string;
  readonly includeDeleted?: boolean;
  readonly limit?: number;
  readonly offset?: number;
  /**
   * Filtro de igualdad sobre campos escalares de `data` (JSONB), aplicado en el
   * almacén (push-down). Cada par exige `data->>clave = valor`. Permite acotar
   * por p. ej. `entityRef` SIN depender de una ventana global de `limit` filas:
   * imprescindible cuando un tenant acumula muchas entradas (p. ej. históricos)
   * y el filtro en memoria sobre las primeras N dejaba fuera lo buscado.
   */
  readonly dataEquals?: Readonly<Record<string, string>>;
}

/** Extrae el tenant del contexto. Multitenancy es obligatoria: sin tenant, falla. */
export function tenantOf(ctx: ExecutionContext): Result<TenantId, KernelError> {
  const tenant = ctx.metadata["tenantId"];
  if (typeof tenant !== "string" || tenant.length === 0) {
    return fail(
      KernelErrors.validation("Contexto sin tenantId: toda operación de plataforma es multitenant"),
    );
  }
  return ok(tenant);
}
