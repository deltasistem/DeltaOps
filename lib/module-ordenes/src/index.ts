/**
 * DGP-009.1 · Módulo Órdenes de Trabajo Empresariales (@workspace/module-ordenes)
 * — API pública (dominio).
 *
 * SOLO dominio: aggregate, objetos de valor, catálogos configurables, ciclo de
 * vida DECLARATIVO gobernado por el Workflow Engine (DGP-007), policies,
 * permisos/capacidades, formularios/checklists (Dynamic Forms) y evidencias
 * (platform.attachment, referencia-only), offline-first con recibos de
 * idempotencia. Sin infraestructura HTTP/UI/OpenAPI (DGP-009.2).
 */
export * from "./module-name";
export * from "./domain/value-objects";
export * from "./domain/catalogos";
export * from "./domain/maquina-estados";
export * from "./domain/orden";
export * from "./domain/operacional";
export * from "./domain/sesion";
export * from "./domain/policies";
export * from "./domain/ports";
// FAKES en memoria de los puertos (para pruebas de dominio y para 009.2 hasta
// que aterricen los adaptadores concretos de persistencia).
export * from "./infrastructure/fakes";
// Adaptadores de persistencia PostgreSQL + read models + stores operacionales.
export * from "./infrastructure/repository";
// `Sla` de operacional se renombra a `SlaOperativo` para no colisionar con el
// objeto de valor `Sla` (dominio); el resto se reexporta tal cual.
export {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeMotorStore,
  FakeProyeccionesStore,
  FakeSyncReceiptStore,
  PgConsolaStore,
  PgEventLogStore,
  PgMotorStore,
  PgProyeccionesStore,
  PgSyncReceiptStore,
  type Asignacion,
  type ClaimResult,
  type ConsolaStore,
  type EventLogStore,
  type EventoBitacora,
  type MotorStore,
  type Planificacion,
  type ProyeccionesStore,
  type Recurso,
  type RelacionArista,
  type Sla as SlaOperativo,
  type SyncReceipt,
  type SyncReceiptStore,
} from "./infrastructure/operacional";
export {
  FakeSesionStore,
  PgSesionStore,
  type DuracionesReadRow,
  type SesionCabecera,
  type SesionReadRow,
  type SesionStore,
  type TramoFila,
  type TramoReadRow,
} from "./infrastructure/sesiones";
export * from "./projection";
export { ordenesModule, type ModuleAdapters } from "./module";
export { crearOrdenesRuntime, type OrdenesRuntime, type OrdenesRuntimeOptions } from "./runtime";
export * from "./sincronizacion";
