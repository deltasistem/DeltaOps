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
import { aRolCanonico } from "../../deltaops/identity/rbac";
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

/**
 * Mapa rol → permisos/capacidades del Módulo Órdenes.
 *
 * DGP-020.2 · La verificación de asignación para ABRIR sesión (§6) admite UNA
 * excepción: supervisor/administrador "según capacidades existentes". El colapso
 * legacy hace que SUPERVISOR, PLANIFICADOR y TECNICO compartan el rol de espejo
 * `operador`; por eso NO podemos derivar la excepción del bucket legacy (haría
 * que PLANIFICADOR/TECNICO no asignados saltaran la verificación — bug §27/§38).
 * Normalizamos al ROL CANÓNICO (`aRolCanonico`, misma fuente que Utilización) y
 * concedemos las capacidades administrativas EXISTENTES (`validar-ordenes` /
 * `administrar-ordenes` y el permiso `modulo.ordenes.validar`) SÓLO a los roles
 * realmente elevados (TENANT_ADMIN/SUPER_ADMIN y SUPERVISOR). PLANIFICADOR y
 * TECNICO conservan la operación (`.operar`/`.write`) pero NO el bypass: si no
 * están asignados, abrir sesión ⇒ 403 de negocio.
 */
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
  const canonico = aRolCanonico(rol);

  // GATE DE CIERRE GOBERNADO (contrato CONGELADO de Órdenes): la máquina de
  // estados declara `aprobadores: ["validador"]` para la transición `cerrar`, y
  // el motor de workflow decide por `principal.rol` (o `principal.id`). DeltaOps
  // NO tiene un rol canónico «validador»; su equivalente son los roles ELEVADOS
  // con capacidad `validar-ordenes` (TENANT_ADMIN/SUPER_ADMIN/SUPERVISOR). Este
  // adaptador de autorización —cuya función es TRADUCIR la identidad al vocabulario
  // del módulo— presenta a esos principales con `rol: "validador"` ANTE EL MOTOR,
  // sin tocar la máquina de estados, el motor ni el modelo de identidad. Es seguro:
  // dentro del módulo, `principal.rol` SÓLO lo consume este gate de aprobación; el
  // resto de la lógica (incl. la excepción §6 al abrir sesión) decide por
  // capacidades/permisos (`esSupervisorOAdmin`), nunca por `rol`.
  const ROL_APROBADOR_CIERRE = "validador";

  if (canonico === "TENANT_ADMIN" || canonico === "SUPER_ADMIN") {
    return {
      id: userId,
      rol: ROL_APROBADOR_CIERRE,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS, FORMS_READ, RESP_READ, RESP_WRITE, RESP_SEND],
      capacidades: ["gestionar-ordenes", "ejecutar-ordenes", "validar-ordenes", "administrar-ordenes"],
    };
  }

  // SUPERVISOR: gestión operativa completa CON la excepción §6 (validar/cerrar
  // gobernado). Mantiene `modulo.ordenes.validar` y la capacidad `validar-ordenes`
  // que habilita el bypass legítimo de asignación al abrir sesión, y actúa como
  // aprobador del gate de cierre (rol `validador` ante el motor, ver nota arriba).
  if (canonico === "SUPERVISOR") {
    return {
      id: userId,
      rol: ROL_APROBADOR_CIERRE,
      permisos: [
        ...MODULE_PERMISSIONS.filter((p) => p !== "modulo.ordenes.admin"),
        "platform.attachment.read", "platform.attachment.write",
        "platform.timeline.read", "platform.config.read",
        FORMS_READ, RESP_READ, RESP_WRITE, RESP_SEND,
      ],
      capacidades: ["gestionar-ordenes", "ejecutar-ordenes", "validar-ordenes"],
    };
  }

  // PLANIFICADOR / TECNICO: operan el ciclo de vida y registran ejecución, pero
  // SIN capacidades administrativas ⇒ SIN bypass de asignación (§6). Se les retira
  // `modulo.ordenes.validar` y `modulo.ordenes.admin` para que `esSupervisorOAdmin`
  // no los eleve. Un no-asignado que intente abrir sesión recibe 403 de negocio.
  if (canonico === "PLANIFICADOR" || canonico === "TECNICO") {
    return {
      id: userId,
      rol,
      permisos: [
        ...MODULE_PERMISSIONS.filter(
          (p) => p !== "modulo.ordenes.admin" && p !== "modulo.ordenes.validar",
        ),
        "platform.attachment.read", "platform.attachment.write",
        "platform.timeline.read", "platform.config.read",
        FORMS_READ, RESP_READ, RESP_WRITE, RESP_SEND,
      ],
      capacidades: ["gestionar-ordenes", "ejecutar-ordenes"],
    };
  }

  // CONSULTA y cualquier otro: sólo lectura.
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

/**
 * Construye el contexto de ejecución del Módulo Órdenes.
 *
 * `userId` es el ID ESPEJO legacy (deltaops.users.id) que alimenta `principal.id`
 * (compat con permisos/recibos existentes). La IDENTIDAD CANÓNICA autenticada
 * (idn_identities.identity_id) se propaga por separado en `metadata.identityId`,
 * y es la ÚNICA que el dominio usa para atribuir sesiones de trabajo y verificar
 * asignaciones (DGP-020.1/020.2). Si no hay identidad canónica en la sesión, se
 * omite y los comandos de sesión fallarán CERRADO.
 */
export function contextForOrdenes(
  userId: string,
  rol: string,
  tenant: string = DELTAOPS_TENANT,
  identityId?: string,
): ExecutionContext {
  const metadata: Record<string, unknown> = { tenantId: tenant };
  if (identityId) metadata["identityId"] = identityId;
  return createExecutionContext({
    principal: principalOrdenes(userId, rol),
    metadata,
  });
}
