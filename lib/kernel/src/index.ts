/**
 * DeltaOps Kernel · Barril público.
 * Los módulos de dominio importan SOLO desde "@workspace/kernel".
 */
export * from "./result";
export * from "./errors";
export * from "./context";
export * from "./ports";
export * from "./container";
export * from "./config";
export * from "./auth";
export * from "./telemetry";
export * from "./pipeline";
export * from "./events/types";
export * from "./events/dispatcher";
export * from "./events/outbox";
export * from "./adapters/memory";
export * from "./adapters/pg";
export * from "./runtime";
