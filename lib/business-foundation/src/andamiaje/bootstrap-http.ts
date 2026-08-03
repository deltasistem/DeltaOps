/**
 * DGP-006 · Business Foundation Framework — Borde HTTP genérico (andamiaje).
 *
 * Helper reutilizable para la capa fina HTTP → Command/Query del Kernel. Es
 * 100% neutro (sin ningún concepto de negocio) y no depende de Express ni de
 * ningún framework web: solo mapea errores del Kernel a códigos HTTP y
 * construye el ExecutionContext a partir de datos YA autenticados.
 *
 * Reproduce el patrón `statusOf` + `contextFor` del Reference Module
 * (artifacts/api-server/.../reference-module.ts y reference-runtime.ts) pero de
 * forma genérica y testeable en aislamiento.
 */
import {
  createExecutionContext,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";

/**
 * Traduce un KernelError al código HTTP correspondiente:
 *   - auth (KRN-AUTH-*)   → 403
 *   - not-found (KRN-NF-*) → 404
 *   - conflict (KRN-CFL-*) → 409
 *   - validation (KRN-VAL-*) → 400
 *   - resto                → 500
 *
 * Se prioriza el `code` estable; si no coincide, se usa el `kind` como red de
 * seguridad para errores futuros de la taxonomía.
 */
export function statusOf(err: KernelError): number {
  if (err.code.startsWith("KRN-AUTH")) return 403;
  if (err.code.startsWith("KRN-NF")) return 404;
  if (err.code.startsWith("KRN-CFL")) return 409;
  if (err.code.startsWith("KRN-VAL")) return 400;
  // Red de seguridad por categoría (kind) para códigos no contemplados arriba.
  switch (err.kind) {
    case "unauthorized":
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "validation":
      return 400;
    default:
      return 500;
  }
}

/** Cuerpo JSON estándar de un error HTTP del borde. */
export interface CuerpoErrorHttp {
  readonly error: string;
  readonly code: string;
}

/** Respuesta HTTP resuelta a partir de un Result del Kernel. */
export interface RespuestaHttp {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Convierte un Result del Kernel en una RespuestaHttp neutra:
 *   - éxito  → 200 con el valor
 *   - fallo  → statusOf(error) con { error, code }
 *
 * No escribe en ningún objeto Response: devuelve datos puros para que el
 * adaptador web concreto (Express u otro) los envíe. Función pura y testeable.
 */
export function resolverHttp(r: Result<unknown, KernelError>): RespuestaHttp {
  if (r.ok) return { status: 200, body: r.value };
  const body: CuerpoErrorHttp = { error: r.error.message, code: r.error.code };
  return { status: statusOf(r.error), body };
}

/** Rol → permisos/capacidades ya resueltos por el borde autenticador. */
export interface PrincipalResuelto {
  readonly permisos: readonly string[];
  readonly capacidades?: readonly string[];
}

/** Datos de identidad ya autenticados que produce el borde (sesión, JWT, ...). */
export interface DatosAutenticados {
  /** Identificador del actor (usuario/servicio). */
  readonly actorId: string;
  /** Rol del actor. */
  readonly rol: string;
  /** Tenant activo de la petición. */
  readonly tenantId: string;
  /** Permisos y capacidades ya resueltos para ese rol. */
  readonly principal: PrincipalResuelto;
  /** Correlación entrante opcional (para propagar traza). */
  readonly correlationId?: string;
}

/**
 * Construye un ExecutionContext a partir de datos YA autenticados. El principal
 * se arma con id+rol y sus permisos/capacidades; el tenant viaja en `metadata`
 * (lo consume `tenantOf` de la plataforma). El Kernel NO conoce usuarios de
 * dominio: solo este principal abstracto.
 */
export function contextoDesdeAutenticacion(datos: DatosAutenticados): ExecutionContext {
  const principal: Principal = {
    id: datos.actorId,
    rol: datos.rol,
    permisos: datos.principal.permisos,
    capacidades: datos.principal.capacidades ?? [],
  };
  return createExecutionContext({
    principal,
    correlationId: datos.correlationId,
    metadata: { tenantId: datos.tenantId },
  });
}
