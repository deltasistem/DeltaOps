/**
 * DGP-007 · Workflow Engine — Transition Engine (comandos de instancia).
 *
 * Genera, a partir de una `DefinicionWorkflow`, las fábricas de CommandDefinition
 * de la instancia:
 *   - <servicio>.instancia.iniciar
 *   - <servicio>.instancia.transicionar
 *   - <servicio>.instancia.cancelar | reabrir | suspender | reanudar
 *   - <servicio>.instancia.aprobar | rechazar | delegar
 *   - <servicio>.instancia.expirarAprobaciones   (idempotente, sin timers)
 *
 * Todo pasa por el Kernel: `authorize` (permiso/capacidad/policy vía
 * AuthorizationRuntime), Zod, UoW, outbox y auditoría; y por RecordStorePort
 * (multitenancy + RLS). Cada transición ejecuta sus acciones declarativas en la
 * MISMA UoW y emite `<servicio>.instancia.transicionada` con payload completo.
 * Versionado optimista + `opId` en todo comando (Offline First).
 *
 * 100% neutro: cero vocabulario de negocio.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  KernelTokens,
  ok,
  type CommandDefinition,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  aprobacionDe,
  aprobadorEfectivo,
  aplicarVencimiento,
  guardarAprobacion,
  iniciarAprobacion,
  leerAprobaciones,
  resolverEstado,
  turnoSecuencial,
  type DefinicionAprobacionTransicion,
  type EstadoAprobacion,
  type RegistroAprobacion,
} from "./aprobaciones";
import {
  COMANDO_CANCELAR,
  COMANDO_REABRIR,
  COMANDO_REANUDAR,
  COMANDO_SUSPENDER,
  operacionesEstandarEfectivas,
  type AccionDeclarativa,
  type DefinicionWorkflow,
  type TransicionWorkflow,
} from "./definicion";
import {
  ASIGNADO_KEY,
  RuntimeInstancia,
  SOLICITANTE_KEY,
  VERSION_DEF_KEY,
  WORKFLOW_KEY,
  type RegistroInstancia,
  type TransicionResuelta,
} from "./instancia";

/* ------------------------- Constantes de servicio ------------------------- */

export const RECORD_TYPE_INSTANCIA = "instancia";
const OP_IDS_KEY = "_opIds";
const MAX_OP_IDS = 50;

const NOTIFICATION_SERVICE = "platform.notification";
const NOTIFICATION_RECORD = "notification";

/** Nombres canónicos de los comandos/eventos de instancia de un servicio. */
export function nombresInstancia(servicio: string): {
  iniciar: string;
  transicionar: string;
  cancelar: string;
  reabrir: string;
  suspender: string;
  reanudar: string;
  aprobar: string;
  rechazar: string;
  delegar: string;
  expirar: string;
  obtener: string;
  listar: string;
  transicionada: string;
  iniciada: string;
  aprobacionSolicitada: string;
  aprobacionResuelta: string;
  escalada: string;
} {
  const base = `${servicio}.instancia`;
  return {
    iniciar: `${base}.iniciar`,
    transicionar: `${base}.transicionar`,
    cancelar: `${base}.cancelar`,
    reabrir: `${base}.reabrir`,
    suspender: `${base}.suspender`,
    reanudar: `${base}.reanudar`,
    aprobar: `${base}.aprobar`,
    rechazar: `${base}.rechazar`,
    delegar: `${base}.delegar`,
    expirar: `${base}.expirarAprobaciones`,
    obtener: `${base}.obtener`,
    listar: `${base}.listar`,
    transicionada: `${base}.transicionada`,
    iniciada: `${base}.iniciada`,
    aprobacionSolicitada: `${base}.aprobacion-solicitada`,
    aprobacionResuelta: `${base}.aprobacion-resuelta`,
    escalada: `${base}.aprobacion-escalada`,
  };
}

/** Todos los tipos de evento de la instancia de workflow. */
export function eventosInstancia(servicio: string): readonly string[] {
  const n = nombresInstancia(servicio);
  return [n.iniciada, n.transicionada, n.aprobacionSolicitada, n.aprobacionResuelta, n.escalada];
}

/* -------------------------------- opId ------------------------------------ */

function opIdsDe(data: Record<string, unknown>): string[] {
  const raw = data[OP_IDS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}
function conOpId(data: Record<string, unknown>, opId?: string): Record<string, unknown> {
  if (!opId) return data;
  const previos = opIdsDe(data);
  if (previos.includes(opId)) return data;
  return { ...data, [OP_IDS_KEY]: [...previos, opId].slice(-MAX_OP_IDS) };
}
function opIdAplicado(data: Record<string, unknown>, opId?: string): boolean {
  return !!opId && opIdsDe(data).includes(opId);
}

/* ------------------------------- Payload ---------------------------------- */

function payloadInstancia(
  servicio: string,
  r: RegistroInstancia,
  actorId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tenantId: r.tenantId,
    id: r.id,
    entityRef: `${servicio}.${RECORD_TYPE_INSTANCIA}:${r.id}`,
    recordType: RECORD_TYPE_INSTANCIA,
    estado: r.estado,
    version: r.version,
    data: r.data,
    createdBy: r.createdBy,
    actualizadoAt: r.updatedAt.toISOString(),
    actorId,
    ...extra,
  };
}

/* -------------------------- Config de la fábrica -------------------------- */

export interface OpcionesMotor {
  /** Servicio propietario, p. ej. `flujo.demo`. */
  readonly servicio: string;
  /** Permiso base de lectura de instancias. */
  readonly permisoLeer: string;
  /** Permiso base de escritura (iniciar/transicionar). */
  readonly permisoEscribir: string;
  /**
   * Resolutor de la definición ACTIVA (o por versión) para un tenant. Permite a
   * `registro.ts` inyectar definiciones publicadas como datos. Por defecto se
   * usa una definición fija (útil en tests unitarios del motor).
   */
  readonly resolverDefinicion: (
    deps: ServiceDeps,
    tenantId: string,
    versionDef?: number,
  ) => Promise<Result<{ def: DefinicionWorkflow; version: number }, KernelError>>;
}

/* ----------------------------- Acciones ----------------------------------- */

async function ejecutarAcciones(
  deps: ServiceDeps,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  servicio: string,
  tenantId: string,
  registro: RegistroInstancia,
  acciones: readonly AccionDeclarativa[] | undefined,
): Promise<Result<Record<string, unknown>, KernelError>> {
  let data = { ...registro.data };

  for (const accion of acciones ?? []) {
    switch (accion.tipo) {
      case "emitirEvento": {
        uow.registerEvent(
          createDomainEvent(
            `${servicio}.instancia.${accion.evento}`,
            payloadInstancia(servicio, { ...registro, data }, ctx.principal.id, { accion: "emitirEvento" }),
            ctx.correlationId,
          ),
        );
        break;
      }
      case "asignar": {
        const destino = accion.a === "solicitante" ? String(data[SOLICITANTE_KEY] ?? ctx.principal.id) : accion.a;
        data = { ...data, [ASIGNADO_KEY]: destino };
        break;
      }
      case "escalar": {
        const venceEn = new Date(Date.now() + accion.enMinutos * 60_000).toISOString();
        data = { ...data, _escalamiento: { a: accion.a, venceEn } };
        break;
      }
      case "notificar": {
        const destinatario =
          accion.a === "solicitante"
            ? String(data[SOLICITANTE_KEY] ?? ctx.principal.id)
            : accion.a === "asignado"
              ? String(data[ASIGNADO_KEY] ?? ctx.principal.id)
              : accion.a;
        // Mutación multi-registro en la MISMA UoW (nunca comando anidado):
        // se inserta la notificación en el store del servicio de notificaciones.
        const notifId = crypto.randomUUID();
        const inserted = await deps.store.insert(uow, {
          id: notifId,
          tenantId,
          service: NOTIFICATION_SERVICE,
          recordType: NOTIFICATION_RECORD,
          status: "queued",
          data: {
            destinatarios: [destinatario],
            canal: accion.canal ?? "inapp",
            prioridad: "normal",
            asunto: accion.asunto,
            cuerpo: accion.cuerpo,
            origen: `${servicio}.instancia:${registro.id}`,
          },
          createdBy: ctx.principal.id,
        });
        if (!inserted.ok) return inserted;
        break;
      }
    }
  }
  return ok(data);
}

/* ----------------------- Autorización de transición ---------------------- */

function autorizarTransicion(
  deps: ServiceDeps,
  ctx: ExecutionContext,
  transicion: TransicionWorkflow | undefined,
  permisoEstandar: string | undefined,
  data: Record<string, unknown>,
): Result<void, KernelError> {
  const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
  const req: {
    permissions?: string[];
    capabilities?: string[];
    policies?: { name: string; subject?: Record<string, unknown> }[];
  } = {};
  const permisos: string[] = [];
  if (transicion?.permiso) permisos.push(transicion.permiso);
  if (permisoEstandar) permisos.push(permisoEstandar);
  if (permisos.length) req.permissions = permisos;
  if (transicion?.capacidad) req.capabilities = [transicion.capacidad];
  if (transicion?.policy) req.policies = [{ name: transicion.policy, subject: data }];
  if (!req.permissions && !req.capabilities && !req.policies) return ok(undefined);
  return authorization.authorize(ctx, req);
}

/* ----------------------------- Persistencia ------------------------------- */

async function guardarTransicion(
  deps: ServiceDeps,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  servicio: string,
  tenantId: string,
  actual: RegistroInstancia,
  version: number,
  estadoNuevo: string,
  data: Record<string, unknown>,
  comando: string,
): Promise<Result<RegistroInstancia, KernelError>> {
  const updated = await deps.store.update(uow, tenantId, actual.id, version, {
    status: estadoNuevo,
    data,
  });
  if (!updated.ok) return updated;
  const registro: RegistroInstancia = {
    id: updated.value.id,
    tenantId: updated.value.tenantId,
    estado: updated.value.status,
    version: updated.value.version,
    data: updated.value.data,
    createdBy: updated.value.createdBy,
    updatedAt: updated.value.updatedAt,
  };
  const audited = await audit(deps.audit, uow, ctx, tenantId, servicio, `transicionar:${comando}`, actual.id, {
    de: actual.estado,
    a: estadoNuevo,
    version: registro.version,
  });
  if (!audited.ok) return audited;
  uow.registerEvent(
    createDomainEvent(
      nombresInstancia(servicio).transicionada,
      payloadInstancia(servicio, registro, ctx.principal.id, {
        comando,
        estadoAnterior: actual.estado,
      }),
      ctx.correlationId,
    ),
  );
  return ok(registro);
}

function aRegistro(r: {
  id: string;
  tenantId: string;
  status: string;
  version: number;
  data: Record<string, unknown>;
  createdBy: string;
  updatedAt: Date;
}): RegistroInstancia {
  return {
    id: r.id,
    tenantId: r.tenantId,
    estado: r.status,
    version: r.version,
    data: r.data,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt,
  };
}

async function cargar(
  deps: ServiceDeps,
  tenantId: string,
  id: string,
): Promise<Result<RegistroInstancia | null, KernelError>> {
  const found = await deps.store.findById(tenantId, id);
  if (!found.ok) return found;
  return ok(found.value ? aRegistro(found.value) : null);
}

/* -------------------------- Fábrica de comandos --------------------------- */

/**
 * Genera todas las fábricas de comandos de instancia para un servicio. Se
 * inyecta en `extras.comandos` del descriptor del módulo.
 */
export function crearComandosInstancia(
  opts: OpcionesMotor,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  const servicio = opts.servicio;
  const n = nombresInstancia(servicio);

  const resolverPara = (deps: ServiceDeps, tenantId: string, versionDef?: number) =>
    opts.resolverDefinicion(deps, tenantId, versionDef);

  /* ------------------------------ iniciar -------------------------------- */
  const iniciar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.iniciar,
    inputSchema: z.object({
      id: z.string(), // Offline First: crear exige id de cliente.
      opId: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      const previo = await cargar(deps, tenant.value, input.id);
      if (!previo.ok) return previo;
      if (previo.value) {
        return ok({ id: input.id, version: previo.value.version, estado: previo.value.estado, idempotente: true });
      }

      const resuelto = await resolverPara(deps, tenant.value);
      if (!resuelto.ok) return resuelto;
      const runtime = new RuntimeInstancia(resuelto.value.def);

      const base: Record<string, unknown> = {
        ...(input.data ?? {}),
        [SOLICITANTE_KEY]: ctx.principal.id,
        [WORKFLOW_KEY]: resuelto.value.def.clave,
        [VERSION_DEF_KEY]: resuelto.value.version,
      };
      const data = conOpId(base, input.opId);
      const estadoInicial = runtime.estadoInicial();

      const inserted = await deps.store.insert(uow, {
        id: input.id,
        tenantId: tenant.value,
        service: servicio,
        recordType: RECORD_TYPE_INSTANCIA,
        status: estadoInicial,
        data,
        createdBy: ctx.principal.id,
      });
      if (!inserted.ok) return inserted;
      const registro = aRegistro(inserted.value);
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "iniciar", input.id, {
        estado: estadoInicial,
        version: resuelto.value.version,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(
        createDomainEvent(n.iniciada, payloadInstancia(servicio, registro, ctx.principal.id), ctx.correlationId),
      );
      return ok({ id: input.id, version: registro.version, estado: registro.estado, idempotente: false });
    },
  });

  /* --------- helper común de transición (declarada y estándar) ----------- */
  /**
   * Aplica una transición YA autorizada de forma completa dentro de la UoW:
   * valida pre/postcondiciones, ejecuta acciones declarativas, persiste y emite
   * el evento `transicionada`. Reutilizada por `transicionar` (sin gate) y por
   * `aprobar` cuando la aprobación se resuelve favorablemente.
   */
  async function aplicarTransicionCompleta(
    deps: ServiceDeps,
    ctx: ExecutionContext,
    uow: UnitOfWork,
    tenantId: string,
    def: DefinicionWorkflow,
    actual: RegistroInstancia,
    versionOptimista: number,
    resuelta: TransicionResuelta,
    dataBase: Record<string, unknown>,
    comando: string,
    estadoForzado?: string,
  ): Promise<Result<RegistroInstancia, KernelError>> {
    // Aplicación pura (estadoForzado permite forzar el destino de rechazo).
    const aplicado = estadoForzado
      ? ok({ estado: estadoForzado, data: dataBase })
      : new RuntimeInstancia(def).aplicar(actual, resuelta, dataBase);
    if (!aplicado.ok) return aplicado;

    const registroParaAcciones: RegistroInstancia = {
      ...actual,
      estado: aplicado.value.estado,
      data: aplicado.value.data,
    };
    const conAcciones = await ejecutarAcciones(
      deps,
      ctx,
      uow,
      servicio,
      tenantId,
      registroParaAcciones,
      estadoForzado ? undefined : resuelta.declarada?.acciones,
    );
    if (!conAcciones.ok) return conAcciones;

    return guardarTransicion(
      deps,
      ctx,
      uow,
      servicio,
      tenantId,
      actual,
      versionOptimista,
      aplicado.value.estado,
      conAcciones.value,
      comando,
    );
  }

  async function ejecutarTransicion(
    deps: ServiceDeps,
    ctx: ExecutionContext,
    uow: UnitOfWork,
    input: { id: string; version: number; opId?: string; datos?: Record<string, unknown> },
    comando: string,
    permisoEstandar?: string,
  ): Promise<Result<any, KernelError>> {
    const tenant = tenantOf(ctx);
    if (!tenant.ok) return tenant;
    const actual = await cargar(deps, tenant.value, input.id);
    if (!actual.ok) return actual;
    if (!actual.value) return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.id));

    if (opIdAplicado(actual.value.data, input.opId)) {
      return ok({ id: input.id, version: actual.value.version, estado: actual.value.estado, idempotente: true });
    }

    const versionDef = Number(actual.value.data[VERSION_DEF_KEY]) || undefined;
    const resuelto = await resolverPara(deps, tenant.value, versionDef);
    if (!resuelto.ok) return resuelto;
    const runtime = new RuntimeInstancia(resuelto.value.def);

    const resTransicion = runtime.resolver(actual.value.estado, comando);
    if (!resTransicion.ok) return resTransicion;
    const resuelta: TransicionResuelta = resTransicion.value;

    // Autorización (permiso/capacidad/policy) declarada + estándar.
    const authz = autorizarTransicion(deps, ctx, resuelta.declarada, permisoEstandar, actual.value.data);
    if (!authz.ok) return authz;

    // Datos de entrada mergeados + recibo opId.
    const dataMutada = conOpId({ ...actual.value.data, ...(input.datos ?? {}) }, input.opId);

    // ---------------------------- GATE DE APROBACIÓN ----------------------
    // Si la transición declara `aprobacion`, el estado NO cambia: se crea una
    // aprobación pendiente ligada a la transición (de/a/comando/solicitante) y
    // la instancia permanece en su estado origen. La transición solo se ejecuta
    // cuando `aprobar` alcanza la resolución del modo. Es IMPOSIBLE saltarse el
    // gate: el propio comando `transicionar` no aplica el destino.
    const defAp = resuelta.declarada?.aprobacion;
    if (defAp) {
      // Precondiciones se validan ya al abrir el gate (fallar rápido).
      const preAplicado = runtime.aplicar(actual.value, resuelta, dataMutada);
      if (!preAplicado.ok) return preAplicado;

      // Si ya hay una aprobación en curso para esta transición, es idempotente.
      const existente = aprobacionDe(actual.value.data, comando);
      if (existente && existente.estado === "pendiente") {
        return ok({
          id: input.id,
          version: actual.value.version,
          estado: actual.value.estado,
          pendienteAprobacion: true,
          idempotente: true,
        });
      }

      const flujo = iniciarAprobacion(
        defAp,
        {
          comando,
          estadoOrigen: resuelta.de,
          estadoDestino: resuelta.a,
          rechazoA: resuelta.declarada?.rechazoA,
        },
        String(dataMutada[SOLICITANTE_KEY] ?? ctx.principal.id),
        new Date(),
      );
      const dataGate = guardarAprobacion(dataMutada, flujo);
      const updated = await deps.store.update(uow, tenant.value, input.id, input.version, {
        status: actual.value.estado, // permanece en el origen
        data: dataGate,
      });
      if (!updated.ok) return updated;
      const reg = aRegistro(updated.value);
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, `aprobacion-solicitada:${comando}`, input.id, {
        transicion: comando,
        aprobacion: flujo.nombre,
      });
      if (!audited.ok) return audited;
      uow.registerEvent(
        createDomainEvent(
          n.aprobacionSolicitada,
          payloadInstancia(servicio, reg, ctx.principal.id, { aprobacion: flujo }),
          ctx.correlationId,
        ),
      );
      return ok({
        id: input.id,
        version: reg.version,
        estado: reg.estado,
        pendienteAprobacion: true,
        idempotente: false,
      });
    }

    // ------------------------- SIN GATE: transición directa ----------------
    const guardado = await aplicarTransicionCompleta(
      deps,
      ctx,
      uow,
      tenant.value,
      resuelto.value.def,
      actual.value,
      input.version,
      resuelta,
      dataMutada,
      comando,
    );
    if (!guardado.ok) return guardado;
    return ok({
      id: input.id,
      version: guardado.value.version,
      estado: guardado.value.estado,
      idempotente: false,
    });
  }

  /* --------------------------- transicionar ------------------------------ */
  const transicionar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.transicionar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      comando: z.string().min(1),
      opId: z.string().optional(),
      datos: z.record(z.string(), z.unknown()).optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    handle: (ctx, input, uow) => ejecutarTransicion(deps, ctx, uow, input, input.comando),
  });

  /* --------------- operaciones estándar (comandos fijos) ----------------- */
  const opEstandar = (
    nombre: string,
    comando: string,
    permisoDe: (def: DefinicionWorkflow) => string | undefined,
  ) => (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const actual = await cargar(deps, tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.id));
      const versionDef = Number(actual.value.data[VERSION_DEF_KEY]) || undefined;
      const resuelto = await resolverPara(deps, tenant.value, versionDef);
      if (!resuelto.ok) return resuelto;
      const permisoExtra = permisoDe(resuelto.value.def);
      return ejecutarTransicion(deps, ctx, uow, input, comando, permisoExtra);
    },
  });

  const cancelar = opEstandar(n.cancelar, COMANDO_CANCELAR, (def) => operacionesEstandarEfectivas(def).cancelar?.permiso);
  const reabrir = opEstandar(n.reabrir, COMANDO_REABRIR, (def) => operacionesEstandarEfectivas(def).reabrir?.permiso);
  const suspender = opEstandar(n.suspender, COMANDO_SUSPENDER, (def) => operacionesEstandarEfectivas(def).suspender?.permiso);
  const reanudar = opEstandar(n.reanudar, COMANDO_REANUDAR, (def) => operacionesEstandarEfectivas(def).reanudar?.permiso);

  /* ------------------------- aprobación: aprobar ------------------------- */
  /** Reconstruye la definición de aprobación efectiva desde la transición. */
  function defAprobacionDe(
    def: DefinicionWorkflow,
    transicion: string,
  ): { defAp: DefinicionAprobacionTransicion; declarada: TransicionWorkflow } | undefined {
    const declarada = def.transiciones.find((t) => t.comando === transicion && t.aprobacion);
    if (!declarada || !declarada.aprobacion) return undefined;
    return { defAp: declarada.aprobacion, declarada };
  }

  async function decidir(
    deps: ServiceDeps,
    ctx: ExecutionContext,
    uow: UnitOfWork,
    input: { id: string; version: number; transicion: string; opId?: string; motivo?: string },
    decision: "aprobada" | "rechazada",
  ): Promise<Result<any, KernelError>> {
    const tenant = tenantOf(ctx);
    if (!tenant.ok) return tenant;
    const actual = await cargar(deps, tenant.value, input.id);
    if (!actual.ok) return actual;
    if (!actual.value) return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.id));
    if (opIdAplicado(actual.value.data, input.opId)) {
      return ok({ id: input.id, version: actual.value.version, idempotente: true });
    }

    const versionDef = Number(actual.value.data[VERSION_DEF_KEY]) || undefined;
    const resuelto = await resolverPara(deps, tenant.value, versionDef);
    if (!resuelto.ok) return resuelto;

    const aprobacion = aprobacionDe(actual.value.data, input.transicion);
    if (!aprobacion || aprobacion.estado !== "pendiente") {
      return fail(KernelErrors.conflict(`No hay aprobación pendiente para "${input.transicion}"`));
    }
    const resolvedDef = defAprobacionDe(resuelto.value.def, aprobacion.transicion);
    if (!resolvedDef) return fail(KernelErrors.internal(`Definición de aprobación ausente: ${aprobacion.nombre}`));
    const { defAp, declarada } = resolvedDef;

    // Permiso del paso.
    const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
    const authz = authorization.authorize(ctx, { permissions: [defAp.permiso] });
    if (!authz.ok) return authz;

    // ¿Actor autorizado (aprobador declarado, delegado o rol escalado)?
    const efectivo = aprobadorEfectivo(aprobacion, ctx.principal.id, ctx.principal.rol);
    if (!efectivo) return fail(KernelErrors.forbidden("no es aprobador de esta transición"));

    // Auto-aprobación.
    if (!defAp.permitirAutor && ctx.principal.id === aprobacion.solicitante) {
      return fail(KernelErrors.forbidden("auto-aprobacion: el solicitante no puede decidir"));
    }
    // Secuencial: respeta el turno.
    if (aprobacion.modo === "secuencial") {
      const turno = turnoSecuencial(aprobacion);
      if (turno !== efectivo) {
        return fail(KernelErrors.conflict(`No es el turno de "${efectivo}" (esperado "${turno}")`));
      }
    }
    // No decidir dos veces el mismo aprobador.
    if (aprobacion.decisiones.some((d) => d.aprobador === efectivo)) {
      return fail(KernelErrors.conflict("El aprobador ya decidió"));
    }

    const registro: RegistroAprobacion = {
      aprobador: efectivo,
      actorId: ctx.principal.id,
      decision,
      fecha: new Date().toISOString(),
    };
    const decisiones = [...aprobacion.decisiones, registro];
    const nuevoEstado = decision === "rechazada" ? "rechazada" : resolverEstado(defAp, decisiones);
    const siguiente: EstadoAprobacion = { ...aprobacion, decisiones, estado: nuevoEstado };

    let data = guardarAprobacion(actual.value.data, siguiente);
    data = conOpId(data, input.opId);

    // La aprobación SIGUE pendiente: solo se registra la decisión, sin transicionar.
    if (nuevoEstado === "pendiente") {
      const updated = await deps.store.update(uow, tenant.value, input.id, input.version, {
        status: actual.value.estado,
        data,
      });
      if (!updated.ok) return updated;
      const reg = aRegistro(updated.value);
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, `aprobacion:${decision}`, input.id, {
        transicion: input.transicion,
        estado: nuevoEstado,
      });
      if (!audited.ok) return audited;
      return ok({ id: input.id, version: reg.version, aprobacion: siguiente, idempotente: false });
    }

    // La aprobación se RESUELVE: ahora sí se ejecuta la transición gobernada.
    // Se elimina la aprobación del mapa (ya resuelta) antes de aplicar.
    const dataResuelta = guardarAprobacion(data, siguiente);
    const resuelta: TransicionResuelta = {
      de: aprobacion.estadoOrigen,
      a: aprobacion.estadoDestino,
      comando: aprobacion.transicion,
      declarada,
    };

    if (nuevoEstado === "aprobada") {
      // Transición COMPLETA (validaciones + acciones + evento) en ESTA UoW.
      const guardado = await aplicarTransicionCompleta(
        deps,
        ctx,
        uow,
        tenant.value,
        resuelto.value.def,
        actual.value,
        input.version,
        resuelta,
        dataResuelta,
        aprobacion.transicion,
      );
      if (!guardado.ok) return guardado;
      uow.registerEvent(
        createDomainEvent(
          n.aprobacionResuelta,
          payloadInstancia(servicio, guardado.value, ctx.principal.id, { aprobacion: siguiente, motivo: input.motivo ?? "" }),
          ctx.correlationId,
        ),
      );
      return ok({ id: input.id, version: guardado.value.version, estado: guardado.value.estado, aprobacion: siguiente, idempotente: false });
    }

    // RECHAZADA: aplica destino de rechazo declarado (o permanece en origen).
    const destinoRechazo = aprobacion.rechazoA ?? aprobacion.estadoOrigen;
    const guardado = await aplicarTransicionCompleta(
      deps,
      ctx,
      uow,
      tenant.value,
      resuelto.value.def,
      actual.value,
      input.version,
      resuelta,
      dataResuelta,
      `${aprobacion.transicion}:rechazo`,
      destinoRechazo, // estadoForzado: salta acciones/postcondiciones de la transición feliz
    );
    if (!guardado.ok) return guardado;
    uow.registerEvent(
      createDomainEvent(
        n.aprobacionResuelta,
        payloadInstancia(servicio, guardado.value, ctx.principal.id, { aprobacion: siguiente, motivo: input.motivo ?? "" }),
        ctx.correlationId,
      ),
    );
    return ok({ id: input.id, version: guardado.value.version, estado: guardado.value.estado, aprobacion: siguiente, idempotente: false });
  }

  const aprobar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.aprobar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      transicion: z.string().min(1),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    handle: (ctx, input, uow) => decidir(deps, ctx, uow, input, "aprobada"),
  });

  const rechazar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.rechazar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      transicion: z.string().min(1),
      motivo: z.string().optional(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    handle: (ctx, input, uow) => decidir(deps, ctx, uow, input, "rechazada"),
  });

  /* ---------------------------- delegar ---------------------------------- */
  const delegar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.delegar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      transicion: z.string().min(1),
      a: z.string().min(1),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const actual = await cargar(deps, tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.id));
      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, idempotente: true });
      }
      const versionDef = Number(actual.value.data[VERSION_DEF_KEY]) || undefined;
      const resuelto = await resolverPara(deps, tenant.value, versionDef);
      if (!resuelto.ok) return resuelto;
      const aprobacion = aprobacionDe(actual.value.data, input.transicion);
      if (!aprobacion || aprobacion.estado !== "pendiente") {
        return fail(KernelErrors.conflict(`No hay aprobación pendiente para "${input.transicion}"`));
      }
      const resolvedDef = defAprobacionDe(resuelto.value.def, aprobacion.transicion);
      if (!resolvedDef) return fail(KernelErrors.internal(`Definición de aprobación ausente: ${aprobacion.nombre}`));

      const authorization = deps.runtime.container.resolve(KernelTokens.authorization);
      const authz = authorization.authorize(ctx, { permissions: [resolvedDef.defAp.permiso] });
      if (!authz.ok) return authz;

      // Solo un aprobador declarado (o su rol) puede delegar su turno.
      const efectivo = aprobadorEfectivo(aprobacion, ctx.principal.id, ctx.principal.rol);
      if (!efectivo) return fail(KernelErrors.forbidden("no es aprobador de esta transición"));

      const delegaciones = [
        ...aprobacion.delegaciones.filter((d) => d.de !== efectivo),
        { de: efectivo, a: input.a, fecha: new Date().toISOString() },
      ];
      const siguiente: EstadoAprobacion = { ...aprobacion, delegaciones };
      let data = guardarAprobacion(actual.value.data, siguiente);
      data = conOpId(data, input.opId);
      const updated = await deps.store.update(uow, tenant.value, input.id, input.version, {
        status: actual.value.estado,
        data,
      });
      if (!updated.ok) return updated;
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "aprobacion:delegar", input.id, {
        transicion: input.transicion,
        de: efectivo,
        a: input.a,
      });
      if (!audited.ok) return audited;
      return ok({ id: input.id, version: updated.value.version, aprobacion: siguiente, idempotente: false });
    },
  });

  /* ------------------- expirarAprobaciones (idempotente) ----------------- */
  const expirar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: n.expirar,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [opts.permisoEscribir] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const actual = await cargar(deps, tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(RECORD_TYPE_INSTANCIA, input.id));
      if (opIdAplicado(actual.value.data, input.opId)) {
        return ok({ id: input.id, version: actual.value.version, expiradas: 0, idempotente: true });
      }

      const ahora = new Date();
      const aprobaciones = leerAprobaciones(actual.value.data);
      let data = { ...actual.value.data };
      let cambios = 0;
      let escaladas = 0;
      let rechazadas = 0;
      // Si alguna aprobación expira como RECHAZADA (alVencer: 'rechazar' o
      // escalamiento agotado), la instancia debe moverse a su destino de rechazo.
      let estadoForzado: string | undefined;
      for (const ap of aprobaciones) {
        const r = aplicarVencimiento(ap, ahora);
        if (r.cambio) {
          data = guardarAprobacion(data, r.aprobacion);
          cambios++;
          if (r.escalada) escaladas++;
          if (r.aprobacion.estado === "rechazada") {
            rechazadas++;
            estadoForzado = r.aprobacion.rechazoA ?? r.aprobacion.estadoOrigen;
          }
        }
      }
      if (cambios === 0) {
        // Idempotente: nada vencido → no-op exitoso, sin subir versión.
        return ok({ id: input.id, version: actual.value.version, expiradas: 0, idempotente: false });
      }
      data = conOpId(data, input.opId);
      // Estado destino: por rechazo de expiración se aplica el destino de rechazo;
      // escalamientos/expiradas 'nada' conservan el estado origen.
      const estadoNuevo = estadoForzado ?? actual.value.estado;
      const updated = await deps.store.update(uow, tenant.value, input.id, input.version, {
        status: estadoNuevo,
        data,
      });
      if (!updated.ok) return updated;
      const reg = aRegistro(updated.value);
      const audited = await audit(deps.audit, uow, ctx, tenant.value, servicio, "expirarAprobaciones", input.id, {
        expiradas: cambios,
        escaladas,
        rechazadas,
        estado: estadoNuevo,
      });
      if (!audited.ok) return audited;
      if (escaladas > 0) {
        uow.registerEvent(
          createDomainEvent(n.escalada, payloadInstancia(servicio, reg, ctx.principal.id, { escaladas }), ctx.correlationId),
        );
      }
      uow.registerEvent(
        createDomainEvent(
          n.aprobacionResuelta,
          payloadInstancia(servicio, reg, ctx.principal.id, { expiradas: cambios, rechazadas }),
          ctx.correlationId,
        ),
      );
      return ok({ id: input.id, version: reg.version, expiradas: cambios, escaladas, rechazadas, idempotente: false });
    },
  });

  return [iniciar, transicionar, cancelar, reabrir, suspender, reanudar, aprobar, rechazar, delegar, expirar];
}
