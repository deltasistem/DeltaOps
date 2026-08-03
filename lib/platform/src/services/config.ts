/**
 * DeltaOps Plataforma · Servicio de Configuración por Tenant.
 * Expone los comandos oficiales para overrides por tenant que el resto de
 * servicios consume vía TenantConfigService.
 */
import { z } from "zod";
import { ok } from "@workspace/kernel";
import { audit } from "../core/audit";
import { storeHealthCheck } from "../core/helpers";
import type { PlatformServiceDefinition } from "../core/service";
import { tenantOf } from "../core/types";

const SERVICE = "platform.config";

export function configPlatformService(): PlatformServiceDefinition {
  return {
    name: SERVICE,
    version: "1.0.0",
    description: "Configuración por tenant con precedencia override → default → global",
    capabilities: [
      {
        name: "gestionar-configuracion",
        permissions: ["platform.config.write", "platform.config.read"],
        description: "Administrar configuración por tenant",
      },
    ],
    permissions: ["platform.config.write", "platform.config.read"],
    dependsOn: [],
    events: ["platform.config.changed"],
    recordTypes: ["override"],
    configDefaults: {},
    commands: [
      (deps) => ({
        name: `${SERVICE}.set`,
        inputSchema: z.object({ key: z.string().min(1), value: z.string() }),
        authorization: { permissions: ["platform.config.write"] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const set = await deps.tenantConfig.set(uow, tenant.value, input.key, input.value, ctx.principal.id);
          if (!set.ok) return set;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, SERVICE, "set", input.key, {});
          if (!audited.ok) return audited;
          return ok({ key: input.key });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${SERVICE}.get`,
        inputSchema: z.object({ key: z.string().min(1) }),
        authorization: { permissions: ["platform.config.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const value = await deps.tenantConfig.get(tenant.value, input.key);
          if (!value.ok) return value;
          return ok({ key: input.key, value: value.value });
        },
      }),
      (deps) => ({
        name: `${SERVICE}.overrides`,
        inputSchema: z.object({}),
        authorization: { permissions: ["platform.config.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return deps.tenantConfig.listOverrides(tenant.value);
        },
      }),
    ],
    eventHandlers: [],
    healthCheck: storeHealthCheck(SERVICE),
  };
}
