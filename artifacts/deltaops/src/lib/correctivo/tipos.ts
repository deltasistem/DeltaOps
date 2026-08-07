/**
 * DGP-015 · Tipos TOLERANTES del read model correctivo (frontend).
 *
 * Las respuestas GET del contrato son objetos opacos (sin propiedades
 * enumeradas): estos tipos describen la forma ESPERADA de manera tolerante
 * (todo opcional, con índice de propiedades) para la presentación, sin acoplar
 * el frontend a un esquema de respuesta que el contrato deja libre.
 */

/** Objeto afectado por la solicitud (activo + componente/ubicación opcionales). */
export interface ObjetoAfectado {
  readonly activoId: string;
  readonly componenteId?: string | null;
  readonly ubicacionId?: string | null;
}

/** Clasificación de la falla (todo opcional, catálogos de tenant). */
export interface Clasificacion {
  tipoFalla?: string | null;
  modoFalla?: string | null;
  causa?: string | null;
  efecto?: string | null;
  severidad?: string | null;
  impacto?: string | null;
}

/** Evidencia REFERENCIA-ONLY (attachmentId de plataforma, sin binario). */
export interface Evidencia {
  readonly attachmentId: string;
  readonly tipo: string;
  readonly etiqueta?: string | null;
}

/** Síntoma reportado (clave de catálogo o texto libre). */
export interface Sintoma {
  clave?: string | null;
  texto?: string | null;
}

/** Fila de solicitud correctiva (tolerante). */
export interface SolicitudRow {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion?: string | null;
  readonly origen: string;
  readonly estado?: string;
  readonly prioridad?: string | null;
  readonly criticidad?: string | null;
  readonly objeto?: ObjetoAfectado;
  readonly activoId?: string;
  readonly clasificacion?: Clasificacion;
  readonly sintoma?: Sintoma;
  readonly evidencias?: Evidencia[];
  readonly comentarios?: Comentario[];
  readonly diagnostico?: Diagnostico | null;
  readonly ordenTrabajoId?: string | null;
  readonly intervencionId?: string | null;
  readonly version?: number;
  readonly creadoEn?: string;
  readonly actualizadoEn?: string;
  readonly [k: string]: unknown;
}

export interface Comentario {
  readonly id?: string;
  readonly texto: string;
  readonly actorId?: string;
  readonly fecha?: string;
}

export interface Diagnostico {
  readonly id?: string;
  readonly plantilla?: { plantillaId: string; version: number };
  readonly respuestas?: Record<string, unknown>;
  readonly causaReportada?: string | null;
  readonly causaEncontrada?: string | null;
  readonly causaRaiz?: string | null;
  readonly modoFalla?: string | null;
  readonly efecto?: string | null;
  readonly criticidad?: string | null;
  readonly impacto?: string | null;
  readonly recomendaciones?: string | null;
  readonly clasificacion?: Clasificacion;
  readonly fecha?: string;
  readonly [k: string]: unknown;
}

/** Responsable dentro de una cuadrilla. */
export interface Responsable {
  readonly responsableId: string;
  readonly rol: string;
}

/** Recurso asignado a una cuadrilla. */
export interface RecursoCuadrilla {
  readonly tipo: string;
  readonly referencia: { tipo: string; id: string; etiqueta?: string };
  readonly cantidad?: number;
}

/** Cuadrilla de una intervención (correctivo mayor: múltiples cuadrillas). */
export interface Cuadrilla {
  readonly cuadrillaId: string;
  readonly etiqueta?: string | null;
  readonly responsables: Responsable[];
  readonly recursos?: RecursoCuadrilla[];
}

/** Línea de repuesto (reserva/consumo/devolución). */
export interface LineaRepuesto {
  readonly inventarioId: string;
  readonly articuloId: string;
  readonly cantidad: number;
  readonly unidad: string;
}

/** Movimiento de repuesto registrado en la intervención (tolerante). */
export interface MovimientoRepuesto {
  readonly tipo?: string;
  readonly inventarioId?: string;
  readonly articuloId?: string;
  readonly cantidad?: number;
  readonly unidad?: string;
  readonly estado?: string;
  readonly solicitudCompraId?: string | null;
  readonly fecha?: string;
  readonly [k: string]: unknown;
}

/** Fila de intervención correctiva (tolerante). */
export interface IntervencionRow {
  readonly id: string;
  readonly solicitudId?: string;
  readonly ordenTrabajoId?: string | null;
  readonly estado?: string;
  readonly mayor?: boolean;
  readonly cuadrillas?: Cuadrilla[];
  readonly reservas?: MovimientoRepuesto[];
  readonly consumos?: MovimientoRepuesto[];
  readonly devoluciones?: MovimientoRepuesto[];
  readonly repuestos?: MovimientoRepuesto[];
  readonly solicitudesCompra?: { id: string; estado?: string }[];
  readonly version?: number;
  readonly [k: string]: unknown;
}

/** Evento de activo (historial de fallas/reincidencias). */
export interface EventoActivo {
  readonly id?: string;
  readonly activoId?: string;
  readonly tipo: string;
  readonly solicitudId?: string | null;
  readonly ordenTrabajoId?: string | null;
  readonly modoFalla?: string | null;
  readonly ocurridoEn?: string;
  readonly reincidente?: boolean;
  readonly insumosKpi?: {
    tiempoEntreFallasMin?: number | null;
    tiempoReparacionMin?: number | null;
    tiempoIndisponibleMin?: number | null;
  };
  readonly [k: string]: unknown;
}

/** Opción de catálogo de tenant. */
export interface OpcionCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly habilitado?: boolean;
  readonly datos?: Record<string, unknown>;
}

/** Entrada del flujo de eventos del módulo (event log). */
export interface EventoCorrectivo {
  readonly tipo?: string;
  readonly agregado?: string;
  readonly ocurridoEn?: string;
  readonly datos?: Record<string, unknown>;
  readonly [k: string]: unknown;
}

/** Resultado de generar una OT correctiva. */
export interface ResultadoGeneracion {
  readonly estado?: "materializada" | "pendiente" | string;
  readonly ordenTrabajoId?: string;
  readonly idempotente?: boolean;
  readonly [k: string]: unknown;
}
