import type { ErrorRequestHandler } from "express";
import { recordDeltaopsError } from "./metrics";

/**
 * DeltaOps · DGP-001 — Manejo centralizado de errores.
 * Todo error no manejado de las rutas DeltaOps termina aquí: se registra
 * estructurado, se cuenta en métricas y se responde con contrato uniforme
 * { error } sin filtrar detalles internos en producción.
 */
export class DeltaopsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeltaopsHttpError";
  }
}

export const deltaopsErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  _next,
) => {
  const status = err instanceof DeltaopsHttpError ? err.status : 500;
  if (status >= 500) {
    recordDeltaopsError();
    req.log.error({ err }, "Error no manejado en DeltaOps");
  } else {
    req.log.warn({ err: err.message, status }, "Error de solicitud DeltaOps");
  }
  const message =
    status >= 500 && process.env.NODE_ENV === "production"
      ? "Error interno de la plataforma"
      : err.message || "Error interno de la plataforma";
  res.status(status).json({ error: message });
};
