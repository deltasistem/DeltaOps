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
export * from "./domain/policies";
export * from "./domain/ports";
// FAKES en memoria de los puertos (para pruebas de dominio y para 009.2 hasta
// que aterricen los adaptadores concretos de persistencia).
export * from "./infrastructure/fakes";
export { ordenesModule, type ModuleAdapters } from "./module";
export * from "./sincronizacion";
