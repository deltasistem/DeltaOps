/**
 * DGP-019.1 · Runtime del Módulo de Utilización, Medidores y Combustible en el
 * API Server. Singleton Kernel + Plataforma + Módulo (SIN Workflow Engine) con
 * adaptadores PostgreSQL reales. Mismo patrón que correctivo-runtime pero sin
 * motor de workflow ni colaboradores de inventario/órdenes.
 *
 * COLABORACIÓN CROSS-MÓDULO (capa de integración, jamás comandos anidados):
 *  - `activosPort`: valida EXISTENCIA de activos (`modulo.activos.detalle`) y
 *    PROPAGA los valores de medidor válidos a Activos vía los comandos OFICIALES
 *    `modulo.activos.actualizar-horometro` / `actualizar-odometro`. El detalle da
 *    la `version` (control optimista) y el último valor de cada medidor para que
 *    la sincronización "gane la más reciente". FAIL-SAFE: ante fallo del
 *    colaborador, la orquestación NO asume el efecto.
 */
import { pool } from "@workspace/db";
import {
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearUtilizacionRuntimeOperacional,
  MODULO,
  PERMISOS_MODULO,
  type ActivosPort,
  type ActualizarMedidorInput,
  type DetalleActivo,
  type ResultadoActualizacionActivo,
  type UtilizacionRuntimeOperacional,
} from "@workspace/module-utilizacion";
import { DELTAOPS_TENANT } from "./reference-runtime";
import { activosRuntime, contextForActivos } from "./activos-runtime";

let runtime: UtilizacionRuntimeOperacional | null = null;

/** Forma pública (parcial) de la lectura de medidor en el detalle de Activos. */
type MedicionRemota = { valor?: number; unidad?: string; fecha?: string } | null | undefined;

function medicionDe(m: MedicionRemota): DetalleActivo["horometro"] {
  if (!m || typeof m.valor !== "number") return null;
  return { valor: m.valor, unidad: String(m.unidad ?? ""), medidoAt: m.fecha ? String(m.fecha) : null };
}

/**
 * Puerto de Activos (fail-safe): existencia + detalle (versión/medidores) y los
 * comandos OFICIALES de actualización de horómetro/odómetro. Mapea el
 * `ActualizarMedidorInput` del módulo al contrato de Activos
 * (`{ id, expectedVersion, opId?, medicion: { valor, unidad, fecha } }`).
 */
const activosPort: ActivosPort = {
  async existen(tenantId, activoIds): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    const ctxA = contextForActivos("system", "lector", tenantId);
    const inexistentes: string[] = [];
    for (const id of activoIds) {
      const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id });
      if (!r.ok) {
        if (r.error.code === "KRN-NF-001") { inexistentes.push(id); continue; }
        return r as Result<never, KernelError>;
      }
    }
    return ok({ inexistentes });
  },
  async detalle(tenantId, activoId): Promise<Result<DetalleActivo | null, KernelError>> {
    const ctxA = contextForActivos("system", "lector", tenantId);
    // El comando de Activos aplica control optimista contra la versión del
    // MODELO DE ESCRITURA (`act_activos.version`), mientras que `detalle` lee
    // la versión del MODELO DE LECTURA (`act_activos_read.version`), que se
    // proyecta de forma asíncrona vía outbox. Si la proyección va atrasada, el
    // `expectedVersion` sale desactualizado ⇒ KRN-CFL-001. Drenamos el outbox
    // ANTES de leer para que la versión de lectura converja con la de escritura
    // (§4.1: releer la versión vigente y fresca antes de propagar). Idempotente.
    await activosRuntime().platform.kernel.outboxProcessor.processPending();
    const r = await activosRuntime().platform.kernel.queries.execute(ctxA, "modulo.activos.detalle", { id: activoId });
    if (!r.ok) {
      if (r.error.code === "KRN-NF-001") return ok(null);
      return r as Result<never, KernelError>;
    }
    const row = r.value as { version?: number; horometro?: MedicionRemota; odometro?: MedicionRemota } | null;
    if (!row) return ok(null);
    return ok({
      version: Number(row.version ?? 1),
      horometro: medicionDe(row.horometro),
      odometro: medicionDe(row.odometro),
    });
  },
  actualizarHorometro: (tenantId, actorId, input) => actualizarMedidor(tenantId, actorId, "actualizar-horometro", input),
  actualizarOdometro: (tenantId, actorId, input) => actualizarMedidor(tenantId, actorId, "actualizar-odometro", input),
};

/** Compone el comando oficial de Activos y drena su outbox tras el efecto. */
async function actualizarMedidor(
  tenantId: string,
  actorId: string,
  comando: "actualizar-horometro" | "actualizar-odometro",
  input: ActualizarMedidorInput,
): Promise<Result<ResultadoActualizacionActivo, KernelError>> {
  const ctxA = contextForActivos(actorId, "admin", tenantId);
  const r = await activosRuntime().platform.kernel.commands.execute(ctxA, `modulo.activos.${comando}`, {
    id: input.activoId,
    expectedVersion: input.expectedVersion,
    ...(input.opId ? { opId: input.opId } : {}),
    medicion: { valor: input.valor, unidad: input.unidad, fecha: input.fecha },
  });
  if (!r.ok) return r as Result<never, KernelError>;
  await activosRuntime().platform.kernel.outboxProcessor.processPending();
  const v = r.value as { version?: number };
  if (typeof v.version !== "number") return fail(KernelErrors.infrastructure(`modulo.activos.${comando} no devolvió version`, {}));
  return ok({ version: v.version });
}

export function utilizacionRuntime(): UtilizacionRuntimeOperacional {
  if (!runtime) {
    runtime = crearUtilizacionRuntimeOperacional({ pool, activos: activosPort });
  }
  return runtime;
}

const PLATFORM_PERMISSIONS = [...new Set(officialServices().flatMap((s) => [...s.permissions]))];
const MODULE_PERMISSIONS = [...PERMISOS_MODULO];

// Nombres canónicos de permisos del módulo (capacidades del mandato).
const P_LEER = `${MODULO}.leer`;
const P_LECT_REGISTRAR = `${MODULO}.lecturas.registrar`;
const P_LECT_ANULAR = `${MODULO}.lecturas.anular`;
const P_TANQ_REGISTRAR = `${MODULO}.tanqueos.registrar`;
const P_TANQ_ANULAR = `${MODULO}.tanqueos.anular`;
const P_REGULARIZAR = `${MODULO}.medidores.regularizar`;

/**
 * Mapa rol → permisos (RBAC del mandato):
 *  - TENANT_ADMIN / admin / platform_admin: TODO.
 *  - SUPERVISOR: leer + registrar/anular (ambos) + regularizar.
 *  - PLANIFICADOR: sólo leer.
 *  - TECNICO: leer + registrar (lecturas y tanqueos).
 *  - CONSULTA / lector: sólo leer.
 */
export function principalUtilizacion(userId: string, rol: string): Principal {
  const r = rol.toUpperCase();
  const platformLectura = ["platform.timeline.read", "platform.config.read"];
  if (r === "TENANT_ADMIN" || r === "ADMIN" || r === "PLATFORM_ADMIN") {
    return {
      id: userId,
      rol,
      permisos: [...PLATFORM_PERMISSIONS, ...MODULE_PERMISSIONS],
      capacidades: [
        "leer", "lecturas.registrar", "lecturas.anular",
        "tanqueos.registrar", "tanqueos.anular", "medidores.regularizar",
      ],
    };
  }
  if (r === "SUPERVISOR") {
    return {
      id: userId,
      rol,
      permisos: [P_LEER, P_LECT_REGISTRAR, P_LECT_ANULAR, P_TANQ_REGISTRAR, P_TANQ_ANULAR, P_REGULARIZAR, ...platformLectura],
      capacidades: ["leer", "lecturas.registrar", "lecturas.anular", "tanqueos.registrar", "tanqueos.anular", "medidores.regularizar"],
    };
  }
  if (r === "TECNICO") {
    return {
      id: userId,
      rol,
      permisos: [P_LEER, P_LECT_REGISTRAR, P_TANQ_REGISTRAR, ...platformLectura],
      capacidades: ["leer", "lecturas.registrar", "tanqueos.registrar"],
    };
  }
  // PLANIFICADOR, CONSULTA, lector y cualquier otro: sólo lectura.
  return {
    id: userId,
    rol,
    permisos: [P_LEER, ...platformLectura],
    capacidades: ["leer"],
  };
}

export function contextForUtilizacion(userId: string, rol: string, tenant: string = DELTAOPS_TENANT): ExecutionContext {
  return createExecutionContext({
    principal: principalUtilizacion(userId, rol),
    metadata: { tenantId: tenant },
  });
}
