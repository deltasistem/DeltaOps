/**
 * DGP-009.1 · Órdenes de Trabajo — Harness de PRUEBAS (NO se envía a producción).
 *
 * El paquete 009.1 entrega SOLO el dominio (puertos + fakes). Para ejercer el
 * ciclo de vida gobernado por el Workflow Engine REAL y la validación de
 * plantillas contra el Dynamic Forms REAL, las pruebas montan aquí su propio
 * runtime de plataforma con los tres servicios como `extraServices`:
 *   - `modulo.formularios` (Dynamic Forms, DGP-007)
 *   - `modulo.ordenes.workflow` (Workflow Engine, DGP-007)
 *   - `modulo.ordenes` (este módulo, con FAKES en memoria de sus puertos)
 *
 * Los adaptadores de persistencia de producción (Postgres/Record Store) llegan
 * en DGP-009.2; este harness es infraestructura de PRUEBA legítima.
 */
import { createExecutionContext, type ExecutionContext, type LoggerPort } from "@workspace/kernel";
import { createPlatformRuntime, type PlatformRuntime } from "@workspace/platform";
import { crearMotorFormularios, ResolutorPlantillaStore } from "@workspace/dynamic-forms";
import { crearMotorWorkflow } from "@workspace/workflow-engine";
import { MODULO, MODULO_WORKFLOW } from "../module-name";
import { ordenesModule } from "../module";
import { crearFakeAdapters, type FakeAdapters } from "../infrastructure/fakes";
import { plantillasDesdeRuntime } from "../infrastructure/plantillas-runtime";
import type { PlantillasPort } from "../domain/ports";

export interface OrdenesHarness {
  readonly platform: PlatformRuntime;
  readonly adapters: FakeAdapters;
}

/**
 * Monta el runtime completo de pruebas. Si no se pasa `plantillas`, se usa el
 * adaptador respaldado por el motor REAL de Dynamic Forms del propio runtime.
 */
export function crearHarness(opts: { logger?: LoggerPort; plantillas?: PlantillasPort } = {}): OrdenesHarness {
  const resolutor = new ResolutorPlantillaStore();

  // Holder para resolver el ciclo runtime↔adaptador (el adaptador de plantillas
  // por defecto necesita el runtime que aún se está construyendo).
  const holder: { runtime: PlatformRuntime | null } = { runtime: null };
  const plantillas: PlantillasPort =
    opts.plantillas ??
    plantillasDesdeRuntime(
      new Proxy({} as PlatformRuntime, {
        get(_t, prop) {
          if (!holder.runtime) throw new Error("runtime aún no disponible");
          return (holder.runtime as unknown as Record<string | symbol, unknown>)[prop];
        },
      }),
      (tenantId) => createExecutionContext({ principal: SYSTEM, metadata: { tenantId } }),
    );

  const adapters = crearFakeAdapters(plantillas);

  const platform = createPlatformRuntime({
    ...(opts.logger ? { logger: opts.logger } : {}),
    extraServices: [
      crearMotorFormularios({ resolutor }),
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      ordenesModule(adapters),
    ],
  });
  holder.runtime = platform;
  resolutor.conectar(platform.store);

  return { platform, adapters };
}

/** Principal del sistema con permisos amplios (solo para el harness). */
const SYSTEM = {
  id: "sistema",
  rol: "sistema",
  permisos: ["*"],
  capacidades: ["*"],
};

export { MODULO, MODULO_WORKFLOW };
