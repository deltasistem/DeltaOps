/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Runtime de PRUEBAS.
 *
 * NO es infraestructura de producción: monta un runtime de plataforma con FAKES
 * en memoria de los puertos del módulo como `extraService`, para ejercer los
 * comandos/consultas/policies end-to-end de forma 100% determinista.
 *
 * FAIL-SAFE DE FUENTES: por defecto se inyectan fuentes read-only RICAS (que en
 * Etapa 2 envolverán los contratos públicos reales). Pasando `fuentes: {}` (o
 * sin la fuente concreta) se verifica que la evaluación falla de forma segura
 * (KRN-CFL) — nunca inventa datos.
 */
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { createPlatformRuntime, type PlatformRuntime } from "@workspace/platform";
import { analyticsModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, FakeFuente, type FakeAdapters } from "./fakes";
import type { RegistroFuentes } from "./domain/ports";
import type { Hecho } from "./domain/filtros";

/* ----------------------- Datos RICOS de fuentes (demo) ------------------- */

/**
 * Series de hechos deterministas por (módulo → dataset). Modelan las FORMAS reales
 * que expondrán los contratos públicos: órdenes con estado/prioridad/tiempos,
 * eventos-activo con insumosKpi crudos (MTBF/MTTR), movimientos de inventario, etc.
 */
export const DATOS_DEMO: Record<keyof RegistroFuentes, Record<string, Hecho[]>> = {
  ordenes: {
    ordenes: [
      { id: "ot-1", estado: "abierta", prioridad: "alta", tipo: "correctiva", vencida: false, dentroSla: true, tiempoEjecucionMin: 120, tiempoCierreMin: 300, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "ot-2", estado: "ejecucion", prioridad: "critica", tipo: "correctiva", vencida: true, dentroSla: false, tiempoEjecucionMin: 240, tiempoCierreMin: 900, fecha: "2024-01-11T08:00:00.000Z" },
      { id: "ot-3", estado: "cerrada", prioridad: "media", tipo: "preventiva", vencida: false, dentroSla: true, tiempoEjecucionMin: 60, tiempoCierreMin: 180, fecha: "2024-01-12T08:00:00.000Z" },
      { id: "ot-4", estado: "pendiente", prioridad: "baja", tipo: "preventiva", vencida: false, dentroSla: true, tiempoEjecucionMin: 30, tiempoCierreMin: 90, fecha: "2024-01-13T08:00:00.000Z" },
      { id: "ot-5", estado: "backlog", prioridad: "emergencia", tipo: "correctiva", vencida: true, dentroSla: false, tiempoEjecucionMin: 480, tiempoCierreMin: 1200, fecha: "2024-01-14T08:00:00.000Z" },
    ],
    asignaciones: [
      { id: "a-1", responsable: "tec-1", cuadrilla: "cua-a", estado: "asignada" },
      { id: "a-2", responsable: "tec-1", cuadrilla: "cua-a", estado: "asignada" },
      { id: "a-3", responsable: "tec-2", cuadrilla: "cua-b", estado: "asignada" },
    ],
    costos: [
      { id: "c-1", tipo: "correctiva", costoTotal: 1500, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "c-2", tipo: "preventiva", costoTotal: 500, fecha: "2024-01-12T08:00:00.000Z" },
      { id: "c-3", tipo: "correctiva", costoTotal: 2000, fecha: "2024-01-14T08:00:00.000Z" },
    ],
  },
  activos: {
    disponibilidad: [
      { id: "act-1", tiempoOperativoMin: 950, tiempoTotalMin: 1000, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "act-2", tiempoOperativoMin: 800, tiempoTotalMin: 1000, fecha: "2024-01-11T08:00:00.000Z" },
    ],
    utilizacion: [
      { id: "act-1", tiempoUsoMin: 700, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "act-2", tiempoUsoMin: 400, fecha: "2024-01-11T08:00:00.000Z" },
    ],
  },
  inventario: {
    movimientos: [
      { id: "m-1", tipo: "consumo", cantidad: 10, satisfecha: true, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "m-2", tipo: "consumo", cantidad: 5, satisfecha: false, fecha: "2024-01-11T08:00:00.000Z" },
      { id: "m-3", tipo: "reserva", cantidad: 3, satisfecha: true, fecha: "2024-01-12T08:00:00.000Z" },
      { id: "m-4", tipo: "transferencia", cantidad: 8, satisfecha: true, fecha: "2024-01-13T08:00:00.000Z" },
    ],
  },
  correctivo: {
    "eventos-activo": [
      { id: "e-1", activo: "act-1", tipo: "falla", modoFalla: "desgaste", esFalla: true, reincidente: false, tiempoEntreFallasMin: 6000, tiempoReparacionMin: 120, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "e-2", activo: "act-1", tipo: "falla", modoFalla: "fuga", esFalla: true, reincidente: true, tiempoEntreFallasMin: 3000, tiempoReparacionMin: 300, fecha: "2024-01-15T08:00:00.000Z" },
      { id: "e-3", activo: "act-2", tipo: "falla", modoFalla: "desgaste", esFalla: true, reincidente: false, tiempoEntreFallasMin: 9000, tiempoReparacionMin: 60, fecha: "2024-01-20T08:00:00.000Z" },
      { id: "e-4", activo: "act-2", tipo: "inspeccion", modoFalla: null, esFalla: false, reincidente: false, tiempoEntreFallasMin: 0, tiempoReparacionMin: 0, fecha: "2024-01-21T08:00:00.000Z" },
    ],
    solicitudes: [
      { id: "s-1", estado: "aprobada", prioridad: "alta", tiempoAtencionMin: 45, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "s-2", estado: "aprobada", prioridad: "critica", tiempoAtencionMin: 15, fecha: "2024-01-11T08:00:00.000Z" },
      { id: "s-3", estado: "registro", prioridad: "media", tiempoAtencionMin: 180, fecha: "2024-01-12T08:00:00.000Z" },
    ],
  },
  preventivo: {
    generaciones: [
      { id: "g-1", aTiempo: true, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "g-2", aTiempo: true, fecha: "2024-01-11T08:00:00.000Z" },
      { id: "g-3", aTiempo: false, fecha: "2024-01-12T08:00:00.000Z" },
    ],
  },
  abastecimiento: {
    solicitudes: [
      { id: "sc-1", estado: "creada", fecha: "2024-01-10T08:00:00.000Z" },
      { id: "sc-2", estado: "aprobada", fecha: "2024-01-12T08:00:00.000Z" },
    ],
  },
  planes: {
    generaciones: [
      { id: "pg-1", ejecutada: true, fecha: "2024-01-10T08:00:00.000Z" },
      { id: "pg-2", ejecutada: false, fecha: "2024-01-11T08:00:00.000Z" },
    ],
  },
  timeline: {
    entradas: [
      { id: "t-1", entityRef: "activo:act-1", eventType: "estado", fecha: "2024-01-10T08:00:00.000Z" },
    ],
  },
};

/** Construye el registro de fuentes RICAS a partir de `DATOS_DEMO`. */
export function crearFuentesDemo(): RegistroFuentes {
  return {
    ordenes: new FakeFuente(DATOS_DEMO.ordenes),
    activos: new FakeFuente(DATOS_DEMO.activos),
    inventario: new FakeFuente(DATOS_DEMO.inventario),
    correctivo: new FakeFuente(DATOS_DEMO.correctivo),
    preventivo: new FakeFuente(DATOS_DEMO.preventivo),
    abastecimiento: new FakeFuente(DATOS_DEMO.abastecimiento),
    planes: new FakeFuente(DATOS_DEMO.planes),
    timeline: new FakeFuente(DATOS_DEMO.timeline),
  };
}

export interface AnalyticsRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: FakeAdapters;
  ctx(tenantId: string, principal?: Principal): ExecutionContext;
}

/** Principal del sistema con permisos amplios (solo para pruebas). */
export const SISTEMA: Principal = { id: "sistema", rol: "sistema", permisos: ["*"], capacidades: ["*"] };

/** Principal con permisos limitados (para verificar capacidades por permiso). */
export function principalCon(permisos: readonly string[], id = "usuario"): Principal {
  return { id, rol: "usuario", permisos: [...permisos], capacidades: [] };
}

export interface CrearRuntimeOpts {
  /**
   * Registro de fuentes a inyectar. Por defecto, fuentes RICAS de demo. Pasa `{}`
   * o un subconjunto para verificar el fallo seguro (KRN-CFL) de la evaluación
   * cuando falta la fuente requerida.
   */
  fuentes?: RegistroFuentes | null;
}

export function crearAnalyticsRuntime(opts: CrearRuntimeOpts = {}): AnalyticsRuntime {
  const fakes = crearFakeAdapters();
  const fuentes = opts.fuentes === undefined ? crearFuentesDemo() : opts.fuentes;
  const adapters: ModuleAdapters = {
    ...fakes,
    ...(fuentes ? { fuentes } : {}),
  };
  const platform = createPlatformRuntime({ extraServices: [analyticsModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
  };
}
