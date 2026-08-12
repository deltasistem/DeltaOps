/**
 * DGP-020.3 · Fundación de Mano de Obra (@workspace/module-manodeobra) — Barril.
 *
 * Composición pura sobre contratos públicos congelados (DGP-014/016). Fuente
 * única de tiempo: sesiones DGP-020.2 (`efectivoMs` = autoridad). Determina de
 * forma auditable quién trabajó, en qué OT, sobre qué activo, cuánto tiempo
 * efectivo, categoría, tarifa vigente, costo derivado, tenant, momento y fuente.
 */
export * from "./module-name";
export * from "./domain/catalogos";
export * from "./domain/dinero";
export * from "./domain/events";
export * from "./domain/recurso";
export * from "./domain/tarifa";
export * from "./domain/valoracion";
export * from "./domain/ports";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./infrastructure/catalogo-service";
export * from "./infrastructure/fakes";
export * from "./infrastructure/repository";

/* --------------------------------- Servicio ------------------------------ */
export {
  manodeobraModule,
  TABLAS_RLS_MODULO,
  type ModuleAdapters,
  type EventLogPort,
} from "./module";

/* --------------------------------- Runtime ------------------------------- */
export {
  crearManodeobraRuntime,
  type ManodeobraRuntime,
  type ManodeobraRuntimeOptions,
} from "./runtime";
