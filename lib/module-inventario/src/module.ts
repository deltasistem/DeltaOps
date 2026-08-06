/**
 * DGP-011.1 · Módulo Enterprise Inventory — Capa de aplicación + descriptor.
 *
 * SOLO dominio + aplicación: se registra por el ÚNICO mecanismo permitido
 * (extraServices de createPlatformRuntime). NADA de persistencia real, read
 * models, OpenAPI/UI/dashboards ni motor de workflow: transferencias, ajustes y
 * conteos operan sobre CONTRATOS neutros de workflow (workflow.ts). NO hay modo
 * directo/auto-aprobación en el ensamblaje operativo: sin un `WorkflowPort`
 * aprobado (el adaptador real llega en DGP-011.2), los comandos gobernados
 * FALLAN de forma segura con error de configuración y no alteran existencias.
 *
 * INVARIANTE DURA: el stock NUNCA se muta directamente; TODO cambio de
 * existencias nace de un movimiento-evento aplicado por el dominio.
 */
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  fail,
  KernelErrors,
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
import { MODULO } from "./module-name";
import { CATALOGOS, recordTypesCatalogos, type NombreCatalogo } from "./domain/catalogos";

/** Enum Zod de nombres de catálogo (tupla mutable requerida por zod v3). */
const catalogoEnum = z.enum([...CATALOGOS] as [string, ...string[]]);
import { EVENTOS_MODULO } from "./domain/events";
import {
  aplicarCostos,
  crearItem,
  editarItem,
  eliminarItem,
  requiereLote,
  requiereSerie,
  type ItemInventario,
} from "./domain/item";
import {
  aplicarMovimientoInventario,
  crearExistencia,
  type Inventario,
} from "./domain/inventario";
import { crearBodega, crearUbicacion } from "./domain/bodega";
import { crearLoteInventario, registrarSerie } from "./domain/lote-serie";
import { crearReserva, liberarReserva } from "./domain/reserva";
import { aplicarEstadoTransferencia, crearTransferencia } from "./domain/transferencia";
import { aplicarEstadoAjuste, crearAjuste } from "./domain/ajuste";
import { cerrarConteo, iniciarConteo, registrarConteo } from "./domain/conteo";
import type { FamiliaMovimiento } from "./domain/stock";
import { totalStock } from "./domain/stock";
import type { ReferenciaWorkflow } from "./domain/workflow";
import {
  policiesDelModulo,
  POLICY_PUEDE_AJUSTAR,
  POLICY_PUEDE_CERRAR_CONTEO,
  POLICY_PUEDE_CONTAR,
  POLICY_PUEDE_CREAR_ITEM,
  POLICY_PUEDE_ELIMINAR_ITEM,
  POLICY_PUEDE_LIBERAR_RESERVA,
  POLICY_PUEDE_MODIFICAR_ITEM,
  POLICY_PUEDE_MOVER_INVENTARIO,
  POLICY_PUEDE_RESERVAR,
  POLICY_PUEDE_TRANSFERIR,
} from "./domain/policies";
import {
  crearCostoUltimaCompra,
  crearSku,
  crearUbicacionFisica,
  recalcularPromedio,
  type UbicacionFisica,
} from "./domain/value-objects";
import {
  CONFIG_CODIGO_DEFAULT,
  type AjusteRepository,
  type BodegaRepository,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type ConteoRepository,
  type InventarioRepository,
  type ItemRepository,
  type LoteSerieRepository,
  type ReciboPort,
  type ReservaRepository,
  type TransferenciaRepository,
} from "./domain/ports";
import type { ProcesoWorkflow, WorkflowPort } from "./domain/workflow";
import type {
  ConsolaStore,
  EventLogStore,
  ExistenciaReadRow,
  ReadModelsStore,
  SyncReceiptStore,
} from "./infrastructure/operacional";
import {
  aplicarEventoAggregate,
  aplicarEventoOperacional,
  handlerProyeccion,
} from "./projection";

export { MODULO };

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly items: ItemRepository;
  readonly inventario: InventarioRepository;
  readonly bodegas: BodegaRepository;
  readonly lotesSeries: LoteSerieRepository;
  readonly reservas: ReservaRepository;
  readonly transferencias: TransferenciaRepository;
  readonly ajustes: AjusteRepository;
  readonly conteos: ConteoRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  /** Read models CQRS (items/existencias/movimientos + proyectados). */
  readonly readModel: ReadModelsStore;
  /** Bitácora de eventos durable (fuente de verdad del replay/reproyección). */
  readonly eventLog: EventLogStore;
  /** Recibos de sincronización offline (protocolo de reclamación durable). */
  readonly syncReceipts: SyncReceiptStore;
  /** Consola técnica (diagnóstico del outbox del Kernel filtrado al módulo). */
  readonly consola: ConsolaStore;
  /**
   * Adaptador del Workflow Engine (contrato neutro). Es OPCIONAL en el tipo
   * porque el módulo puede montarse sin él, pero los comandos gobernados
   * (transferir, completar-transferencia, ajustar, cerrar-conteo) FALLAN de
   * forma segura si no está provisto — nunca auto-aprueban. El adaptador real
   * llega en DGP-011.2; la auto-aprobación es EXCLUSIVA de pruebas.
   */
  readonly workflow?: WorkflowPort;
}

/**
 * Exige un `WorkflowPort` aprobado para operar un proceso gobernado. Sin él, la
 * operación se rechaza de forma segura con error de configuración (nunca
 * auto-aprueba ni altera stock/transferencias/ajustes/conteos).
 */
function exigirWorkflow(
  adapters: ModuleAdapters,
  proceso: ProcesoWorkflow,
): Result<WorkflowPort, KernelError> {
  if (!adapters.workflow) {
    return fail(
      KernelErrors.conflict(
        `El proceso gobernado "${proceso}" requiere un adaptador de Workflow Engine aprobado; el módulo no está configurado con uno. Operación rechazada sin efectos.`,
        { proceso, motivo: "workflow-no-configurado" },
      ),
    );
  }
  return ok(adapters.workflow);
}

/* ------------------------------ Configuración ---------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

async function configCodigo(deps: ServiceDeps, tenant: string): Promise<ConfigCodigo> {
  return {
    prefijo: await cfg(deps, tenant, "codigo-prefijo", CONFIG_CODIGO_DEFAULT.prefijo),
    separador: await cfg(deps, tenant, "codigo-separador", CONFIG_CODIGO_DEFAULT.separador),
    padding: Number(await cfg(deps, tenant, "codigo-padding", String(CONFIG_CODIGO_DEFAULT.padding))),
    serie: await cfg(deps, tenant, "codigo-serie", CONFIG_CODIGO_DEFAULT.serie),
  };
}

/* --------------------------- Emisión de eventos -------------------------- */

/**
 * Emite un evento AUTOSUFICIENTE del módulo de forma DURABLE: lo persiste en la
 * bitácora de eventos (`inv_eventos`, fuente de verdad del replay/reproyección)
 * y lo registra en el outbox del Kernel con el MISMO id de dominio (transporte
 * at-least-once hacia handlers idempotentes). El payload lleva el snapshot
 * completo para proyecciones sin releer el aggregate. Ambas escrituras ocurren
 * en la misma UoW del comando ⇒ atomicidad efecto/bitácora/outbox.
 */
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
    occurredAt: dominio.occurredAt,
  });
  if (!appended.ok) return appended;
  uow.registerEvent(dominio);
  return ok(undefined);
}

/**
 * Registra un evento del módulo en el SHARED TIMELINE canónico de plataforma
 * mediante el COMANDO `platform.timeline.record` (NUNCA escritura directa a las
 * tablas de plataforma). Idempotente por `entryId = event.id`: una reentrega
 * tardía del outbox (at-least-once) NO duplica la entrada. Corre bajo un ctx de
 * sistema que propaga el `correlationId` del evento y el tenant del payload
 * (eventos autosuficientes). Mismo patrón que module-ordenes/activos (DGP-009.2).
 */
function registrarEnTimeline() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    if (!tenantId) return ok(undefined);
    const entityRef = String(p["entityRef"] ?? (p["id"] ? `inventario:${String(p["id"])}` : ""));
    if (!entityRef) return ok(undefined);
    const resumen = String(
      p["sku"] ?? p["codigo"] ?? p["numero"] ?? p["tipo"] ?? p["motivo"] ?? event.type,
    );
    const occurredAt = String(
      p["registradoAt"] ?? p["actualizadoAt"] ?? p["ocurridoAt"] ?? new Date().toISOString(),
    );
    const sys = createExecutionContext({
      principal: SYSTEM_PRINCIPAL,
      correlationId: event.correlationId,
      metadata: { tenantId },
    });
    const r = await deps.runtime.commands.execute(sys, "platform.timeline.record", {
      entryId: event.id,
      entityRef,
      eventType: event.type,
      actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
      occurredAt,
      resumen,
      estado: p["estado"] != null ? String(p["estado"]) : null,
      entidadRelacionada: p["itemId"] != null ? `inventario-item:${String(p["itemId"])}` : null,
      payload: p,
    });
    return r.ok ? ok(undefined) : (r as Result<void, KernelError>);
  };
}

/**
 * Reconstruye la forma canónica de existencia CQRS: expone el modelo `stock` con
 * los 7 buckets (más `total`) a partir de la fila plana del read model, para
 * mantener el contrato de lectura del dominio (011.1) sin releer el aggregate.
 */
function conStock(row: ExistenciaReadRow): Record<string, unknown> {
  return {
    ...row,
    stock: {
      disponible: row.disponible,
      reservado: row.reservado,
      comprometido: row.comprometido,
      enTransito: row.enTransito,
      enInspeccion: row.enInspeccion,
      bloqueado: row.bloqueado,
      vencido: row.vencido,
    },
    total: row.total,
  };
}

/* --------------------------- Idempotencia offline ------------------------ */

async function reciboPrevio(
  adapters: ModuleAdapters,
  tenant: string,
  comando: string,
  opId: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (!opId) return null;
  const previo = await adapters.recibos.buscar(tenant, comando, opId);
  return previo.ok && previo.value ? previo.value.resultado : null;
}

async function sellarRecibo(
  adapters: ModuleAdapters,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
  resultado: Record<string, unknown>,
  actorId: string,
): Promise<Result<void, KernelError>> {
  if (!opId) return ok(undefined);
  return adapters.recibos.sellar(uow, tenant, { opId, comando, resultado }, actorId);
}

/* -------------------------- Validación de catálogos ---------------------- */

async function validarClasificacion(
  adapters: ModuleAdapters,
  tenant: string,
  claves: Partial<Record<NombreCatalogo, string | null | undefined>>,
  obligatorios: readonly NombreCatalogo[],
): Promise<Result<void, KernelError>> {
  for (const [catalogo, valor] of Object.entries(claves) as [NombreCatalogo, string | null | undefined][]) {
    const r = await adapters.catalogos.validarReferencia(tenant, catalogo, valor, obligatorios.includes(catalogo));
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/**
 * Traduce la clave de `tipos-movimiento` del tenant a una familia contable
 * neutra. La correspondencia es CONFIGURABLE (config `familia-movimiento.<clave>`)
 * y cae al mapeo canónico por defecto cuando no está configurada. NUNCA es un
 * enum de dominio.
 */
const FAMILIA_CANONICA: Record<string, FamiliaMovimiento> = {
  entrada: "entrada",
  salida: "salida",
  transferencia: "transferencia-salida",
  reserva: "reserva",
  liberacion: "liberacion",
  consumo: "consumo",
  devolucion: "devolucion",
  "ajuste-positivo": "ajuste-positivo",
  "ajuste-negativo": "ajuste-negativo",
  conteo: "conteo",
  inicializacion: "inicializacion",
  correccion: "correccion",
};

async function familiaDe(deps: ServiceDeps, tenant: string, tipo: string): Promise<FamiliaMovimiento | null> {
  const cfgFamilia = await cfg(deps, tenant, `familia-movimiento.${tipo}`, "");
  if (cfgFamilia) return cfgFamilia as FamiliaMovimiento;
  return FAMILIA_CANONICA[tipo] ?? null;
}

/* ------------------------------ Descriptor ------------------------------- */

export function inventarioModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Enterprise Inventory — dominio (DGP-011.1): items, existencias por bodega/ubicación jerárquica, movimientos SOLO por eventos, lotes/series/vencimientos, reservas, transferencias/ajustes/conteos preparados por CONTRATOS de workflow, catálogos configurables por tenant, offline-first con recibos de idempotencia.",
    capabilities: [
      {
        name: "gestionar-items",
        permissions: [`${MODULO}.read`, `${MODULO}.write`],
        description: "Alta, edición y clasificación de items de inventario",
      },
      {
        name: "operar-inventario",
        permissions: [`${MODULO}.read`, `${MODULO}.move`],
        description: "Registro de movimientos e inicialización de existencias",
      },
      {
        name: "reservar-inventario",
        permissions: [`${MODULO}.read`, `${MODULO}.reserve`],
        description: "Reservas y liberaciones para OT/proyectos/solicitudes",
      },
      {
        name: "transferir-inventario",
        permissions: [`${MODULO}.read`, `${MODULO}.transfer`],
        description: "Transferencias entre ubicaciones/bodegas/empresas",
      },
      {
        name: "contar-inventario",
        permissions: [`${MODULO}.read`, `${MODULO}.count`],
        description: "Conteos físicos parciales/cíclicos/generales y reconteos",
      },
      {
        name: "ajustar-inventario",
        permissions: [`${MODULO}.read`, `${MODULO}.adjust`],
        description: "Ajustes de existencias por merma/sobrante/corrección",
      },
      {
        name: "administrar-inventario",
        permissions: [`${MODULO}.admin`],
        description: "Administración de catálogos, bodegas y configuración",
      },
    ],
    permissions: [
      `${MODULO}.read`,
      `${MODULO}.write`,
      `${MODULO}.move`,
      `${MODULO}.reserve`,
      `${MODULO}.transfer`,
      `${MODULO}.count`,
      `${MODULO}.adjust`,
      `${MODULO}.admin`,
    ],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "inventario-item",
      "inventario-existencia",
      "inventario-movimiento",
      "inventario-bodega",
      "inventario-ubicacion",
      "inventario-lote",
      "inventario-serie",
      "inventario-reserva",
      "inventario-transferencia",
      "inventario-ajuste",
      "inventario-conteo",
      "secuencia",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "max-longitud-nombre": "200",
      "codigo-prefijo": "ITM",
      "codigo-separador": "-",
      "codigo-padding": "6",
      "codigo-serie": "default",
      "moneda-defecto": "USD",
      "exigir-item-activo-para-mover": "false",
    },
    commands: [
      /* ------------------------------ crear item ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-item`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            sku: z.string().min(1),
            nombre: z.string().min(1),
            descripcion: z.string().optional(),
            estado: z.string().min(1),
            tipoItem: z.string().min(1),
            categoria: z.string().nullable().optional(),
            familia: z.string().nullable().optional(),
            subfamilia: z.string().nullable().optional(),
            marca: z.string().nullable().optional(),
            fabricante: z.string().nullable().optional(),
            modelo: z.string().nullable().optional(),
            empresa: z.string().nullable().optional(),
            centroCosto: z.string().nullable().optional(),
            proyecto: z.string().nullable().optional(),
            unidadBase: z.object({ clave: z.string().min(1), etiqueta: z.string().optional(), factorBase: z.number().positive().optional() }),
            modoTrazabilidad: z.enum(["sin-lote", "con-lote", "con-serie", "lote-y-serie"]),
            controlaVencimiento: z.boolean().optional(),
            reposicion: z.object({ minimo: z.number().nonnegative().optional(), maximo: z.number().nonnegative().optional(), puntoReorden: z.number().nonnegative().optional() }).optional(),
            leadTimeDias: z.number().int().nonnegative().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-item`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_ITEM, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters,
              tenant.value,
              {
                "tipos-item": input.tipoItem,
                categorias: input.categoria,
                familias: input.familia,
                subfamilias: input.subfamilia,
                marcas: input.marca,
                fabricantes: input.fabricante,
                modelos: input.modelo,
                unidades: input.unidadBase.clave,
                "estados-item": input.estado,
                empresas: input.empresa,
                "centros-costo": input.centroCosto,
                proyectos: input.proyecto,
              },
              ["tipos-item", "unidades", "estados-item"],
            );
            if (!val.ok) return val;

            const sku = crearSku({ valor: input.sku });
            if (!sku.ok) return sku;

            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value), ctx.principal.id);
            if (!codigo.ok) return codigo;

            const id = input.id ?? crypto.randomUUID();
            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "200"));
            const cambio = crearItem({
              id,
              tenantId: tenant.value,
              codigo: codigo.value,
              sku: sku.value,
              nombre: input.nombre,
              descripcion: input.descripcion,
              estado: input.estado,
              clasificacion: {
                tipoItem: input.tipoItem,
                categoria: input.categoria ?? null,
                familia: input.familia ?? null,
                subfamilia: input.subfamilia ?? null,
                marca: input.marca ?? null,
                fabricante: input.fabricante ?? null,
                modelo: input.modelo ?? null,
                empresa: input.empresa ?? null,
                centroCosto: input.centroCosto ?? null,
                proyecto: input.proyecto ?? null,
              },
              unidadBase: {
                clave: input.unidadBase.clave,
                ...(input.unidadBase.etiqueta !== undefined ? { etiqueta: input.unidadBase.etiqueta } : {}),
                factorBase: input.unidadBase.factorBase ?? 1,
              },
              modoTrazabilidad: input.modoTrazabilidad,
              controlaVencimiento: input.controlaVencimiento ?? false,
              reposicion: {
                minimo: input.reposicion?.minimo ?? 0,
                maximo: input.reposicion?.maximo ?? 0,
                puntoReorden: input.reposicion?.puntoReorden ?? 0,
              },
              leadTime: input.leadTimeDias !== undefined ? { dias: input.leadTimeDias } : null,
              actorId: ctx.principal.id,
              maxLongitudNombre: maxNombre,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            const saved = await adapters.items.insert(uow, cambio.value.item);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-item", id, { sku: sku.value.valor });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id, codigo: codigo.value.valor, sku: sku.value.valor, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-item`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------------- editar item ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-item`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().optional(),
            estado: z.string().min(1).optional(),
            reposicion: z.object({ minimo: z.number().nonnegative(), maximo: z.number().nonnegative(), puntoReorden: z.number().nonnegative() }).optional(),
            leadTimeDias: z.number().int().nonnegative().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.editar-item`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.items.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-item", input.id));
            const item = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_MODIFICAR_ITEM, { eliminado: item.eliminado });
            if (!pol.ok) return pol;

            if (input.estado !== undefined) {
              const v = await adapters.catalogos.validarReferencia(tenant.value, "estados-item", input.estado, true);
              if (!v.ok) return v;
            }

            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "200"));
            const cambio = editarItem(
              item,
              {
                ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
                ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {}),
                ...(input.estado !== undefined ? { estado: input.estado } : {}),
                ...(input.reposicion !== undefined ? { reposicion: input.reposicion } : {}),
                ...(input.leadTimeDias !== undefined ? { leadTime: input.leadTimeDias === null ? null : { dias: input.leadTimeDias } } : {}),
              },
              ctx.principal.id,
              maxNombre,
              new Date(),
            );
            if (!cambio.ok) return cambio;

            const saved = await adapters.items.update(uow, cambio.value.item, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-item", input.id, { version: saved.value.version });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id: input.id, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.editar-item`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- eliminar item ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.eliminar-item`,
          inputSchema: z.object({ id: z.string(), expectedVersion: z.number().int().positive(), opId: z.string().optional() }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.eliminar-item`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.items.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-item", input.id));

            const existencias = await adapters.inventario.listPorItem(tenant.value, input.id);
            if (!existencias.ok) return existencias;
            const conExistencias = existencias.value.some((e) => totalStock(e.stock) > 0);

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ELIMINAR_ITEM, { eliminado: found.value.eliminado, conExistencias });
            if (!pol.ok) return pol;

            const cambio = eliminarItem(found.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await adapters.items.update(uow, cambio.value.item, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "eliminar-item", input.id, {});
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id: input.id, version: saved.value.version, eliminado: true };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.eliminar-item`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- crear bodega ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-bodega`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            codigo: z.string().min(1),
            nombre: z.string().min(1),
            tipo: z.string().min(1),
            empresa: z.string().nullable().optional(),
            padreId: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-bodega`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const val = await validarClasificacion(
              adapters,
              tenant.value,
              { "tipos-bodega": input.tipo, empresas: input.empresa },
              ["tipos-bodega"],
            );
            if (!val.ok) return val;

            let padre = null;
            if (input.padreId) {
              const p = await adapters.bodegas.findById(tenant.value, input.padreId);
              if (!p.ok) return p;
              if (!p.value) return fail(KernelErrors.notFound("inventario-bodega", input.padreId));
              padre = p.value;
            }
            const id = input.id ?? crypto.randomUUID();
            const cambio = crearBodega({
              id,
              tenantId: tenant.value,
              codigo: input.codigo,
              nombre: input.nombre,
              tipo: input.tipo,
              empresa: input.empresa ?? null,
              padre,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.bodegas.insert(uow, cambio.value.bodega);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-bodega", id, {});
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id, codigo: input.codigo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-bodega`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- crear ubicación ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-ubicacion`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            bodegaId: z.string().min(1),
            padreId: z.string().nullable().optional(),
            nivel: z.string().min(1),
            valor: z.string().min(1),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-ubicacion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const bodega = await adapters.bodegas.findById(tenant.value, input.bodegaId);
            if (!bodega.ok) return bodega;
            if (!bodega.value) return fail(KernelErrors.notFound("inventario-bodega", input.bodegaId));

            const nivelVal = await adapters.catalogos.validarReferencia(tenant.value, "tipos-ubicacion", input.nivel, true);
            if (!nivelVal.ok) return nivelVal;

            let padre = null;
            if (input.padreId) {
              const p = await adapters.bodegas.findUbicacion(tenant.value, input.padreId);
              if (!p.ok) return p;
              if (!p.value) return fail(KernelErrors.notFound("inventario-ubicacion", input.padreId));
              padre = p.value;
            }
            const id = input.id ?? crypto.randomUUID();
            const cambio = crearUbicacion({
              id,
              tenantId: tenant.value,
              bodega: bodega.value,
              padre,
              segmento: { nivel: input.nivel, valor: input.valor },
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.bodegas.insertUbicacion(uow, cambio.value.ubicacion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-ubicacion", id, { ruta: cambio.value.ubicacion.ruta });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id, ruta: cambio.value.ubicacion.ruta };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-ubicacion`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ crear lote ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-lote`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            itemId: z.string().min(1),
            codigo: z.string().min(1),
            vencimiento: z.string().nullable().optional(),
            diasAlerta: z.number().int().nonnegative().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-lote`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const item = await adapters.items.findById(tenant.value, input.itemId);
            if (!item.ok) return item;
            if (!item.value) return fail(KernelErrors.notFound("inventario-item", input.itemId));
            if (!requiereLote(item.value.modoTrazabilidad)) {
              return fail(KernelErrors.validation("El item no está configurado para trazabilidad por lote"));
            }
            const id = input.id ?? crypto.randomUUID();
            const cambio = crearLoteInventario({
              id,
              tenantId: tenant.value,
              itemId: input.itemId,
              codigo: input.codigo,
              vencimiento: input.vencimiento ? { fecha: input.vencimiento, diasAlerta: input.diasAlerta ?? 0 } : null,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.lotesSeries.insertLote(uow, cambio.value.lote);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-lote", id, { codigo: input.codigo });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id, codigo: input.codigo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-lote`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- registrar serie ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-serie`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            itemId: z.string().min(1),
            numero: z.string().min(1),
            loteCodigo: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrar-serie`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const item = await adapters.items.findById(tenant.value, input.itemId);
            if (!item.ok) return item;
            if (!item.value) return fail(KernelErrors.notFound("inventario-item", input.itemId));
            if (!requiereSerie(item.value.modoTrazabilidad)) {
              return fail(KernelErrors.validation("El item no está configurado para trazabilidad por serie"));
            }
            const id = input.id ?? crypto.randomUUID();
            const cambio = registrarSerie({
              id,
              tenantId: tenant.value,
              itemId: input.itemId,
              numero: input.numero,
              loteCodigo: input.loteCodigo ?? null,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.lotesSeries.insertSerie(uow, cambio.value.serie);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-serie", id, { numero: input.numero });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id, numero: input.numero };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.registrar-serie`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- mover inventario --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.mover`,
          inputSchema: z.object({
            movimientoId: z.string().uuid().optional(),
            opId: z.string().optional(),
            itemId: z.string().min(1),
            bodegaId: z.string().min(1),
            ubicacionId: z.string().min(1),
            loteCodigo: z.string().nullable().optional(),
            serieNumero: z.string().nullable().optional(),
            tipo: z.string().min(1),
            motivo: z.string().nullable().optional(),
            cantidad: z.number().finite().nonnegative(),
            objetivo: z.number().finite().nonnegative().optional(),
            costoUnitario: z.number().finite().nonnegative().optional(),
            moneda: z.string().optional(),
            referencia: z.object({ tipo: z.string(), id: z.string() }).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.move`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.mover`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const item = await adapters.items.findById(tenant.value, input.itemId);
            if (!item.ok) return item;
            if (!item.value) return fail(KernelErrors.notFound("inventario-item", input.itemId));

            const exigir = (await cfg(deps, tenant.value, "exigir-item-activo-para-mover", "false")) === "true";
            const pol = evaluar(deps, ctx, POLICY_PUEDE_MOVER_INVENTARIO, {
              itemEliminado: item.value.eliminado,
              itemActivo: item.value.estado === "activo",
              exigirItemActivo: exigir,
            });
            if (!pol.ok) return pol;

            // Validaciones de trazabilidad + catálogos.
            const tipoVal = await adapters.catalogos.validarReferencia(tenant.value, "tipos-movimiento", input.tipo, true);
            if (!tipoVal.ok) return tipoVal;
            if (input.motivo) {
              const mv = await adapters.catalogos.validarReferencia(tenant.value, "motivos-movimiento", input.motivo, false);
              if (!mv.ok) return mv;
            }
            const trazErr = validarTrazabilidad(item.value, input.loteCodigo ?? null, input.serieNumero ?? null);
            if (trazErr) return fail(trazErr);

            const familia = await familiaDe(deps, tenant.value, input.tipo);
            if (!familia) return fail(KernelErrors.validation(`No hay familia contable configurada para el movimiento "${input.tipo}"`));

            const ubic = await resolverUbicacionFisica(adapters, tenant.value, input.bodegaId, input.ubicacionId);
            if (!ubic.ok) return ubic;

            // Obtiene/crea la existencia.
            const invRes = await obtenerOCrearExistencia(adapters, uow, tenant.value, {
              itemId: input.itemId,
              bodegaId: input.bodegaId,
              ubicacion: ubic.value,
              loteCodigo: input.loteCodigo ?? null,
              serieNumero: input.serieNumero ?? null,
            });
            if (!invRes.ok) return invRes;
            const { inventario: inv, creada } = invRes.value;

            const movimientoId = input.movimientoId ?? crypto.randomUUID();
            const cambio = aplicarMovimientoInventario(inv, {
              movimientoId,
              tipo: input.tipo,
              familia,
              motivo: input.motivo ?? null,
              cantidad: input.cantidad,
              ...(input.objetivo !== undefined ? { objetivo: input.objetivo } : {}),
              referencia: input.referencia ?? null,
              opId: input.opId ?? null,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            const persisted = creada
              ? await adapters.inventario.insert(uow, cambio.value.inventario)
              : await adapters.inventario.update(uow, cambio.value.inventario, inv.version);
            if (!persisted.ok) return persisted;
            const movSaved = await adapters.inventario.registrarMovimiento(uow, cambio.value.movimiento);
            if (!movSaved.ok) return movSaved;

            // Recalcula costos ante una entrada con costo unitario informado.
            if ((familia === "entrada" || familia === "devolucion") && input.costoUnitario !== undefined) {
              const moneda = input.moneda ?? (await cfg(deps, tenant.value, "moneda-defecto", "USD"));
              const costo = crearCostoUltimaCompra({ monto: input.costoUnitario, moneda });
              if (!costo.ok) return costo;
              const promedio = recalcularPromedio(item.value.costoPromedio, inv.stock.disponible, costo.value, input.cantidad);
              if (!promedio.ok) return promedio;
              const cItem = aplicarCostos(item.value, { promedio: promedio.value, ultimaCompra: costo.value }, ctx.principal.id, new Date());
              const upItem = await adapters.items.update(uow, cItem.item, item.value.version);
              if (!upItem.ok) return upItem;
              {
                const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cItem.evento);
                if (!_e.ok) return _e;
              }
            }

            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "mover", movimientoId, { tipo: input.tipo, familia, cantidad: input.cantidad });
            if (!audited.ok) return audited;
            for (const ev of cambio.value.eventos) {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
              if (!_e.ok) return _e;
            }

            const resultado = {
              movimientoId,
              inventarioId: cambio.value.inventario.id,
              stock: cambio.value.inventario.stock,
              total: totalStock(cambio.value.inventario.stock),
              version: cambio.value.inventario.version,
            };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.mover`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------- reservar -------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reservar`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            inventarioId: z.string().min(1),
            tipo: z.string().min(1),
            demanda: z.object({ tipo: z.string(), id: z.string() }),
            cantidad: z.number().positive(),
          }),
          authorization: { permissions: [`${MODULO}.reserve`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.reservar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const inv = await adapters.inventario.findById(tenant.value, input.inventarioId);
            if (!inv.ok) return inv;
            if (!inv.value) return fail(KernelErrors.notFound("inventario", input.inventarioId));
            const item = await adapters.items.findById(tenant.value, inv.value.itemId);
            if (!item.ok) return item;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_RESERVAR, { itemEliminado: item.value?.eliminado ?? false });
            if (!pol.ok) return pol;

            const tipoVal = await adapters.catalogos.validarReferencia(tenant.value, "tipos-reserva", input.tipo, true);
            if (!tipoVal.ok) return tipoVal;

            // Movimiento `reserva` sobre la existencia (consistencia de stock).
            const movId = crypto.randomUUID();
            const mov = aplicarMovimientoInventario(inv.value, {
              movimientoId: movId,
              tipo: "reserva",
              familia: "reserva",
              cantidad: input.cantidad,
              referencia: input.demanda,
              opId: input.opId ?? null,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!mov.ok) return mov;

            const id = input.id ?? crypto.randomUUID();
            const cambio = crearReserva({
              id,
              tenantId: tenant.value,
              itemId: inv.value.itemId,
              inventarioId: inv.value.id,
              bodegaId: inv.value.bodegaId,
              ubicacionId: inv.value.ubicacion.ubicacionId,
              tipo: input.tipo,
              demanda: input.demanda,
              cantidad: input.cantidad,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            const upInv = await adapters.inventario.update(uow, mov.value.inventario, inv.value.version);
            if (!upInv.ok) return upInv;
            const movSaved = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
            if (!movSaved.ok) return movSaved;
            const savedRes = await adapters.reservas.insert(uow, cambio.value.reserva);
            if (!savedRes.ok) return savedRes;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reservar", id, { cantidad: input.cantidad });
            if (!audited.ok) return audited;
            for (const ev of mov.value.eventos) {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
              if (!_e.ok) return _e;
            }
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id, inventarioId: inv.value.id, stock: mov.value.inventario.stock };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.reservar`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- liberar reserva ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.liberar-reserva`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            cantidad: z.number().positive().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.reserve`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.liberar-reserva`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.reservas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-reserva", input.id));
            const reserva = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_LIBERAR_RESERVA, { estadoReserva: reserva.estado });
            if (!pol.ok) return pol;

            const cambio = liberarReserva(reserva, input.cantidad ?? null, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const liberado = Number(cambio.value.evento.payload["liberado"] ?? 0);

            const inv = await adapters.inventario.findById(tenant.value, reserva.inventarioId);
            if (!inv.ok) return inv;
            if (!inv.value) return fail(KernelErrors.notFound("inventario", reserva.inventarioId));

            const movId = crypto.randomUUID();
            const mov = aplicarMovimientoInventario(inv.value, {
              movimientoId: movId,
              tipo: "liberacion",
              familia: "liberacion",
              cantidad: liberado,
              referencia: reserva.demanda,
              opId: input.opId ?? null,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!mov.ok) return mov;

            const upRes = await adapters.reservas.update(uow, cambio.value.reserva, input.expectedVersion);
            if (!upRes.ok) return upRes;
            const upInv = await adapters.inventario.update(uow, mov.value.inventario, inv.value.version);
            if (!upInv.ok) return upInv;
            const movSaved = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
            if (!movSaved.ok) return movSaved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "liberar-reserva", input.id, { liberado });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            for (const ev of mov.value.eventos) {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
              if (!_e.ok) return _e;
            }

            const resultado = { id: input.id, liberado, estado: cambio.value.reserva.estado, version: cambio.value.reserva.version, stock: mov.value.inventario.stock };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.liberar-reserva`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ transferir ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transferir`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            origen: extremoSchema(),
            destino: extremoSchema(),
            lineas: z.array(z.object({
              itemId: z.string().min(1),
              cantidad: z.number().positive(),
              loteCodigo: z.string().nullable().optional(),
              serieNumero: z.string().nullable().optional(),
            })).min(1),
          }),
          authorization: { permissions: [`${MODULO}.transfer`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transferir`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSFERIR, { estado: "borrador" });
            if (!pol.ok) return pol;

            // Gobierno: exige Workflow Engine aprobado. Sin él, se rechaza ANTES
            // de tocar stock (fallo seguro, nunca auto-aprobación).
            const wf = exigirWorkflow(adapters, "transferencia");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "transferencia", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "transferencia", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const id = input.id ?? crypto.randomUUID();
            const cambio = crearTransferencia({
              id,
              tenantId: tenant.value,
              origen: { ...input.origen, empresa: input.origen.empresa ?? null, proyecto: input.origen.proyecto ?? null, centroCosto: input.origen.centroCosto ?? null },
              destino: { ...input.destino, empresa: input.destino.empresa ?? null, proyecto: input.destino.proyecto ?? null, centroCosto: input.destino.centroCosto ?? null },
              lineas: input.lineas.map((l: { itemId: string; cantidad: number; loteCodigo?: string | null; serieNumero?: string | null }) => ({ itemId: l.itemId, cantidad: l.cantidad, loteCodigo: l.loteCodigo ?? null, serieNumero: l.serieNumero ?? null })),
              workflow: { ...ref, instanciaId: inicio.value.instanciaId },
              estadoInicial: inicio.value.estado.estado as "en-transito",
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            // Movimiento de SALIDA (disponible → en tránsito) por cada línea.
            for (const l of cambio.value.transferencia.lineas) {
              const ubic = await resolverUbicacionFisica(adapters, tenant.value, input.origen.bodegaId, input.origen.ubicacionId);
              if (!ubic.ok) return ubic;
              const inv = await obtenerOCrearExistencia(adapters, uow, tenant.value, {
                itemId: l.itemId,
                bodegaId: input.origen.bodegaId,
                ubicacion: ubic.value,
                loteCodigo: l.loteCodigo,
                serieNumero: l.serieNumero,
              });
              if (!inv.ok) return inv;
              const mov = aplicarMovimientoInventario(inv.value.inventario, {
                movimientoId: crypto.randomUUID(),
                tipo: "transferencia",
                familia: "transferencia-salida",
                cantidad: l.cantidad,
                referencia: { tipo: "transferencia", id },
                opId: input.opId ?? null,
                actorId: ctx.principal.id,
                ahora: new Date(),
              });
              if (!mov.ok) return mov;
              const persisted = inv.value.creada
                ? await adapters.inventario.insert(uow, mov.value.inventario)
                : await adapters.inventario.update(uow, mov.value.inventario, inv.value.inventario.version);
              if (!persisted.ok) return persisted;
              const ms = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
              if (!ms.ok) return ms;
              for (const ev of mov.value.eventos) {
                const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
                if (!_e.ok) return _e;
              }
            }

            const saved = await adapters.transferencias.insert(uow, cambio.value.transferencia);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transferir", id, { lineas: input.lineas.length });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id, estado: cambio.value.transferencia.estado, version: cambio.value.transferencia.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transferir`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------ completar transferencia ------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.completar-transferencia`,
          inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), opId: z.string().optional() }),
          authorization: { permissions: [`${MODULO}.transfer`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.completar-transferencia`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.transferencias.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-transferencia", input.id));
            const t = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSFERIR, { estado: t.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "transferencia");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, t.workflow, "completada", ctx.principal.id);
            if (!trans.ok) return trans;

            const cambio = aplicarEstadoTransferencia(t, "completada", ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;

            // Movimiento de ENTRADA (en tránsito → disponible) en destino.
            for (const l of t.lineas) {
              const ubic = await resolverUbicacionFisica(adapters, tenant.value, t.destino.bodegaId, t.destino.ubicacionId);
              if (!ubic.ok) return ubic;
              const inv = await obtenerOCrearExistencia(adapters, uow, tenant.value, {
                itemId: l.itemId,
                bodegaId: t.destino.bodegaId,
                ubicacion: ubic.value,
                loteCodigo: l.loteCodigo,
                serieNumero: l.serieNumero,
              });
              if (!inv.ok) return inv;
              // La entrada en destino repone `en-transito` que aún no existe en la
              // existencia destino: se materializa como entrada directa a disponible.
              const mov = aplicarMovimientoInventario(inv.value.inventario, {
                movimientoId: crypto.randomUUID(),
                tipo: "transferencia",
                familia: "entrada",
                cantidad: l.cantidad,
                referencia: { tipo: "transferencia", id: input.id },
                opId: input.opId ?? null,
                actorId: ctx.principal.id,
                ahora: new Date(),
              });
              if (!mov.ok) return mov;
              const persisted = inv.value.creada
                ? await adapters.inventario.insert(uow, mov.value.inventario)
                : await adapters.inventario.update(uow, mov.value.inventario, inv.value.inventario.version);
              if (!persisted.ok) return persisted;
              const ms = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
              if (!ms.ok) return ms;
              for (const ev of mov.value.eventos) {
                const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
                if (!_e.ok) return _e;
              }
            }

            const saved = await adapters.transferencias.update(uow, cambio.value.transferencia, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "completar-transferencia", input.id, {});
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id: input.id, estado: "completada", version: cambio.value.transferencia.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.completar-transferencia`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------- ajustar --------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.ajustar`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            tipo: z.string().min(1),
            motivo: z.string().nullable().optional(),
            lineas: z.array(z.object({
              itemId: z.string().min(1),
              bodegaId: z.string().min(1),
              ubicacionId: z.string().min(1),
              loteCodigo: z.string().nullable().optional(),
              serieNumero: z.string().nullable().optional(),
              delta: z.number().finite(),
            })).min(1),
          }),
          authorization: { permissions: [`${MODULO}.adjust`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.ajustar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_AJUSTAR, { estado: "borrador" });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "ajuste");
            if (!wf.ok) return wf;

            const tipoVal = await adapters.catalogos.validarReferencia(tenant.value, "tipos-ajuste", input.tipo, true);
            if (!tipoVal.ok) return tipoVal;

            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "ajuste", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "ajuste", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            // Resuelve existencias e inventarioId por línea.
            const lineas = [];
            for (const l of input.lineas) {
              const ubic = await resolverUbicacionFisica(adapters, tenant.value, l.bodegaId, l.ubicacionId);
              if (!ubic.ok) return ubic;
              const inv = await obtenerOCrearExistencia(adapters, uow, tenant.value, {
                itemId: l.itemId,
                bodegaId: l.bodegaId,
                ubicacion: ubic.value,
                loteCodigo: l.loteCodigo ?? null,
                serieNumero: l.serieNumero ?? null,
              });
              if (!inv.ok) return inv;
              lineas.push({ linea: { itemId: l.itemId, inventarioId: inv.value.inventario.id, bodegaId: l.bodegaId, ubicacionId: l.ubicacionId, loteCodigo: l.loteCodigo ?? null, serieNumero: l.serieNumero ?? null, delta: l.delta }, inv });
            }

            const id = input.id ?? crypto.randomUUID();
            const cambio = crearAjuste({
              id,
              tenantId: tenant.value,
              tipo: input.tipo,
              motivo: input.motivo ?? null,
              lineas: lineas.map((x) => x.linea),
              workflow: { ...ref, instanciaId: inicio.value.instanciaId },
              estadoInicial: "aprobado",
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;

            // Con el workflow aprobado (iniciar OK arriba), se aplica el ajuste.
            const aplicado = aplicarEstadoAjuste(cambio.value.ajuste, "aplicado", ctx.principal.id, new Date());
            if (!aplicado.ok) return aplicado;

            for (const { linea, inv } of lineas) {
              const familia: FamiliaMovimiento = linea.delta >= 0 ? "ajuste-positivo" : "ajuste-negativo";
              const mov = aplicarMovimientoInventario(inv.value.inventario, {
                movimientoId: crypto.randomUUID(),
                tipo: input.tipo,
                familia,
                motivo: input.motivo ?? null,
                cantidad: Math.abs(linea.delta),
                referencia: { tipo: "ajuste", id },
                opId: input.opId ?? null,
                actorId: ctx.principal.id,
                ahora: new Date(),
              });
              if (!mov.ok) return mov;
              const persisted = inv.value.creada
                ? await adapters.inventario.insert(uow, mov.value.inventario)
                : await adapters.inventario.update(uow, mov.value.inventario, inv.value.inventario.version);
              if (!persisted.ok) return persisted;
              const ms = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
              if (!ms.ok) return ms;
              for (const ev of mov.value.eventos) {
                const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
                if (!_e.ok) return _e;
              }
            }

            const saved = await adapters.ajustes.insert(uow, aplicado.value.ajuste);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "ajustar", id, { tipo: input.tipo, lineas: input.lineas.length });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, aplicado.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id, estado: aplicado.value.ajuste.estado, version: aplicado.value.ajuste.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.ajustar`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- iniciar conteo ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.iniciar-conteo`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            tipo: z.string().min(1),
            alcance: z.object({ tipo: z.string(), id: z.string() }).nullable().optional(),
            lineas: z.array(z.object({ inventarioId: z.string().min(1) })).min(1),
          }),
          authorization: { permissions: [`${MODULO}.count`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.iniciar-conteo`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CONTAR, { estado: "abierto" });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "conteo");
            if (!wf.ok) return wf;

            const tipoVal = await adapters.catalogos.validarReferencia(tenant.value, "tipos-conteo", input.tipo, true);
            if (!tipoVal.ok) return tipoVal;

            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "conteo", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "conteo", definicion: def.value.definicion, instanciaId: null, version: def.value.version };

            const lineas = [];
            for (const l of input.lineas) {
              const inv = await adapters.inventario.findById(tenant.value, l.inventarioId);
              if (!inv.ok) return inv;
              if (!inv.value) return fail(KernelErrors.notFound("inventario", l.inventarioId));
              lineas.push({
                itemId: inv.value.itemId,
                inventarioId: inv.value.id,
                bodegaId: inv.value.bodegaId,
                ubicacionId: inv.value.ubicacion.ubicacionId,
                loteCodigo: inv.value.lote?.codigo ?? null,
                serieNumero: inv.value.serie?.numero ?? null,
                esperado: inv.value.stock.disponible,
              });
            }
            const id = input.id ?? crypto.randomUUID();
            const cambio = iniciarConteo({
              id,
              tenantId: tenant.value,
              tipo: input.tipo,
              alcance: input.alcance ?? null,
              lineas,
              workflow: ref,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.conteos.insert(uow, cambio.value.conteo);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "iniciar-conteo", id, { tipo: input.tipo });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id, estado: cambio.value.conteo.estado, version: cambio.value.conteo.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.iniciar-conteo`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- registrar conteo ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-conteo`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            contados: z.array(z.object({ inventarioId: z.string().min(1), cantidad: z.number().nonnegative() })).min(1),
          }),
          authorization: { permissions: [`${MODULO}.count`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrar-conteo`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.conteos.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-conteo", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CONTAR, { estado: found.value.estado });
            if (!pol.ok) return pol;

            const mapa = new Map<string, number>(input.contados.map((c: { inventarioId: string; cantidad: number }) => [c.inventarioId, c.cantidad] as [string, number]));
            const cambio = registrarConteo(found.value, mapa, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await adapters.conteos.update(uow, cambio.value.conteo, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-conteo", input.id, {});
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }
            const resultado = { id: input.id, estado: cambio.value.conteo.estado, version: cambio.value.conteo.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.registrar-conteo`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- cerrar conteo ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.cerrar-conteo`,
          inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), opId: z.string().optional() }),
          authorization: { permissions: [`${MODULO}.count`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.cerrar-conteo`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.conteos.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("inventario-conteo", input.id));
            const conteo = found.value;
            const hayPendientes = conteo.lineas.some((l) => l.contado === null);

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CERRAR_CONTEO, { estado: conteo.estado, hayPendientes });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "conteo");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, conteo.workflow, "cerrado", ctx.principal.id);
            if (!trans.ok) return trans;

            const cambio = cerrarConteo(conteo, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const diferencias = (cambio.value.evento.payload["diferencias"] as { inventarioId: string; contado: number }[]) ?? [];

            // Ajustes posteriores: concilia disponible al valor contado.
            for (const d of diferencias) {
              const inv = await adapters.inventario.findById(tenant.value, d.inventarioId);
              if (!inv.ok) return inv;
              if (!inv.value) continue;
              const mov = aplicarMovimientoInventario(inv.value, {
                movimientoId: crypto.randomUUID(),
                tipo: "conteo",
                familia: "conteo",
                cantidad: 0,
                objetivo: d.contado,
                referencia: { tipo: "conteo", id: input.id },
                opId: input.opId ?? null,
                actorId: ctx.principal.id,
                ahora: new Date(),
              });
              if (!mov.ok) return mov;
              const up = await adapters.inventario.update(uow, mov.value.inventario, inv.value.version);
              if (!up.ok) return up;
              const ms = await adapters.inventario.registrarMovimiento(uow, mov.value.movimiento);
              if (!ms.ok) return ms;
              for (const ev of mov.value.eventos) {
                const _e = await emitirEvento(adapters, ctx, uow, tenant.value, ev);
                if (!_e.ok) return _e;
              }
            }

            const saved = await adapters.conteos.update(uow, cambio.value.conteo, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "cerrar-conteo", input.id, { diferencias: diferencias.length });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
              if (!_e.ok) return _e;
            }

            const resultado = { id: input.id, estado: "cerrado", diferencias: diferencias.length, version: cambio.value.conteo.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.cerrar-conteo`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- catálogo: upsert ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo-upsert`,
          inputSchema: z.object({
            catalogo: catalogoEnum,
            clave: z.string().min(1),
            etiqueta: z.string().min(1),
            posicion: z.number().int().nonnegative().optional(),
            padre: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.upsert(
              uow,
              tenant.value,
              input.catalogo as NombreCatalogo,
              { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null },
              ctx.principal.id,
            );
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo-upsert", `${input.catalogo}:${input.clave}`, {});
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave });
          },
        };
      },
      /* ------------------------- catálogo: habilitar --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo-habilitar`,
          inputSchema: z.object({ catalogo: catalogoEnum, clave: z.string().min(1), habilitado: z.boolean() }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo-habilitar", `${input.catalogo}:${input.clave}`, { habilitado: input.habilitado });
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
          },
        };
      },
      /* --------------------------- reproyectar (admin) ------------------- */
      // Reconstrucción determinista de TODOS los read models desde la bitácora
      // durable (`inv_eventos`), NO desde el outbox. Idempotente ⇒ equivalencia.
      (deps) => ({
        name: `${MODULO}.reproyectar`,
        inputSchema: z.object({}).passthrough(),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, _input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const limpiado = await adapters.readModel.clear(uow, tenant.value);
          if (!limpiado.ok) return limpiado;
          const stream = await adapters.eventLog.stream(tenant.value);
          if (!stream.ok) return stream;
          const proyAdapters = { readModel: adapters.readModel };
          let aplicados = 0;
          for (const ev of stream.value) {
            const evLike = { id: ev.eventId, type: ev.tipo, payload: ev.payload };
            const rAgg = await aplicarEventoAggregate(proyAdapters, uow, evLike);
            if (!rAgg.ok) return rAgg;
            const rOp = await aplicarEventoOperacional(proyAdapters, uow, evLike);
            if (!rOp.ok) return rOp;
            aplicados += 1;
          }
          return ok({ reproyectados: aplicados });
        },
      }),
    ],
    queries: [
      /* -------------------------------- item (READ MODEL) ---------------- */
      (deps) => ({
        name: `${MODULO}.item`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.readModel.itemGet(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("inventario-item", input.id));
          // El detalle expone el snapshot completo del item (JSONB `datos`)
          // más las columnas indexadas del read model.
          return ok({ ...r.value.datos, id: r.value.id, version: r.value.version });
        },
      }),
      /* ----------------------------- items lista (READ MODEL) ------------ */
      (deps) => ({
        name: `${MODULO}.items`,
        inputSchema: z.object({ estado: z.string().optional(), tipoItem: z.string().optional(), incluirEliminados: z.boolean().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          return adapters.readModel.itemList(tenant.value, input);
        },
      }),
      /* ---------------------------- existencia (READ MODEL) -------------- */
      (deps) => ({
        name: `${MODULO}.existencia`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.readModel.existenciaGet(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("inventario", input.id));
          return ok(conStock(r.value));
        },
      }),
      /* --------------------- existencias/disponibilidad por item --------- */
      (deps) => ({
        name: `${MODULO}.existencias-item`,
        inputSchema: z.object({ itemId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.readModel.existenciasPorItem(tenant.value, input.itemId);
          if (!r.ok) return r;
          return ok(r.value.map(conStock));
        },
      }),
      /* ------------------------- movimientos historial (READ MODEL) ------ */
      (deps) => ({
        name: `${MODULO}.movimientos`,
        inputSchema: z.object({ inventarioId: z.string().min(1), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.readModel.movimientosDe(tenant.value, input.inventarioId, input.limit);
          if (!r.ok) return r;
          // Cada movimiento expone su snapshot completo (incluye stockDespues).
          return ok(r.value.map((m) => ({ ...m.datos, eventId: m.eventId, tipo: m.tipo, familia: m.familia })));
        },
      }),
      /* --------------------------- catálogo opciones --------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo-opciones`,
        inputSchema: z.object({ catalogo: catalogoEnum }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          return adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
        },
      }),
      /* ----------- listados proyectados por (tenant,id) ------------------ */
      ...(
        [
          ["reservas", "inv_reservas_read"],
          ["transferencias", "inv_transferencias_read"],
          ["conteos", "inv_conteos_read"],
          ["ajustes", "inv_ajustes_read"],
          ["lotes", "inv_lotes_read"],
          ["series", "inv_series_read"],
          ["bodegas", "inv_bodegas_read"],
          ["ubicaciones", "inv_ubicaciones_read"],
        ] as const
      ).flatMap(([nombre, tabla]) => [
        (deps: ServiceDeps) => ({
          name: `${MODULO}.${nombre}`,
          inputSchema: z.object({ limit: z.number().int().positive().optional() }),
          authorization: { permissions: [`${MODULO}.read`] },
          async handle(ctx: ExecutionContext, input: { limit?: number }) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            void deps;
            return adapters.readModel.proyList(tenant.value, tabla, input.limit);
          },
        }),
        (deps: ServiceDeps) => ({
          name: `${MODULO}.${nombre.replace(/s$/, "")}`,
          inputSchema: z.object({ id: z.string().min(1) }),
          authorization: { permissions: [`${MODULO}.read`] },
          async handle(ctx: ExecutionContext, input: { id: string }) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            void deps;
            const r = await adapters.readModel.proyGet(tenant.value, tabla, input.id);
            if (!r.ok) return r;
            if (!r.value) return fail(KernelErrors.notFound(tabla, input.id));
            return ok(r.value);
          },
        }),
      ]),
      /* ------------------------- consola técnica (admin) ----------------- */
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({ limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const [stats, eventos, proyecciones, outbox, recibos] = await Promise.all([
            adapters.readModel.itemStats(tenant.value),
            adapters.eventLog.contar(tenant.value),
            adapters.readModel.contar(tenant.value),
            adapters.consola.outboxDelModulo(tenant.value, input.limit ?? 10),
            adapters.syncReceipts.listByTenant(tenant.value),
          ]);
          if (!stats.ok) return stats;
          if (!eventos.ok) return eventos;
          if (!proyecciones.ok) return proyecciones;
          if (!outbox.ok) return outbox;
          if (!recibos.ok) return recibos;
          return ok({
            statsItems: stats.value,
            eventLog: eventos.value,
            proyecciones: proyecciones.value,
            outbox: outbox.value,
            receipts: recibos.value,
            tablasRLS: [
              "inv_items", "inv_existencias", "inv_movimientos", "inv_eventos",
              "inv_items_read", "inv_existencias_read", "inv_movimientos_read",
              "inv_reservas_read", "inv_transferencias_read", "inv_conteos_read",
              "inv_ajustes_read", "inv_lotes_read", "inv_series_read",
              "inv_bodegas_read", "inv_ubicaciones_read", "inv_sync_receipts",
            ],
          });
        },
      }),
    ],
    eventHandlers: [
      // Proyección CQRS por evento del AGGREGATE (payload-only, idempotente por
      // last_event_id/eventId). El inventario proyecta TODO su modelo de lectura
      // por el stream aggregate; no hay eventos operacionales separados.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          handlerProyeccion({ readModel: adapters.readModel }, false)(deps)(event, eventType),
      })),
      // Shared Timeline CANÓNICO (platform.timeline): CADA evento del módulo se
      // registra vía COMANDO `platform.timeline.record` (nunca escritura directa),
      // idempotente por entryId=event.id ⇒ la reentrega del outbox no duplica.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
    ],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}

/* ------------------------------ Helpers puros ---------------------------- */

function extremoSchema() {
  return z.object({
    bodegaId: z.string().min(1),
    ubicacionId: z.string().min(1),
    empresa: z.string().nullable().optional(),
    proyecto: z.string().nullable().optional(),
    centroCosto: z.string().nullable().optional(),
  });
}

function validarTrazabilidad(item: ItemInventario, loteCodigo: string | null, serieNumero: string | null): KernelError | null {
  if (requiereLote(item.modoTrazabilidad) && !loteCodigo) {
    return KernelErrors.validation("El item exige lote para el movimiento");
  }
  if (!requiereLote(item.modoTrazabilidad) && loteCodigo) {
    return KernelErrors.validation("El item no admite lote");
  }
  if (requiereSerie(item.modoTrazabilidad) && !serieNumero) {
    return KernelErrors.validation("El item exige serie para el movimiento");
  }
  if (!requiereSerie(item.modoTrazabilidad) && serieNumero) {
    return KernelErrors.validation("El item no admite serie");
  }
  return null;
}

async function resolverUbicacionFisica(
  adapters: ModuleAdapters,
  tenant: string,
  bodegaId: string,
  ubicacionId: string,
): Promise<Result<UbicacionFisica, KernelError>> {
  const u = await adapters.bodegas.findUbicacion(tenant, ubicacionId);
  if (!u.ok) return u;
  if (!u.value) return fail(KernelErrors.notFound("inventario-ubicacion", ubicacionId));
  if (u.value.bodegaId !== bodegaId) return fail(KernelErrors.validation("La ubicación no pertenece a la bodega indicada"));
  return crearUbicacionFisica({ ubicacionId: u.value.id, segmentos: u.value.segmentos, ruta: u.value.ruta });
}

interface ClaveNueva {
  readonly itemId: string;
  readonly bodegaId: string;
  readonly ubicacion: UbicacionFisica;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
}

async function obtenerOCrearExistencia(
  adapters: ModuleAdapters,
  _uow: UnitOfWork,
  tenant: string,
  c: ClaveNueva,
): Promise<Result<{ inventario: Inventario; creada: boolean }, KernelError>> {
  const found = await adapters.inventario.findByClave(tenant, {
    itemId: c.itemId,
    bodegaId: c.bodegaId,
    ubicacionId: c.ubicacion.ubicacionId,
    loteCodigo: c.loteCodigo,
    serieNumero: c.serieNumero,
  });
  if (!found.ok) return found;
  if (found.value) return ok({ inventario: found.value, creada: false });
  const inv = crearExistencia({
    id: crypto.randomUUID(),
    tenantId: tenant,
    itemId: c.itemId,
    bodegaId: c.bodegaId,
    ubicacion: c.ubicacion,
    lote: c.loteCodigo ? { codigo: c.loteCodigo, vencimiento: null } : null,
    serie: c.serieNumero ? { numero: c.serieNumero } : null,
    ahora: new Date(),
  });
  return ok({ inventario: inv, creada: true });
}
