/**
 * DGP-009.3 · Tipos del read model de Órdenes (espejo del proyector CQRS).
 * Solo describe las formas que devuelven los endpoints; no contiene lógica.
 */
import type { EstadoOrden } from "./constantes";

/** Fila del read model de una orden (GET /ordenes → {ordenes:[...]}, GET /:id → {orden}). */
export interface OrdenRow {
  readonly tenantId: string;
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoOrden;
  readonly tipo: string;
  readonly categoria: string | null;
  readonly prioridad: string | null;
  readonly severidad: string | null;
  readonly responsable: string | null;
  readonly supervisor: string | null;
  readonly activoPrincipalId: string | null;
  readonly ubicacionId: string | null;
  readonly datos: Record<string, unknown> & {
    readonly fechas?: Record<string, unknown>;
    readonly sla?: Record<string, unknown> | null;
    readonly checklist?: unknown;
    readonly formulario?: unknown;
    readonly evidencias?: unknown[];
    readonly activosRelacionados?: unknown[];
    readonly descripcion?: string;
    readonly observaciones?: string;
    readonly activoPrincipal?: { activoId?: string; entityRef?: string; etiqueta?: string } | null;
  };
  readonly version: number;
  readonly lastEventId: string;
  readonly actualizadoAt: string;
}

/** Entrada de la agenda (GET /agenda → {entradas:[...]}). */
export interface EntradaAgenda {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoOrden;
  readonly responsable: string | null;
  readonly inicioPlanificado: string | null;
  readonly finPlanificado: string | null;
  readonly ventanaInicio: string | null;
  readonly ventanaFin: string | null;
  readonly programacionEstado: string | null;
  readonly enConflicto: boolean;
  readonly version: number;
}

/** Calendario (GET /calendario → {dias: {"YYYY-MM-DD": Entrada[]}}). */
export interface Calendario {
  readonly dias: Record<string, EntradaAgenda[]>;
}

/** Evento del historial (GET /:id/historial → {historial:[...]}). */
export interface EventoHistorial {
  readonly eventId: string;
  readonly ordenId: string;
  readonly tipo: string;
  readonly resumen: string;
  readonly ocurridoAt?: string;
  readonly actor?: string;
}

/** Entrada de la bitácora operacional (GET /:id/bitacora → {bitacora:[...]}). */
export interface EntradaBitacora {
  readonly id?: string;
  readonly ordenId: string;
  readonly accion: string;
  readonly detalle?: Record<string, unknown>;
  readonly ocurridoAt?: string;
  readonly actor?: string;
}

/** Documento adjunto (GET /:id/documentacion → {documentacion:[...]} o array). */
export interface DocumentoOrden {
  readonly id?: string;
  readonly attachmentId?: string;
  readonly clase?: string;
  readonly categoria?: string;
  readonly nombreArchivo: string;
  readonly mimeType: string;
  readonly tamanoBytes: number;
  readonly hashSha256?: string;
}

/** Opción de catálogo (GET /catalogos/:catalogo → OpcionCatalogo[]). */
export interface OpcionCatalogo {
  readonly valor: string;
  readonly etiqueta: string;
  readonly habilitado?: boolean;
}

/** Relación / dependencia OT↔OT (GET /:id/relaciones|dependencias → {relaciones|dependencias:[]}). */
export interface RelacionOrden {
  readonly id: string;
  readonly categoria: string;
  readonly tipo: string;
  readonly ordenId: string;
  readonly destinoId: string;
  readonly destinoCodigo: string | null;
  readonly destinoNombre: string | null;
  readonly datos?: Record<string, unknown>;
  readonly actualizadoAt?: string;
}

/** Asignación / responsable / recurso (GET /:id/asignaciones|responsables). */
export interface Asignacion {
  readonly id?: string;
  readonly recursoId?: string;
  readonly nombre?: string;
  readonly rol?: string;
  readonly tipo?: string;
  /** DGP-020.1 · Referencia fuerte a la identidad canónica (tipo persona). */
  readonly asignadoIdentityId?: string | null;
  readonly asignadoNombre?: string | null;
  readonly asignadoEmail?: string | null;
  readonly [k: string]: unknown;
}

/**
 * DGP-020.1 · Identidad canónica ELEGIBLE para asignación de recurso humano.
 * El frontend muestra `nombre`/`rol` y ENVÍA únicamente `identityId` (jamás
 * nombre/email como clave). Tenant-scoped por la sesión del backend.
 */
export interface IdentidadElegible {
  readonly identityId: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: string;
  readonly estadoMembresia: string;
}
