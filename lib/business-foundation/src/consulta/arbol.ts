/**
 * DGP-006 · Business Foundation Framework — Generic Tree Runtime.
 *
 * Soporte jerárquico genérico sobre el núcleo: un campo `padreId` (referencia
 * al padre) y una RUTA MATERIALIZADA en el campo `data._ruta`. Ofrece:
 *   - crearComandoMover(def): comando `<servicio>.<entidad>.mover` que reasigna
 *     el padre y recalcula la ruta del nodo y de TODOS sus descendientes en
 *     UNA SOLA Unit of Work (atómico: o se mueve todo o nada), usando
 *     RepositorioGenerico directamente. Validación anti-ciclos, un único evento
 *     `.movida` con payload completo, auditoría e idempotencia por `opId`
 *     (recibo `_opIds` en el propio nodo, patrón del núcleo).
 *   - crearQueriesArbol(def): `<servicio>.<entidad>.hijos` (hijos directos) y
 *     `<servicio>.<entidad>.arbol` (árbol completo en memoria desde el listado).
 *
 * 100% neutro. La ruta materializada `/a/b/c` permite consultar subárboles y
 * detectar ciclos sin recorrer la base de datos.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  ok,
  type QueryDefinition,
  type CommandDefinition,
} from "@workspace/kernel";
import { audit, tenantOf, type ServiceDeps } from "@workspace/platform";
import {
  prefijoEventos,
  type DefinicionCampo,
  type DefinicionEntidad,
} from "../nucleo/definicion";
import { RepositorioGenerico } from "../nucleo/repositorio";
import type { RegistroEntidad } from "../nucleo/entidad";

export const CAMPO_PADRE = "padreId";
export const META_RUTA = "_ruta";
const RAIZ = "";

/* --- Idempotencia offline: recibo _opIds en el propio nodo (patrón núcleo) --- */
const OP_IDS_KEY = "_opIds";
const MAX_OP_IDS = 50;

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

/**
 * Campos que una entidad jerárquica debe declarar: el padre (`padreId`) y la
 * ruta materializada (`_ruta`). La ruta se declara como campo para que el
 * esquema Zod del núcleo (comando `.editar`) la conserve; `_ruta` sigue siendo
 * un metadato de árbol gestionado por este runtime, no un dato de negocio.
 */
export function camposArbol(): DefinicionCampo[] {
  return [
    { nombre: CAMPO_PADRE, tipo: "referencia", filtrable: true },
    { nombre: META_RUTA, tipo: "texto", filtrable: true },
  ];
}

/** Ruta materializada de un registro (`/id1/id2/`); vacía si es raíz sin ruta. */
export function rutaDe(registro: Pick<RegistroEntidad, "data">): string {
  const r = registro.data[META_RUTA];
  return typeof r === "string" ? r : RAIZ;
}

/** Calcula la ruta materializada de un nodo dado la ruta de su padre. */
export function calcularRuta(rutaPadre: string, id: string): string {
  const base = rutaPadre === RAIZ ? "/" : rutaPadre.endsWith("/") ? rutaPadre : `${rutaPadre}/`;
  return `${base}${id}/`;
}

/** ¿`descendiente` cuelga (directa o indirectamente) de `nodoId`? */
function esDescendiente(rutaDescendiente: string, nodoId: string): boolean {
  return rutaDescendiente.includes(`/${nodoId}/`);
}

/**
 * Comando `<servicio>.<entidad>.mover`: reasigna `padreId` y recalcula la ruta
 * materializada del nodo y de TODOS sus descendientes en UNA SOLA Unit of Work.
 *
 * Atomicidad: todas las escrituras (nodo + descendientes) usan el mismo `uow`
 * del comando; si cualquiera falla, la transacción del Kernel revierte el
 * conjunto ⇒ nunca queda un árbol parcialmente reubicado. Emite un ÚNICO evento
 * `.movida` con payload completo (autosuficiente para proyección). Idempotencia
 * offline por `opId`: el recibo se guarda en `_opIds` del propio nodo.
 */
export function crearComandoMover(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => CommandDefinition<any, any> {
  const nombre = `${def.servicio}.${def.nombre}.mover`;
  const eventoMovida = `${prefijoEventos(def)}.movida`;
  return (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      /** Nuevo padre; `null`/ausente ⇒ mover a raíz. */
      nuevoPadreId: z.string().nullable().optional(),
      opId: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input, uow) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = new RepositorioGenerico(deps.store, def);

      const actual = await repo.porId(tenant.value, input.id);
      if (!actual.ok) return actual;
      if (!actual.value) return fail(KernelErrors.notFound(def.nombre, input.id));

      // Idempotencia offline: reintento con el mismo opId ⇒ éxito sin efectos.
      if (input.opId && opIdsDe(actual.value.data).includes(input.opId)) {
        return ok({
          id: input.id,
          padreAnterior: (actual.value.data[CAMPO_PADRE] as string | null | undefined) ?? null,
          padreNuevo: (actual.value.data[CAMPO_PADRE] as string | null | undefined) ?? null,
          ruta: rutaDe(actual.value),
          rutasActualizadas: [],
          descendientesReubicados: 0,
          idempotente: true,
        });
      }

      const padreAnterior = (actual.value.data[CAMPO_PADRE] as string | null | undefined) ?? null;
      const nuevoPadreId = input.nuevoPadreId ?? null;
      if (nuevoPadreId === input.id) {
        return fail(KernelErrors.conflict("Un nodo no puede ser su propio padre"));
      }

      // Ruta del nuevo padre (raíz si null) + validación anti-ciclos.
      let rutaPadre = RAIZ;
      if (nuevoPadreId) {
        const padre = await repo.porId(tenant.value, nuevoPadreId);
        if (!padre.ok) return padre;
        if (!padre.value) return fail(KernelErrors.notFound(def.nombre, nuevoPadreId));
        rutaPadre = rutaDe(padre.value);
        if (esDescendiente(calcularRuta(rutaPadre, nuevoPadreId), input.id)) {
          return fail(KernelErrors.conflict("Reparentado inválido: crearía un ciclo"));
        }
      }

      const rutaAnterior = rutaDe(actual.value);
      const rutaNueva = calcularRuta(rutaPadre, input.id);

      // Descendientes: se calculan ANTES de escribir para operar todo en el UoW.
      const descendientes: { registro: RegistroEntidad; rutaNueva: string }[] = [];
      if (rutaAnterior !== RAIZ) {
        const todos = await repo.listar(tenant.value, { limit: 500 });
        if (!todos.ok) return todos;
        for (const nodo of todos.value) {
          const ruta = rutaDe(nodo);
          if (nodo.id === input.id || !ruta.startsWith(rutaAnterior)) continue;
          descendientes.push({ registro: nodo, rutaNueva: rutaNueva + ruta.slice(rutaAnterior.length) });
        }
      }

      // (1) Nodo movido — misma UoW, concurrencia optimista con input.version.
      const dataNodo = conOpId(
        { ...actual.value.data, [CAMPO_PADRE]: nuevoPadreId ?? undefined, [META_RUTA]: rutaNueva },
        input.opId,
      );
      const movido = await repo.actualizar(
        uow,
        { ...actual.value, data: dataNodo },
        input.version,
      );
      if (!movido.ok) return movido;

      // (2) Descendientes — misma UoW; si alguno falla, revierte todo.
      const rutasActualizadas: { id: string; ruta: string }[] = [
        { id: input.id, ruta: rutaNueva },
      ];
      for (const d of descendientes) {
        const r = await repo.actualizar(
          uow,
          { ...d.registro, data: { ...d.registro.data, [META_RUTA]: d.rutaNueva } },
          d.registro.version,
        );
        if (!r.ok) return r;
        rutasActualizadas.push({ id: d.registro.id, ruta: d.rutaNueva });
      }

      // (3) Auditoría (misma UoW).
      const audited = await audit(deps.audit, uow, ctx, tenant.value, def.servicio, "mover", input.id, {
        padreAnterior,
        padreNuevo: nuevoPadreId,
        descendientesReubicados: descendientes.length,
      });
      if (!audited.ok) return audited;

      // (4) Un ÚNICO evento .movida con payload completo (autosuficiente).
      const payload: Record<string, unknown> = {
        tenantId: tenant.value,
        id: input.id,
        entityRef: `${def.servicio}.${def.nombre}:${input.id}`,
        recordType: def.nombre,
        estado: movido.value.estado,
        version: movido.value.version,
        padreAnterior,
        padreNuevo: nuevoPadreId,
        rutaAnterior,
        ruta: rutaNueva,
        rutasActualizadas,
        actorId: ctx.principal.id,
        actualizadoAt: movido.value.updatedAt.toISOString(),
      };
      uow.registerEvent(createDomainEvent(eventoMovida, payload, ctx.correlationId));

      return ok({
        id: input.id,
        padreAnterior,
        padreNuevo: nuevoPadreId,
        ruta: rutaNueva,
        rutasActualizadas,
        descendientesReubicados: descendientes.length,
        idempotente: false,
      });
    },
  });
}

interface NodoArbol {
  readonly id: string;
  readonly estado: string;
  readonly data: Record<string, unknown>;
  readonly hijos: NodoArbol[];
}

/** Construye el árbol en memoria desde un listado plano (por `padreId`). */
export function construirArbol(
  registros: readonly Pick<RegistroEntidad, "id" | "estado" | "data">[],
): NodoArbol[] {
  const nodos = new Map<string, NodoArbol>();
  for (const r of registros) nodos.set(r.id, { id: r.id, estado: r.estado, data: r.data, hijos: [] });
  const raices: NodoArbol[] = [];
  for (const r of registros) {
    const nodo = nodos.get(r.id)!;
    const padreId = r.data[CAMPO_PADRE];
    const padre = typeof padreId === "string" ? nodos.get(padreId) : undefined;
    if (padre) padre.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

/**
 * Queries jerárquicas: `.hijos` (hijos directos de un padre, o raíces si no se
 * indica) y `.arbol` (árbol completo en memoria desde el listado del tenant).
 */
export function crearQueriesArbol(
  def: DefinicionEntidad,
): readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] {
  const base = `${def.servicio}.${def.nombre}`;

  const hijos = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: `${base}.hijos`,
    inputSchema: z.object({ padreId: z.string().nullable().optional() }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = new RepositorioGenerico(deps.store, def);
      const rows = await repo.listar(tenant.value, { limit: 500 });
      if (!rows.ok) return rows;
      const padreId = input.padreId ?? null;
      return ok(rows.value.filter((r) => (r.data[CAMPO_PADRE] ?? null) === padreId));
    },
  });

  const arbol = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: `${base}.arbol`,
    inputSchema: z.object({}),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const repo = new RepositorioGenerico(deps.store, def);
      const rows = await repo.listar(tenant.value, { limit: 500 });
      if (!rows.ok) return rows;
      return ok(construirArbol(rows.value));
    },
  });

  return [hijos, arbol];
}
