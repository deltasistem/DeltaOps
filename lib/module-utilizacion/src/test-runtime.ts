/**
 * DGP-019.1 · Módulo de Utilización — Runtime de PRUEBAS.
 *
 * Monta un runtime de plataforma con FAKES en memoria de los puertos del módulo
 * (incluidos read models CQRS, recibos de sync durables y consola técnica) como
 * `extraService`, para ejercer comandos/consultas/policies/handlers end-to-end
 * de forma 100% determinista. Ofrece variantes de `ActivosPort` de PRUEBA para
 * verificar la composición fail-safe y la sincronización (confirmada, no-aplica,
 * fallida por conflicto). Estas implementaciones son EXCLUSIVAS de test.
 */
import {
  createExecutionContext,
  fail,
  InMemoryOutboxStore,
  KernelErrors,
  KernelTokens,
  ok,
  type ExecutionContext,
  type KernelError,
  type OutboxRecord,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { createPlatformRuntime, type PlatformRuntime } from "@workspace/platform";
import { utilizacionModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import { FakeConsolaStore, FakeReadModelsStore, FakeSyncReceiptStore } from "./infrastructure/operacional";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";
import type {
  ActivosPort,
  ActualizarMedidorInput,
  DetalleActivo,
  MedicionActivo,
  ResultadoActualizacionActivo,
} from "./domain/ports";
import { TIPO_HOROMETRO } from "./domain/value-objects";

/* ------------------------- ActivosPort de PRUEBA ------------------------- */

/** Todos los activos existen; el medidor avanza y confirma sin conflicto. */
export class ActivosPruebaTodos implements ActivosPort {
  private readonly versiones = new Map<string, number>();
  private readonly horo = new Map<string, MedicionActivo>();
  private readonly odo = new Map<string, MedicionActivo>();
  private v(id: string) { return this.versiones.get(id) ?? 1; }

  async existen(_t: string, ids: readonly string[]): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    void ids;
    return ok({ inexistentes: [] });
  }
  async detalle(_t: string, id: string): Promise<Result<DetalleActivo | null, KernelError>> {
    return ok({ version: this.v(id), horometro: this.horo.get(id) ?? null, odometro: this.odo.get(id) ?? null });
  }
  async actualizarHorometro(_t: string, _a: string, input: ActualizarMedidorInput): Promise<Result<ResultadoActualizacionActivo, KernelError>> {
    return this.aplicar(this.horo, input, "h");
  }
  async actualizarOdometro(_t: string, _a: string, input: ActualizarMedidorInput): Promise<Result<ResultadoActualizacionActivo, KernelError>> {
    return this.aplicar(this.odo, input, "km");
  }
  private aplicar(m: Map<string, MedicionActivo>, input: ActualizarMedidorInput, unidad: string): Result<ResultadoActualizacionActivo, KernelError> {
    if (input.expectedVersion !== this.v(input.activoId)) return fail(KernelErrors.conflict("versión desactualizada"));
    const cur = m.get(input.activoId);
    if (cur && input.valor < cur.valor) return fail(KernelErrors.conflict("retroceso de medidor"));
    m.set(input.activoId, { valor: input.valor, unidad, medidoAt: input.fecha });
    const nueva = this.v(input.activoId) + 1;
    this.versiones.set(input.activoId, nueva);
    return ok({ version: nueva });
  }
  medicion(id: string, tipo: string): MedicionActivo | null {
    return (tipo === TIPO_HOROMETRO ? this.horo : this.odo).get(id) ?? null;
  }
}

/** Ningún activo existe (verifica fallo seguro / not found en escritura). */
export class ActivosPruebaFaltantes implements ActivosPort {
  async existen(_t: string, ids: readonly string[]): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    return ok({ inexistentes: [...ids] });
  }
  async detalle(): Promise<Result<DetalleActivo | null, KernelError>> { return ok(null); }
  async actualizarHorometro(): Promise<Result<ResultadoActualizacionActivo, KernelError>> { return fail(KernelErrors.notFound("activo", "?")); }
  async actualizarOdometro(): Promise<Result<ResultadoActualizacionActivo, KernelError>> { return fail(KernelErrors.notFound("activo", "?")); }
}

/**
 * El activo existe pero la actualización SIEMPRE responde 409 (KRN-CFL-001):
 * verifica reintento acotado y transición a estado `fallida` con evento ruidoso.
 */
export class ActivosPruebaConflicto implements ActivosPort {
  async existen(): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> { return ok({ inexistentes: [] }); }
  async detalle(_t: string, id: string): Promise<Result<DetalleActivo | null, KernelError>> {
    return ok({ version: 1, horometro: null, odometro: null });
  }
  async actualizarHorometro(): Promise<Result<ResultadoActualizacionActivo, KernelError>> { return fail(KernelErrors.conflict("conflicto persistente")); }
  async actualizarOdometro(): Promise<Result<ResultadoActualizacionActivo, KernelError>> { return fail(KernelErrors.conflict("conflicto persistente")); }
}

/* ------------------------------- Harness --------------------------------- */

export interface UtilizacionRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly fakes: FakeAdapters;
  readonly readModel: FakeReadModelsStore;
  readonly syncReceipts: FakeSyncReceiptStore;
  readonly activos: ActivosPort | null;
  ctx(tenantId: string, principal?: Principal): ExecutionContext;
  drenar(): Promise<void>;
  sincronizar(ctx: ExecutionContext, operaciones: readonly OperacionSync[]): Promise<ResumenSync>;
}

/** Principal del sistema con permisos amplios (solo para pruebas). */
export const SISTEMA: Principal = { id: "sistema", rol: "sistema", permisos: ["*"], capacidades: ["*"] };

export interface CrearRuntimeOpts {
  /** `ActivosPort` a inyectar. Por defecto `ActivosPruebaTodos`; `null` = sin puerto. */
  activos?: ActivosPort | null;
}

export function crearUtilizacionRuntime(opts: CrearRuntimeOpts = {}): UtilizacionRuntime {
  const fakes = crearFakeAdapters();
  const readModel = new FakeReadModelsStore();
  const syncReceipts = new FakeSyncReceiptStore();
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola = new FakeConsolaStore(() => outboxRecords());
  const activos = opts.activos === undefined ? new ActivosPruebaTodos() : opts.activos;

  const adapters: ModuleAdapters = {
    ...fakes,
    readModel,
    syncReceipts,
    consola,
    ...(activos === null ? {} : { activos }),
  };

  const platform = createPlatformRuntime({ extraServices: [utilizacionModule(adapters)] });
  const store = platform.kernel.container.resolve(KernelTokens.outbox);
  if (store instanceof InMemoryOutboxStore) outboxRecords = () => store.records;

  return {
    platform,
    adapters,
    fakes,
    readModel,
    syncReceipts,
    activos,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
    async drenar() {
      await platform.kernel.outboxProcessor.processPending();
    },
    sincronizar(ctx, operaciones) {
      return procesarCola(platform, adapters, ctx, operaciones);
    },
  };
}
