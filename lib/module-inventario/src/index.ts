/**
 * DGP-011.1 · Módulo Enterprise Inventory (@workspace/module-inventario)
 * — API pública (dominio + aplicación).
 *
 * SOLO dominio/aplicación: aggregates, objetos de valor, catálogos configurables
 * por tenant, modelo de stock con invariantes, movimientos SOLO por eventos,
 * lotes/series/vencimientos/trazabilidad, reservas, transferencias/ajustes/
 * conteos PREPARADOS por contratos de workflow, policies ligadas a comandos,
 * permisos/capacidades granulares y offline-first con recibos de idempotencia.
 * SIN persistencia real, read models, OpenAPI/UI/dashboards ni motor de
 * workflow (llegan por adaptador en fases posteriores).
 */
export * from "./module-name";
export * from "./domain/value-objects";
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/stock";
export * from "./domain/workflow";
export * from "./domain/item";
export * from "./domain/inventario";
export * from "./domain/bodega";
export * from "./domain/lote-serie";
export * from "./domain/reserva";
export * from "./domain/transferencia";
export * from "./domain/ajuste";
export * from "./domain/conteo";
export * from "./domain/policies";
export * from "./domain/ports";
// FAKES en memoria de los puertos (pruebas de dominio y harness).
export * from "./infrastructure/fakes";
export { inventarioModule, type ModuleAdapters } from "./module";
export {
  crearInventarioRuntime,
  WorkflowPruebaAprobado,
  WorkflowPruebaRechazo,
  WorkflowPruebaRechazoTransicion,
  type CrearRuntimeOpts,
  type InventarioRuntime,
} from "./test-runtime";
// DGP-011.2 · Persistencia, CQRS y runtime OPERATIVO.
export {
  crearInventarioRuntimeOperacional,
  type InventarioRuntimeOptions,
  type InventarioRuntimeOperacional,
} from "./runtime";
export {
  procesarCola,
  OperacionSyncSchema,
  ColaSyncSchema,
  type OperacionSync,
  type ResultadoSync,
  type ResumenSync,
  type EstadoSync,
} from "./sincronizacion";
export * from "./infrastructure/repository";
export * from "./infrastructure/operacional";
export { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
export {
  aplicarEventoAggregate,
  aplicarEventoOperacional,
  handlerProyeccion,
} from "./projection";
export { construirOpenApi, serializarOpenApi } from "./openapi/spec";
