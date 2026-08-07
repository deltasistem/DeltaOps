/**
 * DGP-015 · Plantillas de formularios del módulo correctivo (Dynamic Forms).
 *
 * TODA la captura de la experiencia correctiva se declara aquí como
 * `DefinicionFormulario` y la pinta el renderer genérico `FormularioDinamico`.
 * No hay controles a mano fuera del renderer. Importa SOLO de
 * `@workspace/dynamic-forms/definicion`. Activos, síntomas, prioridades, causas,
 * repuestos, etc. se referencian por selección real (opciones inyectadas desde
 * los módulos y catálogos existentes) SIN enums hardcodeados: si el catálogo del
 * tenant está vacío, se degrada a texto libre. Todos los títulos son no vacíos.
 */
import {
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import { TIPOS_EVIDENCIA, TIPOS_EVENTO_ACTIVO } from "../correctivo/constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}
const opc = (arr: readonly { valor: string; etiqueta: string }[]): OpcionSeleccion[] =>
  arr.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

/** Campo select si hay opciones de catálogo; si no, degrada a texto libre. */
function selectOTexto(clave: string, etiqueta: string, opciones: OpcionSeleccion[] | undefined, extra: Partial<CampoFormulario> = {}): CampoFormulario {
  return opciones?.length
    ? campo({ clave, tipo: "select", etiqueta, opciones, ...extra })
    : campo({ clave, tipo: "texto", etiqueta: `${etiqueta} (texto)`, ...extra });
}

/* --------------------------- Filtros del listado ------------------------ */

export function plantillaFiltrosSolicitudes(estados: OpcionSeleccion[], origenes: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "correctivo.filtros",
    titulo: "Filtros de solicitudes",
    descripcion: "Filtra el listado de solicitudes correctivas",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "origen", tipo: "select", etiqueta: "Origen", opciones: origenes }),
          campo({ clave: "activoId", tipo: "texto", etiqueta: "Activo (id)" }),
        ],
      },
    ],
  };
}

/* ---------------------------- Wizard de solicitud ----------------------- */

export interface OpcionesSolicitud {
  origenes?: OpcionSeleccion[];
  activos?: OpcionSeleccion[];
  prioridades?: OpcionSeleccion[];
  sintomas?: OpcionSeleccion[];
  tiposFalla?: OpcionSeleccion[];
  modosFalla?: OpcionSeleccion[];
  causas?: OpcionSeleccion[];
  efectos?: OpcionSeleccion[];
  severidades?: OpcionSeleccion[];
  impactos?: OpcionSeleccion[];
}

/**
 * Wizard multi-paso de alta rápida de una solicitud correctiva: identificación
 * (título, origen), objeto afectado (activo real + componente/ubicación),
 * síntomas y prioridad (catálogos), clasificación de la falla (catálogos, sin
 * enums) y evidencias referencia-only (attachmentId de plataforma).
 */
export function plantillaSolicitud(op: OpcionesSolicitud = {}): DefinicionFormulario {
  const campoOrigen = op.origenes?.length
    ? campo({ clave: "origen", tipo: "select", etiqueta: "Origen", obligatorio: true, opciones: op.origenes })
    : campo({ clave: "origen", tipo: "texto", etiqueta: "Origen", obligatorio: true, ayuda: "operador, supervisor, producción, calidad, SST, IoT, API." });
  const campoActivo = op.activos?.length
    ? campo({ clave: "activoId", tipo: "select", etiqueta: "Activo afectado", obligatorio: true, opciones: op.activos })
    : campo({ clave: "activoId", tipo: "texto", etiqueta: "Activo afectado (id)", obligatorio: true });

  return {
    clave: "correctivo.solicitud.creacion",
    titulo: "Nueva solicitud correctiva",
    descripcion: "Registro rápido de una falla o solicitud de mantenimiento correctivo",
    nodos: [
      {
        clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nueva solicitud",
        pasos: [
          {
            clave: "identificacion", etiqueta: "Identificación",
            hijos: [
              campo({ clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campoOrigen,
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 2000 } }),
            ],
          },
          {
            clave: "objeto", etiqueta: "Objeto afectado",
            hijos: [
              campoActivo,
              campo({ clave: "componenteId", tipo: "texto", etiqueta: "Componente (id, opcional)" }),
              campo({ clave: "ubicacionId", tipo: "texto", etiqueta: "Ubicación (id, opcional)" }),
            ],
          },
          {
            clave: "sintomas", etiqueta: "Síntomas y prioridad",
            hijos: [
              selectOTexto("sintomaClave", "Síntoma (catálogo)", op.sintomas),
              campo({ clave: "sintomaTexto", tipo: "texto", etiqueta: "Descripción del síntoma", restricciones: { longitudMax: 500 } }),
              selectOTexto("prioridad", "Prioridad", op.prioridades),
            ],
          },
          {
            clave: "clasificacion", etiqueta: "Clasificación de la falla",
            hijos: [
              selectOTexto("tipoFalla", "Tipo de falla", op.tiposFalla),
              selectOTexto("modoFalla", "Modo de falla", op.modosFalla),
              selectOTexto("causa", "Causa", op.causas),
              selectOTexto("efecto", "Efecto", op.efectos),
              selectOTexto("severidad", "Severidad", op.severidades),
              selectOTexto("impacto", "Impacto", op.impactos),
            ],
          },
          {
            clave: "evidencias", etiqueta: "Evidencias (referencia)",
            hijos: [
              campo({
                clave: "evidencias", tipo: "tabla", etiqueta: "Evidencias adjuntas",
                ayuda: "Referencia-only: el identificador de adjunto (attachmentId) lo asigna el servicio de plataforma; no se suben binarios.",
                subcampos: [
                  campo({ clave: "attachmentId", tipo: "texto", etiqueta: "Attachment (id)", obligatorio: true }),
                  campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_EVIDENCIA) }),
                  campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta" }),
                ],
              }),
            ],
          },
        ],
      },
    ],
  };
}

/* ------------------------------ Diagnóstico ----------------------------- */

export interface OpcionesDiagnostico {
  modosFalla?: OpcionSeleccion[];
  causas?: OpcionSeleccion[];
  efectos?: OpcionSeleccion[];
  severidades?: OpcionSeleccion[];
  impactos?: OpcionSeleccion[];
  criticidades?: OpcionSeleccion[];
}

/**
 * Formulario de diagnóstico anclado a plantilla+versión: causa reportada,
 * encontrada y raíz, modo de falla, efecto, criticidad, impacto y
 * recomendaciones. Catálogos reales del tenant (sin enums); degradación a texto.
 */
export function plantillaDiagnostico(op: OpcionesDiagnostico = {}): DefinicionFormulario {
  return {
    clave: "correctivo.diagnostico",
    titulo: "Diagnóstico de la falla",
    descripcion: "Ciclo de diagnóstico anclado a la plantilla del motor de formularios",
    nodos: [
      {
        clase: "contenedor", clave: "sec-causa", tipo: "seccion", etiqueta: "Causas",
        hijos: [
          campo({ clave: "causaReportada", tipo: "texto", etiqueta: "Causa reportada", restricciones: { longitudMax: 500 } }),
          campo({ clave: "causaEncontrada", tipo: "texto", etiqueta: "Causa encontrada", restricciones: { longitudMax: 500 } }),
          campo({ clave: "causaRaiz", tipo: "texto", etiqueta: "Causa raíz", restricciones: { longitudMax: 500 } }),
        ],
      },
      {
        clase: "contenedor", clave: "sec-falla", tipo: "seccion", etiqueta: "Clasificación",
        hijos: [
          selectOTexto("modoFalla", "Modo de falla", op.modosFalla),
          selectOTexto("efecto", "Efecto", op.efectos),
          selectOTexto("causa", "Causa (clasificación)", op.causas),
          selectOTexto("severidad", "Severidad", op.severidades),
          selectOTexto("criticidad", "Criticidad", op.criticidades),
          selectOTexto("impacto", "Impacto", op.impactos),
        ],
      },
      {
        clase: "contenedor", clave: "sec-reco", tipo: "seccion", etiqueta: "Recomendaciones",
        hijos: [
          campo({ clave: "recomendaciones", tipo: "texto", etiqueta: "Recomendaciones", restricciones: { longitudMax: 2000 } }),
        ],
      },
    ],
  };
}

/* ----------------------------- Comentario ------------------------------- */

export function plantillaComentario(): DefinicionFormulario {
  return {
    clave: "correctivo.comentario",
    titulo: "Nuevo comentario",
    descripcion: "Añade un comentario a la solicitud",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Comentario",
        hijos: [campo({ clave: "texto", tipo: "texto", etiqueta: "Comentario", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 2000 } })],
      },
    ],
  };
}

/* ------------------------------ Evidencia ------------------------------- */

export function plantillaEvidencia(): DefinicionFormulario {
  return {
    clave: "correctivo.evidencia",
    titulo: "Adjuntar evidencia",
    descripcion: "Evidencia referencia-only (attachmentId de plataforma)",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Evidencia",
        hijos: [
          campo({ clave: "attachmentId", tipo: "texto", etiqueta: "Attachment (id)", obligatorio: true, ayuda: "Lo asigna el servicio de plataforma; no se suben binarios." }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_EVIDENCIA) }),
          campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta" }),
        ],
      },
    ],
  };
}

/* ------------------------------ Repuestos ------------------------------- */

export interface OpcionesRepuestos {
  items?: OpcionSeleccion[];
  articulos?: OpcionSeleccion[];
}

/** Reserva de una o varias líneas de repuesto (selector real de inventario). */
export function plantillaReservar(op: OpcionesRepuestos = {}): DefinicionFormulario {
  const subItem = op.items?.length
    ? campo({ clave: "inventarioId", tipo: "select", etiqueta: "Item (inventario)", obligatorio: true, opciones: op.items })
    : campo({ clave: "inventarioId", tipo: "texto", etiqueta: "Item (inventario id)", obligatorio: true });
  const subArt = op.articulos?.length
    ? campo({ clave: "articuloId", tipo: "select", etiqueta: "Artículo", obligatorio: true, opciones: op.articulos })
    : campo({ clave: "articuloId", tipo: "texto", etiqueta: "Artículo (id)", obligatorio: true });
  return {
    clave: "correctivo.reservar",
    titulo: "Reservar repuestos",
    descripcion: "Reserva de repuestos desde inventario para la intervención",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Líneas a reservar",
        hijos: [
          campo({
            clave: "lineas", tipo: "tabla", etiqueta: "Repuestos",
            subcampos: [
              subItem, subArt,
              campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
              campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad", obligatorio: true, valorDefecto: "unidad", restricciones: { longitudMax: 12 } }),
            ],
          }),
        ],
      },
    ],
  };
}

/** Consumo/devolución de una única línea de repuesto (consumo parcial). */
export function plantillaLineaRepuesto(titulo: string, op: OpcionesRepuestos = {}): DefinicionFormulario {
  const campoItem = op.items?.length
    ? campo({ clave: "inventarioId", tipo: "select", etiqueta: "Item (inventario)", obligatorio: true, opciones: op.items })
    : campo({ clave: "inventarioId", tipo: "texto", etiqueta: "Item (inventario id)", obligatorio: true });
  const campoArt = op.articulos?.length
    ? campo({ clave: "articuloId", tipo: "select", etiqueta: "Artículo", obligatorio: true, opciones: op.articulos })
    : campo({ clave: "articuloId", tipo: "texto", etiqueta: "Artículo (id)", obligatorio: true });
  return {
    clave: "correctivo.linea-repuesto",
    titulo,
    descripcion: "Movimiento de una línea de repuesto",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: titulo,
        hijos: [
          campoItem, campoArt,
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
          campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad", obligatorio: true, valorDefecto: "unidad", restricciones: { longitudMax: 12 } }),
        ],
      },
    ],
  };
}

/* ------------------------------ Cuadrillas ------------------------------ */

/** Asignación de cuadrillas (correctivo mayor): múltiples cuadrillas/recursos. */
export function plantillaCuadrillas(): DefinicionFormulario {
  return {
    clave: "correctivo.cuadrillas",
    titulo: "Asignar cuadrillas",
    descripcion: "Correctivo mayor: múltiples cuadrillas, responsables y recursos",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Cuadrillas",
        hijos: [
          campo({
            clave: "cuadrillas", tipo: "tabla", etiqueta: "Cuadrillas",
            subcampos: [
              campo({ clave: "cuadrillaId", tipo: "texto", etiqueta: "Cuadrilla (id)", obligatorio: true }),
              campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta" }),
              campo({ clave: "responsables", tipo: "texto", etiqueta: "Responsables", obligatorio: true, ayuda: "Formato: id:rol, id:rol (p. ej. r1:lider, r2:tecnico)." }),
              campo({ clave: "recursos", tipo: "texto", etiqueta: "Recursos", ayuda: "Formato: tipo:id, tipo:id (p. ej. equipo:e1, vehiculo:v3)." }),
            ],
          }),
        ],
      },
    ],
  };
}

/* --------------------------- Evento de activo --------------------------- */

export function plantillaEventoActivo(): DefinicionFormulario {
  return {
    clave: "correctivo.evento-activo",
    titulo: "Registrar evento de activo",
    descripcion: "Historial de fallas / reincidencias (sólo registro, no calcula KPIs)",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Evento",
        hijos: [
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo de evento", obligatorio: true, opciones: opc(TIPOS_EVENTO_ACTIVO) }),
          campo({ clave: "modoFalla", tipo: "texto", etiqueta: "Modo de falla (opcional)" }),
          campo({ clave: "solicitudId", tipo: "texto", etiqueta: "Solicitud vinculada (id, opcional)" }),
          campo({ clave: "ordenTrabajoId", tipo: "texto", etiqueta: "OT vinculada (id, opcional)" }),
          campo({ clave: "ocurridoEn", tipo: "fecha", etiqueta: "Ocurrió en (opcional)" }),
        ],
      },
    ],
  };
}

/* --------------------------- Escaneo manual ----------------------------- */
// (El escaneo reutiliza `plantillaEscaneoManual` de plantillas.ts.)
