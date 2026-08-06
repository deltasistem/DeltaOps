/**
 * DGP-012 · Tipos del read model del módulo de Planes (CQRS query side).
 *
 * Reflejan la forma de las proyecciones del backend. Los campos opcionales
 * absorben la tolerancia de forma del read model (no se asume presencia).
 */

export interface ReglaFrecuencia {
  readonly tipo: string;
  readonly cada?: number;
  readonly unidad?: string | null;
  readonly evento?: string | null;
}

export interface Frecuencia {
  readonly reglas: ReglaFrecuencia[];
  readonly modo?: string;
  readonly toleranciaAntes?: number;
  readonly toleranciaDespues?: number;
}

export interface Alcance {
  readonly activos?: string[];
  readonly categorias?: string[];
  readonly familias?: string[];
  readonly subfamilias?: string[];
  readonly empresas?: string[];
  readonly proyectos?: string[];
  readonly ubicaciones?: string[];
  readonly clases?: string[];
}

export interface ReferenciaActividad {
  readonly tipo: string;
  readonly id: string;
  readonly etiqueta?: string;
}

export interface Actividad {
  readonly id: string;
  readonly orden: number;
  readonly tipo: string;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly disciplina?: string | null;
  readonly duracion?: { minutos: number };
  readonly herramientas?: ReferenciaActividad[];
  readonly epp?: ReferenciaActividad[];
  readonly materiales?: ReferenciaActividad[];
  readonly repuestos?: ReferenciaActividad[];
  readonly checklists?: ReferenciaActividad[];
  readonly formularios?: ReferenciaActividad[];
  readonly documentacion?: ReferenciaActividad[];
  readonly riesgos?: Array<{ categoria: string; nota?: string }>;
  readonly observaciones?: string;
}

export interface Rutina {
  readonly id: string;
  readonly nombre: string;
  readonly recursosSugeridos?: Array<{ tipo: string; cantidad?: number }>;
  readonly actividades: Actividad[];
  readonly duracionTotal?: { minutos: number };
}

export interface Programa {
  readonly frecuencia: Frecuencia;
  readonly calendarioId?: string | null;
  readonly vigenteDesde: string;
  readonly vigenteHasta?: string | null;
}

export interface PlanRow {
  readonly id: string;
  readonly tenantId?: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly tipoPlan: string;
  readonly estrategia: string;
  readonly prioridad: string;
  readonly estado: string;
  readonly version?: number;
  readonly alcance?: Alcance;
  readonly rutina?: Rutina;
  readonly programa?: Programa;
  readonly proximaOcurrencia?: string | null;
  readonly actualizadoEn?: string;
  readonly creadoEn?: string;
}

export interface VersionPlan {
  readonly version: number;
  readonly estado?: string;
  readonly activa?: boolean;
  readonly publicadaEn?: string | null;
  readonly nombre?: string;
  readonly resumen?: string;
}

export interface EntradaHistorial {
  readonly id?: string;
  readonly tipo: string;
  readonly descripcion?: string;
  readonly actor?: string;
  readonly motivo?: string;
  readonly fecha?: string;
  readonly version?: number;
}

export type EstadoGeneracion = "pendiente" | "materializada";

export interface Generacion {
  readonly id: string;
  readonly planId?: string;
  readonly version?: number;
  readonly activoId?: string;
  readonly ocurrencia?: string;
  readonly claveDedup?: string;
  readonly origen?: string;
  /** Estado de la generación: `pendiente` (aún sin OT) o `materializada`. */
  readonly estado?: EstadoGeneracion;
  /** Id de la Orden de Trabajo cuando la generación está materializada. */
  readonly ordenTrabajoId?: string | null;
  readonly fechaObjetivo?: string;
  readonly deduplicada?: boolean;
}

export interface Ocurrencia {
  readonly fecha: string;
  readonly activoId?: string;
  readonly regla?: string;
  readonly ventana?: string;
}

export interface Calendario {
  readonly id: string;
  readonly tipo: string;
  readonly ambito: string;
  readonly nombre: string;
  readonly turnos?: Array<{ clave: string; inicioMin: number; finMin: number }>;
  readonly ventanas?: Array<{ tipo: string; desde: string; hasta: string; etiqueta?: string }>;
  readonly exclusiones?: Array<{ tipo: string; desde: string; hasta: string; etiqueta?: string }>;
}

export interface OpcionCatalogo {
  readonly valor: string;
  readonly etiqueta: string;
  readonly clave?: string;
  readonly padre?: string | null;
}

export interface EventoPlan {
  readonly tipo: string;
  readonly planId?: string;
  readonly fecha?: string;
  readonly descripcion?: string;
  readonly datos?: Record<string, unknown>;
}

/** Resultado de una evaluación de generación. */
export interface ResultadoEvaluacion {
  readonly debeGenerar?: boolean;
  readonly ocurrencia?: string;
  readonly claveDedup?: string;
  readonly motivo?: string;
  readonly proxima?: string;
  readonly reglas?: Array<{ tipo: string; vence?: string; cumple?: boolean }>;
}

/** Orden materializada (o deduplicada) por la orquestación de generación. */
export interface OrdenCreada {
  readonly generacionId: string;
  readonly claveDedup: string;
  readonly ordenTrabajoId: string;
  /** `true` cuando la OT ya existía (deduplicada por clave), no se duplicó. */
  readonly idempotente: boolean;
}

/** Error de materialización de una generación concreta. */
export interface ErrorGeneracion {
  readonly claveDedup: string;
  readonly code?: string;
  readonly error: string;
}

/**
 * Resultado de la orquestación idempotente de generación de órdenes
 * (contrato actualizado DGP-012 ronda 1). Distingue órdenes creadas —cada una
 * con su bandera `idempotente`— de los errores por clave de deduplicación.
 */
export interface ResultadoGeneracion {
  readonly planId?: string;
  readonly evaluadas?: number;
  readonly ordenesCreadas?: OrdenCreada[];
  readonly errores?: ErrorGeneracion[];
  readonly idempotente?: boolean;
}
