/**
 * DGP-009.2 · Runtime del Módulo Órdenes de Trabajo en el API Server.
 * Singleton Kernel + Plataforma + Módulo Órdenes con adaptadores PostgreSQL
 * reales. Mismo patrón que activos-runtime (DGP-008) y reference-runtime (DGP-004).
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  ordenesModule,
  crearOrdenesRuntime,
  type IdentidadElegible,
  type IdentidadPort,
  type IdentidadVerificada,
  type OrdenesRuntime,
} from "@workspace/module-ordenes";
import { membresia, obtenerIdentidad, listarUsuariosDeTenant } from "../../deltaops/identity/service";
import { DELTAOPS_TENANT } from "./reference-runtime";

/**
 * DGP-020.1 · Adaptador de PRODUCCIÓN del puerto de Identidad de Órdenes.
 * Órdenes NUNCA accede a las tablas de Identidad: usa exclusivamente las
 * consultas PÚBLICAS del servicio de Identidad (DGP-017). El aislamiento
 * cross-tenant es DOBLE: `membresia(identityId, tenantId)` sólo devuelve la
 * membresía si la identidad pertenece a ESE tenant; y `elegibles` usa
 * `listarUsuariosDeTenant` (tenant-scoped por membresía).
 */
const identidadPort: IdentidadPort = {
  async verificar(tenantId: string, identityId: string): Promise<Result<IdentidadVerificada | null, KernelError>> {
    try {
      const m = await membresia(identityId, tenantId);
      if (!m) return ok(null); // inexistente o de otro tenant ⇒ null (aislamiento)
      const idn = await obtenerIdentidad(identityId);
      if (!idn) return ok(null);
      return ok({
        identityId: idn.identityId,
        tenantId,
        nombre: idn.nombre,
        email: idn.email,
        estado: idn.estado,
        estadoMembresia: m.estado,
        rol: m.rol,
      });
    } catch (err) {
      return { ok: false, error: KernelErrors.infrastructure("verificación de identidad falló", err) } as Result<never, KernelError>;
    }
  },
  async elegibles(tenantId: string, filtro?: { q?: string }): Promise<Result<IdentidadElegible[], KernelError>> {
    try {
      const usuarios = await listarUsuariosDeTenant(tenantId, { q: filtro?.q, estado: "ACTIVO" });
      const rows: IdentidadElegible[] = usuarios
        .filter((u) => u.estado === "ACTIVO")
        .map((u) => ({
          identityId: u.identityId,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          estadoMembresia: u.estadoMembresia,
        }));
      return ok(rows);
    } catch (err) {
      return { ok: false, error: KernelErrors.infrastructure("listado de identidades elegibles falló", err) } as Result<never, KernelError>;
    }
  },
};

let runtime: OrdenesRuntime | null = null;

export function ordenesRuntime(): OrdenesRuntime {
  if (!runtime) runtime = crearOrdenesRuntime({ pool, identidad: identidadPort });
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [
  ...ordenesModule({
    repository: null as never,
    catalogos: null as never,
    consecutivo: null as never,
    recibos: null as never,
    plantillas: null as never,
    identidad: null as never,
    readModel: null as never,
    eventLog: null as never,
    proyecciones: null as never,
    motor: null as never,
    syncReceipts: null as never,
    consola: null as never,
    sesiones: null as never,
  }).permissions,
];

/** Mapa rol → permisos (admin: todo; operador: sin admin; lector: lectura). */
export function principalOrdenes(userId: string, rol: string): Principal {
  // Permisos de Dynamic Forms necesarios para la ejecución de la OT:
  //  - plantilla.read: RENDERIZAR la plantilla asociada (clave+versión exacta).
  //  - respuesta.write/enviar: CAPTURAR y enviar la respuesta del checklist/
  //    formulario asociado, obteniendo un respuestaId que ancla la asociación.
  //  - respuesta.read: consultar el anclaje.
  const FORMS_READ = "modulo.formularios.plantilla.read";
  const RESP_READ = "modulo.formularios.respuesta.read";
  const RESP_WRITE = "modulo.formularios.respuesta.write";
  const RESP_SEND = "modulo.formularios.respuesta.enviar";
  if (rol === "admin" || rol === "platform_admin") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS, FORMS_READ, RESP_READ, RESP_WRITE, RESP_SEND],
      capacidades: ["gestionar-ordenes", "ejecutar-ordenes", "validar-ordenes", "administrar-ordenes"],
    };
  }
  if (rol === "operador") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.ordenes.admin"),
        "platform.attachment.read", "platform.attachment.write",
        "platform.timeline.read", "platform.config.read",
        FORMS_READ, RESP_READ, RESP_WRITE, RESP_SEND,
      ],
      capacidades: ["gestionar-ordenes", "ejecutar-ordenes"],
    };
  }
  return {
    id: userId,
    rol,
    permisos: [
      "modulo.ordenes.read", "platform.timeline.read",
      "platform.attachment.read", "platform.config.read",
      FORMS_READ, RESP_READ,
    ],
    capacidades: [],
  };
}

export function contextForOrdenes(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalOrdenes(userId, rol),
    metadata: { tenantId: tenant },
  });
}
