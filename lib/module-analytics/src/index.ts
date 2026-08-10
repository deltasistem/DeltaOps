/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Barril público (ETAPA 1).
 *
 * Exporta el dominio (indicadores declarativos, motor de evaluación, dashboards,
 * filtros, snapshots), los puertos read-only fail-safe, los catálogos canónicos
 * COMO DATOS, los fakes en memoria, el descriptor del servicio y el runtime de
 * pruebas. La infraestructura real (PostgreSQL + read models CQRS + OpenAPI + UI)
 * llega en la ETAPA 2.
 */
export * from "./module-name";
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/filtros";
export * from "./domain/expresion";
export * from "./domain/motor";
export * from "./domain/definicion-indicador";
export * from "./domain/dashboard";
export * from "./domain/snapshot";
export * from "./domain/policies";
export * from "./domain/ports";
export * from "./domain/catalogo-indicadores";
export * from "./domain/catalogo-dashboards";
export * from "./domain/seed";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./fakes";
export * from "./infrastructure/repository";
export * from "./infrastructure/operacional";

/* --------------------------------- Servicio ------------------------------ */
export { analyticsModule, type ModuleAdapters } from "./module";

/* -------------------------------- CQRS / Sync / Runtime ------------------ */
export * from "./projection";
export * from "./sincronizacion";
export * from "./runtime";

/* -------------------------------- Pruebas -------------------------------- */
export * from "./test-runtime";
