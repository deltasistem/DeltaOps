/**
 * DGP-007 · Workflow & Dynamic Forms Engine — Workflow Engine (barril público).
 *
 * Motor de workflow oficial de DeltaOps, neutro (cero vocabulario de negocio) y
 * reutilizable. Reutiliza estrictamente Kernel, Shared Platform y Business
 * Foundation. Los consumidores importan SOLO desde `@workspace/workflow-engine`.
 */
export * from "./condiciones";
export * from "./definicion";
export * from "./aprobaciones";
export * from "./instancia";
export * from "./motor";
export * from "./registro";
export * from "./validacion";
export * from "./sincronizacion";
export * from "./modulo";
export * from "./runtime";
