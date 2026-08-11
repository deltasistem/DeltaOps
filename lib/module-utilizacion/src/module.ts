/**
 * DGP-019.1 · Módulo de Utilización — Capa de aplicación + descriptor del
 * servicio de plataforma (`modulo.utilizacion`).
 *
 * Se registra por el ÚNICO mecanismo permitido (`extraServices` de
 * createPlatformRuntime). Lecturas y tanqueos son hechos APPEND-ONLY; la
 * corrección es un comando de anulación + nuevo hecho. La propagación del
 * ÚLTIMO valor válido hacia Activos se ENCOLA en la misma UoW (evento en el
 * outbox del Kernel) y la ejecuta un handler idempotente at-least-once,
 * serializado por (tenant, activo, medidor). La lectura histórica NUNCA se
 * pierde y el fallo de sincronización NUNCA se oculta.
 *
 * NO usa Workflow Engine (fase DGP-019.1). Composición con Activos por PUERTO
 * FAIL-SAFE (`ActivosPort`); si no se inyecta, la sincronización no se intenta y
 * la lectura queda registrada igualmente.
 */
import crypto from "node:crypto";
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  fail,
  KernelErrors,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { MODULO } from "./module-name";
import { CATALOGOS, recordTypesCatalogos, type NombreCatalogo } from "./domain/catalogos";
import {
  EVENTOS_MODULO,
  LECTURA_ANULADA,
  LECTURA_INCONSISTENTE,
  LECTURA_REGISTRADA,
  REINICIO_MEDIDOR,
  SINCRONIZACION_FALLIDA,
  TANQUEO_ANULADO,
  TANQUEO_REGISTRADO,
} from "./domain/events";
import {
  anularLectura,
  anularTanqueo,
  conSincronizacion,
  crearLectura,
  crearTanqueo,
  marcarInconsistente,
  SINC_CONFIRMADA,
  SINC_FALLIDA,
  SINC_NO_APLICA,
  TIPO_HOROMETRO,
  TIPO_ODOMETRO,
  TIPOS_MEDIDOR,
  UNIDAD_POR_MEDIDOR,
  ORIGENES_LECTURA,
  type Lectura,
  type TipoMedidor,
} from "./domain/value-objects";
import {
  costoPorHora,
  costoPorKm,
  deltaMedidor,
  litrosPor100Km,
  litrosPorHora,
} from "./domain/calculos";
import {
  policiesDelModulo,
  POLICY_PUEDE_ANULAR_LECTURA,
  POLICY_PUEDE_ANULAR_TANQUEO,
  POLICY_PUEDE_REGISTRAR_LECTURA,
  POLICY_PUEDE_REGISTRAR_TANQUEO,
  POLICY_PUEDE_REGULARIZAR,
} from "./domain/policies";
import type {
  ActivosPort,
  CatalogoPort,
  EventLogStore,
  LecturaRepository,
  ReciboPort,
  TanqueoRepository,
} from "./domain/ports";
import type { ConsolaStore, EventLogOperacional, ReadModelsStore, SyncReceiptStore } from "./infrastructure/operacional";
import { aplicarEventoAggregate, handlerProyeccion, type ProyeccionAdapters } from "./projection";

const catalogoEnum = z.enum([...CATALOGOS] as [string, ...string[]]);

/** Tablas del módulo protegidas por RLS (para la consola técnica de admin). */
const TABLAS_RLS_MODULO: readonly string[] = [
  "utl_lecturas",
  "utl_tanqueos",
  "utl_catalogos",
  "utl_recibos",
  "utl_eventos",
  "utl_sync_receipts",
  "utl_lecturas_read",
  "utl_tanqueos_read",
];

/* --------------------------- Capacidades / permisos ---------------------- */

const CAP_LEER = `${MODULO}.leer`;
const CAP_LECT_REGISTRAR = `${MODULO}.lecturas.registrar`;
const CAP_LECT_ANULAR = `${MODULO}.lecturas.anular`;
const CAP_TANQ_REGISTRAR = `${MODULO}.tanqueos.registrar`;
const CAP_TANQ_ANULAR = `${MODULO}.tanqueos.anular`;
const CAP_REGULARIZAR = `${MODULO}.medidores.regularizar`;

export const PERMISOS_MODULO = [
  CAP_LEER,
  CAP_LECT_REGISTRAR,
  CAP_LECT_ANULAR,
  CAP_TANQ_REGISTRAR,
  CAP_TANQ_ANULAR,
  CAP_REGULARIZAR,
] as const;

/* ----------------------------- Adaptadores ------------------------------- */

export interface ModuleAdapters {
  readonly lecturas: LecturaRepository;
  readonly tanqueos: TanqueoRepository;
  readonly catalogos: CatalogoPort;
  readonly recibos: ReciboPort;
  readonly eventLog: EventLogStore;
  readonly readModel?: ReadModelsStore;
  readonly syncReceipts?: SyncReceiptStore;
  readonly consola?: ConsolaStore;
  /** Composición fail-safe con Activos (propagación del último valor). */
  readonly activos?: ActivosPort;
}

/* --------------------------- Emisión de eventos -------------------------- */

async function emitirEvento(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  evento: { tipo: string; payload: Record<string, unknown> },
): Promise<Result<void, KernelError>> {
  const dominio = createDomainEvent(evento.tipo, evento.payload, ctx.correlationId);
  const appended = await adapters.eventLog.append(uow, {
    tenantId,
    eventId: dominio.id,
    tipo: dominio.type,
    payload: dominio.payload,
    occurredAt: typeof dominio.occurredAt === "string" ? dominio.occurredAt : new Date(dominio.occurredAt).toISOString(),
  });
  if (!appended.ok) return appended;
  uow.registerEvent(dominio);
  return ok(undefined);
}

/** entityRef canónico del activo para el timeline compartido. */
function refActivo(activoId: string): string {
  return `activo:${activoId}`;
}

function registrarEnTimeline() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    if (!tenantId) return ok(undefined);
    const activoId = String(p["activoId"] ?? (p["snapshot"] as Record<string, unknown> | undefined)?.["activoId"] ?? "");
    if (!activoId) return ok(undefined);
    const entityRef = refActivo(activoId);
    const resumen = String(p["resumen"] ?? event.type);
    const occurredAt = String(p["actualizadoAt"] ?? p["fechaHora"] ?? new Date().toISOString());
    const sys = createExecutionContext({ principal: SYSTEM_PRINCIPAL, correlationId: event.correlationId, metadata: { tenantId } });
    const r = await deps.runtime.commands.execute(sys, "platform.timeline.record", {
      entryId: event.id,
      entityRef,
      eventType: event.type,
      actorId: String(p["actorId"] ?? (p["snapshot"] as Record<string, unknown> | undefined)?.["identityId"] ?? SYSTEM_PRINCIPAL.id),
      occurredAt,
      resumen,
      estado: p["estado"] != null ? String(p["estado"]) : null,
      entidadRelacionada: null,
      payload: p,
    });
    return r.ok ? ok(undefined) : (r as Result<void, KernelError>);
  };
}

/* --------------------------- Idempotencia offline ------------------------ */

async function reciboPrevio(adapters: ModuleAdapters, tenant: string, comando: string, opId: string | undefined): Promise<Record<string, unknown> | null> {
  if (!opId) return null;
  const previo = await adapters.recibos.buscar(tenant, comando, opId);
  return previo.ok && previo.value ? previo.value.resultado : null;
}

async function sellarRecibo(adapters: ModuleAdapters, uow: UnitOfWork, tenant: string, comando: string, opId: string | undefined, resultado: Record<string, unknown>, actorId: string): Promise<Result<void, KernelError>> {
  if (!opId) return ok(undefined);
  return adapters.recibos.sellar(uow, tenant, { opId, comando, resultado }, actorId);
}

/* ------------------------------ Esquemas VO ------------------------------ */

const evidenciaSchema = z.object({ attachmentId: z.string().min(1), etiqueta: z.string().min(1).nullable().optional() });
const tipoMedidorEnum = z.enum([...TIPOS_MEDIDOR] as [string, ...string[]]);
const origenEnum = z.enum([...ORIGENES_LECTURA] as [string, ...string[]]);

/* ------------------------------ Descriptor ------------------------------- */

export function utilizacionModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  let policiesRegistradas = false;
  const conPolicies = (deps: ServiceDeps): void => {
    if (policiesRegistradas) return;
    for (const p of policiesDelModulo()) deps.runtime.policyEngine.register(p);
    policiesRegistradas = true;
  };
  const evaluar = (deps: ServiceDeps, ctx: ExecutionContext, policy: string, subject: Record<string, unknown>) =>
    deps.runtime.policyEngine.evaluate(policy, ctx, subject);

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Dominio de Utilización, Medidores y Combustible (DGP-019.1): lecturas de horómetro/odómetro append-only con validación de consistencia (decreciente ⇒ inconsistente, no propaga), regularización explícita de medidor (reinicio de tramo auditado), sincronización fail-safe del último valor hacia Activos (comandos públicos actualizar-horometro/odometro, 'gana la lectura válida más reciente'), tanqueos de combustible con catálogo configurable, cálculos puros de utilización/consumo (L/h, L/100km, costo/h, costo/km; 'sin datos' ≠ 0), read models CQRS, bitácora durable, sincronización offline y contratos QR preparados.",
    capabilities: [
      { name: "utilizacion-leer", permissions: [CAP_LEER], description: "Consultar lecturas, tanqueos y resumen operacional" },
      { name: "utilizacion-lecturas", permissions: [CAP_LEER, CAP_LECT_REGISTRAR, CAP_LECT_ANULAR], description: "Registrar y anular lecturas de medidor" },
      { name: "utilizacion-tanqueos", permissions: [CAP_LEER, CAP_TANQ_REGISTRAR, CAP_TANQ_ANULAR], description: "Registrar y anular tanqueos de combustible" },
      { name: "utilizacion-regularizar", permissions: [CAP_LEER, CAP_REGULARIZAR], description: "Regularizar medidores (reinicio de tramo auditado)" },
    ],
    permissions: [...PERMISOS_MODULO],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: ["lectura-utilizacion", "tanqueo-utilizacion", "recibo-op", ...recordTypesCatalogos()],
    configDefaults: {
      "sync-activos-max-reintentos": "3",
    },
    commands: [
      /* ---------------------------- catálogo ---------------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo-upsert`,
        inputSchema: z.object({
          catalogo: catalogoEnum,
          clave: z.string().min(1),
          etiqueta: z.string().min(1),
          posicion: z.number().int().nonnegative().optional(),
          padre: z.string().min(1).nullable().optional(),
        }),
        authorization: { permissions: [CAP_REGULARIZAR] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.upsert(uow, tenant.value, input.catalogo as NombreCatalogo, { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null }, ctx.principal.id);
          if (!r.ok) return r;
          return ok({ catalogo: input.catalogo, clave: input.clave });
        },
      }),
      (deps) => ({
        name: `${MODULO}.catalogo-habilitar`,
        inputSchema: z.object({ catalogo: catalogoEnum, clave: z.string().min(1), habilitado: z.boolean() }),
        authorization: { permissions: [CAP_REGULARIZAR] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
          if (!r.ok) return r;
          return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
        },
      }),

      /* ------------------------- registrar lectura ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-lectura`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            activoId: z.string().min(1),
            tipoMedidor: tipoMedidorEnum,
            valor: z.number().nonnegative(),
            unidad: z.string().min(1).optional(),
            fechaHora: z.string().min(1),
            origen: origenEnum.default("manual"),
            observacion: z.string().min(1).nullable().optional(),
            evidenciaRef: evidenciaSchema.nullable().optional(),
          }),
          authorization: { permissions: [CAP_LECT_REGISTRAR] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.registrar-lectura`;
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_REGISTRAR_LECTURA, {});
            if (!pol.ok) return pol;

            // Composición fail-safe con Activos: si hay puerto, el activo debe existir.
            if (adapters.activos) {
              const ex = await adapters.activos.existen(tenant.value, [input.activoId]);
              if (!ex.ok) return ex;
              if (ex.value.inexistentes.length > 0) return fail(KernelErrors.notFound("activo", input.activoId));
            }

            const ahora = new Date().toISOString();
            const creada = crearLectura({
              id: input.id ?? crypto.randomUUID(),
              tenantId: tenant.value,
              activoId: input.activoId,
              tipoMedidor: input.tipoMedidor as TipoMedidor,
              valor: input.valor,
              unidad: input.unidad,
              fechaHora: input.fechaHora,
              identityId: ctx.principal.id,
              origen: input.origen,
              observacion: input.observacion ?? null,
              evidenciaRef: input.evidenciaRef ?? null,
              opId: input.opId ?? null,
              createdAt: ahora,
            });
            if (!creada.ok) return creada;

            // Validación de consistencia: si es menor que la última VÁLIDA del
            // mismo medidor ⇒ se conserva marcada inconsistente y NO se propaga.
            const ultima = await adapters.lecturas.ultimaValida(tenant.value, input.activoId, input.tipoMedidor as TipoMedidor);
            if (!ultima.ok) return ultima;
            let lectura: Lectura = creada.value;
            let inconsistente = false;
            let motivo: string | null = null;
            if (ultima.value && lectura.valor < ultima.value.valor) {
              inconsistente = true;
              motivo = `Lectura ${lectura.valor}${lectura.unidad} < última válida ${ultima.value.valor}${ultima.value.unidad} (posible reinicio no regularizado)`;
              lectura = marcarInconsistente(lectura, motivo);
            }

            const saved = await adapters.lecturas.insert(uow, lectura);
            if (!saved.ok) return saved;

            const tipoEvento = inconsistente ? LECTURA_INCONSISTENTE : LECTURA_REGISTRADA;
            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: tipoEvento,
              payload: {
                tenantId: tenant.value,
                id: lectura.id,
                activoId: lectura.activoId,
                actorId: ctx.principal.id,
                actualizadoAt: ahora,
                resumen: inconsistente ? `Lectura inconsistente ${lectura.tipoMedidor}` : `Lectura ${lectura.tipoMedidor} ${lectura.valor}${lectura.unidad}`,
                ...(motivo ? { motivo } : {}),
                snapshot: lectura,
              },
            });
            if (!emitido.ok) return emitido;

            // Encola la propagación del ÚLTIMO valor hacia Activos en la MISMA
            // UoW (evento de dominio ⇒ outbox del Kernel). Sólo lecturas válidas.
            if (!inconsistente) {
              uow.registerEvent(
                createDomainEvent(
                  `${MODULO}.sincronizar-activo`,
                  { tenantId: tenant.value, activoId: lectura.activoId, tipoMedidor: lectura.tipoMedidor, lecturaId: lectura.id, actorId: ctx.principal.id },
                  ctx.correlationId,
                ),
              );
            }

            { const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-lectura", lectura.id, { activoId: lectura.activoId, inconsistente }); if (!a.ok) return a; }
            const resultado = { id: lectura.id, estado: lectura.estado, inconsistente, sincronizacionActivo: lectura.sincronizacionActivo };
            const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
            if (!sello.ok) return sello;
            return ok(resultado);
          },
        };
      },

      /* --------------------------- anular lectura ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.anular-lectura`,
          inputSchema: z.object({ opId: z.string().optional(), id: z.string().min(1), motivo: z.string().min(1) }),
          authorization: { permissions: [CAP_LECT_ANULAR] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.anular-lectura`;
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ANULAR_LECTURA, {});
            if (!pol.ok) return pol;

            const found = await adapters.lecturas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("lectura", input.id));

            const ahora = new Date().toISOString();
            const anulada = anularLectura(found.value, input.motivo, ctx.principal.id, ahora);
            if (!anulada.ok) return anulada;
            const saved = await adapters.lecturas.replace(uow, anulada.value);
            if (!saved.ok) return saved;

            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: LECTURA_ANULADA,
              payload: {
                tenantId: tenant.value, id: anulada.value.id, activoId: anulada.value.activoId, actorId: ctx.principal.id,
                actualizadoAt: ahora, motivo: input.motivo, resumen: `Lectura anulada ${anulada.value.tipoMedidor}`, snapshot: anulada.value,
              },
            });
            if (!emitido.ok) return emitido;

            { const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "anular-lectura", anulada.value.id, { motivo: input.motivo }); if (!a.ok) return a; }
            const resultado = { id: anulada.value.id, estado: anulada.value.estado };
            const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
            if (!sello.ok) return sello;
            return ok(resultado);
          },
        };
      },

      /* ------------- reintentar sincronización con Activos -------------- */
      // Reintento seguro e idempotente de una lectura cuya propagación a Activos
      // quedó marcada `fallida` (p. ej. por una carrera de versión optimista).
      // NO muta la lectura: sólo re-encola el evento de dominio
      // `sincronizar-activo` en la MISMA UoW (outbox del Kernel); el handler de
      // sincronización releerá la versión vigente de Activos y reintentará.
      // Idempotente: si la lectura ya no está `fallida` (o no es vigente), es un
      // no-op silencioso. El recibo por `opId` evita reprocesos duplicados.
      (deps) => ({
        name: `${MODULO}.reintentar-sincronizacion`,
        inputSchema: z.object({ opId: z.string().optional(), id: z.string().min(1) }),
        authorization: { permissions: [CAP_LECT_REGISTRAR] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const comando = `${MODULO}.reintentar-sincronizacion`;
          const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
          if (previo) return ok({ ...previo, idempotente: true });

          const found = await adapters.lecturas.findById(tenant.value, input.id);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("lectura", input.id));
          const lect = found.value;

          // Sólo re-encola si tiene sentido: lectura VÁLIDA cuya sincronización
          // no está confirmada (fallida, o sin intentar). En cualquier otro
          // caso, es un no-op idempotente (no se fuerza un reintento inútil).
          const reintentable =
            lect.estado === "vigente" &&
            !lect.inconsistente &&
            lect.sincronizacionActivo !== SINC_CONFIRMADA &&
            lect.sincronizacionActivo !== SINC_NO_APLICA;

          if (reintentable) {
            uow.registerEvent(
              createDomainEvent(
                `${MODULO}.sincronizar-activo`,
                { tenantId: tenant.value, activoId: lect.activoId, tipoMedidor: lect.tipoMedidor, lecturaId: lect.id, actorId: ctx.principal.id },
                ctx.correlationId,
              ),
            );
            const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reintentar-sincronizacion", lect.id, {
              activoId: lect.activoId, sincronizacionPrevia: lect.sincronizacionActivo,
            });
            if (!a.ok) return a;
          }

          const resultado = { id: lect.id, reintentado: reintentable, sincronizacionActivo: lect.sincronizacionActivo };
          const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
          if (!sello.ok) return sello;
          return ok(resultado);
        },
      }),

      /* ------------------------- reinicio medidor ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reinicio-medidor`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            activoId: z.string().min(1),
            tipoMedidor: tipoMedidorEnum,
            valorNuevo: z.number().nonnegative(),
            fechaHora: z.string().min(1),
            motivo: z.string().min(1),
            observacion: z.string().min(1).nullable().optional(),
          }),
          // GATE por capacidad de regularización (403 sin ella).
          authorization: { permissions: [CAP_REGULARIZAR] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.reinicio-medidor`;
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_REGULARIZAR, { motivo: input.motivo });
            if (!pol.ok) return pol;

            if (adapters.activos) {
              const ex = await adapters.activos.existen(tenant.value, [input.activoId]);
              if (!ex.ok) return ex;
              if (ex.value.inexistentes.length > 0) return fail(KernelErrors.notFound("activo", input.activoId));
            }

            const ultima = await adapters.lecturas.ultimaValida(tenant.value, input.activoId, input.tipoMedidor as TipoMedidor);
            if (!ultima.ok) return ultima;
            const valorAnterior = ultima.value?.valor ?? null;

            const ahora = new Date().toISOString();
            // El reinicio ancla un nuevo tramo: la lectura nueva es VÁLIDA aunque
            // sea menor que la anterior (regularización explícita, nunca automática).
            const creada = crearLectura({
              id: input.id ?? crypto.randomUUID(),
              tenantId: tenant.value,
              activoId: input.activoId,
              tipoMedidor: input.tipoMedidor as TipoMedidor,
              valor: input.valorNuevo,
              fechaHora: input.fechaHora,
              identityId: ctx.principal.id,
              origen: "manual",
              observacion: input.observacion ?? `Reinicio de medidor: ${input.motivo}`,
              opId: input.opId ?? null,
              createdAt: ahora,
            });
            if (!creada.ok) return creada;
            const saved = await adapters.lecturas.insert(uow, creada.value);
            if (!saved.ok) return saved;

            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: REINICIO_MEDIDOR,
              payload: {
                tenantId: tenant.value, id: creada.value.id, activoId: input.activoId, tipoMedidor: input.tipoMedidor,
                valorAnterior, valorNuevo: input.valorNuevo, motivo: input.motivo, actorId: ctx.principal.id,
                actualizadoAt: ahora, resumen: `Reinicio de ${input.tipoMedidor} (${valorAnterior ?? "s/d"} → ${input.valorNuevo})`, snapshot: creada.value,
              },
            });
            if (!emitido.ok) return emitido;

            // Nuevo tramo ⇒ propaga el nuevo valor a Activos igual que una lectura.
            uow.registerEvent(
              createDomainEvent(
                `${MODULO}.sincronizar-activo`,
                { tenantId: tenant.value, activoId: input.activoId, tipoMedidor: input.tipoMedidor, lecturaId: creada.value.id, actorId: ctx.principal.id, reinicio: true },
                ctx.correlationId,
              ),
            );

            { const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reinicio-medidor", creada.value.id, { activoId: input.activoId, valorAnterior, valorNuevo: input.valorNuevo, motivo: input.motivo }); if (!a.ok) return a; }
            const resultado = { id: creada.value.id, valorAnterior, valorNuevo: input.valorNuevo };
            const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
            if (!sello.ok) return sello;
            return ok(resultado);
          },
        };
      },

      /* ------------------------- registrar tanqueo ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-tanqueo`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            activoId: z.string().min(1),
            fechaHora: z.string().min(1),
            litros: z.number().positive(),
            tipoCombustible: z.string().min(1),
            precioUnitario: z.number().nonnegative().nullable().optional(),
            costoTotal: z.number().nonnegative().nullable().optional(),
            moneda: z.string().min(1).nullable().optional(),
            lecturaMedidorRef: z.string().min(1).nullable().optional(),
            proveedorId: z.string().min(1).nullable().optional(),
            observacion: z.string().min(1).nullable().optional(),
            evidenciaRef: evidenciaSchema.nullable().optional(),
          }),
          authorization: { permissions: [CAP_TANQ_REGISTRAR] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.registrar-tanqueo`;
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_REGISTRAR_TANQUEO, {});
            if (!pol.ok) return pol;

            // Catálogo de tipo de combustible (semántica canónica).
            const valCat = await adapters.catalogos.validarReferencia(tenant.value, "tipos-combustible", input.tipoCombustible, true);
            if (!valCat.ok) return valCat;

            if (adapters.activos) {
              const ex = await adapters.activos.existen(tenant.value, [input.activoId]);
              if (!ex.ok) return ex;
              if (ex.value.inexistentes.length > 0) return fail(KernelErrors.notFound("activo", input.activoId));
            }

            const ahora = new Date().toISOString();
            const creado = crearTanqueo({
              id: input.id ?? crypto.randomUUID(),
              tenantId: tenant.value,
              activoId: input.activoId,
              fechaHora: input.fechaHora,
              litros: input.litros,
              tipoCombustible: input.tipoCombustible,
              precioUnitario: input.precioUnitario ?? null,
              costoTotal: input.costoTotal ?? null,
              moneda: input.moneda ?? null,
              lecturaMedidorRef: input.lecturaMedidorRef ?? null,
              identityId: ctx.principal.id,
              proveedorId: input.proveedorId ?? null,
              observacion: input.observacion ?? null,
              evidenciaRef: input.evidenciaRef ?? null,
              opId: input.opId ?? null,
              createdAt: ahora,
            });
            if (!creado.ok) return creado;
            const saved = await adapters.tanqueos.insert(uow, creado.value);
            if (!saved.ok) return saved;

            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: TANQUEO_REGISTRADO,
              payload: {
                tenantId: tenant.value, id: creado.value.id, activoId: input.activoId, actorId: ctx.principal.id,
                actualizadoAt: ahora, resumen: `Tanqueo ${creado.value.litros}L ${creado.value.tipoCombustible}`, snapshot: creado.value,
              },
            });
            if (!emitido.ok) return emitido;

            { const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-tanqueo", creado.value.id, { litros: creado.value.litros }); if (!a.ok) return a; }
            const resultado = { id: creado.value.id, estado: creado.value.estado, costoTotal: creado.value.costoTotal };
            const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
            if (!sello.ok) return sello;
            return ok(resultado);
          },
        };
      },

      /* --------------------------- anular tanqueo ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.anular-tanqueo`,
          inputSchema: z.object({ opId: z.string().optional(), id: z.string().min(1), motivo: z.string().min(1) }),
          authorization: { permissions: [CAP_TANQ_ANULAR] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.anular-tanqueo`;
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ANULAR_TANQUEO, {});
            if (!pol.ok) return pol;

            const found = await adapters.tanqueos.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("tanqueo", input.id));

            const ahora = new Date().toISOString();
            const anulado = anularTanqueo(found.value, input.motivo, ctx.principal.id, ahora);
            if (!anulado.ok) return anulado;
            const saved = await adapters.tanqueos.replace(uow, anulado.value);
            if (!saved.ok) return saved;

            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: TANQUEO_ANULADO,
              payload: {
                tenantId: tenant.value, id: anulado.value.id, activoId: anulado.value.activoId, actorId: ctx.principal.id,
                actualizadoAt: ahora, motivo: input.motivo, resumen: `Tanqueo anulado`, snapshot: anulado.value,
              },
            });
            if (!emitido.ok) return emitido;

            { const a = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "anular-tanqueo", anulado.value.id, { motivo: input.motivo }); if (!a.ok) return a; }
            const resultado = { id: anulado.value.id, estado: anulado.value.estado };
            const sello = await sellarRecibo(adapters, uow, tenant.value, comando, input.opId, resultado, ctx.principal.id);
            if (!sello.ok) return sello;
            return ok(resultado);
          },
        };
      },

      /* ---------------------- reproyección (replay) --------------------- */
      (deps) => ({
        name: `${MODULO}.reproyectar`,
        inputSchema: z.object({}),
        authorization: { permissions: [CAP_REGULARIZAR] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          if (!adapters.readModel) return fail(KernelErrors.conflict("El runtime no tiene read models configurados"));
          const eventos = await adapters.eventLog.listPorTenant(tenant.value);
          if (!eventos.ok) return eventos;
          const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
          const proy: ProyeccionAdapters = { readModel: adapters.readModel };
          let aplicados = 0;
          for (const e of eventos.value) {
            const r = await uowPort.execute(ctx, (uow) => aplicarEventoAggregate(proy, uow, { id: e.eventId, type: e.tipo, payload: e.payload }));
            if (!r.ok) return r as Result<never, KernelError>;
            aplicados++;
          }
          return ok({ eventos: eventos.value.length, aplicados });
        },
      }),
    ],

    queries: [
      (deps) => ({
        name: `${MODULO}.lectura-detalle`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // DETALLE servido SIEMPRE desde read model (test de sabotaje 009.2).
          if (adapters.readModel) {
            const rm = await adapters.readModel.lecturaGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("lectura", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.lecturas.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("lectura", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.lecturas`,
        inputSchema: z.object({
          activoId: z.string().optional(),
          tipoMedidor: tipoMedidorEnum.optional(),
          estado: z.string().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
          offset: z.number().int().nonnegative().optional(),
        }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.lecturaList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.lecturas.list(tenant.value, input as { tipoMedidor?: TipoMedidor });
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.ultima-lectura`,
        inputSchema: z.object({ activoId: z.string().min(1), tipoMedidor: tipoMedidorEnum }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.ultimaLectura(tenant.value, input.activoId, input.tipoMedidor);
            if (!rm.ok) return rm;
            return ok(rm.value ? rm.value.datos : null);
          }
          const r = await adapters.lecturas.ultimaValida(tenant.value, input.activoId, input.tipoMedidor as TipoMedidor);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown> | null);
        },
      }),
      (deps) => ({
        name: `${MODULO}.tanqueo-detalle`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.tanqueoGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("tanqueo", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.tanqueos.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("tanqueo", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.tanqueos`,
        inputSchema: z.object({
          activoId: z.string().optional(),
          estado: z.string().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
          offset: z.number().int().nonnegative().optional(),
        }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.tanqueoList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.tanqueos.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      // RESUMEN operacional básico por activo: deltas y ratios de utilización /
      // consumo, calculados con las funciones PURAS. "sin datos" ≠ 0.
      (deps) => ({
        name: `${MODULO}.resumen`,
        inputSchema: z.object({ activoId: z.string().min(1), desde: z.string().optional(), hasta: z.string().optional() }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.readModel) return fail(KernelErrors.conflict("El runtime no tiene read models configurados"));
          const rango = { activoId: input.activoId, estado: "vigente", desde: input.desde, hasta: input.hasta, limit: 500 };
          const lect = await adapters.readModel.lecturaList(tenant.value, rango);
          if (!lect.ok) return lect;
          const tanq = await adapters.readModel.tanqueoList(tenant.value, { activoId: input.activoId, estado: "vigente", desde: input.desde, hasta: input.hasta, limit: 500 });
          if (!tanq.ok) return tanq;

          const lecturasValidas = lect.value.filter((l) => !l.inconsistente);
          const horo = lecturasValidas.filter((l) => l.tipoMedidor === TIPO_HOROMETRO).sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());
          const odo = lecturasValidas.filter((l) => l.tipoMedidor === TIPO_ODOMETRO).sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());

          const deltaHoras = deltaMedidor(horo[0]?.valor, horo[horo.length - 1]?.valor);
          const deltaKm = deltaMedidor(odo[0]?.valor, odo[odo.length - 1]?.valor);
          const litrosTotal = tanq.value.reduce((acc, t) => acc + t.litros, 0);
          const litros = tanq.value.length > 0 ? litrosTotal : null;
          const costoTotal = tanq.value.some((t) => t.costoTotal != null)
            ? tanq.value.reduce((acc, t) => acc + (t.costoTotal ?? 0), 0)
            : null;
          const dh = deltaHoras.tipo === "valor" ? deltaHoras.valor : null;
          const dk = deltaKm.tipo === "valor" ? deltaKm.valor : null;

          return ok({
            activoId: input.activoId,
            lecturas: lecturasValidas.length,
            tanqueos: tanq.value.length,
            deltaHorometro: deltaHoras,
            deltaOdometro: deltaKm,
            litrosTotal: litros,
            costoTotal,
            litrosPorHora: litrosPorHora(litros, dh),
            litrosPor100Km: litrosPor100Km(litros, dk),
            costoPorHora: costoPorHora(costoTotal, dh),
            costoPorKm: costoPorKm(costoTotal, dk),
          });
        },
      }),
      (deps) => ({
        name: `${MODULO}.catalogo-opciones`,
        inputSchema: z.object({ catalogo: catalogoEnum }),
        authorization: { permissions: [CAP_LEER] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.eventos`,
        inputSchema: z.object({}),
        authorization: { permissions: [CAP_REGULARIZAR] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.eventLog.listPorTenant(tenant.value);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({ limit: z.number().int().positive().optional() }),
        authorization: { permissions: [CAP_REGULARIZAR] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.consola) return fail(KernelErrors.conflict("El runtime no tiene consola técnica configurada"));
          const r = await adapters.consola.outboxDelModulo(tenant.value, input.limit);
          if (!r.ok) return r;
          return ok({ ...r.value, tablasRLS: TABLAS_RLS_MODULO } as unknown as Record<string, unknown>);
        },
      }),
    ],

    eventHandlers: [
      // Shared Timeline CANÓNICO: cada evento del módulo se registra vía comando
      // `platform.timeline.record`, idempotente por entryId=event.id.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
      // PROYECCIÓN CQRS (payload-only): sólo si hay read model.
      ...(adapters.readModel
        ? EVENTOS_MODULO.map((eventType) => {
            const proy = handlerProyeccion({ readModel: adapters.readModel! } satisfies ProyeccionAdapters);
            return {
              eventType,
              handlerName: `proyeccion:${eventType}`,
              handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) => proy(deps)(event, eventType),
            };
          })
        : []),
      // SINCRONIZACIÓN con Activos: propaga el ÚLTIMO valor válido. Idempotente
      // at-least-once; serializado por (tenant, activo, medidor).
      {
        eventType: `${MODULO}.sincronizar-activo`,
        handlerName: `sincronizacion:${MODULO}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          sincronizarConActivos(adapters, deps, event),
      },
    ],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}

/* --------------- Handler de sincronización con Activos ------------------- */

/** Serialización por clave (tenant, activo, medidor): cadena de promesas. */
const colasSync = new Map<string, Promise<unknown>>();
function serializar<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const prev = colasSync.get(clave) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  colasSync.set(clave, next.catch(() => undefined));
  return next;
}

async function sincronizarConActivos(
  adapters: ModuleAdapters,
  deps: ServiceDeps,
  event: { id: string; payload: Record<string, unknown>; correlationId: string },
): Promise<Result<void, KernelError>> {
  const p = event.payload;
  const tenantId = String(p["tenantId"] ?? "");
  const activoId = String(p["activoId"] ?? "");
  const tipoMedidor = String(p["tipoMedidor"] ?? "") as TipoMedidor;
  const lecturaId = String(p["lecturaId"] ?? "");
  const actorId = String(p["actorId"] ?? SYSTEM_PRINCIPAL.id);
  if (!tenantId || !activoId || !TIPOS_MEDIDOR.includes(tipoMedidor)) return ok(undefined);
  // Sin puerto de Activos ⇒ no se intenta (la lectura histórica se conserva).
  if (!adapters.activos) return ok(undefined);

  const clave = `${tenantId}::${activoId}::${tipoMedidor}`;
  return serializar(clave, async () => {
    // Relee la lectura que disparó la propagación; si ya no es válida (anulada /
    // inconsistente) ⇒ no-aplica.
    const found = await adapters.lecturas.findById(tenantId, lecturaId);
    if (!found.ok) return found;
    const disparadora = found.value;
    if (!disparadora || disparadora.estado !== "vigente" || disparadora.inconsistente) {
      await marcarSincronizacion(adapters, deps, tenantId, lecturaId, SINC_NO_APLICA);
      return ok(undefined);
    }

    // "Gana la lectura válida más reciente por fechaHora": si existe una lectura
    // válida posterior, esta propagación es tardía ⇒ no-aplica (no pisa).
    const ultima = await adapters.lecturas!.ultimaValida(tenantId, activoId, tipoMedidor);
    if (!ultima.ok) return ultima;
    if (ultima.value && new Date(ultima.value.fechaHora).getTime() > new Date(disparadora.fechaHora).getTime()) {
      await marcarSincronizacion(adapters, deps, tenantId, lecturaId, SINC_NO_APLICA);
      return ok(undefined);
    }
    const objetivo = ultima.value ?? disparadora;

    const maxReintentos = 3;
    let ultimoError: KernelError | null = null;
    for (let intento = 0; intento < maxReintentos; intento++) {
      const det = await adapters.activos!.detalle(tenantId, activoId);
      if (!det.ok) { ultimoError = det.error; break; }
      if (!det.value) {
        // Activo inexistente: no-aplica (se conserva la lectura histórica).
        await marcarSincronizacion(adapters, deps, tenantId, lecturaId, SINC_NO_APLICA);
        return ok(undefined);
      }
      const input = {
        activoId,
        expectedVersion: det.value.version,
        valor: objetivo.valor,
        unidad: UNIDAD_POR_MEDIDOR[tipoMedidor],
        fecha: objetivo.fechaHora,
        opId: `sync:${lecturaId}`,
      };
      const r = tipoMedidor === TIPO_HOROMETRO
        ? await adapters.activos!.actualizarHorometro(tenantId, actorId, input)
        : await adapters.activos!.actualizarOdometro(tenantId, actorId, input);
      if (r.ok) {
        await marcarSincronizacion(adapters, deps, tenantId, lecturaId, SINC_CONFIRMADA);
        return ok(undefined);
      }
      ultimoError = r.error;
      // 409: versión desactualizada o retroceso ⇒ reintenta releyendo versión.
      if (r.error.code === "KRN-CFL-001") continue;
      // Otros errores no son reintentables aquí.
      break;
    }

    // Reintentos agotados ⇒ FALLIDA (ruidosa), con evento de fallo. Nunca se
    // pierde la lectura histórica ni se oculta el fallo.
    await marcarSincronizacion(adapters, deps, tenantId, lecturaId, SINC_FALLIDA);
    await emitirFalloSincronizacion(adapters, deps, event.correlationId, {
      tenantId, activoId, tipoMedidor, lecturaId, motivo: ultimoError?.message ?? "sincronización agotó reintentos",
    });
    // Retorna ok para no bloquear el outbox (el fallo queda registrado y visible).
    return ok(undefined);
  });
}

/** Persiste el estado de sincronización de la lectura (no destructivo) + reproyecta. */
async function marcarSincronizacion(
  adapters: ModuleAdapters,
  deps: ServiceDeps,
  tenantId: string,
  lecturaId: string,
  estado: Parameters<typeof conSincronizacion>[1],
): Promise<void> {
  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
  await uowPort.execute(ctx, async (uow) => {
    const found = await adapters.lecturas.findById(tenantId, lecturaId);
    if (!found.ok || !found.value) return ok(undefined);
    if (found.value.sincronizacionActivo === estado) return ok(undefined);
    const actualizada = conSincronizacion(found.value, estado);
    const saved = await adapters.lecturas.replace(uow, actualizada);
    if (!saved.ok) return saved;
    if (adapters.readModel) {
      await adapters.readModel.aplicarLectura(uow, {
        tenantId, id: actualizada.id, activoId: actualizada.activoId, tipoMedidor: actualizada.tipoMedidor,
        valor: actualizada.valor, unidad: actualizada.unidad, fechaHora: new Date(actualizada.fechaHora),
        identityId: actualizada.identityId, origen: actualizada.origen, estado: actualizada.estado,
        inconsistente: actualizada.inconsistente, sincronizacionActivo: actualizada.sincronizacionActivo,
        datos: actualizada as unknown as Record<string, unknown>, lastEventId: `sync:${lecturaId}:${estado}`, actualizadoAt: new Date(),
      });
    }
    return ok(undefined);
  });
}

async function emitirFalloSincronizacion(
  adapters: ModuleAdapters,
  deps: ServiceDeps,
  correlationId: string,
  info: { tenantId: string; activoId: string; tipoMedidor: string; lecturaId: string; motivo: string },
): Promise<void> {
  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, correlationId, metadata: { tenantId: info.tenantId } });
  await uowPort.execute(ctx, async (uow) => {
    const dominio = createDomainEvent(SINCRONIZACION_FALLIDA, {
      tenantId: info.tenantId, activoId: info.activoId, tipoMedidor: info.tipoMedidor, lecturaId: info.lecturaId,
      motivo: info.motivo, actorId: SYSTEM_PRINCIPAL.id, actualizadoAt: new Date().toISOString(),
      resumen: `Sincronización con Activos FALLIDA (${info.tipoMedidor})`,
    }, correlationId);
    await adapters.eventLog.append(uow, {
      tenantId: info.tenantId, eventId: dominio.id, tipo: dominio.type, payload: dominio.payload,
      occurredAt: new Date().toISOString(),
    });
    uow.registerEvent(dominio);
    return ok(undefined);
  });
}
