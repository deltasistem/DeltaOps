/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain
 * (`@workspace/module-abastecimiento`).
 *
 * Superficie pública del paquete. ETAPA 1: dominio puro + servicio
 * `modulo.abastecimiento` con FAKES en memoria y runtime de pruebas. La
 * persistencia real (PostgreSQL / read models CQRS / OpenAPI / UI) y la
 * orquestación cross-módulo (Inventario / Órdenes / Planes) llegan en la ETAPA 2.
 */
export * from "./module-name";

/* --------------------------------- Dominio ------------------------------- */
export * from "./domain/catalogos";
export * from "./domain/events";
export * from "./domain/workflow";
export * from "./domain/value-objects";
export * from "./domain/cost-engine";
export * from "./domain/articulo";
export * from "./domain/proveedor";
export * from "./domain/solicitud";
export * from "./domain/cotizacion";
export * from "./domain/orden-compra";
export * from "./domain/recepcion";
export * from "./domain/integraciones";
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
export { abastecimientoModule, type ModuleAdapters } from "./module";

/* ---------------------- Runtime operativo (ETAPA 2) ---------------------- */
export {
  crearAbastecimientoRuntimeOperacional,
  type AbastecimientoRuntimeOptions,
  type AbastecimientoRuntimeOperacional,
} from "./runtime";

/* -------------------------------- Pruebas -------------------------------- */
export * from "./test-runtime";
