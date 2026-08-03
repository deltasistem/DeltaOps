/**
 * DGP-006 · Business Foundation Framework — Generic Repository Runtime.
 *
 * RepositorioGenerico delega 100% en RecordStorePort: el store ya resuelve la
 * multitenancy y RLS (setTenantContext en PgRecordStore). Aquí NO hay SQL
 * propio; solo mapeo entre RegistroEntidad (aggregate) y PlatformRecord.
 */
import { ok, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { PlatformRecord, RecordStorePort, TenantId } from "@workspace/platform";
import type { DefinicionEntidad } from "./definicion";
import type { RegistroEntidad } from "./entidad";

function aRegistro(r: PlatformRecord): RegistroEntidad {
  return {
    id: r.id,
    tenantId: r.tenantId,
    estado: r.status,
    version: r.version,
    data: r.data,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt,
  };
}

export interface FiltroListado {
  readonly estado?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeDeleted?: boolean;
}

/** Repositorio genérico multitenant sobre el Record Store de la plataforma. */
export class RepositorioGenerico {
  constructor(
    private readonly store: RecordStorePort,
    private readonly def: DefinicionEntidad,
  ) {}

  async insertar(uow: UnitOfWork, r: RegistroEntidad): Promise<Result<RegistroEntidad, KernelError>> {
    const inserted = await this.store.insert(uow, {
      id: r.id,
      tenantId: r.tenantId,
      service: this.def.servicio,
      recordType: this.def.nombre,
      status: r.estado,
      data: r.data,
      createdBy: r.createdBy,
    });
    return inserted.ok ? ok(aRegistro(inserted.value)) : inserted;
  }

  /** Actualiza con concurrencia optimista (versión esperada). */
  async actualizar(
    uow: UnitOfWork,
    r: RegistroEntidad,
    versionEsperada: number,
  ): Promise<Result<RegistroEntidad, KernelError>> {
    const updated = await this.store.update(uow, r.tenantId, r.id, versionEsperada, {
      status: r.estado,
      data: r.data,
    });
    return updated.ok ? ok(aRegistro(updated.value)) : updated;
  }

  async eliminarSuave(
    uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
  ): Promise<Result<void, KernelError>> {
    return this.store.softDelete(uow, tenantId, id);
  }

  async porId(
    tenantId: TenantId,
    id: string,
  ): Promise<Result<RegistroEntidad | null, KernelError>> {
    const found = await this.store.findById(tenantId, id);
    if (!found.ok) return found;
    return ok(found.value ? aRegistro(found.value) : null);
  }

  async listar(
    tenantId: TenantId,
    filtro: FiltroListado = {},
  ): Promise<Result<RegistroEntidad[], KernelError>> {
    const rows = await this.store.list(tenantId, {
      service: this.def.servicio,
      recordType: this.def.nombre,
      status: filtro.estado,
      includeDeleted: filtro.includeDeleted,
      limit: filtro.limit,
      offset: filtro.offset,
    });
    return rows.ok ? ok(rows.value.map(aRegistro)) : rows;
  }
}
