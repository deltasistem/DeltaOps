/**
 * DGP-006 · Business Foundation Framework — Generic Comment Runtime.
 *
 * Fachada tipada sobre el Shared Service `platform.comment`, ligada a una
 * DefinicionEntidad. Genera dos operaciones neutras:
 *   - Comando `<servicio>.<entidad>.comentar`  → delega en `platform.comment.create`
 *   - Consulta `<servicio>.<entidad>.comentarios` → delega en `platform.comment.byEntity`
 *
 * La referencia estable a la entidad es `<servicio>:<entidad>:<id>` (opaca para
 * la plataforma). Todo pasa por el Kernel: permisos de la definición, Zod y el
 * pipeline de comandos/consultas del runtime. No se persiste directamente: se
 * reutiliza el servicio de plataforma (que ya aporta UoW, outbox y auditoría).
 */
import { z } from "zod";
import { childContext, ok, type CommandDefinition, type QueryDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type { DefinicionEntidad } from "../nucleo/definicion";

/**
 * Referencia estable de una entidad para los servicios de colaboración
 * (comentarios, adjuntos, cronología): `<servicio>:<entidad>:<id>`.
 * Es opaca para la plataforma y estable entre reintentos offline.
 */
export function referenciaEntidad(def: DefinicionEntidad, id: string): string {
  return `${def.servicio}:${def.nombre}:${id}`;
}

/** Nombres canónicos de las operaciones de comentarios de una entidad. */
export function nombresComentarios(def: DefinicionEntidad): {
  comentar: string;
  comentarios: string;
} {
  const base = `${def.servicio}.${def.nombre}`;
  return { comentar: `${base}.comentar`, comentarios: `${base}.comentarios` };
}

/** Capacidad dedicada de comentarios de una entidad (agrupa leer + editar). */
export function capacidadComentarios(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `comentar-${def.nombre}`,
    permissions: [...new Set([def.permisos.editar, def.permisos.leer])],
    description: `Crear y consultar comentarios de ${def.etiqueta}`,
  };
}

/**
 * Genera el comando y la consulta de comentarios de una entidad. Requiere el
 * permiso de lectura (consulta) y de edición (comentar) de la definición.
 */
export function crearComentarios(def: DefinicionEntidad): {
  comandos: readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[];
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombres = nombresComentarios(def);

  const comentar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.comentar,
    inputSchema: z.object({
      id: z.string().min(1),
      texto: z.string().min(1),
      parentId: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const entityRef = referenciaEntidad(def, input.id);
      const res = await deps.runtime.commands.execute(childContext(ctx), "platform.comment.create", {
        entityRef,
        texto: input.texto,
        parentId: input.parentId,
      });
      if (!res.ok) return res;
      return ok({ ...(res.value as Record<string, unknown>), entityRef });
    },
  });

  const comentarios = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombres.comentarios,
    inputSchema: z.object({ id: z.string().min(1) }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const entityRef = referenciaEntidad(def, input.id);
      return deps.runtime.queries.execute(childContext(ctx), "platform.comment.byEntity", {
        entityRef,
      });
    },
  });

  return { comandos: [comentar], queries: [comentarios] };
}
