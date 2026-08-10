/**
 * DGP-016 · Catálogo CANÓNICO de indicadores COMO DATOS (nunca código).
 *
 * ~28 definiciones declarativas del sistema. Cada una describe fuente + expresión
 * + unidad + formato + umbrales; el MOTOR las interpreta genéricamente. Los
 * tenants pueden crear las suyas o sobrescribir por clave; estas son el punto de
 * partida canónico (delSistema = true).
 */
import type { ClaveFuente } from "./ports";
import type { TipoExpresion } from "./expresion";

/** Especificación declarativa de un indicador del sistema (sin instanciar tenant). */
export interface EspecIndicador {
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly categoria: string;
  readonly fuente: { modulo: ClaveFuente; dataset: string };
  readonly expresion: {
    readonly tipo: TipoExpresion;
    readonly campo?: string;
    readonly filtros?: { dimension: string; campo?: string; operador: string; valor: unknown }[];
    readonly filtrosDenominador?: { dimension: string; campo?: string; operador: string; valor: unknown }[];
    readonly factor?: number;
    readonly ventana?: { campoFecha: string; ultimosDias?: number };
    readonly agrupadores?: string[];
    readonly campoTiempoOperativo?: string;
    readonly campoTiempoReparacion?: string;
    readonly campoEsFalla?: string;
  };
  readonly unidad: string;
  readonly formato: string;
  readonly umbrales?: { mayorEsMejor: boolean; bueno: number; alerta: number; critico: number };
}

/** Catálogo canónico de indicadores (COMO DATOS). */
export const CATALOGO_INDICADORES: readonly EspecIndicador[] = [
  {
    clave: "disponibilidad",
    nombre: "Disponibilidad",
    descripcion: "Porcentaje de tiempo operativo sobre el tiempo total del activo",
    categoria: "disponibilidad",
    fuente: { modulo: "activos", dataset: "disponibilidad" },
    expresion: { tipo: "ratio", campo: "tiempoOperativoMin", filtrosDenominador: [], factor: 100 },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 95, alerta: 90, critico: 0 },
  },
  {
    clave: "utilizacion",
    nombre: "Utilización",
    descripcion: "Porcentaje de tiempo en uso sobre tiempo disponible",
    categoria: "utilizacion",
    fuente: { modulo: "activos", dataset: "utilizacion" },
    expresion: { tipo: "ratio", campo: "tiempoUsoMin", filtrosDenominador: [], factor: 100 },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 80, alerta: 60, critico: 0 },
  },
  {
    clave: "confiabilidad",
    nombre: "Confiabilidad",
    descripcion: "Probabilidad de operación sin fallas en el periodo",
    categoria: "confiabilidad",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: {
      tipo: "ratio",
      filtros: [{ dimension: "tipo", campo: "tipo", operador: "neq", valor: "falla" }],
      factor: 100,
    },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 98, alerta: 90, critico: 0 },
  },
  {
    clave: "mtbf",
    nombre: "MTBF",
    descripcion: "Tiempo medio entre fallas (calculado desde eventos crudos)",
    categoria: "confiabilidad",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: { tipo: "mtbf", campoTiempoOperativo: "tiempoEntreFallasMin", campoEsFalla: "esFalla" },
    unidad: "horas",
    formato: "decimal-1",
    umbrales: { mayorEsMejor: true, bueno: 720, alerta: 240, critico: 0 },
  },
  {
    clave: "mttr",
    nombre: "MTTR",
    descripcion: "Tiempo medio de reparación (calculado desde eventos crudos)",
    categoria: "mantenibilidad",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: { tipo: "mttr", campoTiempoReparacion: "tiempoReparacionMin" },
    unidad: "horas",
    formato: "decimal-1",
    umbrales: { mayorEsMejor: false, bueno: 4, alerta: 12, critico: 24 },
  },
  {
    clave: "tiempo-promedio-atencion",
    nombre: "Tiempo promedio de atención",
    descripcion: "Promedio de minutos desde solicitud hasta inicio de atención",
    categoria: "tiempos",
    fuente: { modulo: "correctivo", dataset: "solicitudes" },
    expresion: { tipo: "duracion-promedio", campo: "tiempoAtencionMin" },
    unidad: "minutos",
    formato: "decimal-1",
    umbrales: { mayorEsMejor: false, bueno: 60, alerta: 240, critico: 1440 },
  },
  {
    clave: "tiempo-promedio-ejecucion",
    nombre: "Tiempo promedio de ejecución",
    descripcion: "Promedio de minutos de ejecución de la orden",
    categoria: "tiempos",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "duracion-promedio", campo: "tiempoEjecucionMin" },
    unidad: "minutos",
    formato: "decimal-1",
  },
  {
    clave: "tiempo-promedio-cierre",
    nombre: "Tiempo promedio de cierre",
    descripcion: "Promedio de minutos desde apertura hasta cierre de la orden",
    categoria: "tiempos",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "duracion-promedio", campo: "tiempoCierreMin" },
    unidad: "minutos",
    formato: "decimal-1",
  },
  {
    clave: "ot-abiertas",
    nombre: "OT abiertas",
    descripcion: "Cantidad de órdenes de trabajo abiertas",
    categoria: "ordenes",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "estado", operador: "in", valor: ["abierta", "asignada", "ejecucion"] }] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "ot-vencidas",
    nombre: "OT vencidas",
    descripcion: "Cantidad de órdenes vencidas respecto a su fecha compromiso",
    categoria: "ordenes",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "estado", campo: "vencida", operador: "eq", valor: true }] },
    unidad: "conteo",
    formato: "entero",
    umbrales: { mayorEsMejor: false, bueno: 0, alerta: 5, critico: 20 },
  },
  {
    clave: "ot-criticas",
    nombre: "OT críticas",
    descripcion: "Cantidad de órdenes con prioridad crítica",
    categoria: "ordenes",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "prioridad", operador: "in", valor: ["critica", "emergencia"] }] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "costo-mantenimiento",
    nombre: "Costo de mantenimiento",
    descripcion: "Costo total de mantenimiento en el periodo",
    categoria: "costos",
    fuente: { modulo: "ordenes", dataset: "costos" },
    expresion: { tipo: "suma", campo: "costoTotal" },
    unidad: "moneda",
    formato: "moneda",
  },
  {
    clave: "costo-preventivo",
    nombre: "Costo preventivo",
    descripcion: "Costo asociado a mantenimiento preventivo",
    categoria: "costos",
    fuente: { modulo: "ordenes", dataset: "costos" },
    expresion: { tipo: "suma", campo: "costoTotal", filtros: [{ dimension: "tipo", operador: "eq", valor: "preventiva" }] },
    unidad: "moneda",
    formato: "moneda",
  },
  {
    clave: "costo-correctivo",
    nombre: "Costo correctivo",
    descripcion: "Costo asociado a mantenimiento correctivo",
    categoria: "costos",
    fuente: { modulo: "ordenes", dataset: "costos" },
    expresion: { tipo: "suma", campo: "costoTotal", filtros: [{ dimension: "tipo", operador: "eq", valor: "correctiva" }] },
    unidad: "moneda",
    formato: "moneda",
  },
  {
    clave: "consumo-inventario",
    nombre: "Consumo de inventario",
    descripcion: "Total consumido de inventario en el periodo",
    categoria: "inventario",
    fuente: { modulo: "inventario", dataset: "movimientos" },
    expresion: { tipo: "suma", campo: "cantidad", filtros: [{ dimension: "tipo", operador: "eq", valor: "consumo" }] },
    unidad: "unidades",
    formato: "decimal-2",
  },
  {
    clave: "rotacion-inventario",
    nombre: "Rotación de inventario",
    descripcion: "Ratio de consumo sobre existencia media",
    categoria: "inventario",
    fuente: { modulo: "inventario", dataset: "movimientos" },
    expresion: {
      tipo: "ratio",
      campo: "cantidad",
      filtros: [{ dimension: "tipo", operador: "eq", valor: "consumo" }],
      filtrosDenominador: [{ dimension: "tipo", campo: "existenciaMedia", operador: "exists", valor: true }],
    },
    unidad: "veces",
    formato: "decimal-2",
  },
  {
    clave: "nivel-servicio",
    nombre: "Nivel de servicio",
    descripcion: "Porcentaje de demandas satisfechas desde stock",
    categoria: "servicio",
    fuente: { modulo: "inventario", dataset: "movimientos" },
    expresion: {
      tipo: "tasa",
      filtros: [{ dimension: "estado", campo: "satisfecha", operador: "eq", valor: true }],
      factor: 100,
    },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 95, alerta: 85, critico: 0 },
  },
  {
    clave: "cumplimiento-sla",
    nombre: "Cumplimiento SLA",
    descripcion: "Porcentaje de órdenes cerradas dentro del SLA",
    categoria: "cumplimiento",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: {
      tipo: "tasa",
      filtros: [{ dimension: "estado", campo: "dentroSla", operador: "eq", valor: true }],
      factor: 100,
    },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 90, alerta: 75, critico: 0 },
  },
  {
    clave: "backlog",
    nombre: "Backlog",
    descripcion: "Órdenes pendientes acumuladas (backlog)",
    categoria: "ordenes",
    fuente: { modulo: "ordenes", dataset: "ordenes" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "estado", operador: "in", valor: ["pendiente", "backlog"] }] },
    unidad: "conteo",
    formato: "entero",
    umbrales: { mayorEsMejor: false, bueno: 10, alerta: 50, critico: 200 },
  },
  {
    clave: "carga-tecnicos",
    nombre: "Carga de técnicos",
    descripcion: "Órdenes asignadas por técnico (agrupado por responsable)",
    categoria: "carga",
    fuente: { modulo: "ordenes", dataset: "asignaciones" },
    expresion: { tipo: "conteo", agrupadores: ["responsable"] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "carga-cuadrillas",
    nombre: "Carga de cuadrillas",
    descripcion: "Órdenes asignadas por cuadrilla (agrupado por cuadrilla)",
    categoria: "carga",
    fuente: { modulo: "ordenes", dataset: "asignaciones" },
    expresion: { tipo: "conteo", agrupadores: ["cuadrilla"] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "reincidencias",
    nombre: "Reincidencias",
    descripcion: "Fallas reincidentes detectadas en la ventana",
    categoria: "fallas",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "estado", campo: "reincidente", operador: "eq", valor: true }] },
    unidad: "conteo",
    formato: "entero",
    umbrales: { mayorEsMejor: false, bueno: 0, alerta: 3, critico: 10 },
  },
  {
    clave: "fallas-por-activo",
    nombre: "Fallas por activo",
    descripcion: "Conteo de fallas agrupado por activo",
    categoria: "fallas",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: {
      tipo: "conteo",
      filtros: [{ dimension: "tipo", operador: "eq", valor: "falla" }],
      agrupadores: ["activo"],
    },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "fallas-por-tipo",
    nombre: "Fallas por tipo",
    descripcion: "Conteo de fallas agrupado por tipo/modo de falla",
    categoria: "fallas",
    fuente: { modulo: "correctivo", dataset: "eventos-activo" },
    expresion: {
      tipo: "conteo",
      filtros: [{ dimension: "tipo", operador: "eq", valor: "falla" }],
      agrupadores: ["modoFalla"],
    },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "reservas",
    nombre: "Reservas de inventario",
    descripcion: "Cantidad de reservas de inventario en el periodo",
    categoria: "inventario",
    fuente: { modulo: "inventario", dataset: "movimientos" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "tipo", operador: "eq", valor: "reserva" }] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "transferencias",
    nombre: "Transferencias",
    descripcion: "Cantidad de transferencias entre bodegas",
    categoria: "inventario",
    fuente: { modulo: "inventario", dataset: "movimientos" },
    expresion: { tipo: "conteo", filtros: [{ dimension: "tipo", operador: "eq", valor: "transferencia" }] },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "compras-generadas",
    nombre: "Compras generadas",
    descripcion: "Solicitudes de compra generadas en el periodo",
    categoria: "abastecimiento",
    fuente: { modulo: "abastecimiento", dataset: "solicitudes" },
    expresion: { tipo: "conteo" },
    unidad: "conteo",
    formato: "entero",
  },
  {
    clave: "cumplimiento-preventivo",
    nombre: "Cumplimiento preventivo",
    descripcion: "Porcentaje de programaciones preventivas ejecutadas a tiempo",
    categoria: "cumplimiento",
    fuente: { modulo: "preventivo", dataset: "generaciones" },
    expresion: {
      tipo: "tasa",
      filtros: [{ dimension: "estado", campo: "aTiempo", operador: "eq", valor: true }],
      factor: 100,
    },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 95, alerta: 80, critico: 0 },
  },
  {
    clave: "adherencia-plan",
    nombre: "Adherencia al plan",
    descripcion: "Porcentaje de actividades del plan ejecutadas",
    categoria: "cumplimiento",
    fuente: { modulo: "planes", dataset: "generaciones" },
    expresion: {
      tipo: "tasa",
      filtros: [{ dimension: "estado", campo: "ejecutada", operador: "eq", valor: true }],
      factor: 100,
    },
    unidad: "porcentaje",
    formato: "porcentaje",
    umbrales: { mayorEsMejor: true, bueno: 90, alerta: 70, critico: 0 },
  },
];

/** Claves de todos los indicadores del sistema (para verificación). */
export const CLAVES_INDICADORES_SISTEMA: readonly string[] = CATALOGO_INDICADORES.map((i) => i.clave);
