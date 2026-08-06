/**
 * DGP-012 · Módulo Enterprise Maintenance Plans (`@workspace/module-planes`).
 *
 * Superficie pública del paquete. ETAPA 1: dominio puro + servicio `modulo.planes`
 * con FAKES en memoria y runtime de pruebas. La persistencia real (PostgreSQL /
 * read models CQRS / OpenAPI / UI) llega en la etapa 2.
 */
export * from "./module-name";

/* --------------------------------- Dominio ------------------------------- */
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/workflow";
export * from "./domain/value-objects";
export * from "./domain/frecuencia-engine";
export * from "./domain/calendario";
export * from "./domain/rutina";
export * from "./domain/generacion";
export * from "./domain/suspension";
export * from "./domain/plan";
export * from "./domain/policies";
export * from "./domain/ports";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./infrastructure/fakes";
export { WorkflowMotorAdapter, estadoInicialDe } from "./infrastructure/workflow-adapter";
export * from "./infrastructure/repository";
export * from "./infrastructure/operacional";

/* --------------------------------- Servicio ------------------------------ */
export { planesModule, type ModuleAdapters } from "./module";

/* ----------------------- Runtime operacional (ETAPA 2) ------------------- */
export {
  crearPlanesRuntimeOperacional,
  type PlanesRuntimeOperacional,
  type PlanesRuntimeOptions,
} from "./runtime";
export {
  procesarCola,
  ColaSyncSchema,
  OperacionSyncSchema,
  type EstadoSync,
  type OperacionSync,
  type ResultadoSync,
  type ResumenSync,
} from "./sincronizacion";
export {
  aplicarEventoAggregate,
  aplicarEventoOperacional,
  handlerProyeccion,
  type EventoLike,
  type ProyeccionAdapters,
} from "./projection";

/* -------------------------------- Pruebas -------------------------------- */
export * from "./test-runtime";
