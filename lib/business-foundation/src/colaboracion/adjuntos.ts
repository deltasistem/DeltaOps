/**
 * DGP-006 · Business Foundation Framework — Generic Attachment Runtime.
 *
 * Fachada tipada sobre el Shared Service `platform.attachment`, ligada a una
 * DefinicionEntidad, con la misma referencia estable `<servicio>:<entidad>:<id>`:
 *   - Comando  `<servicio>.<entidad>.adjuntar`      → `platform.attachment.register`
 *   - Comando  `<servicio>.<entidad>.quitarAdjunto` → `platform.attachment.delete`
 *   - Consulta `<servicio>.<entidad>.adjuntos`      → `platform.attachment.byEntity`
 *
 * Valida metadatos (nombre, mime, hash) y el tamaño máximo por TenantConfig
 * `adjunto-max-bytes` (default 10485760). Nunca toca binarios: solo metadatos.
 */
import { z } from "zod";
import {
  childContext,
  fail,
  KernelErrors,
  ok,
  type CommandDefinition,
  type QueryDefinition,
} from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type { DefinicionEntidad } from "../nucleo/definicion";
import { referenciaEntidad } from "./comentarios";

/** Clave de configuración por tenant del tamaño máximo de adjunto (bytes). */
export const CLAVE_ADJUNTO_MAX_BYTES = "adjunto-max-bytes";
/** Default: 10 MiB. */
export const ADJUNTO_MAX_BYTES_DEFAULT = 10485760;

/** Nombres canónicos de las operaciones de adjuntos de una entidad. */
export function nombresAdjuntos(def: DefinicionEntidad): {
  adjuntar: string;
  quitarAdjunto: string;
  adjuntos: string;
} {
  const base = `${def.servicio}.${def.nombre}`;
  return {
    adjuntar: `${base}.adjuntar`,
    quitarAdjunto: `${base}.quitarAdjunto`,
    adjuntos: `${base}.adjuntos`,
  };
}

/** Defaults de configuración que aporta el runtime de adjuntos (clave SIN prefijo). */
export function configDefaultsAdjuntos(): Record<string, string> {
  return { [CLAVE_ADJUNTO_MAX_BYTES]: String(ADJUNTO_MAX_BYTES_DEFAULT) };
}

/** Capacidad dedicada de adjuntos de una entidad (agrupa leer + editar). */
export function capacidadAdjuntos(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `adjuntar-${def.nombre}`,
    permissions: [...new Set([def.permisos.editar, def.permisos.leer])],
    description: `Registrar y consultar adjuntos de ${def.etiqueta}`,
  };
}

/**
 * Genera comandos y consultas de adjuntos de una entidad. Permiso de edición
 * para registrar/quitar; permiso de lectura para listar.
 */
export function crearAdjuntos(def: DefinicionEntidad): {
  comandos: readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[];
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombres = nombresAdjuntos(def);

  const adjuntar = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.adjuntar,
    inputSchema: z.object({
      id: z.string().min(1),
      nombreArchivo: z.string().min(1),
      mimeType: z.string().min(1),
      tamanoBytes: z.number().int().nonnegative(),
      hashSha256: z.string().length(64),
      attachmentId: z.string().optional(),
    }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      // Validación de metadatos: tamaño máximo por TenantConfig.
      const maxCfg = await deps.tenantConfig.get(
        tenant.value,
        `${def.servicio}.${CLAVE_ADJUNTO_MAX_BYTES}`,
      );
      const maxBytes = maxCfg.ok ? Number(maxCfg.value) : ADJUNTO_MAX_BYTES_DEFAULT;
      if (input.tamanoBytes > maxBytes) {
        return fail(
          KernelErrors.validation(
            `El adjunto excede el tamaño máximo permitido (${maxBytes} bytes)`,
            { tamanoBytes: input.tamanoBytes, maxBytes },
          ),
        );
      }

      const entityRef = referenciaEntidad(def, input.id);
      const res = await deps.runtime.commands.execute(childContext(ctx), "platform.attachment.register", {
        entityRef,
        nombreArchivo: input.nombreArchivo,
        mimeType: input.mimeType,
        tamanoBytes: input.tamanoBytes,
        hashSha256: input.hashSha256,
        attachmentId: input.attachmentId,
      });
      if (!res.ok) return res;
      return ok({ ...(res.value as Record<string, unknown>), entityRef });
    },
  });

  const quitarAdjunto = (deps: ServiceDeps): CommandDefinition<any, any> => ({
    name: nombres.quitarAdjunto,
    inputSchema: z.object({ attachmentId: z.string().min(1) }),
    authorization: { permissions: [def.permisos.editar] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return deps.runtime.commands.execute(childContext(ctx), "platform.attachment.delete", {
        id: input.attachmentId,
      });
    },
  });

  const adjuntos = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombres.adjuntos,
    inputSchema: z.object({ id: z.string().min(1) }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const entityRef = referenciaEntidad(def, input.id);
      return deps.runtime.queries.execute(childContext(ctx), "platform.attachment.byEntity", {
        entityRef,
      });
    },
  });

  return { comandos: [adjuntar, quitarAdjunto], queries: [adjuntos] };
}
