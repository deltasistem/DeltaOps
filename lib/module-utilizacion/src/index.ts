/**
 * DGP-019.1 · Módulo de Utilización, Medidores y Combustible — Barril público.
 *
 * Superficie estable del paquete `@workspace/module-utilizacion`: descriptor del
 * servicio de plataforma, ensamblaje operativo (PG/Fake), harness de pruebas,
 * dominio puro (VOs, cálculos, catálogos, eventos, policies) y contratos de
 * puertos (incluido el `ActivosPort` fail-safe de composición).
 */
export { MODULO } from "./module-name";

// Descriptor + adaptadores de aplicación
export { utilizacionModule, PERMISOS_MODULO, type ModuleAdapters } from "./module";

// Ensamblaje operativo (producción / offline)
export {
  crearUtilizacionRuntimeOperacional,
  type UtilizacionRuntimeOptions,
  type UtilizacionRuntimeOperacional,
} from "./runtime";

// Sincronización offline
export {
  procesarCola,
  OperacionSyncSchema,
  ColaSyncSchema,
  type OperacionSync,
  type ResultadoSync,
  type ResumenSync,
  type EstadoSync,
} from "./sincronizacion";

// Proyección CQRS
export { aplicarEventoAggregate, handlerProyeccion, type ProyeccionAdapters, type EventoLike } from "./projection";

// Harness de pruebas
export {
  crearUtilizacionRuntime,
  SISTEMA,
  ActivosPruebaTodos,
  ActivosPruebaFaltantes,
  ActivosPruebaConflicto,
  type UtilizacionRuntime,
  type CrearRuntimeOpts,
} from "./test-runtime";

// Dominio
export * from "./domain/events";
export * from "./domain/value-objects";
export * from "./domain/calculos";
export * from "./domain/catalogos";
export * from "./domain/policies";
export * from "./domain/ports";

// Infraestructura (tipos y adaptadores reutilizables)
export {
  crearFakeAdapters,
  FakeLecturaRepository,
  FakeTanqueoRepository,
  FakeCatalogoStore,
  FakeRecibos,
  FakeEventLogStore,
  type FakeAdapters,
} from "./infrastructure/fakes";
export {
  PgLecturaRepository,
  PgTanqueoRepository,
  PgCatalogoStore,
  PgReciboStore,
  setTenant,
  withTenantRead,
} from "./infrastructure/repository";
export {
  FakeSyncReceiptStore,
  PgSyncReceiptStore,
  FakeReadModelsStore,
  PgReadModelsStore,
  FakeConsolaStore,
  PgConsolaStore,
  PgEventLogStore,
  type SyncReceiptStore,
  type SyncReceipt,
  type ReadModelsStore,
  type LecturaReadRow,
  type LecturaReadFiltro,
  type TanqueoReadRow,
  type TanqueoReadFiltro,
  type ConsolaStore,
  type ConsolaResumen,
} from "./infrastructure/operacional";
