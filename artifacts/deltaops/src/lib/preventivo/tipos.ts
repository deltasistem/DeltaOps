/**
 * DGP-014 · Tipos del read model del módulo preventivo (frontend).
 *
 * El OpenAPI congelado proyecta las respuestas GET como objetos opacos (el read
 * model es autoridad del servidor). Aquí modelamos formas TOLERANTES (todo
 * opcional salvo el identificador) para pintar sin fabricar datos: si un campo
 * no viene, la UI degrada con "—" o vacío.
 */

export interface ReferenciaPlan {
  readonly planId: string;
  readonly version: number;
  /** Nombre resuelto del plan (si el read model lo adjunta). */
  readonly nombre?: string;
}

export interface Vigencia {
  readonly desde: string;
  readonly hasta?: string | null;
}

export interface Checklist {
  readonly plantillaId: string;
  readonly version: number;
  readonly nombre?: string;
}

/* ------------------------------ Programa -------------------------------- */

export interface ProgramaRow {
  readonly id: string;
  readonly tenantId?: string;
  readonly codigo?: string | null;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly tipo: string;
  readonly clasificacion?: string | null;
  readonly estado: string;
  readonly version?: number;
  readonly padreId?: string | null;
  readonly padreNombre?: string | null;
  readonly hijos?: ProgramaRow[];
  readonly planes?: ReferenciaPlan[];
  readonly activos?: string[];
  readonly vigencia?: Vigencia;
  readonly sla?: Record<string, unknown> | null;
  readonly actualizadoEn?: string;
  readonly creadoEn?: string;
  readonly totalActividades?: number;
}

/* ------------------------------ Actividad ------------------------------- */

export interface TiempoEstimado {
  readonly valor: number;
  readonly unidad: string;
}

/** Recurso de personal por rol. */
export interface RecursoPersonal {
  readonly rol: string;
  readonly cantidad?: number;
  readonly horas?: number;
}

/** Repuesto/herramienta requerido (ref. a artículo/item real). */
export interface RecursoMaterial {
  readonly referenciaId: string;
  readonly descripcion?: string;
  readonly cantidad?: number;
  readonly unidad?: string;
  readonly fuente?: "inventario" | "abastecimiento";
}

export interface RecursosActividad {
  readonly personal?: RecursoPersonal[];
  readonly herramientas?: RecursoMaterial[];
  readonly repuestos?: RecursoMaterial[];
  readonly costoEstimado?: number;
  readonly moneda?: string;
}

export interface ActividadRow {
  readonly id: string;
  readonly programaId: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly orden: number;
  readonly dependencias?: string[];
  readonly checklist?: Checklist;
  readonly recursos?: RecursosActividad | Record<string, unknown> | null;
  readonly tiempoEstimado?: TiempoEstimado;
  readonly moneda?: string;
  readonly costoEstimado?: number;
  readonly sla?: Record<string, unknown> | null;
}

/* ------------------------------ Versiones ------------------------------- */

export interface VersionPrograma {
  readonly version: number;
  readonly estado?: string;
  readonly activa?: boolean;
  readonly creadoEn?: string;
  readonly autor?: string;
  readonly nota?: string;
  readonly resumen?: string;
}

/* ----------------------------- Generaciones ----------------------------- */

export interface Generacion {
  readonly id?: string;
  readonly programaId?: string;
  readonly actividadId?: string;
  readonly activoId?: string;
  readonly estado?: string;
  readonly ordenTrabajoId?: string | null;
  readonly idempotente?: boolean;
  readonly fechaObjetivo?: string;
  readonly ventana?: string;
  readonly origen?: string;
  readonly creadoEn?: string;
}

/* --------------------------- Programaciones ----------------------------- */

/** Una ocurrencia planificada del calendario preventivo. */
export interface Programacion {
  readonly id?: string;
  readonly programaId?: string;
  readonly programaNombre?: string;
  readonly actividadId?: string;
  readonly actividadNombre?: string;
  readonly activoId?: string;
  readonly activoNombre?: string;
  readonly fecha: string;
  readonly fechaFin?: string;
  readonly estado?: string;
  readonly ventana?: string;
  readonly ordenTrabajoId?: string | null;
  readonly sla?: Record<string, unknown> | null;
}

/* ------------------------------ Auxiliares ------------------------------ */

export interface OpcionCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly habilitado?: boolean;
  readonly posicion?: number;
  readonly padre?: string | null;
}

export interface EventoPreventivo {
  readonly id?: string;
  readonly tipo?: string;
  readonly programaId?: string;
  readonly ocurridoEn?: string;
  readonly descripcion?: string;
  readonly datos?: Record<string, unknown>;
}

export interface EntradaHistorial {
  readonly id?: string;
  readonly evento?: string;
  readonly descripcion?: string;
  readonly ocurridoEn?: string;
  readonly autor?: string;
}

/* --------------------------- Resultado generar -------------------------- */

export interface ResultadoGeneracion {
  readonly estado?: "materializada" | "pendiente" | string;
  readonly ordenTrabajoId?: string | null;
  readonly idempotente?: boolean;
  readonly corresponde?: boolean;
}
