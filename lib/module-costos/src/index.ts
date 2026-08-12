/**
 * DGP-021.1 · Fundación del Módulo de Costos (@workspace/module-costos) — Barril.
 *
 * Composición pura sobre contratos públicos congelados. Materializa HECHOS
 * ECONÓMICOS de mantenimiento (exactos, auditables, multitenant) con SNAPSHOT
 * inmutable y estados ACTIVO/ANULADO. NO calcula agregados/KPIs ni duplica las
 * fuentes de verdad de mano de obra, combustible o materiales.
 */
export * from "./module-name";
export * from "./domain/dinero";
export * from "./domain/events";
export * from "./domain/hecho";
export * from "./domain/ports";

/* ------------------------------ Infraestructura -------------------------- */
export * from "./infrastructure/fakes";
export * from "./infrastructure/repository";

/* --------------------------------- Servicio ------------------------------ */
export {
  costosModule,
  TABLAS_RLS_MODULO,
  type ModuleAdapters,
  type EventLogPort,
} from "./module";

/* --------------------------------- Runtime ------------------------------- */
export {
  crearCostosRuntime,
  type CostosRuntime,
  type CostosRuntimeOptions,
} from "./runtime";
