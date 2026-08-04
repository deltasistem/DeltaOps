/**
 * DGP-008.1 · Módulo Activos Empresariales — Capa de aplicación + descriptor.
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime → registerPlatformService). Pipeline:
 * HTTP → Command → Validation → Authorization → Policy → Application Service →
 * Repository → UoW → PostgreSQL → Outbox → Audit → Projection → Read Model → API.
 *
 * CQRS estricto: los comandos leen el aggregate (fuente de verdad); las
 * consultas SOLO leen el read model. Los catálogos son configurables por
 * tenant (Record Store). Todo parametrizado vía tenantConfig — nada hardcodeado.
 */
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
import {
  ACTIVO_ACTUALIZADO,
  ACTIVO_EN_MANTENIMIENTO,
  ACTIVO_FUERA_SERVICIO,
  ACTIVO_HOROMETRO_ACTUALIZADO,
  ACTIVO_ODOMETRO_ACTUALIZADO,
  ACTIVO_OPERATIVO,
  ACTIVO_REGISTRADO,
  ACTIVO_RESPONSABLE_ACTUALIZADO,
  ACTIVO_RETIRADO,
  ACTIVO_UBICACION_ACTUALIZADA,
  actualizarHorometro,
  actualizarOdometro,
  asignarResponsable,
  cambiarUbicacion,
  crearActivo,
  editarActivo,
  EVENTOS_MODULO,
  eventoActivo,
  fueraServicioActivo,
  mantenerActivo,
  operarActivo,
  registrarActivo,
  retirarActivo,
  type Activo,
  type CambioActivo,
  type PatchActivo,
} from "./domain/activo";
import { ESTADOS, type EstadoActivo } from "./domain/maquina-estados";
import {
  policiesDelModulo,
  POLICY_PUEDE_ASIGNAR_RESPONSABLE,
  POLICY_PUEDE_CAMBIAR_UBICACION,
  POLICY_PUEDE_CERRAR,
  POLICY_PUEDE_MODIFICAR,
  POLICY_PUEDE_MODIFICAR_HOROMETRO,
  POLICY_PUEDE_MODIFICAR_ODOMETRO,
  POLICY_PUEDE_REGISTRAR,
  POLICY_PUEDE_RETIRAR,
  POLICIES,
} from "./domain/policies";
import { CATALOGOS, ESTADO_HABILITADO, type NombreCatalogo } from "./domain/catalogos";
import {
  crearGarantia,
  crearEspecificaciones,
  crearIdentificacionTecnica,
  crearMedicion,
  crearUbicacion,
} from "./domain/value-objects";
import { CatalogoService } from "./infrastructure/catalogo-service";
import {
  type ActivoReadModel,
  type ActivoReadRow,
  type ActivoRepository,
} from "./infrastructure/repository";

export { MODULO };

export interface ModuleAdapters {
  readonly repository: ActivoRepository;
  readonly readModel: ActivoReadModel;
}

/* ------------------------------- Config ---------------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

/* ------------------------- Domain Service (unicidad) --------------------- */

async function codigoDisponible(
  repo: ActivoRepository,
  tenantId: string,
  codigo: string,
  exceptoId?: string,
): Promise<Result<void, KernelError>> {
  const existing = await repo.findByCodigo(tenantId, codigo);
  if (!existing.ok) return existing;
  if (existing.value && existing.value.id !== exceptoId) {
    return fail(KernelErrors.conflict(`Ya existe un activo con código "${codigo}"`));
  }
  return ok(undefined);
}

/* ------------------------- Validación de catálogos ----------------------- */

async function validarCatalogos(
  store: CatalogoService,
  tenant: string,
  a: Pick<Activo, "tipo" | "categoria" | "familia" | "subfamilia" | "criticidad" | "prioridad" | "moneda" | "centroCosto" | "empresa" | "proyecto" | "fabricante" | "modelo"> & { ubicacionId?: string | null },
): Promise<Result<void, KernelError>> {
  const checks: [NombreCatalogo, string | null | undefined, boolean][] = [
    ["tipos", a.tipo, true],
    ["categorias", a.categoria, true],
    ["familias", a.familia, true],
    ["subfamilias", a.subfamilia, false],
    ["criticidades", a.criticidad, false],
    ["prioridades", a.prioridad, false],
    ["monedas", a.moneda, false],
    ["centros-costo", a.centroCosto, false],
    ["empresas", a.empresa, false],
    ["proyectos", a.proyecto, false],
    ["fabricantes", a.fabricante, false],
    ["modelos", a.modelo, false],
    ["ubicaciones", a.ubicacionId, false],
  ];
  for (const [catalogo, clave, obligatorio] of checks) {
    const r = await store.validarReferencia(tenant, catalogo, clave, obligatorio);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/**
 * Valida el estado destino de una transición contra el catálogo CONFIGURABLE
 * `estados`, con semántica INEQUÍVOCA:
 *
 *   - Catálogo `estados` VACÍO  ⇒ máquina de estados CANÓNICA completa: toda
 *     transición del dominio es admisible (sin configuración explícita).
 *   - Catálogo `estados` NO VACÍO ⇒ el tenant declara EXPLÍCITAMENTE qué
 *     estados admite: el estado destino debe estar PRESENTE **y** HABILITADO.
 *     Si está ausente o deshabilitado, la transición se RECHAZA con un error de
 *     validación claro.
 */
async function validarEstadoHabilitado(
  store: CatalogoService,
  tenant: string,
  estadoDestino: string,
): Promise<Result<void, KernelError>> {
  const total = await store.contarEntradas(tenant, "estados");
  if (!total.ok) return total;
  if (total.value === 0) return ok(undefined); // catálogo vacío ⇒ máquina canónica

  const entrada = await store.buscar(tenant, "estados", estadoDestino);
  if (!entrada.ok) return entrada;
  if (!entrada.value) {
    return fail(
      KernelErrors.validation(
        `El estado "${estadoDestino}" no está en el catálogo "estados" configurado por el tenant`,
      ),
    );
  }
  if (entrada.value.status !== ESTADO_HABILITADO) {
    return fail(
      KernelErrors.validation(`El estado "${estadoDestino}" está deshabilitado en el catálogo del tenant`),
    );
  }
  return ok(undefined);
}

/** Valida las unidades de medición (horómetro/odómetro) contra `unidades`. */
async function validarUnidades(
  store: CatalogoService,
  tenant: string,
  unidades: ReadonlyArray<string | null | undefined>,
): Promise<Result<void, KernelError>> {
  for (const u of unidades) {
    const r = await store.validarReferencia(tenant, "unidades", u ?? null, false);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/* ---------------------- Application Service ------------------------------ */

async function persistirCambio(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  cambio: CambioActivo,
  accion: string,
  esCreacion: boolean,
  expectedVersion?: number,
): Promise<Result<Activo, KernelError>> {
  const a = cambio.activo;
  const persisted = esCreacion
    ? await adapters.repository.insert(uow, a)
    : await adapters.repository.update(uow, a, expectedVersion!);
  if (!persisted.ok) return persisted;

  const audited = await audit(deps.audit, uow, ctx, a.tenantId, MODULO, accion, a.id, {
    estado: a.estado,
    version: a.version,
  });
  if (!audited.ok) return audited;

  uow.registerEvent(createDomainEvent(cambio.evento.tipo, cambio.evento.payload, ctx.correlationId));
  return ok(a);
}

/* ----------------------------- Proyección -------------------------------- */

function readRowDeEvento(p: Record<string, unknown>, eventId: string): ActivoReadRow {
  const ubic = p["ubicacion"] as { ubicacionId?: string } | null | undefined;
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: String(p["id"] ?? ""),
    codigoEmpresarial: String(p["codigoEmpresarial"] ?? ""),
    nombre: String(p["nombre"] ?? ""),
    estado: (p["estado"] as EstadoActivo) ?? "BORRADOR",
    tipo: String(p["tipo"] ?? ""),
    criticidad: p["criticidad"] == null ? null : String(p["criticidad"]),
    ubicacionId: ubic?.ubicacionId ?? null,
    datos: { ...p },
    version: Number(p["version"] ?? 1),
    lastEventId: eventId,
    actualizadoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
  };
}

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
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, (uow) =>
      adapters.readModel.apply(uow, readRowDeEvento(p, event.id)),
    );
    return applied.ok ? ok(undefined) : applied;
  };
}

/* ------------------------------- Schemas VO ------------------------------ */

const UbicacionInput = z.object({
  ubicacionId: z.string().min(1),
  etiqueta: z.string().min(1),
  coordenadas: z
    .object({ latitud: z.number(), longitud: z.number(), altitud: z.number().optional() })
    .optional(),
  detalle: z.string().optional(),
});
const MedicionInput = z.object({ valor: z.number(), unidad: z.string().min(1), fecha: z.string().min(1) });

const CrearInput = z.object({
  id: z.string().uuid().optional(),
  opId: z.string().optional(),
  codigoEmpresarial: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  tipo: z.string().min(1),
  categoria: z.string().min(1),
  familia: z.string().min(1),
  subfamilia: z.string().nullish(),
  fabricante: z.string().nullish(),
  modelo: z.string().nullish(),
  serie: z.string().nullish(),
  anio: z.number().int().nullish(),
  fechaCompra: z.string().nullish(),
  fechaPuestaServicio: z.string().nullish(),
  vidaUtil: z.number().nullish(),
  valorAdquisicion: z.number().nullish(),
  valorResidual: z.number().nullish(),
  moneda: z.string().nullish(),
  centroCosto: z.string().nullish(),
  empresa: z.string().nullish(),
  proyecto: z.string().nullish(),
  proveedor: z.string().nullish(),
  ubicacion: UbicacionInput.nullish(),
  responsable: z.string().nullish(),
  supervisor: z.string().nullish(),
  horometro: MedicionInput.nullish(),
  odometro: MedicionInput.nullish(),
  garantia: z.record(z.string(), z.unknown()).nullish(),
  identificacion: z.record(z.string(), z.unknown()).nullish(),
  especificaciones: z.record(z.string(), z.unknown()).nullish(),
  criticidad: z.string().nullish(),
  prioridad: z.string().nullish(),
  observaciones: z.string().optional(),
});

/* ------------------------------ Helpers UoW ------------------------------ */

/** Carga el aggregate o falla con notFound. */
async function cargar(
  adapters: ModuleAdapters,
  tenant: string,
  id: string,
): Promise<Result<Activo, KernelError>> {
  const actual = await adapters.repository.findById(tenant, id);
  if (!actual.ok) return actual;
  if (!actual.value) return fail(KernelErrors.notFound("activo", id));
  return ok(actual.value);
}

const ID_VERSION = z.object({ id: z.string(), expectedVersion: z.number().int().positive() });

/* ------------------------------ Descriptor ------------------------------- */

export function activosModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  let policiesRegistradas = false;
  const conPolicies = (deps: ServiceDeps): void => {
    if (policiesRegistradas) return;
    for (const p of policiesDelModulo()) deps.runtime.policyEngine.register(p);
    policiesRegistradas = true;
  };
  const catalogoDe = (deps: ServiceDeps) => new CatalogoService(deps.store);

  /**
   * Ejecuta una transición de estado con SUS policies (todas deben permitir) y
   * su evento. Cada policy recibe la configuración del tenant que necesita
   * (p.ej. `requiereAprobacion` para el cierre/retiro) y el estado destino, de
   * modo que la máquina de estados respeta los estados HABILITADOS por catálogo.
   */
  const comandoTransicion = (
    nombre: string,
    permiso: string,
    policies: readonly string[],
    fn: (a: Activo, actorId: string, ahora: Date) => Result<CambioActivo, KernelError>,
    accion: string,
    estadoDestino: EstadoActivo,
  ) => (deps: ServiceDeps) => {
    conPolicies(deps);
    return {
      name: `${MODULO}.${nombre}`,
      inputSchema: ID_VERSION.extend({ aprobado: z.boolean().optional() }),
      authorization: { permissions: [permiso] },
      async handle(ctx: ExecutionContext, input: z.infer<typeof ID_VERSION> & { aprobado?: boolean }, uow: UnitOfWork) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const actual = await cargar(adapters, tenant.value, input.id);
        if (!actual.ok) return actual;

        // El estado destino debe estar habilitado en el catálogo `estados`.
        const estadoOk = await validarEstadoHabilitado(catalogoDe(deps), tenant.value, estadoDestino);
        if (!estadoOk.ok) return estadoOk;

        const requiereAprobacion =
          (await cfg(deps, tenant.value, "requiere-aprobacion-retiro", "false")) === "true";
        const subject = {
          estado: actual.value.estado,
          estadoDestino,
          requiereAprobacion,
          aprobado: input.aprobado === true,
        };
        for (const policy of policies) {
          const decision = deps.runtime.policyEngine.evaluate(policy, ctx, subject);
          if (!decision.ok) return decision;
        }
        const cambio = fn(actual.value, ctx.principal.id, new Date());
        if (!cambio.ok) return cambio;
        const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, accion, false, input.expectedVersion);
        if (!saved.ok) return saved;
        return ok({ id: input.id, estado: saved.value.estado, version: saved.value.version });
      },
    };
  };

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Activos Empresariales (DGP-008.1) — dominio neutro por configuración: cualquier clase de activo por catálogos",
    capabilities: [
      {
        name: "gestionar-activos",
        permissions: ["modulo.activos.read", "modulo.activos.write", "modulo.activos.operar"],
        description: "Ciclo de vida operativo del activo (registro, edición, transiciones, mediciones)",
      },
      {
        name: "consultar-activos",
        permissions: ["modulo.activos.read"],
        description: "Consulta de activos y read models",
      },
      {
        name: "administrar-activos",
        permissions: ["modulo.activos.admin", "modulo.activos.retirar"],
        description: "Administración: catálogos, retiro/cierre y reproyección",
      },
    ],
    permissions: [
      "modulo.activos.read",
      "modulo.activos.write",
      "modulo.activos.operar",
      "modulo.activos.retirar",
      "modulo.activos.admin",
    ],
    dependsOn: ["platform.search", "platform.timeline", "platform.attachment", "platform.comment", "platform.config"],
    events: [...EVENTOS_MODULO],
    recordTypes: CATALOGOS.map((c) => `catalogo:${c}`),
    configDefaults: {
      "max-longitud-nombre": "160",
      "max-longitud-codigo": "60",
      "moneda-defecto": "USD",
      "permite-retroceso-horometro": "false",
      "permite-retroceso-odometro": "false",
      "requiere-aprobacion-retiro": "false",
    },
    commands: [
      // Crear — idempotente por id de cliente (offline). Registra el activo.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear`,
          inputSchema: CrearInput,
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const id = input.id ?? crypto.randomUUID();

            if (input.id) {
              const previo = await adapters.repository.findById(tenant.value, id);
              if (!previo.ok) return previo;
              if (previo.value) {
                return ok({ id, version: previo.value.version, estado: previo.value.estado, idempotente: true });
              }
            }

            const unico = await codigoDisponible(adapters.repository, tenant.value, input.codigoEmpresarial);
            if (!unico.ok) return unico;

            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "160"));
            const maxCodigo = Number(await cfg(deps, tenant.value, "max-longitud-codigo", "60"));
            const monedaDefecto = await cfg(deps, tenant.value, "moneda-defecto", "USD");
            // La moneda EFECTIVA (aplicando el defecto) es la que se valida como
            // habilitada: si un tenant no la tiene en su catálogo, se rechaza.
            const monedaEfectiva = input.moneda ?? monedaDefecto;

            // Validación de catálogos (valores habilitados por tenant).
            const cat = catalogoDe(deps);
            const okCat = await validarCatalogos(cat, tenant.value, {
              tipo: input.tipo, categoria: input.categoria, familia: input.familia,
              subfamilia: input.subfamilia ?? null, criticidad: input.criticidad ?? null,
              prioridad: input.prioridad ?? null, moneda: monedaEfectiva,
              centroCosto: input.centroCosto ?? null, empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null, fabricante: input.fabricante ?? null,
              modelo: input.modelo ?? null, ubicacionId: input.ubicacion?.ubicacionId ?? null,
            });
            if (!okCat.ok) return okCat;

            // Unidades de las mediciones contra el catálogo `unidades`.
            const okUni = await validarUnidades(cat, tenant.value, [
              input.horometro?.unidad, input.odometro?.unidad,
            ]);
            if (!okUni.ok) return okUni;

            // Proveedor: el VO se valida contra el catálogo `proveedores`.
            const okProv = await cat.validarReferencia(
              tenant.value, "proveedores", input.proveedor ?? null, false,
            );
            if (!okProv.ok) return okProv;

            // Construcción de VO validados.
            let ubicacion = null;
            if (input.ubicacion) {
              const vo = crearUbicacion(input.ubicacion);
              if (!vo.ok) return vo;
              ubicacion = vo.value;
            }
            let horometro = null;
            if (input.horometro) {
              const vo = crearMedicion(input.horometro);
              if (!vo.ok) return vo;
              horometro = vo.value;
            }
            let odometro = null;
            if (input.odometro) {
              const vo = crearMedicion(input.odometro);
              if (!vo.ok) return vo;
              odometro = vo.value;
            }
            let garantia = null;
            if (input.garantia) {
              const vo = crearGarantia(input.garantia);
              if (!vo.ok) return vo;
              garantia = vo.value;
            }
            let identificacion = null;
            if (input.identificacion) {
              const vo = crearIdentificacionTecnica(input.identificacion);
              if (!vo.ok) return vo;
              identificacion = vo.value;
            }
            let especificaciones = null;
            if (input.especificaciones) {
              const vo = crearEspecificaciones(input.especificaciones);
              if (!vo.ok) return vo;
              especificaciones = vo.value;
            }

            const registro = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_REGISTRAR, ctx, { estado: "BORRADOR" });
            if (!registro.ok) return registro;

            const cambio = crearActivo({
              id, tenantId: tenant.value,
              codigoEmpresarial: input.codigoEmpresarial, nombre: input.nombre,
              descripcion: input.descripcion, tipo: input.tipo, categoria: input.categoria,
              familia: input.familia, subfamilia: input.subfamilia ?? null,
              fabricante: input.fabricante ?? null, modelo: input.modelo ?? null,
              serie: input.serie ?? null, anio: input.anio ?? null,
              fechaCompra: input.fechaCompra ?? null, fechaPuestaServicio: input.fechaPuestaServicio ?? null,
              vidaUtil: input.vidaUtil ?? null, valorAdquisicion: input.valorAdquisicion ?? null,
              valorResidual: input.valorResidual ?? null, moneda: monedaEfectiva,
              centroCosto: input.centroCosto ?? null, empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null, proveedor: input.proveedor ?? null,
              ubicacion, responsable: input.responsable ?? null,
              supervisor: input.supervisor ?? null, horometro, odometro, garantia,
              identificacion, especificaciones, criticidad: input.criticidad ?? null,
              prioridad: input.prioridad ?? null, observaciones: input.observaciones,
              actorId: ctx.principal.id, maxLongitudNombre: maxNombre, maxLongitudCodigo: maxCodigo,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "crear", true);
            if (!saved.ok) return saved;
            return ok({ id, version: saved.value.version, estado: saved.value.estado, idempotente: false });
          },
        };
      },
      // Editar — policy puede-modificar + concurrencia optimista + catálogos.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar`,
          inputSchema: ID_VERSION.extend({
            nombre: z.string().min(1).optional(),
            descripcion: z.string().optional(),
            tipo: z.string().optional(),
            categoria: z.string().optional(),
            familia: z.string().optional(),
            subfamilia: z.string().nullish(),
            fabricante: z.string().nullish(),
            modelo: z.string().nullish(),
            serie: z.string().nullish(),
            anio: z.number().int().nullish(),
            fechaCompra: z.string().nullish(),
            fechaPuestaServicio: z.string().nullish(),
            vidaUtil: z.number().nullish(),
            valorAdquisicion: z.number().nullish(),
            valorResidual: z.number().nullish(),
            moneda: z.string().nullish(),
            centroCosto: z.string().nullish(),
            empresa: z.string().nullish(),
            proyecto: z.string().nullish(),
            proveedor: z.string().nullish(),
            supervisor: z.string().nullish(),
            criticidad: z.string().nullish(),
            prioridad: z.string().nullish(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;

            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;

            const cat = catalogoDe(deps);
            const okCat = await validarCatalogos(cat, tenant.value, {
              tipo: input.tipo ?? actual.value.tipo,
              categoria: input.categoria ?? actual.value.categoria,
              familia: input.familia ?? actual.value.familia,
              subfamilia: input.subfamilia ?? actual.value.subfamilia,
              criticidad: input.criticidad ?? actual.value.criticidad,
              prioridad: input.prioridad ?? actual.value.prioridad,
              moneda: input.moneda ?? actual.value.moneda,
              centroCosto: input.centroCosto ?? actual.value.centroCosto,
              empresa: input.empresa ?? actual.value.empresa,
              proyecto: input.proyecto ?? actual.value.proyecto,
              fabricante: input.fabricante ?? actual.value.fabricante,
              modelo: input.modelo ?? actual.value.modelo,
              ubicacionId: actual.value.ubicacion?.ubicacionId ?? null,
            });
            if (!okCat.ok) return okCat;

            const okProv = await cat.validarReferencia(
              tenant.value, "proveedores", input.proveedor ?? actual.value.proveedor, false,
            );
            if (!okProv.ok) return okProv;

            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "160"));
            const { id, expectedVersion, ...patch } = input;
            const cambio = editarActivo(actual.value, patch as PatchActivo, ctx.principal.id, maxNombre, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "editar", false, expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id, version: saved.value.version, estado: saved.value.estado });
          },
        };
      },
      // Transiciones de la máquina de estados (cada una con SUS policies).
      comandoTransicion("registrar", "modulo.activos.operar", [POLICY_PUEDE_REGISTRAR], registrarActivo, "registrar", "REGISTRADO"),
      comandoTransicion("operar", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], operarActivo, "operar", "OPERATIVO"),
      comandoTransicion("mantener", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], mantenerActivo, "mantener", "MANTENIMIENTO"),
      comandoTransicion("fuera-servicio", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], fueraServicioActivo, "fuera-servicio", "FUERA_SERVICIO"),
      // Retiro = CIERRE definitivo: exige puede-retirar Y puede-cerrar.
      comandoTransicion("retirar", "modulo.activos.retirar", [POLICY_PUEDE_RETIRAR, POLICY_PUEDE_CERRAR], retirarActivo, "retirar", "RETIRADO"),
      // Cambiar ubicación.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.cambiar-ubicacion`,
          inputSchema: ID_VERSION.extend({ ubicacion: UbicacionInput }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_CAMBIAR_UBICACION, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okCat = await catalogoDe(deps).validarReferencia(
              tenant.value, "ubicaciones", input.ubicacion.ubicacionId, true,
            );
            if (!okCat.ok) return okCat;
            const vo = crearUbicacion(input.ubicacion);
            if (!vo.ok) return vo;
            const cambio = cambiarUbicacion(actual.value, vo.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "cambiar-ubicacion", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Asignar responsable.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar-responsable`,
          inputSchema: ID_VERSION.extend({ responsable: z.string().min(1) }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_ASIGNAR_RESPONSABLE, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const cambio = asignarResponsable(actual.value, input.responsable, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "asignar-responsable", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Actualizar horómetro (medición monótona).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-horometro`,
          inputSchema: ID_VERSION.extend({ medicion: MedicionInput }),
          authorization: { permissions: ["modulo.activos.operar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR_HOROMETRO, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okUni = await validarUnidades(catalogoDe(deps), tenant.value, [input.medicion.unidad]);
            if (!okUni.ok) return okUni;
            const vo = crearMedicion(input.medicion);
            if (!vo.ok) return vo;
            const permite = (await cfg(deps, tenant.value, "permite-retroceso-horometro", "false")) === "true";
            const cambio = actualizarHorometro(actual.value, vo.value, permite, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "actualizar-horometro", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Actualizar odómetro (medición monótona).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-odometro`,
          inputSchema: ID_VERSION.extend({ medicion: MedicionInput }),
          authorization: { permissions: ["modulo.activos.operar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR_ODOMETRO, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okUni = await validarUnidades(catalogoDe(deps), tenant.value, [input.medicion.unidad]);
            if (!okUni.ok) return okUni;
            const vo = crearMedicion(input.medicion);
            if (!vo.ok) return vo;
            const permite = (await cfg(deps, tenant.value, "permite-retroceso-odometro", "false")) === "true";
            const cambio = actualizarOdometro(actual.value, vo.value, permite, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "actualizar-odometro", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Catálogo: alta/actualización de una entrada.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.upsert`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            etiqueta: z.string().min(1),
            posicion: z.number().int().optional(),
            padre: z.string().nullish(),
          }),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await catalogoDe(deps).upsert(
              uow, tenant.value, input.catalogo,
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
      // Catálogo: habilitar / deshabilitar una entrada.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.habilitar`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            habilitado: z.boolean(),
          }),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await catalogoDe(deps).habilitar(uow, tenant.value, input.catalogo, input.clave, input.habilitado);
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo-habilitar", `${input.catalogo}:${input.clave}`, { habilitado: input.habilitado });
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
          },
        };
      },
      // Reproyección (replay) del read model desde los aggregates.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reproyectar`,
          inputSchema: z.object({}),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, _input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const cleared = await adapters.readModel.clear(uow, tenant.value);
            if (!cleared.ok) return cleared;
            const all = await adapters.repository.list(tenant.value, { limit: 1000 });
            if (!all.ok) return all;
            let proyectados = 0;
            for (const a of all.value) {
              const evento = eventoActivo(a, ACTIVO_ACTUALIZADO, ctx.principal.id);
              const row = readRowDeEvento(evento.payload, `replay:${crypto.randomUUID()}`);
              const applied = await adapters.readModel.apply(uow, row);
              if (!applied.ok) return applied;
              proyectados += 1;
            }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reproyectar", "-", { proyectados });
            if (!audited.ok) return audited;
            return ok({ proyectados });
          },
        };
      },
      // NOTA: la sincronización offline NO es un comando del Kernel (eso
      // anidaría UoWs). Es una ORQUESTACIÓN fuera del pipeline: ver
      // `procesarCola` en `sincronizacion.ts`, expuesta por el runtime como
      // `sincronizar(ctx, operaciones)` y por el router como POST .../sync.
    ],
    queries: [
      // Listado desde el READ MODEL (filtros por estado/criticidad/ubicación/tipo).
      () => ({
        name: `${MODULO}.listar`,
        inputSchema: z.object({
          estado: z.enum(ESTADOS).optional(),
          criticidad: z.string().optional(),
          ubicacionId: z.string().optional(),
          tipo: z.string().optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return adapters.readModel.list(tenant.value, {
            estado: input.estado as EstadoActivo | undefined,
            criticidad: input.criticidad,
            ubicacionId: input.ubicacionId,
            tipo: input.tipo,
            limit: input.limit,
          });
        },
      }),
      // Detalle: SOLO read model (CQRS estricto).
      () => ({
        name: `${MODULO}.detalle`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rm = await adapters.readModel.get(tenant.value, input.id);
          if (!rm.ok) return rm;
          if (!rm.value) return fail(KernelErrors.notFound("activo", input.id));
          return ok(rm.value);
        },
      }),
      // Opciones de un catálogo (habilitadas).
      (deps) => ({
        name: `${MODULO}.catalogo.opciones`,
        inputSchema: z.object({ catalogo: z.enum(CATALOGOS) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return new CatalogoService(deps.store).opciones(tenant.value, input.catalogo as NombreCatalogo);
        },
      }),
      // Consola técnica: contrato + configuración efectiva.
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({}),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const claves = [
            "max-longitud-nombre", "max-longitud-codigo", "moneda-defecto",
            "permite-retroceso-horometro", "permite-retroceso-odometro", "requiere-aprobacion-retiro",
          ];
          const config: Record<string, string> = {};
          for (const k of claves) config[k] = await cfg(deps, tenant.value, k, "");
          return ok({
            modulo: MODULO,
            version: "1.0.0",
            estados: [...ESTADOS],
            eventos: [...EVENTOS_MODULO],
            policies: [...POLICIES],
            catalogos: [...CATALOGOS],
            configuracion: config,
          });
        },
      }),
    ],
    eventHandlers: [
      // Projection: todos los eventos actualizan el read model (idempotente).
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccion(adapters)(deps, event),
      })),
      // Search: indexación desde el payload en registro/actualización.
      ...[ACTIVO_REGISTRADO, ACTIVO_ACTUALIZADO].map((eventType) => ({
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
          const sysCtx = createExecutionContext({
            principal: SYSTEM_PRINCIPAL,
            correlationId: event.correlationId,
            metadata: { tenantId },
          });
          const r = await deps.runtime.commands.execute(sysCtx, "platform.search.indexDocument", {
            documentId: `activo:${id}`,
            entityType: "activo",
            entityRef: `activo:${id}`,
            titulo: `${String(p["codigoEmpresarial"] ?? "")} · ${String(p["nombre"] ?? "")}`,
            contenido: String(p["descripcion"] ?? ""),
          });
          return r.ok ? ok(undefined) : r;
        },
      })),
    ],
    healthCheck: () => async () => {
      const probe = await adapters.readModel.stats("healthcheck");
      return probe.ok
        ? { healthy: true, detail: "repositorio y read model de activos operativos" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}
