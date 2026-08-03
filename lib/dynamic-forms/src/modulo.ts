/**
 * DGP-007 · Dynamic Forms Engine — Descriptor del motor (modulo.ts).
 *
 * crearMotorFormularios(opciones) devuelve un PlatformServiceDefinition COMPLETO
 * (eventos, capacidades, permisos, configuracionDefaults, comandos, consultas,
 * event handlers y health check) listo para `extraServices` de
 * createPlatformRuntime. El registro automático (registerPlatformService) lo
 * inscribe en el Kernel y en los cinco registros oficiales.
 *
 * El motor persiste dos recordTypes vía Record Store: `plantilla-formulario` y
 * `respuesta-formulario`. No hay SQL propio.
 */
import { ok, type Result, type KernelError } from "@workspace/kernel";
import type {
  EventHandlerDefinition,
  PlatformServiceDefinition,
  ServiceDeps,
} from "@workspace/platform";
import {
  comandosPlantilla,
  queriesPlantilla,
  PERMISOS_PLANTILLA,
  RECORD_PLANTILLA,
  SERVICIO,
} from "./plantillas";
import {
  comandosRespuesta,
  queriesRespuesta,
  PERMISOS_RESPUESTA,
  RECORD_RESPUESTA,
  RESPUESTA_ENVIADA,
  RESPUESTA_GUARDADA,
  type ResolutorPlantillas,
} from "./respuestas";
import { ResolutorPlantillaStore } from "./resolutor";

export interface OpcionesMotor {
  /**
   * Resolutor que obtiene la definición/contrato de un formulario a partir de
   * su plantilla. Por defecto usa las plantillas persistidas en el Record Store
   * (ResolutorPlantillaStore). Se puede inyectar otro para pruebas o catálogos.
   */
  readonly resolutor?: ResolutorPlantillas;
  /** Event handlers adicionales (p. ej. proyecciones a read models externos). */
  readonly eventHandlers?: readonly EventHandlerDefinition[];
}

export const EVENTOS_MOTOR: readonly string[] = [RESPUESTA_GUARDADA, RESPUESTA_ENVIADA];

export function crearMotorFormularios(
  opciones: OpcionesMotor = {},
): PlatformServiceDefinition {
  const resolutor = opciones.resolutor ?? new ResolutorPlantillaStore();

  return {
    name: SERVICIO,
    version: "1.0.0",
    description:
      "Dynamic Forms Engine — motor de formularios y checklists declarativos (DGP-007); framework neutro, sin negocio",
    capabilities: [
      {
        name: "disenar-formularios",
        permissions: [
          PERMISOS_PLANTILLA.leer,
          PERMISOS_PLANTILLA.crear,
          PERMISOS_PLANTILLA.publicar,
          PERMISOS_PLANTILLA.admin,
        ],
        description: "Diseño, versionado, publicación e importación de plantillas de formulario",
      },
      {
        name: "capturar-respuestas",
        permissions: [
          PERMISOS_RESPUESTA.leer,
          PERMISOS_RESPUESTA.escribir,
          PERMISOS_RESPUESTA.enviar,
        ],
        description: "Captura de respuestas (borrador → enviada) con validación declarativa",
      },
    ],
    permissions: [
      PERMISOS_PLANTILLA.leer,
      PERMISOS_PLANTILLA.crear,
      PERMISOS_PLANTILLA.publicar,
      PERMISOS_PLANTILLA.admin,
      PERMISOS_RESPUESTA.leer,
      PERMISOS_RESPUESTA.escribir,
      PERMISOS_RESPUESTA.enviar,
    ],
    dependsOn: ["platform.config", "platform.attachment", "platform.comment", "platform.search"],
    events: [...EVENTOS_MOTOR],
    recordTypes: [RECORD_PLANTILLA, RECORD_RESPUESTA],
    configDefaults: {
      // Claves SIN prefijo de servicio (registerDefaults las prefija).
      "max-plantillas-activas": "500",
      "permitir-import": "true",
      "sellar-dispositivo": "true",
    },
    commands: [
      ...comandosPlantilla(),
      ...comandosRespuesta(resolutor),
    ],
    queries: [
      ...queriesPlantilla(),
      ...queriesRespuesta(),
    ],
    eventHandlers: [...(opciones.eventHandlers ?? [])],
    healthCheck: (deps: ServiceDeps) => async () => {
      const probe = await deps.store.list("__health__", { service: SERVICIO, limit: 1 });
      return probe.ok
        ? { healthy: true, detail: "record store del motor de formularios operativo" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}

/** Health check tipado auxiliar (reutilizable en composición). */
export async function healthProbe(deps: ServiceDeps): Promise<Result<void, KernelError>> {
  const probe = await deps.store.list("__health__", { service: SERVICIO, limit: 1 });
  return probe.ok ? ok(undefined) : probe;
}
