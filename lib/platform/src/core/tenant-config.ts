/**
 * DeltaOps Plataforma · Configuración por Tenant.
 * Precedencia: override del tenant (Record Store) → default del servicio →
 * configuración global del Kernel. Los overrides se escriben mediante el
 * comando oficial `platform.config.set` (auditado, transaccional).
 */
import {
  fail,
  KernelErrors,
  ok,
  type ConfigurationResolver,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { RecordStorePort } from "./record-store";
import type { TenantId } from "./types";

const SERVICE = "platform.config";

export class TenantConfigService {
  private readonly defaults = new Map<string, string>();

  constructor(
    private readonly store: RecordStorePort,
    private readonly kernelConfig: ConfigurationResolver,
  ) {}

  /** Solo registerPlatformService declara defaults (clave = servicio.clave). */
  registerDefaults(service: string, defaults: Record<string, string>): void {
    for (const [k, v] of Object.entries(defaults)) {
      this.defaults.set(`${service}.${k}`, v);
    }
  }

  async get(tenantId: TenantId, key: string): Promise<Result<string, KernelError>> {
    const override = await this.store.findById(tenantId, `config:${key}`);
    if (!override.ok) return override;
    const value = override.value?.data["value"];
    if (typeof value === "string") return ok(value);
    const def = this.defaults.get(key);
    if (def !== undefined) return ok(def);
    const global = this.kernelConfig.get(key.toUpperCase().replace(/[.\-]/g, "_"));
    if (global.ok) return global;
    return fail(KernelErrors.notFound("config", key));
  }

  async set(
    uow: UnitOfWork,
    tenantId: TenantId,
    key: string,
    value: string,
    actorId: string,
  ): Promise<Result<void, KernelError>> {
    const id = `config:${key}`;
    const existing = await this.store.findById(tenantId, id);
    if (!existing.ok) return existing;
    if (existing.value) {
      const updated = await this.store.update(uow, tenantId, id, existing.value.version, {
        data: { key, value },
      });
      return updated.ok ? ok(undefined) : updated;
    }
    const inserted = await this.store.insert(uow, {
      id,
      tenantId,
      service: SERVICE,
      recordType: "override",
      status: "active",
      data: { key, value },
      createdBy: actorId,
    });
    return inserted.ok ? ok(undefined) : inserted;
  }

  async listOverrides(tenantId: TenantId): Promise<Result<{ key: string; value: string }[], KernelError>> {
    const rows = await this.store.list(tenantId, { service: SERVICE, recordType: "override" });
    if (!rows.ok) return rows;
    return ok(
      rows.value.map((r) => ({
        key: String(r.data["key"] ?? ""),
        value: String(r.data["value"] ?? ""),
      })),
    );
  }

  listDefaults(): { key: string; value: string }[] {
    return [...this.defaults.entries()].map(([key, value]) => ({ key, value }));
  }
}
