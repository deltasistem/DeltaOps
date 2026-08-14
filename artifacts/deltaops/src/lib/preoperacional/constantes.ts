/**
 * DGP-LITE-04 · Constantes del PREOPERACIONAL / Checklist Operacional (frontend).
 *
 * La superficie HTTP se ancla bajo `/api/deltaops/activos/preoperacional` (mismo
 * entitlement `activos`; jamás un módulo nuevo). El backend es la AUTORIDAD:
 * valida el activo, resuelve la plantilla ACTIVA, captura la respuesta, calcula y
 * SELLA el veredicto. El frontend nunca decide el veredicto ni la criticidad.
 */

/** Namespace del comando orquestador (para la cola offline). */
export const MODULO = "modulo.preoperacional";

/** Base HTTP de la superficie. */
export const API_BASE = "/api/deltaops/activos/preoperacional";

/** Endpoint de sincronización offline (reutiliza la ÚNICA cola existente). */
export const SYNC_URL = `${API_BASE}/sync`;

/** Espacio de nombres de la cola offline (deltaops:preoperacional:cola:<tenant>). */
export const MODULO_OFFLINE = "preoperacional";

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/** Estado de un ítem mapeado al contrato del motor (`estado` boolean|"na" + comentario). */
export type EstadoItem = "cumple" | "no_cumple" | "observacion" | "na";

/** Catálogo de presentación del control segmentado (mobile-first, §4/§9). */
export interface OpcionSegmento {
  readonly clave: EstadoItem;
  readonly etiqueta: string;
  readonly icono: "check" | "x" | "warning" | "minus";
  readonly tono: Tono;
}

export const OPCIONES_SEGMENTO: readonly OpcionSegmento[] = [
  { clave: "cumple", etiqueta: "Cumple", icono: "check", tono: "exito" },
  { clave: "no_cumple", etiqueta: "No cumple", icono: "x", tono: "error" },
  { clave: "observacion", etiqueta: "Observación", icono: "warning", tono: "advertencia" },
  { clave: "na", etiqueta: "No aplica", icono: "minus", tono: "neutro" },
];

/** Veredicto sellado por el backend. */
export type Veredicto = "APTO" | "APTO_CON_OBSERVACIONES" | "NO_APTO";

/** Presentación del veredicto: texto + color + icono (§8/§10). */
export interface PresentacionVeredicto {
  readonly etiqueta: string;
  readonly tono: Tono;
  readonly icono: "check" | "warning" | "x";
  readonly descripcion: string;
}

export const PRESENTACION_VEREDICTO: Record<Veredicto, PresentacionVeredicto> = {
  APTO: {
    etiqueta: "APTO",
    tono: "exito",
    icono: "check",
    descripcion: "El equipo cumple con todos los puntos obligatorios.",
  },
  APTO_CON_OBSERVACIONES: {
    etiqueta: "APTO CON OBSERVACIONES",
    tono: "advertencia",
    icono: "warning",
    descripcion: "Sin fallas críticas, pero hay observaciones o incumplimientos no críticos por seguir.",
  },
  NO_APTO: {
    etiqueta: "NO APTO",
    tono: "error",
    icono: "x",
    descripcion: "Existe al menos un punto CRÍTICO que no cumple. No debe operar.",
  },
};

/**
 * Mapea el estado de presentación al contrato del motor: `estado` es
 * `boolean | "na"` y la observación viaja como `estado:true` + `comentario`
 * (cumple con salvedad). No se rompe el contrato existente.
 */
export function aContratoMotor(estado: EstadoItem, comentario?: string): {
  estado: boolean | "na";
  comentario?: string;
} {
  switch (estado) {
    case "cumple":
      return { estado: true, ...(comentario ? { comentario } : {}) };
    case "no_cumple":
      return { estado: false, ...(comentario ? { comentario } : {}) };
    case "observacion":
      // Cumple CON observación → requiere comentario (seguimiento).
      return { estado: true, comentario: comentario ?? "Observación" };
    case "na":
      return { estado: "na", ...(comentario ? { comentario } : {}) };
  }
}
