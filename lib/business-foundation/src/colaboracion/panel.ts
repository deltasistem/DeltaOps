/**
 * DGP-006 · Business Foundation Framework — Generic Dashboard Runtime.
 *
 * Un DefinicionPanel describe un tablero neutro (título + widgets) que se
 * persiste como CONFIGURACIÓN del servicio (TenantConfig JSON), por lo que cada
 * tenant puede sobrescribirlo mediante `platform.config.set`. La consulta
 * `<servicio>.<entidad>.panel` resuelve los widgets a datos en UNA respuesta:
 *   - widget 'kpi'    → valores actuales del KPI (consulta `.kpis`)
 *   - widget 'estado' → conteo por estado (KPI porEstado o listado)
 *   - widget 'lista'  → registros recientes (consulta `.listar`)
 *
 * No introduce persistencia propia: reutiliza las consultas del núcleo y del
 * runtime de indicadores a través del Kernel.
 */
import { z } from "zod";
import { childContext, fail, KernelErrors, ok, type QueryDefinition } from "@workspace/kernel";
import { tenantOf, type ServiceDeps } from "@workspace/platform";
import { nombresOperaciones, type DefinicionEntidad } from "../nucleo/definicion";
import { nombreKpis } from "./indicadores";

/** Widget declarativo de un panel. */
export interface DefinicionWidget {
  readonly tipo: "kpi" | "lista" | "estado";
  readonly titulo: string;
  /** Nombre del KPI a mostrar (widgets 'kpi' y 'estado'). */
  readonly kpi?: string;
  /** Nº de registros recientes a listar (widget 'lista'). */
  readonly limite?: number;
}

/** Definición declarativa de un panel/tablero neutro. */
export interface DefinicionPanel {
  readonly titulo: string;
  readonly widgets: readonly DefinicionWidget[];
}

/** Nombre canónico de la consulta de panel de una entidad. */
export function nombrePanel(def: DefinicionEntidad): string {
  return `${def.servicio}.${def.nombre}.panel`;
}

/** Clave de configuración por tenant donde vive el JSON del panel (SIN prefijo). */
export function claveConfigPanel(def: DefinicionEntidad): string {
  return `panel-${def.nombre}`;
}

/** Capacidad dedicada de panel de una entidad. */
export function capacidadPanel(def: DefinicionEntidad): {
  name: string;
  permissions: readonly string[];
  description: string;
} {
  return {
    name: `panel-${def.nombre}`,
    permissions: [def.permisos.leer],
    description: `Consultar el panel de ${def.etiqueta}`,
  };
}

/** Default de configuración que serializa el panel declarado del módulo. */
export function configDefaultsPanel(
  def: DefinicionEntidad,
  panel: DefinicionPanel,
): Record<string, string> {
  return { [claveConfigPanel(def)]: JSON.stringify(panel) };
}

function parsePanel(raw: string): DefinicionPanel | null {
  try {
    const parsed = JSON.parse(raw) as DefinicionPanel;
    if (parsed && typeof parsed.titulo === "string" && Array.isArray(parsed.widgets)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Genera la consulta de panel de una entidad. */
export function crearPanel(def: DefinicionEntidad): {
  queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
} {
  const nombre = nombrePanel(def);
  const ops = nombresOperaciones(def);
  const nombreConsultaKpis = nombreKpis(def);

  const panelQuery = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nombre,
    inputSchema: z.object({}),
    authorization: { permissions: [def.permisos.leer] },
    async handle(ctx) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;

      // El panel vive en TenantConfig (default del módulo + override del tenant).
      const cfg = await deps.tenantConfig.get(tenant.value, `${def.servicio}.${claveConfigPanel(def)}`);
      if (!cfg.ok) return cfg;
      const panel = parsePanel(cfg.value);
      if (!panel) return fail(KernelErrors.validation("Definición de panel inválida en configuración"));

      // Resuelve KPIs una sola vez (compartido por widgets 'kpi'/'estado').
      const kpisRes = await deps.runtime.queries.execute(childContext(ctx), nombreConsultaKpis, {});
      const kpisValores = kpisRes.ok
        ? ((kpisRes.value as { kpis: { nombre: string; valor: number; porEstado: Record<string, number> }[] }).kpis)
        : [];
      const kpiPorNombre = new Map(kpisValores.map((k) => [k.nombre, k]));

      const widgets: Record<string, unknown>[] = [];
      for (const w of panel.widgets) {
        if (w.tipo === "kpi") {
          const k = w.kpi ? kpiPorNombre.get(w.kpi) : undefined;
          widgets.push({ tipo: w.tipo, titulo: w.titulo, valor: k?.valor ?? 0 });
        } else if (w.tipo === "estado") {
          const k = w.kpi ? kpiPorNombre.get(w.kpi) : undefined;
          widgets.push({ tipo: w.tipo, titulo: w.titulo, porEstado: k?.porEstado ?? {} });
        } else {
          const lista = await deps.runtime.queries.execute(childContext(ctx), ops.listar, {
            limit: w.limite ?? 5,
          });
          widgets.push({
            tipo: w.tipo,
            titulo: w.titulo,
            items: lista.ok ? lista.value : [],
          });
        }
      }

      return ok({ titulo: panel.titulo, widgets });
    },
  });

  return { queries: [panelQuery] };
}
