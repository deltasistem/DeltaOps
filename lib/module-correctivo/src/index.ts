/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Barril público.
 *
 * ETAPA 2: exporta el dominio, los puertos, los fakes en memoria, el descriptor
 * del servicio, la infraestructura real (PostgreSQL + read models CQRS),
 * proyección, sincronización offline y el runtime operativo.
 */
export * from "./module-name";
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/workflow";
export * from "./domain/value-objects";
export * from "./domain/solicitud";
export * from "./domain/diagnostico";
export * from "./domain/intervencion";
export * from "./domain/orden-correctiva";
export * from "./domain/historial";
export * from "./domain/eventos-activo";
export * from "./domain/policies";
export * from "./domain/ports";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./infrastructure/fakes";
export * from "./infrastructure/repository";
export * from "./infrastructure/operacional";
export * from "./infrastructure/workflow-adapter";

/* --------------------------------- Servicio ------------------------------ */
export { correctivoModule, type ModuleAdapters } from "./module";

/* ------------------------------- Proyección ------------------------------ */
export * from "./projection";

/* ------------------------------ Sincronización --------------------------- */
export * from "./sincronizacion";

/* --------------------------------- Runtime ------------------------------- */
export * from "./runtime";

/* -------------------------------- Pruebas -------------------------------- */
export * from "./test-runtime";
