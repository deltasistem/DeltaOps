/**
 * DGP-004 · Reference Module — Capa de aplicación + descriptor del módulo.
 * Se registra a través del ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime → registerPlatformService): capacidad, permisos,
 * eventos, policies, configuración, comandos, consultas, read models,
 * knowledge graph y observabilidad quedan inscritos automáticamente.
 *
 * Pipeline demostrado: HTTP → Command → Validation → Authorization → Policy
 * → Application Service → Repository → UoW → PostgreSQL → Outbox → Audit
 * → Projection → Read Model → Shared Services → API → Frontend.
 */
import { z } from "zod";
import {
  childContext,
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
import {
  audit,
  tenantOf,
  type PlatformServiceDefinition,
  type ServiceDeps,
} from "@workspace/platform";
import {
  activarElemento,
  archivarElemento,
  crearElemento,
  editarElemento,
  ELEMENTO_ACTIVADO,
  ELEMENTO_ACTUALIZADO,
  ELEMENTO_ARCHIVADO,
  ELEMENTO_CREADO,
  EVENTOS_MODULO,
  policiesDelModulo,
  POLICY_PUEDE_ARCHIVAR,
  POLICY_PUEDE_EDITAR,
  type CambioElemento,
  type ElementoReferencia,
  type Estado,
} from "./domain/elemento";
import type { ElementoReadModel, ElementoRepository } from "./infrastructure/repository";

export const MODULO = "modulo.referencia";

export interface ModuleAdapters {
  readonly repository: ElementoRepository;
  readonly readModel: ElementoReadModel;
}

/* ------------------------- Domain Service --------------------------------- */
/** Servicio de dominio: unicidad de nombre por tenant (requiere repositorio). */
async function nombreDisponible(
  repo: ElementoRepository,
  tenantId: string,
  nombre: string,
  exceptoId?: string,
): Promise<Result<void, KernelError>> {
  const existing = await repo.findByNombre(tenantId, nombre);
  if (!existing.ok) return existing;
  if (existing.value && existing.value.id !== exceptoId) {
    return fail(KernelErrors.conflict(`Ya existe un elemento con nombre "${nombre}"`));
  }
  return ok(undefined);
}

/* ---------------------- Application Service ------------------------------- */
/**
 * Application Service: orquesta dominio + repositorio + auditoría + eventos
 * dentro del Unit of Work del comando. No contiene reglas de dominio.
 */
async function persistirCambio(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  cambio: CambioElemento,
  accion: string,
  esCreacion: boolean,
  expectedVersion?: number,
): Promise<Result<ElementoReferencia, KernelError>> {
  const e = cambio.elemento;
  const persisted = esCreacion
    ? await adapters.repository.insert(uow, e)
    : await adapters.repository.update(uow, e, expectedVersion!);
  if (!persisted.ok) return persisted;

  const audited = await audit(deps.audit, uow, ctx, e.tenantId, MODULO, accion, e.id, {
    estado: e.estado,
    version: e.version,
  });
  if (!audited.ok) return audited;

  uow.registerEvent(
    createDomainEvent(cambio.evento.tipo, cambio.evento.payload, ctx.correlationId),
  );
  return ok(e);
}

/* ----------------------------- Proyección --------------------------------- */
/**
 * La proyección se construye SOLO desde el payload del evento (autosuficiente):
 * una reentrega tardía nunca proyecta un estado posterior bajo un evento viejo,
 * y el guard (last_event_id, version) del read model la hace idempotente.
 */
function proyeccion(adapters: ModuleAdapters) {
  return async (
    deps: ServiceDeps,
    event: { id: string; payload: Record<string, unknown> },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({
      principal: SYSTEM_PRINCIPAL,
      metadata: { tenantId },
    });
    const applied = await uowPort.execute(ctx, (uow) =>
      adapters.readModel.apply(uow, {
        tenantId,
        id,
        nombre: String(p["nombre"] ?? ""),
        descripcion: String(p["descripcion"] ?? ""),
        estado: p["estado"] as Estado,
        version: Number(p["version"] ?? 1),
        createdBy: String(p["createdBy"] ?? ""),
        lastEventId: event.id,
        actualizadoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
      }),
    );
    return applied.ok ? ok(undefined) : applied;
  };
}

/* --------------------------- Shared Services ------------------------------ */

async function ejecutarComoSistema(
  deps: ServiceDeps,
  tenantId: string,
  correlationId: string,
  comando: string,
  input: Record<string, unknown>,
): Promise<Result<unknown, KernelError>> {
  const ctx = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId,
    metadata: { tenantId },
  });
  return deps.runtime.commands.execute(ctx, comando, input);
}

/* ------------------------------ Descriptor -------------------------------- */

export function referenceModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  let policiesRegistradas = false;
  const conPolicies = (deps: ServiceDeps): void => {
    if (policiesRegistradas) return;
    for (const p of policiesDelModulo()) deps.runtime.policyEngine.register(p);
    policiesRegistradas = true;
  };

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Elemento de Referencia — módulo neutro patrón oficial (DGP-004); no representa negocio",
    capabilities: [
      {
        name: "gestionar-elementos-referencia",
        permissions: [
          "modulo.referencia.read",
          "modulo.referencia.write",
          "modulo.referencia.activar",
          "modulo.referencia.archivar",
        ],
        description: "Ciclo de vida completo del Elemento de Referencia",
      },
      {
        name: "consultar-elementos-referencia",
        permissions: ["modulo.referencia.read"],
        description: "Consulta de elementos y read models",
      },
    ],
    permissions: [
      "modulo.referencia.read",
      "modulo.referencia.write",
      "modulo.referencia.activar",
      "modulo.referencia.archivar",
      "modulo.referencia.admin",
    ],
    dependsOn: [
      "platform.search",
      "platform.notification",
      "platform.timeline",
      "platform.attachment",
      "platform.comment",
      "platform.dashboard",
      "platform.kpi",
      "platform.ai",
      "platform.integration",
      "platform.config",
    ],
    events: [...EVENTOS_MODULO],
    recordTypes: [], // el módulo usa tablas propias, no el Record Store
    configDefaults: {
      "max-longitud-nombre": "120",
      "archivado-directo": "false",
      "webhook-activacion": "", // id de webhook de platform.integration (opcional)
      "kpi-definicion-activos": "kpi-ref-activos",
    },
    commands: [
      // Crear — idempotente por id de cliente (soporte offline)
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            nombre: z.string().min(1),
            descripcion: z.string().default(""),
          }),
          authorization: { permissions: ["modulo.referencia.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const id = input.id ?? crypto.randomUUID();

            // Idempotencia offline: si el cliente reintenta con el mismo id,
            // el comando reconoce la aplicación previa y no duplica.
            if (input.id) {
              const previo = await adapters.repository.findById(tenant.value, id);
              if (!previo.ok) return previo;
              if (previo.value) return ok({ id, version: previo.value.version, idempotente: true });
            }

            const unico = await nombreDisponible(adapters.repository, tenant.value, input.nombre);
            if (!unico.ok) return unico;

            const maxCfg = await deps.tenantConfig.get(tenant.value, `${MODULO}.max-longitud-nombre`);
            const cambio = crearElemento({
              id,
              tenantId: tenant.value,
              nombre: input.nombre,
              descripcion: input.descripcion,
              actorId: ctx.principal.id,
              maxLongitudNombre: maxCfg.ok ? Number(maxCfg.value) : 120,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "crear", true);
            if (!saved.ok) return saved;
            return ok({ id, version: saved.value.version, idempotente: false });
          },
        };
      },
      // Editar — policy puede-editar + concurrencia optimista
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.referencia.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("elemento", input.id));

            const policy = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_EDITAR, ctx, {
              estado: actual.value.estado,
            });
            if (!policy.ok) return policy;

            if (input.nombre) {
              const unico = await nombreDisponible(adapters.repository, tenant.value, input.nombre, input.id);
              if (!unico.ok) return unico;
            }
            const maxCfg = await deps.tenantConfig.get(tenant.value, `${MODULO}.max-longitud-nombre`);
            const cambio = editarElemento(
              actual.value,
              { nombre: input.nombre, descripcion: input.descripcion },
              ctx.principal.id,
              maxCfg.ok ? Number(maxCfg.value) : 120,
              new Date(),
            );
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(
              deps, adapters, ctx, uow, cambio.value, "editar", false, input.expectedVersion,
            );
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Activar — transición BORRADOR → ACTIVO
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.activar`,
          inputSchema: z.object({ id: z.string(), expectedVersion: z.number().int().positive() }),
          authorization: { permissions: ["modulo.referencia.activar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("elemento", input.id));
            const cambio = activarElemento(actual.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(
              deps, adapters, ctx, uow, cambio.value, "activar", false, input.expectedVersion,
            );
            if (!saved.ok) return saved;
            return ok({ id: input.id, estado: saved.value.estado, version: saved.value.version });
          },
        };
      },
      // Archivar — policy puede-archivar (config por tenant)
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.archivar`,
          inputSchema: z.object({ id: z.string(), expectedVersion: z.number().int().positive() }),
          authorization: { permissions: ["modulo.referencia.archivar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("elemento", input.id));

            const directoCfg = await deps.tenantConfig.get(tenant.value, `${MODULO}.archivado-directo`);
            const policy = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_ARCHIVAR, ctx, {
              estado: actual.value.estado,
              archivadoDirecto: directoCfg.ok && directoCfg.value === "true",
            });
            if (!policy.ok) return policy;

            const cambio = archivarElemento(actual.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(
              deps, adapters, ctx, uow, cambio.value, "archivar", false, input.expectedVersion,
            );
            if (!saved.ok) return saved;
            return ok({ id: input.id, estado: saved.value.estado, version: saved.value.version });
          },
        };
      },
      // Reproyección (replay): reconstruye el read model desde los aggregates
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reproyectar`,
          inputSchema: z.object({}),
          authorization: { permissions: ["modulo.referencia.admin"] },
          async handle(ctx, _input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const cleared = await adapters.readModel.clear(uow, tenant.value);
            if (!cleared.ok) return cleared;
            const all = await adapters.repository.list(tenant.value, { limit: 1000 });
            if (!all.ok) return all;
            let proyectados = 0;
            for (const e of all.value) {
              const applied = await adapters.readModel.apply(uow, {
                tenantId: tenant.value,
                id: e.id,
                nombre: e.nombre,
                descripcion: e.descripcion,
                estado: e.estado,
                version: e.version,
                createdBy: e.createdBy,
                lastEventId: `replay:${crypto.randomUUID()}`,
                actualizadoAt: e.updatedAt,
              });
              if (!applied.ok) return applied;
              proyectados += 1;
            }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reproyectar", "-", {
              proyectados,
            });
            if (!audited.ok) return audited;
            return ok({ proyectados });
          },
        };
      },
      // AI Hook: sugerir descripción vía platform.ai (Fake Provider)
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sugerirDescripcion`,
          inputSchema: z.object({ nombre: z.string().min(1) }),
          authorization: { permissions: ["modulo.referencia.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await deps.runtime.commands.execute(childContext(ctx), "platform.ai.infer", {
              modelo: "fake-modelo-referencia",
              proveedor: "fake",
              prompt: `Descripción neutra para el elemento de referencia "${input.nombre}"`,
            });
            if (!r.ok) return r;
            return ok({ sugerencia: (r.value as { respuesta?: string }).respuesta ?? String(r.value) });
          },
        };
      },
    ],
    queries: [
      // Listado desde el READ MODEL (CQRS: lecturas nunca tocan el aggregate)
      () => ({
        name: `${MODULO}.listar`,
        inputSchema: z.object({
          estado: z.enum(["BORRADOR", "ACTIVO", "ARCHIVADO"]).optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
        authorization: { permissions: ["modulo.referencia.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return adapters.readModel.list(tenant.value, {
            estado: input.estado as Estado | undefined,
            limit: input.limit,
          });
        },
      }),
      // Detalle: SOLO read model (CQRS estricto — las consultas nunca tocan
      // el aggregate; la fuente de verdad solo la leen los comandos)
      () => ({
        name: `${MODULO}.detalle`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["modulo.referencia.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rm = await adapters.readModel.get(tenant.value, input.id);
          if (!rm.ok) return rm;
          if (!rm.value) return fail(KernelErrors.notFound("elemento", input.id));
          return ok({ elemento: rm.value, readModel: rm.value });
        },
      }),
      // Dashboard del módulo: stats del read model
      () => ({
        name: `${MODULO}.dashboard`,
        inputSchema: z.object({}),
        authorization: { permissions: ["modulo.referencia.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const stats = await adapters.readModel.stats(tenant.value);
          if (!stats.ok) return stats;
          const total = Object.values(stats.value).reduce((a, b) => a + b, 0);
          return ok({ total, porEstado: stats.value });
        },
      }),
      // Consola técnica del módulo: configuración efectiva + contrato
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({}),
        authorization: { permissions: ["modulo.referencia.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const claves = [
            "max-longitud-nombre",
            "archivado-directo",
            "webhook-activacion",
            "kpi-definicion-activos",
          ];
          const config: Record<string, string> = {};
          for (const k of claves) {
            const v = await deps.tenantConfig.get(tenant.value, `${MODULO}.${k}`);
            config[k] = v.ok ? v.value : "";
          }
          return ok({
            modulo: MODULO,
            version: "1.0.0",
            estados: ["BORRADOR", "ACTIVO", "ARCHIVADO"],
            eventos: EVENTOS_MODULO,
            policies: [POLICY_PUEDE_EDITAR, POLICY_PUEDE_ARCHIVAR],
            configuracion: config,
          });
        },
      }),
    ],
    eventHandlers: [
      // Projection: todos los eventos del módulo actualizan el read model
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccion(adapters)(deps, event),
      })),
      // Search: indexación automática en creación/actualización
      ...[ELEMENTO_CREADO, ELEMENTO_ACTUALIZADO].map((eventType) => ({
        eventType,
        handlerName: `indexar:${eventType}`,
        handle: (deps: ServiceDeps) => async (event: {
          payload: Record<string, unknown>;
          correlationId: string;
        }) => {
          const p = event.payload;
          const tenantId = String(p["tenantId"] ?? "");
          const id = String(p["id"] ?? "");
          if (!tenantId || !id) return ok(undefined);
          // Indexación desde el payload (documentId estable ⇒ upsert idempotente)
          const r = await ejecutarComoSistema(deps, tenantId, event.correlationId, "platform.search.indexDocument", {
            documentId: `ref:${id}`,
            entityType: "elemento-referencia",
            entityRef: `ref:${id}`,
            titulo: String(p["nombre"] ?? ""),
            contenido: String(p["descripcion"] ?? ""),
          });
          return r.ok ? ok(undefined) : r;
        },
      })),
      // Notification + KPI + Integration Hook en activación.
      // Idempotencia ante reentrega (outbox at-least-once): el snapshot KPI
      // lleva el eventId como dimensión y actúa de recibo; si ya existe, el
      // handler completo se considera aplicado y no repite ningún efecto.
      {
        eventType: ELEMENTO_ACTIVADO,
        handlerName: "efectos-activacion",
        handle: (deps: ServiceDeps) => async (event: {
          id: string;
          payload: Record<string, unknown>;
          correlationId: string;
        }) => {
          const p = event.payload;
          const tenantId = String(p["tenantId"] ?? "");
          const id = String(p["id"] ?? "");
          const nombre = String(p["nombre"] ?? "");
          const createdBy = String(p["createdBy"] ?? "");
          if (!tenantId || !id) return ok(undefined);

          const sysCtx = createExecutionContext({
            principal: SYSTEM_PRINCIPAL,
            correlationId: event.correlationId,
            metadata: { tenantId },
          });

          // Definición KPI asegurada por código (buscada por `codigo`)
          const defCfg = await deps.tenantConfig.get(tenantId, `${MODULO}.kpi-definicion-activos`);
          const codigo = defCfg.ok && defCfg.value ? defCfg.value : "kpi-ref-activos";
          const defs = await deps.runtime.queries.execute(sysCtx, "platform.kpi.definition.list", {});
          if (!defs.ok) return defs;
          let definitionId = (defs.value as { id: string; data: Record<string, unknown> }[]).find(
            (d) => d.data["codigo"] === codigo,
          )?.id;
          if (!definitionId) {
            const created = await ejecutarComoSistema(
              deps, tenantId, event.correlationId, "platform.kpi.definition.create",
              { data: { codigo, nombre: "Elementos de referencia activos", unidad: "elementos" } },
            );
            if (!created.ok) return created;
            definitionId = (created.value as { id: string }).id;
          }

          // Recibo de idempotencia: ¿ya existe un snapshot con este eventId?
          const previos = await deps.runtime.queries.execute(sysCtx, "platform.kpi.results", {
            definitionId,
          });
          if (previos.ok) {
            const yaAplicado = (previos.value as { data: Record<string, unknown> }[]).some(
              (s) => (s.data["dimensiones"] as Record<string, string> | undefined)?.["eventId"] === event.id,
            );
            if (yaAplicado) return ok(undefined);
          }

          // Notificación al creador (groupKey por evento ⇒ agrupable/dedupe)
          const noti = await ejecutarComoSistema(deps, tenantId, event.correlationId, "platform.notification.queue", {
            destinatarios: [createdBy],
            canal: "inapp",
            prioridad: "normal",
            asunto: `Elemento activado: ${nombre}`,
            cuerpo: `El elemento de referencia "${nombre}" pasó a estado ACTIVO.`,
            groupKey: `ref-activacion:${event.id}`,
          });
          if (!noti.ok) return noti;

          // Integration Hook: webhook opcional configurado por tenant
          // (payload con eventId para deduplicación del receptor)
          const whCfg = await deps.tenantConfig.get(tenantId, `${MODULO}.webhook-activacion`);
          if (whCfg.ok && whCfg.value) {
            const wh = await ejecutarComoSistema(
              deps, tenantId, event.correlationId, "platform.integration.webhook.dispatch",
              { webhookId: whCfg.value, payload: { evento: ELEMENTO_ACTIVADO, eventId: event.id, id, nombre } },
            );
            if (!wh.ok) return wh;
          }

          // KPI snapshot AL FINAL: sella el recibo del handler completo
          const activos = await adapters.repository.list(tenantId, { estado: "ACTIVO", limit: 1000 });
          const kpi = await ejecutarComoSistema(deps, tenantId, event.correlationId, "platform.kpi.snapshot", {
            definitionId,
            valor: activos.ok ? activos.value.length : 0,
            periodo: new Date().toISOString().slice(0, 10),
            dimensiones: { modulo: MODULO, eventId: event.id },
          });
          if (!kpi.ok) return kpi;
          return ok(undefined);
        },
      },
    ],
    healthCheck: () => async () => {
      const probe = await adapters.readModel.stats("healthcheck");
      return probe.ok
        ? { healthy: true, detail: "repositorio y read model operativos" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}
