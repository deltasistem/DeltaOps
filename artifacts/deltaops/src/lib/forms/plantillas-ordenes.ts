/**
 * DGP-009.3 · Plantillas de formularios de Órdenes (Dynamic Forms Engine).
 *
 * TODAS las formas de captura de la experiencia de Órdenes se declaran aquí como
 * `DefinicionFormulario` y las pinta el renderer genérico `FormularioDinamico`.
 * No hay controles construidos a mano fuera del renderer. Importa SOLO de
 * `@workspace/dynamic-forms/definicion` (seguro para el bundle del navegador).
 */
import {
  validarDefinicion,
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

/** Pasos del wizard de creación (claves por paso para validación por paso). */
export const PASOS_CREACION: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "identificacion", etiqueta: "Identificación", campos: ["titulo", "tipo", "categoria", "descripcion"] },
  { clave: "clasificacion", etiqueta: "Clasificación", campos: ["prioridad", "severidad"] },
  { clave: "activo", etiqueta: "Activo y ubicación", campos: ["activoId", "activoEtiqueta", "ubicacionId", "ubicacionEtiqueta"] },
  { clave: "responsables", etiqueta: "Responsables", campos: ["responsable", "supervisor"] },
  { clave: "planificacion", etiqueta: "Planificación", campos: ["inicioPlanificado", "finPlanificado", "observaciones"] },
];

export interface OpcionesCreacion {
  tipos?: OpcionSeleccion[];
  categorias?: OpcionSeleccion[];
  prioridades?: OpcionSeleccion[];
  severidades?: OpcionSeleccion[];
}

/** Wizard de creación de una orden de trabajo. */
export function plantillaCreacion(op: OpcionesCreacion = {}): DefinicionFormulario {
  const tipos = op.tipos ?? [];
  const campoTipo = tipos.length
    ? campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: tipos })
    : campo({ clave: "tipo", tipo: "texto", etiqueta: "Tipo", obligatorio: true, ayuda: "Ej.: correctiva, preventiva, inspección.", restricciones: { longitudMin: 1, longitudMax: 60 } });
  const categorias = op.categorias ?? [];
  const campoCategoria = categorias.length
    ? campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", opciones: categorias })
    : campo({ clave: "categoria", tipo: "texto", etiqueta: "Categoría", restricciones: { longitudMax: 60 } });
  const def: DefinicionFormulario = {
    clave: "orden.creacion",
    titulo: "Nueva orden de trabajo",
    descripcion: "Registro de una orden de trabajo",
    nodos: [
      {
        clase: "contenedor",
        clave: "wiz",
        tipo: "wizard",
        etiqueta: "Nueva orden",
        pasos: [
          {
            clave: "identificacion",
            etiqueta: "Identificación",
            hijos: [
              campo({ clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campoTipo,
              campoCategoria,
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
            ],
          },
          {
            clave: "clasificacion",
            etiqueta: "Clasificación",
            hijos: [
              campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", opciones: op.prioridades ?? [] }),
              campo({ clave: "severidad", tipo: "select", etiqueta: "Severidad", opciones: op.severidades ?? [] }),
            ],
          },
          {
            clave: "activo",
            etiqueta: "Activo y ubicación",
            hijos: [
              campo({ clave: "activoId", tipo: "texto", etiqueta: "Id del activo principal", ayuda: "Puedes rellenarlo escaneando el QR del activo." }),
              campo({ clave: "activoEtiqueta", tipo: "texto", etiqueta: "Etiqueta del activo" }),
              campo({ clave: "ubicacionId", tipo: "texto", etiqueta: "Id de ubicación" }),
              campo({ clave: "ubicacionEtiqueta", tipo: "texto", etiqueta: "Etiqueta de ubicación" }),
            ],
          },
          {
            clave: "responsables",
            etiqueta: "Responsables",
            hijos: [
              campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable (técnico)" }),
              campo({ clave: "supervisor", tipo: "texto", etiqueta: "Supervisor" }),
            ],
          },
          {
            clave: "planificacion",
            etiqueta: "Planificación",
            hijos: [
              campo({ clave: "inicioPlanificado", tipo: "fechaHora", etiqueta: "Inicio planificado" }),
              campo({ clave: "finPlanificado", tipo: "fechaHora", etiqueta: "Fin planificado" }),
              campo({ clave: "observaciones", tipo: "texto", etiqueta: "Observaciones", restricciones: { longitudMax: 1000 } }),
            ],
          },
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Edición de una orden (campos editables básicos). */
export function plantillaEdicionOrden(op: OpcionesCreacion = {}): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.edicion",
    titulo: "Editar orden",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
          campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", opciones: op.prioridades ?? [] }),
          campo({ clave: "severidad", tipo: "select", etiqueta: "Severidad", opciones: op.severidades ?? [] }),
          campo({ clave: "observaciones", tipo: "texto", etiqueta: "Observaciones", restricciones: { longitudMax: 1000 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Filtros del Centro de Operaciones. */
export function plantillaFiltrosOrdenes(estados: OpcionSeleccion[], tipos: OpcionSeleccion[]): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.filtros",
    titulo: "Filtros",
    nodos: [
      {
        clase: "contenedor", clave: "f", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", opciones: tipos }),
          campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Comentario / observación (texto largo → Textarea). */
export function plantillaComentarioOrden(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.comentario",
    titulo: "Comentario",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [campo({ clave: "texto", tipo: "texto", etiqueta: "Comentario u observación", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 2000 } })],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Evento de bitácora operacional (acción + notas + tiempo). */
export function plantillaBitacora(acciones: OpcionSeleccion[]): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.bitacora",
    titulo: "Registrar en bitácora",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "accion", tipo: "select", etiqueta: "Acción", obligatorio: true, opciones: acciones }),
          campo({ clave: "nota", tipo: "texto", etiqueta: "Nota", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Registro de horas trabajadas. */
export function plantillaHoras(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.horas",
    titulo: "Registrar horas",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "horas", tipo: "decimal", etiqueta: "Horas", obligatorio: true, restricciones: { minimo: 0, maximo: 1000 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción del trabajo", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/**
 * Clases de recurso canónicas del dominio (DGP-009.1 `CLASES_RECURSO`):
 * herramienta/material/EPP/vehículo/equipo-auxiliar. Espejo de presentación; el
 * backend es la autoridad (rechaza clases no válidas).
 */
export const CLASES_RECURSO_OPCIONES: OpcionSeleccion[] = [
  // §15 · Consumo ligero primero (repuesto/insumo) por ser el caso frecuente.
  { valor: "repuesto", etiqueta: "Repuesto" },
  { valor: "insumo", etiqueta: "Insumo" },
  { valor: "herramienta", etiqueta: "Herramienta" },
  { valor: "material", etiqueta: "Material" },
  { valor: "epp", etiqueta: "EPP" },
  { valor: "vehiculo", etiqueta: "Vehículo" },
  { valor: "equipo-auxiliar", etiqueta: "Equipo auxiliar" },
];

/**
 * Registro de un recurso. Alineado EXACTAMENTE con el comando
 * `modulo.ordenes.registrar-recurso`: `clase` (enum) + `referenciaId`
 * obligatorios; `descripcion/cantidad/unidad` opcionales.
 */
export function plantillaRecurso(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.recurso",
    titulo: "Registrar recurso",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "clase", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: CLASES_RECURSO_OPCIONES }),
          campo({ clave: "referenciaId", tipo: "texto", etiqueta: "Referencia (SKU/código)", obligatorio: true, ayuda: "Identificador del repuesto/insumo/material en el catálogo o inventario. Para consumo ligero puede ser un código libre; NO exige inventario.", restricciones: { longitudMin: 1, longitudMax: 120 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 200 } }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", restricciones: { minimo: 0 } }),
          campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad" }),
          // §15 · Consumo ligero: costo/proveedor/observación opcionales. El
          // costo es dinero string (frontera estricta en el backend, sin float).
          campo({ clave: "costo", tipo: "texto", etiqueta: "Costo (opcional)", ayuda: "Importe total del consumo, p.ej. 1200.50. No exige inventario.", restricciones: { longitudMax: 20 } }),
          campo({ clave: "proveedorId", tipo: "texto", etiqueta: "Proveedor (opcional)", restricciones: { longitudMax: 160 } }),
          campo({ clave: "observacion", tipo: "texto", etiqueta: "Observación (opcional)", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Categorías documentales de evidencias (fotos/videos/PDF/procedimientos/…). */
export const CATEGORIAS_EVIDENCIA: OpcionSeleccion[] = [
  { valor: "fotografia", etiqueta: "Fotografía" },
  { valor: "video", etiqueta: "Video" },
  { valor: "pdf", etiqueta: "PDF" },
  { valor: "procedimiento", etiqueta: "Procedimiento" },
  { valor: "manual", etiqueta: "Manual" },
  { valor: "certificado", etiqueta: "Certificado" },
  { valor: "plano", etiqueta: "Plano" },
  { valor: "diagrama", etiqueta: "Diagrama" },
  { valor: "firma", etiqueta: "Firma" },
];

/** Registro de una evidencia/adjunto (categoría + archivo). */
export function plantillaEvidencia(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.evidencia",
    titulo: "Agregar evidencia",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", obligatorio: true, opciones: CATEGORIAS_EVIDENCIA }),
          campo({ clave: "archivo", tipo: "adjunto", etiqueta: "Archivo", obligatorio: true, ayuda: "El binario no se sube: sólo se registran metadatos y el hash sha256 (Attachment Service, referencia-only)." }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Planificación / reprogramación (ventanas + fechas). */
export function plantillaPlanificacion(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.planificacion",
    titulo: "Planificar",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "inicioPlanificado", tipo: "fechaHora", etiqueta: "Inicio planificado", obligatorio: true }),
          campo({ clave: "finPlanificado", tipo: "fechaHora", etiqueta: "Fin planificado" }),
          campo({ clave: "ventanaInicio", tipo: "fechaHora", etiqueta: "Ventana: inicio" }),
          campo({ clave: "ventanaFin", tipo: "fechaHora", etiqueta: "Ventana: fin" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Asignación de responsable/supervisor. */
export function plantillaAsignacion(tecnicos: OpcionSeleccion[], supervisores: OpcionSeleccion[]): DefinicionFormulario {
  const usarTexto = tecnicos.length === 0;
  const def: DefinicionFormulario = {
    clave: "orden.asignacion",
    titulo: "Asignar",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          usarTexto
            ? campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable (técnico)" })
            : campo({ clave: "responsable", tipo: "select", etiqueta: "Responsable (técnico)", opciones: tecnicos }),
          supervisores.length === 0
            ? campo({ clave: "supervisor", tipo: "texto", etiqueta: "Supervisor" })
            : campo({ clave: "supervisor", tipo: "select", etiqueta: "Supervisor", opciones: supervisores }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/**
 * Referencia a una plantilla de Dynamic Forms para asociarla a la OT
 * (formulario o checklist). El backend VERIFICA la referencia contra el runtime
 * real de Dynamic Forms; aquí sólo se capturan clave/versión/etiqueta.
 */
export function plantillaAsociarPlantilla(clase: "formulario" | "checklist"): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: `orden.asociar.${clase}`,
    titulo: clase === "formulario" ? "Asociar formulario" : "Asociar checklist",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Referencia de plantilla",
        hijos: [
          campo({ clave: "clave", tipo: "texto", etiqueta: "Clave de la plantilla", obligatorio: true, ayuda: "Clave publicada en Dynamic Forms.", restricciones: { longitudMin: 1, longitudMax: 120 } }),
          campo({ clave: "version", tipo: "numero", etiqueta: "Versión", obligatorio: true, restricciones: { minimo: 1 } }),
          campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta (opcional)", restricciones: { longitudMax: 120 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Entrada manual de escaneo de QR (código o URL). */
export function plantillaEscaneoOrden(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "orden.escaneo.manual",
    titulo: "Entrada manual",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [campo({ clave: "codigo", tipo: "texto", etiqueta: "Código o URL del QR", obligatorio: true, restricciones: { longitudMin: 1 } })],
      },
    ],
  };
  return validarDefinicion(def);
}
