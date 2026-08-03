/**
 * DGP-006 · Business Foundation Framework — Generic History/Audit Viewer Runtime.
 *
 * Dos consultas neutras sobre el AuditTrailPort de la plataforma:
 *   - `<servicio>.<entidad>.historial`  → historia reconstruida del registro
 *     (entradas ordenadas cronológicamente, forma legible).
 *   - `<servicio>.<entidad>.auditoria`  → entradas crudas de auditoría paginadas.
 *
 * El núcleo audita cada escritura con `subjectId = id` del registro y
 * `service = <servicio>`, de modo que la historia se reconstruye filtrando la
 * auditoría por sujeto. Requiere el permiso `leer` de la definición y una
 * capacidad dedicada de auditoría.
 */
import { z } from "zod";
import { ok, type QueryDefinition } from "@workspace/kernel";
import { tenantOf, type AuditEntry, type ServiceDeps } from "@workspace/platform";
import type { DefinicionEntidad } from "../nucleo/definicion";

/** Nombres canónicos de las consultas de historial de una entidad. */
export function nombresHistorial(def: DefinicionEntidad): {
  historial: string;
  auditoria: string;
} {
  const base = `${def.servicio}.${def.nombre}`;
  return { historial: `${base}.historial`, auditoria: `${base}.auditoria` };
}

/** Nombre de la capacidad dedicada de auditoría de una entidad. */
export function capacidadAuditoria(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `auditar-${def.nombre}`,
    permissions: [def.permisos.leer],
    description: `Consultar historial y auditoría de ${def.etiqueta}`,
  };
}

/** Entrada de historia reconstruida (proyección legible de la auditoría). */
export interface EntradaHistorial {
  readonly id: string;
  readonly accion: string;
  readonly actorId: string;
  readonly detalle: Record<string, unknown>;
  readonly correlationId: string;
  readonly ocurridoEn: string;
}

function aEntradaHistorial(e: AuditEntry): EntradaHistorial {
  return {
    id: e.id,
    accion: e.action,
    actorId: e.actorId,
    detalle: e.detail,
    correlationId: e.correlationId,
    ocurridoEn: e.occurredAt.toISOString(),
  };
}

/** Genera las consultas de historial/auditoría de una entidad. */
export function crearHistorial(def: DefinicionEntidad): {
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombres = nombresHistorial(def);

  const historial = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombres.historial,
    inputSchema: z.object({ id: z.string().min(1) }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const trail = await deps.audit.list(tenant.value, {
        service: def.servicio,
        subjectId: input.id,
        limit: 500,
      });
      if (!trail.ok) return trail;
      // Orden cronológico ascendente para reconstruir la historia del registro.
      const entradas = [...trail.value]
        .map(aEntradaHistorial)
        .sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
      return ok({ id: input.id, entradas });
    },
  });

  const auditoria = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombres.auditoria,
    inputSchema: z.object({
      id: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const trail = await deps.audit.list(tenant.value, {
        service: def.servicio,
        subjectId: input.id,
        limit: 500,
      });
      if (!trail.ok) return trail;
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;
      const total = trail.value.length;
      const pagina = trail.value.slice(offset, offset + limit);
      return ok({ total, offset, limit, entradas: pagina });
    },
  });

  return { queries: [historial, auditoria] };
}
