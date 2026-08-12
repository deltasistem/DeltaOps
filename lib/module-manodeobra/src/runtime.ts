/**
 * DGP-020.3 · Composición oficial del Módulo Mano de Obra.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, eligiendo
 * adaptadores PostgreSQL o Fake (offline) según haya `pool`. El `CatalogoService`
 * se apoya en el Record Store de la plataforma que se está montando (holder que
 * resuelve el ciclo, patrón `crearOrdenesRuntime`).
 *
 * Los puertos hacia contratos AJENOS (Identidad, sesiones de Órdenes) se INYECTAN
 * desde el api-server (adaptadores de producción). Si no se proveen, se usan
 * Fakes en memoria (offline/pruebas). El módulo NUNCA lee tablas de Órdenes ni
 * de Identidad por SQL directo.
 */
import type { Pool } from "pg";
import type { RecordStorePort } from "@workspace/platform";
import { createPlatformRuntime, type PlatformRuntime, type PlatformRuntimeOptions } from "@workspace/platform";
import { manodeobraModule, type ModuleAdapters, type EventLogPort } from "./module";
import { CatalogoService } from "./infrastructure/catalogo-service";
import {
  PgEventLog,
  PgReciboStore,
  PgRecursoStore,
  PgTarifaStore,
  PgValoracionStore,
} from "./infrastructure/repository";
import {
  FakeEventLog,
  FakeIdentidadPort,
  FakeOrdenesSesionPort,
  FakeReciboPort,
  FakeRecursoRepository,
  FakeTarifaRepository,
  FakeValoracionRepository,
} from "./infrastructure/fakes";
import type {
  IdentidadPort,
  OrdenesSesionPort,
  ReciboPort,
  RecursoRepository,
  TarifaRepository,
  ValoracionRepository,
} from "./domain/ports";

export interface ManodeobraRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /** Puerto hacia la Identidad canónica (producción: api-server). */
  readonly identidad?: IdentidadPort;
  /** Puerto de SOLO LECTURA hacia las sesiones de Órdenes (producción: api-server). */
  readonly ordenes?: OrdenesSesionPort;
}

export interface ManodeobraRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  /** Fakes expuestos para pruebas (semilla de sesiones/identidades en memoria). */
  readonly fakes?: {
    readonly identidad: FakeIdentidadPort;
    readonly ordenes: FakeOrdenesSesionPort;
  };
}

export function crearManodeobraRuntime(options: ManodeobraRuntimeOptions = {}): ManodeobraRuntime {
  const { pool } = options;

  const recursos: RecursoRepository = pool ? new PgRecursoStore(pool) : new FakeRecursoRepository();
  const tarifas: TarifaRepository = pool ? new PgTarifaStore(pool) : new FakeTarifaRepository();
  const valoraciones: ValoracionRepository = pool ? new PgValoracionStore(pool) : new FakeValoracionRepository();
  const recibos: ReciboPort = pool ? new PgReciboStore(pool) : new FakeReciboPort();
  const eventLog: EventLogPort = pool ? new PgEventLog(pool) : new FakeEventLog();

  const fakeIdentidad = options.identidad instanceof FakeIdentidadPort ? options.identidad : new FakeIdentidadPort();
  const fakeOrdenes = options.ordenes instanceof FakeOrdenesSesionPort ? options.ordenes : new FakeOrdenesSesionPort();
  const identidad: IdentidadPort = options.identidad ?? fakeIdentidad;
  const ordenes: OrdenesSesionPort = options.ordenes ?? fakeOrdenes;

  // El Record Store se resuelve tras montar la plataforma (holder/proxy).
  const holder: { store: RecordStorePort | null } = { store: null };
  const storeProxy = new Proxy({} as RecordStorePort, {
    get(_t, prop) {
      if (!holder.store) throw new Error("Record Store aún no disponible");
      return (holder.store as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
  const catalogos = new CatalogoService(storeProxy);

  const adapters: ModuleAdapters = { recursos, tarifas, valoraciones, recibos, identidad, ordenes, catalogos, eventLog };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [manodeobraModule(adapters)],
  });
  holder.store = platform.store;

  return {
    platform,
    adapters,
    fakes: pool ? undefined : { identidad: fakeIdentidad, ordenes: fakeOrdenes },
  };
}
