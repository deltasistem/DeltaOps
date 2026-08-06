/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Barril público.
 *
 * ETAPA 1 (SÓLO DOMINIO PURO): exporta el dominio, los puertos, los fakes en
 * memoria, el descriptor del servicio y el runtime de pruebas. La persistencia
 * real (PostgreSQL / read models CQRS / OpenAPI / UI) llega en la ETAPA 2.
 */
export * from "./module-name";
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/workflow";
export * from "./domain/value-objects";
export * from "./domain/programa";
export * from "./domain/actividad";
export * from "./domain/programacion";
export * from "./domain/generacion";
export * from "./domain/historial";
export * from "./domain/policies";
export * from "./domain/ports";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./infrastructure/fakes";
export * from "./infrastructure/repository";
export * from "./infrastructure/operacional";
export * from "./infrastructure/workflow-adapter";

/* ------------------------------- CQRS / Sync ----------------------------- */
export * from "./projection";
export * from "./sincronizacion";

/* --------------------------------- Servicio ------------------------------ */
export { preventivoModule, type ModuleAdapters } from "./module";

/* ---------------------- Runtime operativo (ETAPA 2) ---------------------- */
export {
  crearPreventivoRuntimeOperacional,
  type PreventivoRuntimeOptions,
  type PreventivoRuntimeOperacional,
} from "./runtime";

/* -------------------------------- Pruebas -------------------------------- */
export * from "./test-runtime";
