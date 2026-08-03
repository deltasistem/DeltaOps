/**
 * DGP-007 · Ejemplo neutro compartido por las pruebas: "proceso de solicitud
 * genérica". CERO vocabulario de negocio.
 *
 * Estados: borrador → enviada → enRevision → aprobada / rechazada (finales).
 * enRevision es suspendible. La transición enRevision→aprobada está GOBERNADA
 * por una aprobación inline (gate): el comando `aprobar` no cambia el estado
 * hasta que la aprobación se resuelve.
 */
import type { DefinicionWorkflow } from "../definicion";

export const SERVICIO = "flujo.demo";

export const PERMISO_LEER = `${SERVICIO}.read`;
export const PERMISO_OPERAR = `${SERVICIO}.operar`;
export const PERMISO_DISENAR = `${SERVICIO}.disenar`;
export const PERMISO_REVISAR = `${SERVICIO}.revisar`;

/** Definición base v1 del proceso de solicitud genérica. */
export const workflowSolicitud: DefinicionWorkflow = {
  clave: "solicitud-generica",
  etiqueta: "Proceso de solicitud genérica",
  estados: [
    { nombre: "borrador", inicial: true, etiqueta: "Borrador" },
    { nombre: "enviada", etiqueta: "Enviada" },
    { nombre: "enRevision", suspendible: true, etiqueta: "En revisión" },
    { nombre: "aprobada", final: true, etiqueta: "Aprobada" },
    { nombre: "rechazada", final: true, etiqueta: "Rechazada" },
  ],
  transiciones: [
    {
      de: "borrador",
      a: "enviada",
      comando: "enviar",
      precondiciones: [{ campo: "titulo", operador: "existe" }],
      acciones: [
        { tipo: "asignar", a: "solicitante" },
        { tipo: "notificar", a: "solicitante", asunto: "Solicitud enviada", cuerpo: "Su solicitud fue enviada." },
      ],
    },
    {
      de: "enviada",
      a: "enRevision",
      comando: "tomar",
      permiso: PERMISO_REVISAR,
    },
    {
      // Transición GOBERNADA por aprobación inline (gate). El destino de rechazo
      // es un estado declarado explícito.
      de: "enRevision",
      a: "aprobada",
      comando: "resolver",
      permiso: PERMISO_REVISAR,
      rechazoA: "rechazada",
      acciones: [{ tipo: "emitirEvento", evento: "resuelta-ok" }],
      aprobacion: {
        nombre: "revisionFinal",
        modo: "individual",
        permiso: PERMISO_REVISAR,
        aprobadores: ["revisor"],
      },
    },
  ],
};

/** Variante v2 con un estado adicional (para migración N/N-1). */
export const workflowSolicitudV2: DefinicionWorkflow = {
  ...workflowSolicitud,
  estados: [
    { nombre: "borrador", inicial: true },
    { nombre: "enviada" },
    { nombre: "enRevision", suspendible: true },
    { nombre: "enEspera" },
    { nombre: "aprobada", final: true },
    { nombre: "rechazada", final: true },
  ],
  transiciones: [
    { de: "borrador", a: "enviada", comando: "enviar" },
    { de: "enviada", a: "enRevision", comando: "tomar", permiso: PERMISO_REVISAR },
    { de: "enRevision", a: "enEspera", comando: "esperar", permiso: PERMISO_REVISAR },
    { de: "enEspera", a: "enRevision", comando: "retomar", permiso: PERMISO_REVISAR },
    { de: "enRevision", a: "aprobada", comando: "resolver", permiso: PERMISO_REVISAR },
    { de: "enRevision", a: "rechazada", comando: "denegar", permiso: PERMISO_REVISAR },
  ],
};
