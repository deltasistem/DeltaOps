/**
 * DGP-009.1 · Módulo Órdenes de Trabajo Empresariales — Capa de aplicación +
 * descriptor del servicio.
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime). El ciclo de vida se gobierna con el Workflow Engine
 * (servicio `modulo.ordenes.workflow`, montado junto a este módulo). TODA
 * transición de estado se ejecuta mediante los comandos de instancia del motor;
 * este módulo NUNCA implementa lógica de transición propia.
 *
 * Patrón de ORQUESTACIÓN (evita comandos anidados en la misma UoW): los comandos
 * de transición ejecutan el comando del motor en su propio contexto/UoW y, a
 * continuación, sincronizan el estado resultante al aggregate/read model en una
 * UoW SEPARADA. No hay comandos anidados dentro de una misma UoW (regla dura).
 */
import { z } from "zod";
import {
  childContext,
  createDomainEvent,
  fail,
  KernelErrors,
  KernelTokens,
  ok,
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
import { nombresDefinicion, nombresInstancia } from "@workspace/workflow-engine";
import { MODULO, MODULO_WORKFLOW } from "./module-name";
import {
  CATALOGOS,
  type NombreCatalogo,
} from "./domain/catalogos";
import {
  CMD_ABRIR,
  componerDefinicion,
  estadoDeNegocio,
  firmaExtension,
  PERMISO_OPERAR,
  WORKFLOW_ORDEN,
  type EstadoOrdenEfectivo,
  type ExtensionMaquina,
} from "./domain/maquina-estados";
import {
  actualizarAsignacion,
  actualizarEjecucion,
  agregarEvidencia,
  aplicarEstado,
  asociarChecklist,
  asociarFormulario,
  crearOrden,
  editarOrden,
  EVENTOS_MODULO,
  type CambioOrden,
  type OrdenTrabajo,
} from "./domain/orden";
import {
  policiesDelModulo,
  POLICY_PUEDE_ASIGNAR,
  POLICY_PUEDE_ASOCIAR_CHECKLIST,
  POLICY_PUEDE_ASOCIAR_FORMULARIO,
  POLICY_PUEDE_AGREGAR_EVIDENCIA,
  POLICY_PUEDE_CREAR,
  POLICY_PUEDE_EDITAR,
  POLICY_PUEDE_EJECUTAR,
  POLICY_PUEDE_TRANSICIONAR,
} from "./domain/policies";
import {
  crearCosto,
  crearDiagnostico,
  crearDuracion,
  crearEvidencia,
  crearFechas,
  crearReferenciaActivo,
  crearReferenciaPlantilla,
  crearRiesgoImpacto,
  crearSla,
  crearUbicacion,
} from "./domain/value-objects";
import {
  CONFIG_CODIGO_DEFAULT,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type OrdenRepository,
  type PlantillasPort,
  type ReciboPort,
} from "./domain/ports";

export { MODULO };

/**
 * Puertos de dominio que la capa de aplicación necesita. Los ADAPTADORES
 * concretos (Postgres / Record Store) llegan en DGP-009.2; en 009.1 se inyectan
 * FAKES en memoria (ver `infrastructure/fakes.ts`) para pruebas de dominio.
 */
export interface ModuleAdapters {
  readonly repository: OrdenRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  readonly plantillas: PlantillasPort;
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

/* --------------------------- Application Service ------------------------- */

/**
 * Persiste un cambio del aggregate + auditoría + evento de outbox, TODO dentro
 * de la misma UoW.
 *
 * NOTA (alcance 009.1): NO se materializa read model ni bitácora durable propia;
 * el read-side (proyección CQRS, bitácora, índices) es INFRAESTRUCTURA DE LECTURA
 * y llega en DGP-009.2. El evento de outbox sigue emitiéndose para que 009.2 lo
 * consuma.
 */
async function persistir(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  cambio: CambioOrden,
  accion: string,
  esCreacion: boolean,
  expectedVersion?: number,
): Promise<Result<OrdenTrabajo, KernelError>> {
  const o = cambio.orden;
  const persisted = esCreacion
    ? await adapters.repository.insert(uow, o)
    : await adapters.repository.update(uow, o, expectedVersion!);
  if (!persisted.ok) return persisted;

  const audited = await audit(deps.audit, uow, ctx, o.tenantId, MODULO, accion, o.id, {
    estado: o.estado,
    version: o.version,
  });
  if (!audited.ok) return audited;

  const evento = createDomainEvent(cambio.evento.tipo, cambio.evento.payload, ctx.correlationId);
  uow.registerEvent(evento);
  return ok(persisted.value);
}

/* --------------------------- Idempotencia offline ------------------------ */

/**
 * Cortocircuito de idempotencia por `opId`: si el recibo ya existe, devuelve el
 * resultado previo sin re-ejecutar el efecto. `sellar` se invoca DENTRO de la
 * UoW del comando junto con el resto de la escritura.
 */
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

/* ----------------------- Orquestación de Workflow ------------------------ */
/**
 * Compone la definición ACTIVA del tenant (ciclo base + EXTENSIÓN declarativa
 * del tenant) y garantiza que esté publicada+activa en el motor:
 *
 *  - Lee la extensión declarativa del tenant (puerto de catálogos), la compone
 *    con el ciclo base y la valida con `validarWorkflow` (dentro de
 *    `componerDefinicion`).
 *  - Deriva un `id` de definición que incluye la FIRMA de la extensión: misma
 *    extensión ⇒ mismo id ⇒ publicar es idempotente; extensión distinta ⇒ id
 *    nuevo ⇒ nueva versión N que se activa.
 *  - Verifica COHERENCIA catálogo↔definición: los estados extra declarados en el
 *    catálogo `estados` deben aparecer en la definición compuesta y viceversa;
 *    cualquier divergencia ⇒ error explícito.
 *
 * Se ejecuta como comandos del motor (UoW propia del motor). Idempotente.
 */
async function asegurarWorkflow(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
): Promise<Result<{ version: number }, KernelError>> {
  const extR = await extensionTenant(adapters, tenant);
  if (!extR.ok) return extR;
  const compuesta = componerDefinicion(extR.value);
  if (!compuesta.ok) return compuesta;

  // Coherencia catálogo `estados` ↔ definición compuesta.
  const coherente = await verificarCoherenciaEstados(adapters, tenant, compuesta.value.estadosExtra);
  if (!coherente.ok) return coherente;

  const nDef = nombresDefinicion(MODULO_WORKFLOW);
  const firma = firmaExtension(extR.value);
  const id = `wf-def:${WORKFLOW_ORDEN}:${tenant}:${firma}`;

  // ¿Ya está activa ESTA definición (mismo id/firma)? ⇒ idempotente.
  const activa = await deps.runtime.queries.execute(childContext(ctx), nDef.activa, { clave: WORKFLOW_ORDEN });
  if (activa.ok && activa.value && (activa.value as { id?: string }).id === id) {
    const v = Number((activa.value as { data: Record<string, unknown> }).data["versionN"] ?? 1);
    if (Number.isFinite(v) && v > 0) return ok({ version: v });
  }

  const pub = await deps.runtime.commands.execute(childContext(ctx), nDef.publicar, {
    id,
    definicion: compuesta.value.definicion,
  });
  if (!pub.ok) return pub;
  const versionN = Number((pub.value as { versionN: number }).versionN);

  // `activar` usa la versión OPTIMISTA del registro (no la versión N de la
  // definición). La leemos del registro para evitar conflictos de concurrencia
  // cuando la definición no está en su primera versión o fue reactivada.
  const rec = await deps.runtime.queries.execute(childContext(ctx), nDef.obtener, { id });
  if (!rec.ok) return rec;
  const versionOptimista = Number((rec.value as { version: number }).version);
  const act = await deps.runtime.commands.execute(childContext(ctx), nDef.activar, { id, version: versionOptimista });
  if (!act.ok) return act;
  return ok({ version: versionN });
}

/**
 * Extensión declarativa de la máquina del tenant (estados/transiciones extra).
 * Se lee del puerto de catálogos; un tenant sin extensión devuelve la vacía.
 */
async function extensionTenant(adapters: ModuleAdapters, tenant: string): Promise<Result<ExtensionMaquina, KernelError>> {
  return adapters.catalogos.extensionMaquina(tenant);
}

/**
 * Estados NEUTROS extra declarados por el tenant (más allá del ciclo canónico).
 * Se leen del puerto de catálogos (`estados`); el mapeo motor→negocio se
 * resuelve a partir de ellos SIN fallback silencioso (ver `estadoDeNegocio`).
 */
async function estadosTenant(adapters: ModuleAdapters, tenant: string): Promise<string[]> {
  const r = await adapters.catalogos.estadosDeclarados(tenant);
  return r.ok ? r.value : [];
}

/**
 * Verifica que el catálogo `estados` (nombres neutros extra) y la definición de
 * workflow compuesta COINCIDAN exactamente. Divergencia ⇒ error explícito, para
 * que un estado declarado sea SIEMPRE alcanzable y viceversa.
 */
async function verificarCoherenciaEstados(
  adapters: ModuleAdapters,
  tenant: string,
  estadosDefinicion: readonly string[],
): Promise<Result<void, KernelError>> {
  const catalogo = await estadosTenant(adapters, tenant);
  const setDef = new Set(estadosDefinicion);
  const setCat = new Set(catalogo);
  const soloCatalogo = [...setCat].filter((e) => !setDef.has(e));
  const soloDefinicion = [...setDef].filter((e) => !setCat.has(e));
  if (soloCatalogo.length > 0) {
    return fail(KernelErrors.validation(
      `Estados declarados en el catálogo "estados" pero ausentes de la definición de workflow activa: ${soloCatalogo.join(", ")}. ` +
        `Declara sus transiciones en la extensión de la máquina.`,
    ));
  }
  if (soloDefinicion.length > 0) {
    return fail(KernelErrors.validation(
      `Estados presentes en la definición de workflow pero no declarados en el catálogo "estados": ${soloDefinicion.join(", ")}. ` +
        `Añádelos al catálogo "estados" del tenant.`,
    ));
  }
  return ok(undefined);
}

/** Lee el estado actual de la instancia de workflow. */
async function estadoInstancia(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
  instanciaId: string,
): Promise<Result<{ estadoMotor: string; estado: EstadoOrdenEfectivo; version: number; aprobacionPendiente: boolean }, KernelError>> {
  const nInst = nombresInstancia(MODULO_WORKFLOW);
  const r = await deps.runtime.queries.execute(childContext(ctx), nInst.obtener, { id: instanciaId });
  if (!r.ok) return r;
  // La instancia es un PlatformRecord: `status` = estado neutro, `data._aprobaciones`.
  const inst = r.value as { status?: string; version?: number; data?: Record<string, unknown> } | null;
  if (!inst) return fail(KernelErrors.notFound("workflow-instancia", instanciaId));
  const aprobaciones = (inst.data?.["_aprobaciones"] as Record<string, { estado?: string }> | undefined) ?? {};
  const pendiente = Object.values(aprobaciones).some((a) => a?.estado === "pendiente");
  const estadoMotor = String(inst.status ?? "");
  // Mapeo motor→negocio construido desde el catálogo VIGENTE del tenant; estado
  // no declarado ⇒ error explícito (nunca BORRADOR por defecto).
  const negocio = estadoDeNegocio(estadoMotor, await estadosTenant(adapters, tenant));
  if (!negocio.ok) return negocio;
  return ok({
    estadoMotor,
    estado: negocio.value,
    version: Number(inst.version ?? 1),
    aprobacionPendiente: pendiente,
  });
}

/**
 * Sincroniza el estado de la OT con el estado resuelto por el motor, en una UoW
 * SEPARADA (nunca dentro de la UoW del comando de transición del motor). Es
 * idempotente: si el estado ya coincide, no reescribe.
 */
async function sincronizarEstado(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
  ordenId: string,
  instanciaId: string,
): Promise<Result<{ estado: EstadoOrdenEfectivo; version: number }, KernelError>> {
  const estado = await estadoInstancia(deps, adapters, ctx, tenant, instanciaId);
  if (!estado.ok) return estado;

  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  return uowPort.execute(ctx, async (uow) => {
    const actual = await adapters.repository.findById(tenant, ordenId);
    if (!actual.ok) return actual;
    if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", ordenId));
    if (actual.value.estado === estado.value.estado) {
      return ok({ estado: actual.value.estado, version: actual.value.version });
    }
    const cambio = aplicarEstado(actual.value, estado.value.estado, instanciaId, ctx.principal.id, new Date());
    const saved = await persistir(deps, adapters, ctx, uow, cambio, "transicionar", false, actual.value.version);
    if (!saved.ok) return saved;
    return ok({ estado: saved.value.estado, version: saved.value.version });
  });
}

/* ------------------------------ Descriptor ------------------------------- */

export function ordenesModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Órdenes de Trabajo Empresariales — dominio (DGP-009.1): aggregate, catálogos, ciclo de vida gobernado por Workflow Engine, formularios/checklists (Dynamic Forms), evidencias (platform.attachment), offline-first.",
    capabilities: [
      {
        name: "gestionar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.write`],
        description: "Alta, edición y clasificación de órdenes de trabajo",
      },
      {
        name: "ejecutar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.operar`],
        description: "Operación del ciclo de vida y registro de ejecución",
      },
      {
        name: "validar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.validar`],
        description: "Validación y cierre gobernado por aprobación",
      },
      {
        name: "administrar-ordenes",
        permissions: [`${MODULO}.admin`],
        description: "Administración de catálogos y configuración del módulo",
      },
    ],
    permissions: [
      `${MODULO}.read`,
      `${MODULO}.write`,
      `${MODULO}.operar`,
      `${MODULO}.validar`,
      `${MODULO}.admin`,
      // Permisos del motor de workflow que este módulo orquesta:
      `${MODULO_WORKFLOW}.read`,
      `${MODULO_WORKFLOW}.operar`,
      `${MODULO_WORKFLOW}.disenar`,
    ],
    dependsOn: [
      MODULO_WORKFLOW,
      "modulo.formularios",
      "platform.attachment",
      "platform.config",
    ],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "orden-trabajo",
      "secuencia",
      "recibo-op",
      ...CATALOGOS.map((c) => `catalogo:${c}`),
    ],
    configDefaults: {
      // SIN prefijo en las claves (el prefijo lo añade la lectura).
      "max-longitud-titulo": "160",
      "codigo-prefijo": "OT",
      "codigo-separador": "-",
      "codigo-padding": "6",
      "codigo-serie": "default",
      "edicion-solo-borrador": "false",
      "moneda-defecto": "",
    },
    commands: [
      /* ------------------------------- crear ------------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            titulo: z.string().min(1),
            descripcion: z.string().optional(),
            tipo: z.string().min(1),
            categoria: z.string().nullable().optional(),
            prioridad: z.string().nullable().optional(),
            severidad: z.string().nullable().optional(),
            sla: z.unknown().optional(),
            empresa: z.string().nullable().optional(),
            proyecto: z.string().nullable().optional(),
            centroCosto: z.string().nullable().optional(),
            ubicacion: z.unknown().optional(),
            activoPrincipal: z.unknown().optional(),
            activosRelacionados: z.array(z.unknown()).optional(),
            responsable: z.string().nullable().optional(),
            supervisor: z.string().nullable().optional(),
            solicitante: z.string().nullable().optional(),
            tiempoEstimado: z.unknown().optional(),
            costoEstimado: z.unknown().optional(),
            riesgoImpacto: z.unknown().optional(),
            /** Fechas de solicitud/programación (ISO-8601, Offline First). */
            fechaSolicitada: z.string().min(1).optional(),
            fechaProgramada: z.string().min(1).optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;

            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR, {});
            if (!pol.ok) return pol;

            // Validaciones de catálogo (semántica canónica).
            const val = await validarClasificacion(adapters, tenant.value, {
              tipo: input.tipo,
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
            });
            if (!val.ok) return val;

            // VOs opcionales.
            const vos = construirVOs(input);
            if (!vos.ok) return vos;

            // Fechas de solicitud/programación (solicitada por defecto = ahora).
            const ahora = new Date();
            const fechasV = crearFechas({
              solicitada: input.fechaSolicitada ?? ahora.toISOString(),
              ...(input.fechaProgramada ? { programada: input.fechaProgramada } : {}),
            });
            if (!fechasV.ok) return fechasV;

            // Asegura el workflow del tenant y obtiene versión.
            const wf = await asegurarWorkflow(deps, adapters, ctx, tenant.value);
            if (!wf.ok) return wf;

            const id = input.id ?? crypto.randomUUID();
            const codigo = await adapters.consecutivo.siguiente(
              uow,
              tenant.value,
              await configCodigo(deps, tenant.value),
              ctx.principal.id,
            );
            if (!codigo.ok) return codigo;

            const maxTitulo = Number(await cfg(deps, tenant.value, "max-longitud-titulo", "160"));
            const cambio = crearOrden({
              id,
              tenantId: tenant.value,
              codigo: codigo.value,
              titulo: input.titulo,
              descripcion: input.descripcion,
              tipo: input.tipo,
              categoria: input.categoria ?? null,
              prioridad: input.prioridad ?? null,
              severidad: input.severidad ?? null,
              sla: vos.value.sla,
              activoPrincipal: vos.value.activoPrincipal,
              activosRelacionados: vos.value.activosRelacionados,
              responsable: input.responsable ?? null,
              supervisor: input.supervisor ?? null,
              solicitante: input.solicitante ?? null,
              empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null,
              centroCosto: input.centroCosto ?? null,
              ubicacion: vos.value.ubicacion,
              tiempoEstimado: vos.value.tiempoEstimado,
              costoEstimado: vos.value.costoEstimado,
              riesgoImpacto: vos.value.riesgoImpacto,
              fechas: fechasV.value,
              observaciones: input.observaciones,
              workflow: { definicion: WORKFLOW_ORDEN, instanciaId: null, version: wf.value.version },
              actorId: ctx.principal.id,
              maxLongitudTitulo: maxTitulo,
              ahora,
            });
            if (!cambio.ok) return cambio;

            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "crear", true);
            if (!saved.ok) return saved;

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(
                uow, tenant.value, { opId: input.opId, comando: `${MODULO}.crear`, resultado }, ctx.principal.id,
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ editar ------------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            titulo: z.string().min(1).optional(),
            descripcion: z.string().optional(),
            categoria: z.string().nullable().optional(),
            prioridad: z.string().nullable().optional(),
            severidad: z.string().nullable().optional(),
            empresa: z.string().nullable().optional(),
            proyecto: z.string().nullable().optional(),
            centroCosto: z.string().nullable().optional(),
            // VOs editables (Offline First): mismos objetos de valor que crear.
            sla: z.unknown().optional(),
            ubicacion: z.unknown().optional(),
            activoPrincipal: z.unknown().optional(),
            activosRelacionados: z.array(z.unknown()).optional(),
            tiempoEstimado: z.unknown().optional(),
            costoEstimado: z.unknown().optional(),
            riesgoImpacto: z.unknown().optional(),
            fechaSolicitada: z.string().min(1).optional(),
            fechaProgramada: z.string().min(1).optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.editar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

            const soloBorrador = (await cfg(deps, tenant.value, "edicion-solo-borrador", "false")) === "true";
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: actual.value.estado, soloBorrador });
            if (!pol.ok) return pol;

            const val = await validarClasificacion(adapters, tenant.value, {
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
            });
            if (!val.ok) return val;

            // VOs editables: solo se incluyen en el patch los campos APORTADOS
            // (undefined ⇒ no se toca; null ⇒ se limpia explícitamente).
            const patch: Parameters<typeof editarOrden>[1] = {
              titulo: input.titulo,
              descripcion: input.descripcion,
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
              observaciones: input.observaciones,
            };
            if (input.sla !== undefined) {
              if (input.sla === null) (patch as { sla: null }).sla = null;
              else { const r = crearSla(input.sla); if (!r.ok) return r; (patch as { sla: typeof r.value }).sla = r.value; }
            }
            if (input.ubicacion !== undefined) {
              if (input.ubicacion === null) (patch as { ubicacion: null }).ubicacion = null;
              else { const r = crearUbicacion(input.ubicacion); if (!r.ok) return r; (patch as { ubicacion: typeof r.value }).ubicacion = r.value; }
            }
            if (input.activoPrincipal !== undefined) {
              if (input.activoPrincipal === null) (patch as { activoPrincipal: null }).activoPrincipal = null;
              else { const r = crearReferenciaActivo(input.activoPrincipal); if (!r.ok) return r; (patch as { activoPrincipal: typeof r.value }).activoPrincipal = r.value; }
            }
            if (input.activosRelacionados !== undefined) {
              const refs: OrdenTrabajo["activosRelacionados"][number][] = [];
              for (const a of input.activosRelacionados) { const r = crearReferenciaActivo(a); if (!r.ok) return r; refs.push(r.value); }
              (patch as { activosRelacionados: typeof refs }).activosRelacionados = refs;
            }
            if (input.tiempoEstimado !== undefined) {
              if (input.tiempoEstimado === null) (patch as { tiempoEstimado: null }).tiempoEstimado = null;
              else { const r = crearDuracion(input.tiempoEstimado); if (!r.ok) return r; (patch as { tiempoEstimado: typeof r.value }).tiempoEstimado = r.value; }
            }
            if (input.costoEstimado !== undefined) {
              if (input.costoEstimado === null) (patch as { costoEstimado: null }).costoEstimado = null;
              else { const r = crearCosto(input.costoEstimado); if (!r.ok) return r; (patch as { costoEstimado: typeof r.value }).costoEstimado = r.value; }
            }
            if (input.riesgoImpacto !== undefined) {
              if (input.riesgoImpacto === null) (patch as { riesgoImpacto: null }).riesgoImpacto = null;
              else { const r = crearRiesgoImpacto(input.riesgoImpacto); if (!r.ok) return r; (patch as { riesgoImpacto: typeof r.value }).riesgoImpacto = r.value; }
            }
            if (input.fechaSolicitada !== undefined || input.fechaProgramada !== undefined) {
              const r = crearFechas({
                ...actual.value.fechas,
                ...(input.fechaSolicitada !== undefined ? { solicitada: input.fechaSolicitada } : {}),
                ...(input.fechaProgramada !== undefined ? { programada: input.fechaProgramada } : {}),
              });
              if (!r.ok) return r;
              (patch as { fechas: typeof r.value }).fechas = r.value;
            }

            const maxTitulo = Number(await cfg(deps, tenant.value, "max-longitud-titulo", "160"));
            const cambio = editarOrden(actual.value, patch, ctx.principal.id, maxTitulo, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "editar", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.editar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- asignar ------------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            responsable: z.string().nullable().optional(),
            supervisor: z.string().nullable().optional(),
            solicitante: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.asignar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_ASIGNAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;
            const cambio = actualizarAsignacion(
              actual.value,
              { responsable: input.responsable, supervisor: input.supervisor, solicitante: input.solicitante },
              ctx.principal.id,
              new Date(),
            );
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "asignar", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.asignar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- ejecutar ------------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrarEjecucion`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            diagnostico: z.unknown().optional(),
            tiempoReal: z.unknown().optional(),
            costoReal: z.unknown().optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrarEjecucion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EJECUTAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;

            let tiempoReal = actual.value.tiempoReal;
            if (input.tiempoReal !== undefined) {
              const d = crearDuracion(input.tiempoReal);
              if (!d.ok) return d;
              tiempoReal = d.value;
            }
            let costoReal = actual.value.costoReal;
            if (input.costoReal !== undefined) {
              const c = crearCosto(input.costoReal);
              if (!c.ok) return c;
              costoReal = c.value;
            }
            let diagnostico: OrdenTrabajo["diagnostico"] | undefined;
            if (input.diagnostico !== undefined && input.diagnostico !== null) {
              const d = crearDiagnostico(input.diagnostico);
              if (!d.ok) return d;
              diagnostico = d.value;
            }
            const cambio = actualizarEjecucion(
              actual.value,
              {
                diagnostico,
                tiempoReal,
                costoReal,
                observaciones: input.observaciones,
              },
              ctx.principal.id,
              new Date(),
            );
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "ejecucion", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.registrarEjecucion`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------- asociar formulario --------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asociarFormulario`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            plantilla: z.object({
              servicio: z.string().optional(),
              clave: z.string().min(1),
              version: z.number().int().positive(),
              etiqueta: z.string().optional(),
            }),
            /** Anclaje de la respuesta capturada (id en `modulo.formularios`). */
            respuestaId: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            return asociarPlantilla(deps, adapters, ctx, uow, input, "formulario");
          },
        };
      },
      /* ---------------------- asociar checklist --------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asociarChecklist`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            plantilla: z.object({
              servicio: z.string().optional(),
              clave: z.string().min(1),
              version: z.number().int().positive(),
              etiqueta: z.string().optional(),
            }),
            /** Anclaje de la respuesta capturada (id en `modulo.formularios`). */
            respuestaId: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            return asociarPlantilla(deps, adapters, ctx, uow, input, "checklist");
          },
        };
      },
      /* --------------------- agregar evidencia ---------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.agregarEvidencia`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            evidencia: z.unknown(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.agregarEvidencia`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_AGREGAR_EVIDENCIA, { estado: actual.value.estado });
            if (!pol.ok) return pol;
            const ev = crearEvidencia(input.evidencia);
            if (!ev.ok) return ev;
            const cambio = agregarEvidencia(actual.value, ev.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "evidencia", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version, evidencias: saved.value.evidencias.length };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.agregarEvidencia`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- transicionar ---------------------------- */
      // ORQUESTADOR: ejecuta la transición vía el Workflow Engine y sincroniza.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar`,
          inputSchema: z.object({
            id: z.string(),
            comando: z.string().min(1),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;

            const nInst = nombresInstancia(MODULO_WORKFLOW);
            let instanciaId = actual.value.workflow.instanciaId;

            // Primera transición ⇒ iniciar la instancia del motor (UoW del motor).
            if (!instanciaId) {
              const wf = await asegurarWorkflow(deps, adapters, ctx, tenant.value);
              if (!wf.ok) return wf;
              instanciaId = actual.value.id; // id de instancia = id de OT (1:1)
              const ini = await deps.runtime.commands.execute(childContext(ctx), nInst.iniciar, {
                id: instanciaId,
                data: { ordenId: actual.value.id },
              });
              if (!ini.ok) return ini;
            }

            // Estado + versión actual de la instancia.
            const est = await estadoInstancia(deps, adapters, ctx, tenant.value, instanciaId);
            if (!est.ok) return est;

            // Ejecuta la transición SOLO a través del motor (UoW propia del motor).
            const tr = await deps.runtime.commands.execute(childContext(ctx), nInst.transicionar, {
              id: instanciaId,
              version: est.value.version,
              comando: input.comando,
              ...(input.opId ? { opId: `${input.opId}:wf` } : {}),
            });
            if (!tr.ok) return tr;

            // Sincroniza el estado resultante a la OT (UoW SEPARADA).
            const sync = await sincronizarEstado(deps, adapters, ctx, tenant.value, actual.value.id, instanciaId);
            if (!sync.ok) return sync;

            const resultado = {
              id: input.id,
              estado: sync.value.estado,
              version: sync.value.version,
              aprobacionPendiente: (tr.value as { pendienteAprobacion?: boolean }).pendienteAprobacion === true,
            };
            if (input.opId) {
              const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
              const rec = await uowPort.execute(ctx, (uow) =>
                adapters.recibos.sellar(uow, tenant.value, { opId: input.opId!, comando: `${MODULO}.transicionar`, resultado }, ctx.principal.id),
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------ aprobar validación ------------------------ */
      // ORQUESTADOR de la aprobación (gate) que gobierna el cierre.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.aprobarCierre`,
          inputSchema: z.object({
            id: z.string(),
            transicion: z.string().default("cerrar"),
            decision: z.enum(["aprobar", "rechazar"]),
            motivo: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.validar`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.aprobarCierre`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const instanciaId = actual.value.workflow.instanciaId;
            if (!instanciaId) return fail(KernelErrors.conflict("La OT no tiene instancia de workflow activa"));

            const nInst = nombresInstancia(MODULO_WORKFLOW);
            const est = await estadoInstancia(deps, adapters, ctx, tenant.value, instanciaId);
            if (!est.ok) return est;

            // CLAIM→EXECUTE→FINALIZE: el `opId` se PROPAGA al comando del motor
            // (sufijo `:wf`). El motor es idempotente por opId, de modo que un
            // reintento tras un fallo PARCIAL (gate ya resuelto, recibo aún no
            // sellado) NO vuelve a aplicar la decisión: reconstruye el mismo
            // resultado y sella el recibo sin inconsistencias.
            const comando = input.decision === "aprobar" ? nInst.aprobar : nInst.rechazar;
            const r = await deps.runtime.commands.execute(childContext(ctx), comando, {
              id: instanciaId,
              version: est.value.version,
              transicion: input.transicion,
              ...(input.opId ? { opId: `${input.opId}:wf` } : {}),
              ...(input.decision === "rechazar" && input.motivo ? { motivo: input.motivo } : {}),
            });
            if (!r.ok) return r;

            const sync = await sincronizarEstado(deps, adapters, ctx, tenant.value, actual.value.id, instanciaId);
            if (!sync.ok) return sync;
            const resultado = { id: input.id, estado: sync.value.estado, version: sync.value.version };
            if (input.opId) {
              const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
              const rec = await uowPort.execute(ctx, (uow) =>
                adapters.recibos.sellar(uow, tenant.value, { opId: input.opId!, comando: `${MODULO}.aprobarCierre`, resultado }, ctx.principal.id),
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------- catálogo: upsert ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.upsert`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            etiqueta: z.string().min(1),
            posicion: z.number().int().optional(),
            padre: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.upsert(
              uow, tenant.value, input.catalogo as NombreCatalogo,
              { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre },
              ctx.principal.id,
            );
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo:upsert", `${input.catalogo}:${input.clave}`, {});
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave });
          },
        };
      },
      /* ----------------------- catálogo: habilitar ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.habilitar`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            habilitado: z.boolean(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo:habilitar", `${input.catalogo}:${input.clave}`, { habilitado: input.habilitado });
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
          },
        };
      },
    ],
    queries: [
      // `detalle` es el MÍNIMO de lectura del dominio: lee el AGGREGATE del
      // repositorio (fuente de verdad), NO un read model materializado.
      // `listar`/`bitacora`/dashboard/índices son read-side y llegan en 009.2.
      () => ({
        name: `${MODULO}.detalle`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.repository.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
          return ok({ orden: r.value });
        },
      }),
      (deps) => ({
        name: `${MODULO}.catalogo.opciones`,
        inputSchema: z.object({ catalogo: z.enum(CATALOGOS) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          return adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
        },
      }),
    ],
    // NOTA (alcance 009.1): SIN eventHandlers de lectura. La proyección CQRS al
    // read model, la bitácora durable y la indexación en búsqueda son
    // INFRAESTRUCTURA DE LECTURA y llegan en DGP-009.2. El outbox sigue emitiendo
    // los eventos de dominio para que 009.2 los consuma.
    eventHandlers: [],
    // Salud del dominio: sonda mínima contra el repositorio (fuente de verdad).
    healthCheck: () => async () => {
      const probe = await adapters.repository.list("healthcheck", { limit: 1 });
      return probe.ok
        ? { healthy: true, detail: "repositorio del aggregate operativo" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}

/* ----------------------------- Helpers privados -------------------------- */

async function validarClasificacion(
  adapters: ModuleAdapters,
  tenant: string,
  refs: {
    tipo?: string;
    categoria?: string | null;
    prioridad?: string | null;
    severidad?: string | null;
    empresa?: string | null;
    proyecto?: string | null;
    centroCosto?: string | null;
  },
): Promise<Result<void, KernelError>> {
  const checks: Array<[NombreCatalogo, string | null | undefined, boolean]> = [
    ["tipos", refs.tipo, refs.tipo !== undefined],
    ["categorias", refs.categoria, false],
    ["prioridades", refs.prioridad, false],
    ["severidades", refs.severidad, false],
    ["empresas", refs.empresa, false],
    ["proyectos", refs.proyecto, false],
    ["centros-costo", refs.centroCosto, false],
  ];
  for (const [cat, val, obligatorio] of checks) {
    if (val === undefined) continue;
    const r = await adapters.catalogos.validarReferencia(tenant, cat, val, obligatorio);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

function construirVOs(input: Record<string, unknown>): Result<
  {
    sla: OrdenTrabajo["sla"];
    ubicacion: OrdenTrabajo["ubicacion"];
    activoPrincipal: OrdenTrabajo["activoPrincipal"];
    activosRelacionados: OrdenTrabajo["activosRelacionados"];
    tiempoEstimado: OrdenTrabajo["tiempoEstimado"];
    costoEstimado: OrdenTrabajo["costoEstimado"];
    riesgoImpacto: OrdenTrabajo["riesgoImpacto"];
  },
  KernelError
> {
  let sla: OrdenTrabajo["sla"] = null;
  if (input["sla"] !== undefined && input["sla"] !== null) {
    const r = crearSla(input["sla"]);
    if (!r.ok) return r;
    sla = r.value;
  }
  let ubicacion: OrdenTrabajo["ubicacion"] = null;
  if (input["ubicacion"] !== undefined && input["ubicacion"] !== null) {
    const r = crearUbicacion(input["ubicacion"]);
    if (!r.ok) return r;
    ubicacion = r.value;
  }
  let activoPrincipal: OrdenTrabajo["activoPrincipal"] = null;
  if (input["activoPrincipal"] !== undefined && input["activoPrincipal"] !== null) {
    const r = crearReferenciaActivo({ ...(input["activoPrincipal"] as object), rol: "principal" });
    if (!r.ok) return r;
    activoPrincipal = r.value;
  }
  const activosRelacionados: OrdenTrabajo["activosRelacionados"][number][] = [];
  for (const a of (input["activosRelacionados"] as unknown[] | undefined) ?? []) {
    const r = crearReferenciaActivo({ ...(a as object), rol: "relacionado" });
    if (!r.ok) return r;
    activosRelacionados.push(r.value);
  }
  let tiempoEstimado: OrdenTrabajo["tiempoEstimado"] = null;
  if (input["tiempoEstimado"] !== undefined && input["tiempoEstimado"] !== null) {
    const r = crearDuracion(input["tiempoEstimado"]);
    if (!r.ok) return r;
    tiempoEstimado = r.value;
  }
  let costoEstimado: OrdenTrabajo["costoEstimado"] = null;
  if (input["costoEstimado"] !== undefined && input["costoEstimado"] !== null) {
    const r = crearCosto(input["costoEstimado"]);
    if (!r.ok) return r;
    costoEstimado = r.value;
  }
  let riesgoImpacto: OrdenTrabajo["riesgoImpacto"] = null;
  if (input["riesgoImpacto"] !== undefined && input["riesgoImpacto"] !== null) {
    const r = crearRiesgoImpacto(input["riesgoImpacto"]);
    if (!r.ok) return r;
    riesgoImpacto = r.value;
  }
  return ok({ sla, ubicacion, activoPrincipal, activosRelacionados, tiempoEstimado, costoEstimado, riesgoImpacto });
}

/**
 * Máxima diferencia de versión aceptada respecto a la ACTIVA (garantía N/N-1
 * del motor de Dynamic Forms): la versión anclada puede ser la activa (N) o la
 * inmediatamente anterior (N-1).
 */
const MAX_DELTA_VERSION = 1;

async function asociarPlantilla(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  input: {
    id: string;
    expectedVersion: number;
    opId?: string;
    plantilla: { servicio?: string; clave: string; version: number; etiqueta?: string };
    respuestaId?: string;
  },
  clase: "formulario" | "checklist",
): Promise<Result<unknown, KernelError>> {
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return tenant;
  const comando = `${MODULO}.asociar${clase === "formulario" ? "Formulario" : "Checklist"}`;
  const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
  if (previo) return ok({ ...previo, idempotente: true });
  const actual = await adapters.repository.findById(tenant.value, input.id);
  if (!actual.ok) return actual;
  if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

  const policy = clase === "formulario" ? POLICY_PUEDE_ASOCIAR_FORMULARIO : POLICY_PUEDE_ASOCIAR_CHECKLIST;
  const pol = deps.runtime.policyEngine.evaluate(policy, ctx, { estado: actual.value.estado });
  if (!pol.ok) return pol;

  // (a) VALIDACIÓN contra el runtime de Dynamic Forms: la plantilla EXISTE, es
  // de la CLASE correcta y su versión es COMPATIBLE (N/N-1). Sin esta
  // verificación no se puede anclar ninguna respuesta coherente.
  const verif = await adapters.plantillas.verificar(tenant.value, clase, input.plantilla.clave, input.plantilla.version);
  if (!verif.ok) return verif;
  if (verif.value.versionActiva != null) {
    const delta = verif.value.versionActiva - input.plantilla.version;
    if (delta < 0 || delta > MAX_DELTA_VERSION) {
      return fail(
        KernelErrors.conflict(
          `Versión de plantilla incompatible: ${input.plantilla.version} (activa ${verif.value.versionActiva}); ` +
            `solo se admite la activa (N) o la anterior (N-1).`,
        ),
      );
    }
  }

  // (b) ANCLAJE de respuesta: si se aporta una respuesta, debe existir y estar
  // anclada a la versión EXACTA de la plantilla referida (coherencia).
  let respuesta: { respuestaId: string; version: number } | null = null;
  if (input.respuestaId) {
    const rp = await adapters.plantillas.verificarRespuesta(tenant.value, input.respuestaId, input.plantilla.clave);
    if (!rp.ok) return rp;
    if (rp.value.plantillaVersion !== input.plantilla.version) {
      return fail(
        KernelErrors.conflict(
          `La respuesta ${input.respuestaId} está anclada a la versión ${rp.value.plantillaVersion}, ` +
            `no a la versión referida ${input.plantilla.version}.`,
        ),
      );
    }
    respuesta = { respuestaId: rp.value.respuestaId, version: rp.value.plantillaVersion };
  }

  const ref = crearReferenciaPlantilla({
    ...input.plantilla,
    clase,
    etiqueta: input.plantilla.etiqueta ?? verif.value.titulo,
    respuesta,
  });
  if (!ref.ok) return ref;

  const cambio =
    clase === "formulario"
      ? asociarFormulario(actual.value, ref.value, ctx.principal.id, new Date())
      : asociarChecklist(actual.value, ref.value, ctx.principal.id, new Date());
  if (!cambio.ok) return cambio;
  const saved = await persistir(deps, adapters, ctx, uow, cambio.value, `asociar:${clase}`, false, input.expectedVersion);
  if (!saved.ok) return saved;
  const resultado = { id: input.id, version: saved.value.version, clase, respuesta };
  if (input.opId) {
    const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando, resultado }, ctx.principal.id);
    if (!rec.ok) return rec;
  }
  return ok({ ...resultado, idempotente: false });
}

// Referencia no usada directamente pero exportada para claridad del contrato.
export const COMANDO_INICIAL_TRANSICION = CMD_ABRIR;
export { PERMISO_OPERAR };
