/**
 * DGP-007 · Dynamic Forms Engine — Template Runtime (versionado N/N-1).
 *
 * Plantillas de formulario VERSIONADAS e INMUTABLES persistidas vía
 * RecordStorePort (recordType `plantilla-formulario`). Modelo:
 *
 *   - BORRADOR: registro mutable con `id` de cliente (offline). Aún sin versión.
 *   - VERSIÓN PUBLICADA: registro INMUTABLE propio, con id determinista
 *     `<clave>:v<version>`. Nunca se reescribe su contenido.
 *   - ÍNDICE por clave: registro `idx:<clave>` que apunta a la versión ACTIVA y
 *     lleva la última versión publicada. Garantiza UNA sola versión activa.
 *
 * `publicar` incrementa la versión (N+1), crea el registro inmutable, desactiva
 * la versión activa anterior y actualiza el índice — todo en la MISMA UoW. Las
 * versiones históricas permanecen legibles para siempre, de modo que una
 * respuesta creada con la versión N sigue validándose tras publicar N+1
 * (garantía N/N-1). Import respeta clave+versión (duplicado → conflicto).
 *
 * Todo pasa por comandos/consultas del Kernel; el Record Store resuelve
 * multitenancy y RLS. No hay SQL propio.
 */
import { z } from "zod";
import {
  fail,
  KernelErrors,
  ok,
  type CommandDefinition,
  type QueryDefinition,
} from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  RepositorioGenerico,
  type DefinicionEntidad,
} from "@workspace/business-foundation";
import {
  definicionFormularioSchema,
  type DefinicionFormulario,
} from "./definicion";
import type { ContratoValidacion } from "./validacion";
import type { LayoutFormulario } from "./layout";
import { detectarVocabularioProhibido } from "./vocabulario";

export const SERVICIO = "modulo.formularios";
export const RECORD_PLANTILLA = "plantilla-formulario";

export type EstadoPlantilla = "BORRADOR" | "PUBLICADA" | "ACTIVA" | "INACTIVA" | "INDICE";

/** Contenido autocontenido de una plantilla (exportable/importable). */
export interface ContenidoPlantilla {
  readonly definicion: DefinicionFormulario;
  readonly contrato?: ContratoValidacion;
  readonly layout?: LayoutFormulario;
}

/** Documento JSON de exportación autocontenido. */
export interface ExportacionPlantilla extends ContenidoPlantilla {
  readonly clave: string;
  readonly version: number;
  readonly estado: EstadoPlantilla;
  readonly formatoExport: "deltaops.dynamic-forms.plantilla.v1";
}

export const PERMISOS_PLANTILLA = {
  leer: `${SERVICIO}.plantilla.read`,
  crear: `${SERVICIO}.plantilla.write`,
  publicar: `${SERVICIO}.plantilla.publicar`,
  admin: `${SERVICIO}.plantilla.admin`,
} as const;

/** DefinicionEntidad de la plantilla para el RepositorioGenerico. */
export const ENTIDAD_PLANTILLA: DefinicionEntidad = {
  nombre: RECORD_PLANTILLA,
  etiqueta: "Plantilla de formulario",
  servicio: SERVICIO,
  campos: [
    { nombre: "clave", tipo: "texto", requerido: true },
    { nombre: "titulo", tipo: "texto", requerido: true },
    { nombre: "version", tipo: "numero", requerido: false },
    { nombre: "contenido", tipo: "json", requerido: false },
  ],
  permisos: {
    leer: PERMISOS_PLANTILLA.leer,
    crear: PERMISOS_PLANTILLA.crear,
    editar: PERMISOS_PLANTILLA.crear,
    eliminar: PERMISOS_PLANTILLA.admin,
    admin: PERMISOS_PLANTILLA.admin,
  },
  capacidades: [],
};

/* -------------------------- Ids deterministas ----------------------------- */

/** Id determinista e inmutable de una versión publicada. */
export function idVersion(clave: string, version: number): string {
  return `${clave}:v${version}`;
}

/** Id determinista del índice lógico por clave. */
export function idIndice(clave: string): string {
  return `idx:${clave}`;
}

interface DatosIndice {
  readonly clave: string;
  readonly ultimaVersion: number;
  readonly activa: number | null;
}

/* ------------------------------- Esquemas --------------------------------- */

const contenidoSchema = z.object({
  definicion: definicionFormularioSchema,
  contrato: z.unknown().optional(),
  layout: z.unknown().optional(),
});

const importacionSchema = z.object({
  clave: z.string().min(1),
  version: z.number().int().positive(),
  estado: z.enum(["BORRADOR", "PUBLICADA", "ACTIVA", "INACTIVA"]).optional(),
  formatoExport: z.literal("deltaops.dynamic-forms.plantilla.v1"),
  definicion: definicionFormularioSchema,
  contrato: z.unknown().optional(),
  layout: z.unknown().optional(),
});

/* ----------------------------- Repositorio -------------------------------- */

function repo(deps: ServiceDeps): RepositorioGenerico {
  return new RepositorioGenerico(deps.store, ENTIDAD_PLANTILLA);
}

async function leerIndice(
  deps: ServiceDeps,
  tenantId: string,
  clave: string,
): Promise<{ id: string; version: number; datos: DatosIndice } | null> {
  const r = await repo(deps).porId(tenantId, idIndice(clave));
  if (!r.ok || !r.value) return null;
  return {
    id: r.value.id,
    version: r.value.version,
    datos: r.value.data as unknown as DatosIndice,
  };
}

/* ------------------------------- Comandos --------------------------------- */

/** Comandos del Template Runtime (crear/publicar/activar/importar). */
export function comandosPlantilla(): readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] {
  return [
    // crear BORRADOR — idempotente por id de cliente (offline). Sin versión.
    (deps) => ({
      name: `${SERVICIO}.plantilla.crear`,
      inputSchema: z.object({
        id: z.string().optional(),
        opId: z.string().optional(),
        clave: z.string().min(1),
        contenido: contenidoSchema,
      }),
      authorization: { permissions: [PERMISOS_PLANTILLA.crear] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const id = input.id ?? crypto.randomUUID();
        if (input.id) {
          const previo = await repo(deps).porId(tenant.value, id);
          if (!previo.ok) return previo;
          if (previo.value) return ok({ id, estado: previo.value.estado, idempotente: true });
        }
        const prohibido = detectarVocabularioProhibido(input.contenido);
        if (prohibido.length > 0) {
          return fail(
            KernelErrors.validation("La plantilla contiene vocabulario de negocio prohibido", {
              terminos: prohibido,
            }),
          );
        }
        const inserted = await repo(deps).insertar(uow, {
          id,
          tenantId: tenant.value,
          estado: "BORRADOR",
          version: 0,
          data: {
            clave: input.clave,
            titulo: input.contenido.definicion.titulo,
            contenido: input.contenido,
            ...(input.opId ? { _opId: input.opId } : {}),
          },
          createdBy: ctx.principal.id,
          updatedAt: new Date(),
        });
        if (!inserted.ok) return inserted;
        return ok({ id, estado: inserted.value.estado, idempotente: false });
      },
    }),
    // publicar — congela el BORRADOR en una VERSIÓN INMUTABLE N+1, activa esa
    // versión y desactiva la anterior; actualiza el índice (misma UoW).
    (deps) => ({
      name: `${SERVICIO}.plantilla.publicar`,
      inputSchema: z.object({ id: z.string(), opId: z.string().optional() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.publicar] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const borrador = await repo(deps).porId(tenant.value, input.id);
        if (!borrador.ok) return borrador;
        if (!borrador.value) return fail(KernelErrors.notFound(RECORD_PLANTILLA, input.id));
        if (borrador.value.estado !== "BORRADOR") {
          return fail(KernelErrors.conflict("Solo un BORRADOR puede publicarse"));
        }
        const clave = String(borrador.value.data["clave"]);
        const contenido = borrador.value.data["contenido"] as ContenidoPlantilla;

        const indice = await leerIndice(deps, tenant.value, clave);
        const nuevaVersion = (indice?.datos.ultimaVersion ?? 0) + 1;

        // 1) Registro INMUTABLE de la nueva versión, ACTIVA.
        const versionRec = await repo(deps).insertar(uow, {
          id: idVersion(clave, nuevaVersion),
          tenantId: tenant.value,
          estado: "ACTIVA",
          version: 0,
          data: { clave, titulo: borrador.value.data["titulo"], version: nuevaVersion, contenido },
          createdBy: ctx.principal.id,
          updatedAt: new Date(),
        });
        if (!versionRec.ok) return versionRec;

        // 2) Desactivar la versión activa anterior (si existe).
        if (indice?.datos.activa != null) {
          const anterior = await repo(deps).porId(tenant.value, idVersion(clave, indice.datos.activa));
          if (!anterior.ok) return anterior;
          if (anterior.value && anterior.value.estado === "ACTIVA") {
            const des = await repo(deps).actualizar(
              uow,
              { ...anterior.value, estado: "INACTIVA" },
              anterior.value.version,
            );
            if (!des.ok) return des;
          }
        }

        // 3) Índice: apunta a la nueva versión activa y sube la última versión.
        const datosIndice: DatosIndice = { clave, ultimaVersion: nuevaVersion, activa: nuevaVersion };
        if (indice) {
          const upd = await repo(deps).actualizar(
            uow,
            { id: indice.id, tenantId: tenant.value, estado: "INDICE", version: indice.version, data: datosIndice as unknown as Record<string, unknown>, createdBy: ctx.principal.id, updatedAt: new Date() },
            indice.version,
          );
          if (!upd.ok) return upd;
        } else {
          const ins = await repo(deps).insertar(uow, {
            id: idIndice(clave),
            tenantId: tenant.value,
            estado: "INDICE",
            version: 0,
            data: datosIndice as unknown as Record<string, unknown>,
            createdBy: ctx.principal.id,
            updatedAt: new Date(),
          });
          if (!ins.ok) return ins;
        }

        // 4) El BORRADOR queda consumido (marcado PUBLICADA, referencia trazable).
        const consumido = await repo(deps).actualizar(
          uow,
          { ...borrador.value, estado: "PUBLICADA", data: { ...borrador.value.data, versionPublicada: nuevaVersion } },
          borrador.value.version,
        );
        if (!consumido.ok) return consumido;

        return ok({ clave, version: nuevaVersion, estado: "ACTIVA", versionId: idVersion(clave, nuevaVersion) });
      },
    }),
    // activar / desactivar una versión concreta (una sola activa por clave).
    (deps) => ({
      name: `${SERVICIO}.plantilla.activar`,
      inputSchema: z.object({ clave: z.string().min(1), version: z.number().int().positive(), activar: z.boolean() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.publicar] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const objetivo = await repo(deps).porId(tenant.value, idVersion(input.clave, input.version));
        if (!objetivo.ok) return objetivo;
        if (!objetivo.value) return fail(KernelErrors.notFound(RECORD_PLANTILLA, idVersion(input.clave, input.version)));
        if (objetivo.value.estado === "BORRADOR") {
          return fail(KernelErrors.conflict("Una plantilla BORRADOR no puede activarse; publíquela primero"));
        }
        const indice = await leerIndice(deps, tenant.value, input.clave);

        if (input.activar) {
          // Desactivar la activa anterior (si es otra) para preservar unicidad.
          if (indice?.datos.activa != null && indice.datos.activa !== input.version) {
            const anterior = await repo(deps).porId(tenant.value, idVersion(input.clave, indice.datos.activa));
            if (anterior.ok && anterior.value && anterior.value.estado === "ACTIVA") {
              const des = await repo(deps).actualizar(uow, { ...anterior.value, estado: "INACTIVA" }, anterior.value.version);
              if (!des.ok) return des;
            }
          }
          const act = await repo(deps).actualizar(uow, { ...objetivo.value, estado: "ACTIVA" }, objetivo.value.version);
          if (!act.ok) return act;
          if (indice) {
            const upd = await repo(deps).actualizar(
              uow,
              { id: indice.id, tenantId: tenant.value, estado: "INDICE", version: indice.version, data: { ...indice.datos, activa: input.version } as unknown as Record<string, unknown>, createdBy: ctx.principal.id, updatedAt: new Date() },
              indice.version,
            );
            if (!upd.ok) return upd;
          }
          return ok({ clave: input.clave, version: input.version, estado: "ACTIVA" });
        }

        // Desactivar.
        const des = await repo(deps).actualizar(uow, { ...objetivo.value, estado: "INACTIVA" }, objetivo.value.version);
        if (!des.ok) return des;
        if (indice && indice.datos.activa === input.version) {
          const upd = await repo(deps).actualizar(
            uow,
            { id: indice.id, tenantId: tenant.value, estado: "INDICE", version: indice.version, data: { ...indice.datos, activa: null } as unknown as Record<string, unknown>, createdBy: ctx.principal.id, updatedAt: new Date() },
            indice.version,
          );
          if (!upd.ok) return upd;
        }
        return ok({ clave: input.clave, version: input.version, estado: "INACTIVA" });
      },
    }),
    // importar — crea la VERSIÓN INMUTABLE clave+versión (duplicado → conflicto).
    (deps) => ({
      name: `${SERVICIO}.plantilla.importar`,
      inputSchema: z.object({ opId: z.string().optional(), documento: z.unknown() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.crear] },
      async handle(ctx, input, uow) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const parsed = importacionSchema.safeParse(input.documento);
        if (!parsed.success) {
          return fail(
            KernelErrors.validation("Documento de importación inválido", {
              issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
            }),
          );
        }
        const prohibido = detectarVocabularioProhibido(parsed.data);
        if (prohibido.length > 0) {
          return fail(
            KernelErrors.validation("La plantilla importada contiene vocabulario de negocio prohibido", {
              terminos: prohibido,
            }),
          );
        }
        const { clave, version } = parsed.data;

        // Conflicto si la versión ya existe (inmutabilidad histórica).
        const existente = await repo(deps).porId(tenant.value, idVersion(clave, version));
        if (!existente.ok) return existente;
        if (existente.value) {
          return fail(KernelErrors.conflict(`La versión ${version} de la plantilla '${clave}' ya existe`));
        }

        const contenido: ContenidoPlantilla = {
          definicion: parsed.data.definicion,
          contrato: parsed.data.contrato as ContratoValidacion | undefined,
          layout: parsed.data.layout as LayoutFormulario | undefined,
        };
        const indice = await leerIndice(deps, tenant.value, clave);
        const activar = indice == null || version > indice.datos.ultimaVersion;

        // Registro INMUTABLE importado.
        const versionRec = await repo(deps).insertar(uow, {
          id: idVersion(clave, version),
          tenantId: tenant.value,
          estado: activar ? "ACTIVA" : "INACTIVA",
          version: 0,
          data: { clave, titulo: parsed.data.definicion.titulo, version, contenido },
          createdBy: ctx.principal.id,
          updatedAt: new Date(),
        });
        if (!versionRec.ok) return versionRec;

        if (activar && indice?.datos.activa != null) {
          const anterior = await repo(deps).porId(tenant.value, idVersion(clave, indice.datos.activa));
          if (anterior.ok && anterior.value && anterior.value.estado === "ACTIVA") {
            const des = await repo(deps).actualizar(uow, { ...anterior.value, estado: "INACTIVA" }, anterior.value.version);
            if (!des.ok) return des;
          }
        }

        const datosIndice: DatosIndice = {
          clave,
          ultimaVersion: Math.max(version, indice?.datos.ultimaVersion ?? 0),
          activa: activar ? version : (indice?.datos.activa ?? null),
        };
        if (indice) {
          const upd = await repo(deps).actualizar(
            uow,
            { id: indice.id, tenantId: tenant.value, estado: "INDICE", version: indice.version, data: datosIndice as unknown as Record<string, unknown>, createdBy: ctx.principal.id, updatedAt: new Date() },
            indice.version,
          );
          if (!upd.ok) return upd;
        } else {
          const ins = await repo(deps).insertar(uow, {
            id: idIndice(clave),
            tenantId: tenant.value,
            estado: "INDICE",
            version: 0,
            data: datosIndice as unknown as Record<string, unknown>,
            createdBy: ctx.principal.id,
            updatedAt: new Date(),
          });
          if (!ins.ok) return ins;
        }

        return ok({ importada: true, clave, version, estado: activar ? "ACTIVA" : "INACTIVA" });
      },
    }),
  ];
}

/* ------------------------------- Consultas -------------------------------- */

function contenidoDe(data: Record<string, unknown>): ContenidoPlantilla {
  return data["contenido"] as ContenidoPlantilla;
}

/** Consultas del Template Runtime (obtener/obtenerActiva/listar/exportar/compatibilidad). */
export function queriesPlantilla(): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  return [
    // obtener una versión EXACTA (clave + version) — resolución histórica.
    (deps) => ({
      name: `${SERVICIO}.plantilla.obtener`,
      inputSchema: z.object({ clave: z.string().min(1), version: z.number().int().positive() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const found = await repo(deps).porId(tenant.value, idVersion(input.clave, input.version));
        if (!found.ok) return found;
        if (!found.value) return fail(KernelErrors.notFound(RECORD_PLANTILLA, idVersion(input.clave, input.version)));
        return ok(found.value);
      },
    }),
    // obtener la versión ACTIVA por clave.
    (deps) => ({
      name: `${SERVICIO}.plantilla.obtenerActiva`,
      inputSchema: z.object({ clave: z.string().min(1) }),
      authorization: { permissions: [PERMISOS_PLANTILLA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const indice = await leerIndice(deps, tenant.value, input.clave);
        if (!indice || indice.datos.activa == null) {
          return fail(KernelErrors.notFound(RECORD_PLANTILLA, idIndice(input.clave)));
        }
        const found = await repo(deps).porId(tenant.value, idVersion(input.clave, indice.datos.activa));
        if (!found.ok) return found;
        if (!found.value) return fail(KernelErrors.notFound(RECORD_PLANTILLA, idVersion(input.clave, indice.datos.activa)));
        return ok(found.value);
      },
    }),
    (deps) => ({
      name: `${SERVICIO}.plantilla.listar`,
      inputSchema: z.object({
        clave: z.string().optional(),
        estado: z.enum(["BORRADOR", "PUBLICADA", "ACTIVA", "INACTIVA"]).optional(),
        limit: z.number().int().positive().max(200).optional(),
      }),
      authorization: { permissions: [PERMISOS_PLANTILLA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const rows = await repo(deps).listar(tenant.value, { estado: input.estado, limit: input.limit });
        if (!rows.ok) return rows;
        // El índice nunca se lista como plantilla.
        let value = rows.value.filter((r) => r.estado !== "INDICE");
        if (input.clave) value = value.filter((r) => r.data["clave"] === input.clave);
        return ok(value);
      },
    }),
    // exportar — JSON autocontenido de una versión exacta.
    (deps) => ({
      name: `${SERVICIO}.plantilla.exportar`,
      inputSchema: z.object({ clave: z.string().min(1), version: z.number().int().positive() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const found = await repo(deps).porId(tenant.value, idVersion(input.clave, input.version));
        if (!found.ok) return found;
        if (!found.value) return fail(KernelErrors.notFound(RECORD_PLANTILLA, idVersion(input.clave, input.version)));
        const contenido = contenidoDe(found.value.data);
        const doc: ExportacionPlantilla = {
          clave: String(found.value.data["clave"]),
          version: Number(found.value.data["version"]),
          estado: found.value.estado as EstadoPlantilla,
          formatoExport: "deltaops.dynamic-forms.plantilla.v1",
          definicion: contenido.definicion,
          contrato: contenido.contrato,
          layout: contenido.layout,
        };
        return ok(doc);
      },
    }),
    // compatibilidad — ¿existe la versión con la que se llenó una respuesta?
    (deps) => ({
      name: `${SERVICIO}.plantilla.compatibilidad`,
      inputSchema: z.object({ clave: z.string().min(1), version: z.number().int().positive() }),
      authorization: { permissions: [PERMISOS_PLANTILLA.leer] },
      async handle(ctx, input) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const found = await repo(deps).porId(tenant.value, idVersion(input.clave, input.version));
        if (!found.ok) return found;
        const existe = Boolean(found.value);
        const indice = await leerIndice(deps, tenant.value, input.clave);
        return ok({
          compatible: existe,
          clave: input.clave,
          version: input.version,
          esActiva: existe && indice?.datos.activa === input.version,
          versionActiva: indice?.datos.activa ?? null,
        });
      },
    }),
  ];
}

/** Construye un documento de exportación a partir de contenido en memoria. */
export function construirExportacion(
  clave: string,
  version: number,
  contenido: ContenidoPlantilla,
  estado: EstadoPlantilla = "PUBLICADA",
): ExportacionPlantilla {
  return {
    clave,
    version,
    estado,
    formatoExport: "deltaops.dynamic-forms.plantilla.v1",
    definicion: contenido.definicion,
    contrato: contenido.contrato,
    layout: contenido.layout,
  };
}
