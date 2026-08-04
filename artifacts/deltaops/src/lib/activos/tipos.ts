/**
 * DGP-008.3 · Tipos del dominio de Activos en el cliente.
 * Espejo de los read models y payloads del módulo (lib/module-activos).
 */

export const ESTADOS_ACTIVO = [
  "BORRADOR",
  "REGISTRADO",
  "OPERATIVO",
  "MANTENIMIENTO",
  "FUERA_SERVICIO",
  "RETIRADO",
] as const;
export type EstadoActivo = (typeof ESTADOS_ACTIVO)[number];

/** Transiciones de estado disponibles (acción → estado destino). */
export interface TransicionDef {
  readonly accion: string;
  readonly etiqueta: string;
  readonly destino: EstadoActivo;
  readonly desde: readonly EstadoActivo[];
}

export const TRANSICIONES: readonly TransicionDef[] = [
  { accion: "registrar", etiqueta: "Registrar", destino: "REGISTRADO", desde: ["BORRADOR"] },
  { accion: "operar", etiqueta: "Poner operativo", destino: "OPERATIVO", desde: ["REGISTRADO", "MANTENIMIENTO", "FUERA_SERVICIO"] },
  { accion: "mantener", etiqueta: "Enviar a mantenimiento", destino: "MANTENIMIENTO", desde: ["OPERATIVO", "FUERA_SERVICIO"] },
  { accion: "fuera-servicio", etiqueta: "Marcar fuera de servicio", destino: "FUERA_SERVICIO", desde: ["OPERATIVO", "MANTENIMIENTO", "REGISTRADO"] },
  { accion: "retirar", etiqueta: "Retirar", destino: "RETIRADO", desde: ["REGISTRADO", "OPERATIVO", "MANTENIMIENTO", "FUERA_SERVICIO"] },
];

export const CATEGORIAS_DOCUMENTACION = [
  "manual",
  "certificado",
  "garantia",
  "diagrama",
  "plano",
  "procedimiento",
  "fotografia",
  "video",
] as const;
export type CategoriaDocumentacion = (typeof CATEGORIAS_DOCUMENTACION)[number];

export const CATALOGOS = [
  "tipos", "categorias", "familias", "subfamilias", "estados", "criticidades",
  "prioridades", "empresas", "centros-costo", "proyectos", "ubicaciones",
  "fabricantes", "modelos", "monedas", "unidades", "proveedores",
] as const;
export type NombreCatalogo = (typeof CATALOGOS)[number];

export interface Medicion {
  readonly valor: number;
  readonly unidad: string;
  readonly fecha: string;
}

export interface Ubicacion {
  readonly ubicacionId: string;
  readonly etiqueta: string;
  readonly coordenadas?: { latitud: number; longitud: number; altitud?: number };
  readonly detalle?: string;
}

/** Fila de read model de activo (list/detalle). `datos` contiene los campos ricos. */
export interface ActivoRow {
  readonly tenantId: string;
  readonly id: string;
  readonly codigoEmpresarial: string;
  readonly nombre: string;
  readonly estado: EstadoActivo;
  readonly tipo: string;
  readonly criticidad: string | null;
  readonly ubicacionId: string | null;
  readonly datos: Record<string, unknown>;
  readonly version: number;
  readonly lastEventId: string;
  readonly actualizadoAt: string;
}

export interface OpcionCatalogo {
  readonly valor: string;
  readonly etiqueta: string;
  readonly habilitado?: boolean;
}

/** Etiqueta de identificación (QR/barcode/NFC) emitida por platform.qr. */
export interface EtiquetaQr {
  readonly id?: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly acciones?: readonly string[];
  readonly reutilizada?: boolean;
}

/** Detalle de activo: read model + etiqueta vigente (mejor esfuerzo). */
export type DetalleActivo = ActivoRow & { readonly etiqueta?: EtiquetaQr | null };

export interface EventoTimeline {
  readonly id?: string;
  readonly tipo?: string;
  readonly actor?: string;
  readonly estado?: string;
  readonly entidadRelacionada?: string;
  readonly ocurridoAt?: string;
  readonly occurredAt?: string;
  readonly fecha?: string;
  readonly descripcion?: string;
  readonly resumen?: string;
  readonly datos?: Record<string, unknown>;
  readonly [k: string]: unknown;
}

export interface Comentario {
  readonly id: string;
  readonly texto: string;
  readonly autor?: string;
  readonly actorId?: string;
  readonly parentId?: string | null;
  readonly version?: number;
  readonly creadoAt?: string;
  readonly editadoAt?: string | null;
  readonly borrado?: boolean;
  readonly [k: string]: unknown;
}

export interface Adjunto {
  readonly id?: string;
  readonly attachmentId?: string;
  readonly categoria: string;
  readonly nombreArchivo: string;
  readonly mimeType: string;
  readonly tamanoBytes: number;
  readonly hashSha256: string;
  readonly url?: string | null;
  readonly creadoAt?: string;
  readonly [k: string]: unknown;
}

export interface Relacion {
  readonly id: string;
  readonly tipo: string;
  readonly categoria?: string;
  readonly origenId: string;
  readonly destinoId: string;
  readonly origenNombre?: string;
  readonly destinoNombre?: string;
  readonly [k: string]: unknown;
}

export interface NodoArbol {
  readonly id: string;
  readonly nombre?: string;
  readonly codigoEmpresarial?: string;
  readonly estado?: EstadoActivo;
  readonly tipo?: string;
  readonly hijos?: readonly NodoArbol[];
  readonly [k: string]: unknown;
}

export interface CambioHistorico {
  readonly id?: string;
  readonly fecha?: string;
  readonly registradoAt?: string;
  readonly actor?: string;
  readonly actorId?: string;
  readonly [k: string]: unknown;
}

/** Etiqueta legible de un estado. */
export function etiquetaEstado(e: string): string {
  const mapa: Record<string, string> = {
    BORRADOR: "Borrador",
    REGISTRADO: "Registrado",
    OPERATIVO: "Operativo",
    MANTENIMIENTO: "Mantenimiento",
    FUERA_SERVICIO: "Fuera de servicio",
    RETIRADO: "Retirado",
  };
  return mapa[e] ?? e;
}

/** Variante de Badge del DS para un estado. */
export function variantEstado(
  e: string,
): "neutro" | "primario" | "exito" | "advertencia" | "error" | "info" {
  switch (e) {
    case "OPERATIVO":
      return "exito";
    case "MANTENIMIENTO":
      return "advertencia";
    case "FUERA_SERVICIO":
      return "error";
    case "RETIRADO":
      return "neutro";
    case "REGISTRADO":
      return "info";
    case "BORRADOR":
    default:
      return "neutro";
  }
}

/** Transiciones aplicables desde un estado dado. */
export function transicionesDesde(estado: EstadoActivo): TransicionDef[] {
  return TRANSICIONES.filter((t) => t.desde.includes(estado));
}
