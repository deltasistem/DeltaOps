/**
 * DGP-021.1 · Composición oficial del Módulo de Costos.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, eligiendo
 * adaptadores PostgreSQL o Fake (offline) según haya `pool`. Los puertos hacia
 * contratos AJENOS (Identidad, Órdenes, costo exacto de Abastecimiento) se
 * INYECTAN desde el api-server (adaptadores de producción). Si no se proveen, se
 * usan Fakes en memoria (offline/pruebas). El módulo NUNCA lee tablas de otros
 * módulos por SQL directo: compone sus queries públicas.
 */
import type { Pool } from "pg";
import { createPlatformRuntime, type PlatformRuntime, type PlatformRuntimeOptions } from "@workspace/platform";
import { costosModule, type EventLogPort, type ModuleAdapters } from "./module";
import { PgEventLog, PgHechoStore, PgReciboStore } from "./infrastructure/repository";
import {
  FakeCostoExactoPort,
  FakeEventLog,
  FakeHechoRepository,
  FakeIdentidadPort,
  FakeOrdenesPort,
  FakeReciboPort,
} from "./infrastructure/fakes";
import type {
  CostoExactoPort,
  HechoRepository,
  IdentidadPort,
  OrdenesPort,
  ReciboPort,
} from "./domain/ports";

export interface CostosRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /** Puerto hacia la Identidad canónica (producción: api-server). */
  readonly identidad?: IdentidadPort;
  /** Puerto de SOLO LECTURA hacia el contrato público de Órdenes. */
  readonly ordenes?: OrdenesPort;
  /** Puerto de SOLO LECTURA hacia el costo exacto de Abastecimiento (DGP-021.0). */
  readonly costoExacto?: CostoExactoPort;
}

export interface CostosRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  /** Fakes expuestos para pruebas (semilla de OT/identidad/costo exacto en memoria). */
  readonly fakes?: {
    readonly identidad: FakeIdentidadPort;
    readonly ordenes: FakeOrdenesPort;
    readonly costoExacto: FakeCostoExactoPort;
  };
}

export function crearCostosRuntime(options: CostosRuntimeOptions = {}): CostosRuntime {
  const { pool } = options;

  const hechos: HechoRepository = pool ? new PgHechoStore(pool) : new FakeHechoRepository();
  const recibos: ReciboPort = pool ? new PgReciboStore(pool) : new FakeReciboPort();
  const eventLog: EventLogPort = pool ? new PgEventLog(pool) : new FakeEventLog();

  const fakeIdentidad = options.identidad instanceof FakeIdentidadPort ? options.identidad : new FakeIdentidadPort();
  const fakeOrdenes = options.ordenes instanceof FakeOrdenesPort ? options.ordenes : new FakeOrdenesPort();
  const fakeCostoExacto = options.costoExacto instanceof FakeCostoExactoPort ? options.costoExacto : new FakeCostoExactoPort();
  const identidad: IdentidadPort = options.identidad ?? fakeIdentidad;
  const ordenes: OrdenesPort = options.ordenes ?? fakeOrdenes;
  const costoExacto: CostoExactoPort = options.costoExacto ?? fakeCostoExacto;

  const adapters: ModuleAdapters = { hechos, recibos, identidad, ordenes, costoExacto, eventLog };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [costosModule(adapters)],
  });

  return {
    platform,
    adapters,
    fakes: pool ? undefined : { identidad: fakeIdentidad, ordenes: fakeOrdenes, costoExacto: fakeCostoExacto },
  };
}
