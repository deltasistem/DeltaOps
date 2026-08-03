/**
 * DGP-007 · Dynamic Forms Engine — Response Runtime.
 *
 * Captura de respuestas del formulario. Entidad "respuesta de formulario" con
 * ciclo BORRADOR → ENVIADA persistida vía RecordStorePort. Comandos del Kernel:
 *   - guardarBorrador: valida SOLO bloqueos (severidad `bloqueo`).
 *   - enviar: validación COMPLETA (síncrona + condicionales + asincrónicas
 *     server-side) y transición a ENVIADA.
 * Offline First: `opId` en todo comando, idempotencia por recibo en el registro;
 * versionado optimista; evento con payload completo (proyección solo-payload).
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  ok,
  type CommandDefinition,
  type QueryDefinition,
} from "@workspace/kernel";
import { audit, tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  RepositorioGenerico,
  type DefinicionEntidad,
} from "@workspace/business-foundation";
import {
  esquemaDatosFormulario,
  type DefinicionFormulario,
} from "./definicion";
import {
  soloBloqueos,
  validarCompleto,
  validarSincrono,
  type ContratoValidacion,
} from "./validacion";
import { sellarEvidencias, type EntradaEvidencia, type Evidencia } from "./evidencias";
import { SERVICIO } from "./plantillas";

export const RECORD_RESPUESTA = "respuesta-formulario";

export const RESPUESTA_GUARDADA = `${SERVICIO}.respuesta.guardada`;
export const RESPUESTA_ENVIADA = `${SERVICIO}.respuesta.enviada`;

export const PERMISOS_RESPUESTA = {
  leer: `${SERVICIO}.respuesta.read`,
  escribir: `${SERVICIO}.respuesta.write`,
  enviar: `${SERVICIO}.respuesta.enviar`,
} as const;

/** DefinicionEntidad de la respuesta para el RepositorioGenerico. */
export const ENTIDAD_RESPUESTA: DefinicionEntidad = {
  nombre: RECORD_RESPUESTA,
  etiqueta: "Respuesta de formulario",
  servicio: SERVICIO,
  campos: [
    { nombre: "plantillaClave", tipo: "texto", requerido: true },
    { nombre: "plantillaVersion", tipo: "numero", requerido: true },
    { nombre: "datos", tipo: "json", requerido: true },
  ],
  permisos: {
    leer: PERMISOS_RESPUESTA.leer,
    crear: PERMISOS_RESPUESTA.escribir,
    editar: PERMISOS_RESPUESTA.escribir,
    eliminar: PERMISOS_RESPUESTA.escribir,
    admin: PERMISOS_RESPUESTA.enviar,
  },
  capacidades: [],
};

/** Definición + contrato resueltos de una plantilla. */
export interface ResueltoFormulario {
  readonly ok: true;
  readonly definicion: DefinicionFormulario;
  readonly contrato: ContratoValidacion;
}

/** Resolutor de la definición + contrato de un formulario (por clave+versión). */
export interface ResolutorPlantillas {
  /**
   * Devuelve la definición y el contrato de una VERSIÓN EXACTA de plantilla.
   * Debe preservar versiones históricas: una respuesta creada con la versión N
   * se sigue resolviendo aunque exista una N+1 activa (garantía N/N-1).
   */
  resolver(
    tenantId: string,
    plantillaClave: string,
    plantillaVersion: number,
  ): Promise<ResueltoFormulario | { readonly ok: false; readonly mensaje: string }>;
  /** Devuelve la definición/contrato + versión de la plantilla ACTIVA por clave. */
  resolverActiva(
    tenantId: string,
    plantillaClave: string,
  ): Promise<(ResueltoFormulario & { readonly version: number }) | { readonly ok: false; readonly mensaje: string }>;
}

const OP_IDS_KEY = "_opIds";
function opIdsDe(data: Record<string, unknown>): string[] {
  const raw = data[OP_IDS_KEY];
  return Array.isArray(raw) ? raw.map(String) : [];
}
function conOpId(data: Record<string, unknown>, opId?: string): Record<string, unknown> {
  if (!opId) return data;
  const previos = opIdsDe(data);
  if (previos.includes(opId)) return data;
  return { ...data, [OP_IDS_KEY]: [...previos, opId].slice(-50) };
}

function repo(deps: ServiceDeps): RepositorioGenerico {
  return new RepositorioGenerico(deps.store, ENTIDAD_RESPUESTA);
}

const evidenciaEntradaSchema = z.record(z.string(), z.array(z.custom<EntradaEvidencia>()));

/**
 * Comandos del Response Runtime. Requieren un `ResolutorPlantillas` para
 * obtener la definición/contrato de la plantilla (server-side).
 */
export function comandosRespuesta(
  resolutor: ResolutorPlantillas,
): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  const auditar = (
    deps: ServiceDeps,
    uow: Parameters<CommandDefinition<any, any>["handle"]>[2],
    ctx: Parameters<CommandDefinition<any, any>["handle"]>[0],
    tenantId: string,
    accion: string,
    id: string,
    detalle: Record<string, unknown>,
  ) => audit(deps.audit, uow, ctx, tenantId, SERVICIO, accion, id, detalle);

  return [
    // guardarBorrador — valida SOLO bloqueos; crear exige id de cliente
    (deps) => ({
      name: `${SERVICIO}.respuesta.guardarBorrador`,
      inputSchema: z.object({
        id: z.string(),
        opId: z.string(),
        plantillaClave: z.string().min(1),
        plantillaVersion: z.number().int().positive().optional(),
        version: z.number().int().nonnegative().optional(),
        datos: z.record(z.string(), z.unknown()),
        evidencias: evidenciaEntradaSchema.optional(),
      }),
      authorization: { permissions: [PERMISOS_RESPUESTA.escribir] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;

        // Pinnear la versión: si el cliente la fija, esa; si no, la ACTIVA del
        // momento (queda inmutable en la respuesta → garantía N/N-1).
        let plantillaVersion = input.plantillaVersion;
        let resuelto: ResueltoFormulario | { ok: false; mensaje: string };
        if (plantillaVersion != null) {
          resuelto = await resolutor.resolver(tenant.value, input.plantillaClave, plantillaVersion);
        } else {
          const activa = await resolutor.resolverActiva(tenant.value, input.plantillaClave);
          if (!activa.ok) return fail(KernelErrors.notFound("plantilla-formulario", input.plantillaClave));
          plantillaVersion = activa.version;
          resuelto = activa;
        }
        if (!resuelto.ok) return fail(KernelErrors.notFound("plantilla-formulario", input.plantillaClave));

        // Validación de bloqueos (impide guardar incluso el borrador).
        const val = validarSincrono(resuelto.definicion, input.datos, resuelto.contrato);
        const bloqueos = soloBloqueos(val);
        if (!bloqueos.valido) {
          return fail(
            KernelErrors.validation("El borrador no puede guardarse por reglas de bloqueo", {
              hallazgos: bloqueos.hallazgos,
            }),
          );
        }

        // Sellado de evidencias con la identidad/momento del contexto.
        const evidencias = await sellarLote(input.evidencias, ctx);
        if (!evidencias.ok) return evidencias;

        const actual = await repo(deps).porId(tenant.value, input.id);
        if (!actual.ok) return actual;

        if (actual.value) {
          // Idempotencia offline por opId.
          if (opIdsDe(actual.value.data).includes(input.opId)) {
            return ok({ id: input.id, version: actual.value.version, estado: actual.value.estado, idempotente: true });
          }
          if (actual.value.estado !== "BORRADOR") {
            return fail(KernelErrors.conflict("La respuesta ya fue enviada; no admite edición"));
          }
          const data = conOpId(
            {
              plantillaClave: input.plantillaClave,
              plantillaVersion,
              datos: input.datos,
              evidencias: evidencias.value,
            },
            input.opId,
          );
          const updated = await repo(deps).actualizar(
            uow,
            { ...actual.value, data },
            input.version ?? actual.value.version,
          );
          if (!updated.ok) return updated;
          const audited = await auditar(deps, uow, ctx, tenant.value, "guardarBorrador", input.id, {
            version: updated.value.version,
          });
          if (!audited.ok) return audited;
          uow.registerEvent(
            createDomainEvent(RESPUESTA_GUARDADA, payloadRespuesta(tenant.value, input.id, updated.value.estado, updated.value.version, { plantillaClave: input.plantillaClave, plantillaVersion, datos: input.datos }, evidencias.value, ctx.principal.id), ctx.correlationId),
          );
          return ok({ id: input.id, version: updated.value.version, estado: updated.value.estado, idempotente: false });
        }

        // Crear borrador nuevo.
        const inserted = await repo(deps).insertar(uow, {
          id: input.id,
          tenantId: tenant.value,
          estado: "BORRADOR",
          version: 0,
          data: conOpId(
            {
              plantillaClave: input.plantillaClave,
              plantillaVersion,
              datos: input.datos,
              evidencias: evidencias.value,
            },
            input.opId,
          ),
          createdBy: ctx.principal.id,
          updatedAt: new Date(),
        });
        if (!inserted.ok) return inserted;
        const audited = await auditar(deps, uow, ctx, tenant.value, "guardarBorrador", input.id, {
          version: inserted.value.version,
        });
        if (!audited.ok) return audited;
        uow.registerEvent(
          createDomainEvent(RESPUESTA_GUARDADA, payloadRespuesta(tenant.value, input.id, inserted.value.estado, inserted.value.version, { plantillaClave: input.plantillaClave, plantillaVersion, datos: input.datos }, evidencias.value, ctx.principal.id), ctx.correlationId),
        );
        return ok({ id: input.id, version: inserted.value.version, estado: inserted.value.estado, idempotente: false });
      },
    }),
    // enviar — validación COMPLETA (incl. asincrónicas server-side)
    (deps) => ({
      name: `${SERVICIO}.respuesta.enviar`,
      inputSchema: z.object({
        id: z.string(),
        opId: z.string(),
        version: z.number().int().nonnegative(),
      }),
      authorization: { permissions: [PERMISOS_RESPUESTA.enviar] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const actual = await repo(deps).porId(tenant.value, input.id);
        if (!actual.ok) return actual;
        if (!actual.value) return fail(KernelErrors.notFound(RECORD_RESPUESTA, input.id));

        if (opIdsDe(actual.value.data).includes(input.opId)) {
          return ok({ id: input.id, version: actual.value.version, estado: actual.value.estado, idempotente: true });
        }
        if (actual.value.estado === "ENVIADA") {
          return fail(KernelErrors.conflict("La respuesta ya fue enviada"));
        }

        const plantillaClave = String(actual.value.data["plantillaClave"]);
        const plantillaVersion = Number(actual.value.data["plantillaVersion"]);
        const datos = actual.value.data["datos"] as Record<string, unknown>;

        // Resolver SIEMPRE contra la versión ORIGINAL con la que se llenó.
        const resuelto = await resolutor.resolver(tenant.value, plantillaClave, plantillaVersion);
        if (!resuelto.ok) return fail(KernelErrors.notFound("plantilla-formulario", plantillaClave));

        const val = await validarCompleto(resuelto.definicion, datos, resuelto.contrato, ctx, deps.runtime.queries);
        if (!val.valido) {
          return fail(
            KernelErrors.validation("La respuesta no supera la validación de envío", {
              hallazgos: val.hallazgos,
            }),
          );
        }

        const data = conOpId(actual.value.data, input.opId);
        const updated = await repo(deps).actualizar(
          uow,
          { ...actual.value, estado: "ENVIADA", data },
          input.version,
        );
        if (!updated.ok) return updated;
        const audited = await auditar(deps, uow, ctx, tenant.value, "enviar", input.id, {
          version: updated.value.version,
        });
        if (!audited.ok) return audited;
        uow.registerEvent(
          createDomainEvent(
            RESPUESTA_ENVIADA,
            {
              tenantId: tenant.value,
              id: input.id,
              entityRef: `${SERVICIO}.${RECORD_RESPUESTA}:${input.id}`,
              plantillaClave,
              plantillaVersion,
              estado: "ENVIADA",
              version: updated.value.version,
              datos,
              evidencias: updated.value.data["evidencias"] ?? [],
              advertencias: val.hallazgos.filter((h) => h.severidad === "advertencia"),
              actorId: ctx.principal.id,
              enviadaAt: new Date().toISOString(),
            },
            ctx.correlationId,
          ),
        );
        return ok({
          id: input.id,
          estado: updated.value.estado,
          version: updated.value.version,
          advertencias: val.hallazgos.filter((h) => h.severidad === "advertencia"),
          idempotente: false,
        });
      },
    }),
  ];
}

/** Consultas del Response Runtime (obtener/listar). */
export function queriesRespuesta(): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  return [
    (deps) => ({
      name: `${SERVICIO}.respuesta.obtener`,
      inputSchema: z.object({ id: z.string() }),
      authorization: { permissions: [PERMISOS_RESPUESTA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const found = await repo(deps).porId(tenant.value, input.id);
        if (!found.ok) return found;
        if (!found.value) return fail(KernelErrors.notFound(RECORD_RESPUESTA, input.id));
        return ok(found.value);
      },
    }),
    (deps) => ({
      name: `${SERVICIO}.respuesta.listar`,
      inputSchema: z.object({
        estado: z.enum(["BORRADOR", "ENVIADA"]).optional(),
        limit: z.number().int().positive().max(200).optional(),
      }),
      authorization: { permissions: [PERMISOS_RESPUESTA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        return repo(deps).listar(tenant.value, { estado: input.estado, limit: input.limit });
      },
    }),
  ];
}

/* ------------------------------- Helpers ---------------------------------- */

async function sellarLote(
  entradas: Record<string, EntradaEvidencia[]> | undefined,
  ctx: Parameters<CommandDefinition<any, any>["handle"]>[0],
): Promise<ReturnType<typeof sellarEvidencias>> {
  if (!entradas) return ok([]);
  const todas: EntradaEvidencia[] = Object.values(entradas).flat();
  return sellarEvidencias(todas, ctx, new Date());
}

function payloadRespuesta(
  tenantId: string,
  id: string,
  estado: string,
  version: number,
  input: { plantillaClave: string; plantillaVersion: number; datos: Record<string, unknown> },
  evidencias: readonly Evidencia[],
  actorId: string,
): Record<string, unknown> {
  return {
    tenantId,
    id,
    entityRef: `${SERVICIO}.${RECORD_RESPUESTA}:${id}`,
    plantillaClave: input.plantillaClave,
    plantillaVersion: input.plantillaVersion,
    estado,
    version,
    datos: input.datos,
    evidencias,
    actorId,
    actualizadoAt: new Date().toISOString(),
  };
}

/** Esquema Zod de los datos esperados según una definición (para validación externa). */
export function esquemaDatos(def: DefinicionFormulario) {
  return esquemaDatosFormulario(def);
}
