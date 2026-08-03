/**
 * DGP-006 · Business Foundation Framework — Generic Export Runtime.
 *
 * Consulta `<servicio>.<entidad>.exportar` que lista los registros de una
 * entidad (filtro simple por estado + paginación del repositorio genérico) y
 * los proyecta a FILAS PLANAS según los campos declarados en la definición,
 * añadiendo metadatos (id/version/estado/createdBy/actualizadoAt). Las filas
 * quedan listas para serializar a CSV/JSON en el borde HTTP.
 *
 * Respeta el permiso `leer` de la entidad y una capacidad dedicada
 * `exportar-<entidad>` (agrupa el permiso de lectura). Todo por RecordStorePort
 * (multitenancy + RLS); aquí no hay SQL propio ni concepto de negocio.
 */
import { z } from "zod";
import type { QueryDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import type { DefinicionCampo, DefinicionEntidad } from "../nucleo/definicion";
import type { RegistroEntidad } from "../nucleo/entidad";
import { baseOperaciones, ok, repoDe } from "./comun";

/** Columnas de metadatos añadidas a cada fila exportada. */
export const COLUMNAS_META = ["id", "version", "estado", "createdBy", "actualizadoAt"] as const;

/** Nombre canónico de la consulta de exportación de una entidad. */
export function nombreExportar(def: DefinicionEntidad): string {
  return `${baseOperaciones(def)}.exportar`;
}

/** Capacidad dedicada de exportación de una entidad. */
export function capacidadExportar(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `exportar-${def.nombre}`,
    permissions: [def.permisos.leer],
    description: `Exportar registros de ${def.etiqueta}`,
  };
}

/** Cabeceras de la exportación: campos declarados + metadatos. */
export function cabecerasExportacion(def: DefinicionEntidad): readonly string[] {
  return [...def.campos.map((c) => c.nombre), ...COLUMNAS_META];
}

/** Serializa el valor de un campo a texto plano (apto para CSV). */
function valorPlano(valor: unknown, campo: DefinicionCampo): string {
  if (valor === undefined || valor === null) return "";
  if (campo.tipo === "json") return JSON.stringify(valor);
  if (typeof valor === "boolean") return valor ? "true" : "false";
  return String(valor);
}

/** Proyecta un registro a una fila plana (campos declarados + metadatos). */
export function proyectarFila(def: DefinicionEntidad, r: RegistroEntidad): Record<string, string> {
  const fila: Record<string, string> = {};
  for (const campo of def.campos) {
    fila[campo.nombre] = valorPlano(r.data[campo.nombre], campo);
  }
  fila["id"] = r.id;
  fila["version"] = String(r.version);
  fila["estado"] = r.estado;
  fila["createdBy"] = r.createdBy;
  fila["actualizadoAt"] = r.updatedAt.toISOString();
  return fila;
}

/**
 * Genera la consulta de exportación de una entidad. Devuelve una fábrica
 * `(deps) => QueryDefinition` para `extras.queries`.
 */
export function crearQueryExportacion(
  def: DefinicionEntidad,
): (deps: ServiceDeps) => QueryDefinition<any, any> {
  const name = nombreExportar(def);
  const cabeceras = cabecerasExportacion(def);

  return (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name,
    inputSchema: z.object({
      estado: z.string().optional(),
      limit: z.number().int().positive().max(5000).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      const listado = await repoDe(deps, def).listar(tenant.value, {
        estado: input.estado,
        limit: input.limit ?? 1000,
        offset: input.offset,
      });
      if (!listado.ok) return listado;
      const filas = listado.value.map((r) => proyectarFila(def, r));
      return ok({
        entidad: def.nombre,
        cabeceras,
        filas,
        total: filas.length,
      });
    },
  });
}
