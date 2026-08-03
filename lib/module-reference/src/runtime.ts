/**
 * DGP-004 · Composición oficial del Reference Module.
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya pool.
 */
import type { Pool } from "pg";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import {
  FakeElementoReadModel,
  FakeElementoRepository,
  PgElementoReadModel,
  PgElementoRepository,
  type ElementoReadModel,
  type ElementoRepository,
} from "./infrastructure/repository";
import { referenceModule, type ModuleAdapters } from "./module";

export interface ReferenceRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
}

export function createReferenceRuntime(
  options: Omit<PlatformRuntimeOptions, "extraServices"> & { pool?: Pool } = {},
): ReferenceRuntime {
  const repository: ElementoRepository = options.pool
    ? new PgElementoRepository(options.pool)
    : new FakeElementoRepository();
  const readModel: ElementoReadModel = options.pool
    ? new PgElementoReadModel(options.pool)
    : new FakeElementoReadModel();
  const adapters: ModuleAdapters = { repository, readModel };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [referenceModule(adapters)],
  });

  return { platform, adapters };
}
