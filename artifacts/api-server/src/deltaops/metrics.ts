import type { NextFunction, Request, Response } from "express";

/**
 * DeltaOps · DGP-001 — Observabilidad mínima.
 * Contadores en memoria del proceso: solicitudes, errores y latencia media.
 * Derivados, nunca declarados; expuestos vía /deltaops/platform/metrics.
 */
const startedAt = Date.now();
let requestCount = 0;
let errorCount = 0;
let totalDurationMs = 0;

export function deltaopsMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    requestCount += 1;
    totalDurationMs += Number(process.hrtime.bigint() - start) / 1e6;
    if (res.statusCode >= 500) {
      errorCount += 1;
    }
  });
  next();
}

export function recordDeltaopsError(): void {
  errorCount += 1;
}

export function getDeltaopsMetrics(): {
  uptimeSeconds: number;
  requestCount: number;
  errorCount: number;
  avgResponseTimeMs: number | null;
} {
  return {
    uptimeSeconds: (Date.now() - startedAt) / 1000,
    requestCount,
    errorCount,
    avgResponseTimeMs:
      requestCount > 0
        ? Math.round((totalDurationMs / requestCount) * 100) / 100
        : null,
  };
}
