/**
 * DGP-008.3 · Plantillas de formularios de Activos (Dynamic Forms Engine).
 *
 * Definiciones 100% declarativas (DefinicionFormulario) que el renderer genérico
 * interpreta. Cubren el wizard de alta (con pasos) y la edición. Las opciones de
 * catálogos se inyectan en tiempo de ejecución (ver `conCatalogos`).
 */
import {
  validarDefinicion,
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import type { MapaReglas } from "./tipos";
import type { NombreCatalogo } from "../activos/tipos";

/** Claves de campo por paso del wizard (para validación por paso). */
export const PASOS_WIZARD: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "identificacion", etiqueta: "Identificación", campos: ["codigoEmpresarial", "nombre", "descripcion"] },
  { clave: "clasificacion", etiqueta: "Clasificación", campos: ["tipo", "categoria", "familia", "subfamilia", "criticidad", "prioridad"] },
  { clave: "tecnica", etiqueta: "Información técnica", campos: ["fabricante", "modelo", "serie", "anio", "vidaUtil"] },
  { clave: "ubicacion", etiqueta: "Ubicación", campos: ["ubicacionId", "ubicacionEtiqueta"] },
  { clave: "responsables", etiqueta: "Responsables", campos: ["responsable", "supervisor", "centroCosto"] },
  { clave: "garantia", etiqueta: "Garantía", campos: ["fechaCompra", "fechaPuestaServicio", "proveedor", "garantiaMeses"] },
  { clave: "documentacion", etiqueta: "Documentación", campos: ["observaciones"] },
];

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

/** Construye la definición del wizard de alta con opciones de catálogo. */
export function plantillaAlta(
  opciones: Partial<Record<NombreCatalogo, OpcionSeleccion[]>> = {},
): DefinicionFormulario {
  const op = (c: NombreCatalogo): OpcionSeleccion[] => opciones[c] ?? [];
  const def: DefinicionFormulario = {
    clave: "activo.alta",
    titulo: "Alta de activo",
    descripcion: "Registro de un nuevo activo empresarial",
    nodos: [
      {
        clase: "contenedor",
        clave: "wiz",
        tipo: "wizard",
        etiqueta: "Alta de activo",
        pasos: [
          {
            clave: "identificacion",
            etiqueta: "Identificación",
            hijos: [
              campo({ clave: "codigoEmpresarial", tipo: "texto", etiqueta: "Código empresarial", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } }),
              campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 160 } }),
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 500 } }),
            ],
          },
          {
            clave: "clasificacion",
            etiqueta: "Clasificación",
            hijos: [
              campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: op("tipos") }),
              campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", obligatorio: true, opciones: op("categorias") }),
              campo({ clave: "familia", tipo: "select", etiqueta: "Familia", obligatorio: true, opciones: op("familias") }),
              campo({ clave: "subfamilia", tipo: "select", etiqueta: "Subfamilia", opciones: op("subfamilias") }),
              campo({ clave: "criticidad", tipo: "select", etiqueta: "Criticidad", opciones: op("criticidades") }),
              campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", opciones: op("prioridades") }),
            ],
          },
          {
            clave: "tecnica",
            etiqueta: "Información técnica",
            hijos: [
              campo({ clave: "fabricante", tipo: "select", etiqueta: "Fabricante", opciones: op("fabricantes") }),
              campo({ clave: "modelo", tipo: "select", etiqueta: "Modelo", opciones: op("modelos") }),
              campo({ clave: "serie", tipo: "texto", etiqueta: "Nº de serie" }),
              campo({ clave: "anio", tipo: "numero", etiqueta: "Año", restricciones: { minimo: 1900, maximo: 2100 } }),
              campo({ clave: "vidaUtil", tipo: "numero", etiqueta: "Vida útil (meses)", restricciones: { minimo: 0 } }),
            ],
          },
          {
            clave: "ubicacion",
            etiqueta: "Ubicación",
            hijos: [
              campo({ clave: "ubicacionId", tipo: "select", etiqueta: "Ubicación", opciones: op("ubicaciones") }),
              campo({ clave: "ubicacionEtiqueta", tipo: "texto", etiqueta: "Detalle de ubicación" }),
            ],
          },
          {
            clave: "responsables",
            etiqueta: "Responsables",
            hijos: [
              campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable" }),
              campo({ clave: "supervisor", tipo: "texto", etiqueta: "Supervisor" }),
              // §16 · Centro de costos: fuente de verdad en el activo (catálogo
              // autorizado `centros-costo`). Sólo se captura aquí (alta/edición),
              // NUNCA desde una OT.
              campo({ clave: "centroCosto", tipo: "select", etiqueta: "Centro de costos", opciones: op("centros-costo") }),
            ],
          },
          {
            clave: "garantia",
            etiqueta: "Garantía",
            hijos: [
              campo({ clave: "fechaCompra", tipo: "fecha", etiqueta: "Fecha de compra" }),
              campo({ clave: "fechaPuestaServicio", tipo: "fecha", etiqueta: "Puesta en servicio" }),
              campo({ clave: "proveedor", tipo: "select", etiqueta: "Proveedor", opciones: op("proveedores") }),
              campo({ clave: "garantiaMeses", tipo: "numero", etiqueta: "Garantía (meses)", restricciones: { minimo: 0 } }),
            ],
          },
          {
            clave: "documentacion",
            etiqueta: "Documentación",
            hijos: [
              campo({ clave: "observaciones", tipo: "texto", etiqueta: "Observaciones", restricciones: { longitudMax: 1000 } }),
            ],
          },
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Reglas condicionales del alta (ejemplo: subfamilia obligatoria si hay familia). */
export const REGLAS_ALTA: MapaReglas = {
  ubicacionEtiqueta: {
    campo: "ubicacionEtiqueta",
    obligatorioCuando: { campo: "ubicacionId", operador: "existe" },
  },
};

/** Definición de edición (subconjunto editable, sin wizard). */
export function plantillaEdicion(
  opciones: Partial<Record<NombreCatalogo, OpcionSeleccion[]>> = {},
): DefinicionFormulario {
  const op = (c: NombreCatalogo): OpcionSeleccion[] => opciones[c] ?? [];
  const def: DefinicionFormulario = {
    clave: "activo.edicion",
    titulo: "Editar activo",
    nodos: [
      {
        clase: "contenedor",
        clave: "datos",
        tipo: "seccion",
        etiqueta: "Datos generales",
        hijos: [
          campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMax: 160 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 500 } }),
          campo({ clave: "criticidad", tipo: "select", etiqueta: "Criticidad", opciones: op("criticidades") }),
          campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", opciones: op("prioridades") }),
          // §16 · Centro de costos editable SÓLO desde el activo (nunca la OT).
          campo({ clave: "centroCosto", tipo: "select", etiqueta: "Centro de costos", opciones: op("centros-costo") }),
          campo({ clave: "observaciones", tipo: "texto", etiqueta: "Observaciones", restricciones: { longitudMax: 1000 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

const CATEGORIAS_DOC: OpcionSeleccion[] = [
  { valor: "manual", etiqueta: "Manual" },
  { valor: "certificado", etiqueta: "Certificado" },
  { valor: "garantia", etiqueta: "Garantía" },
  { valor: "diagrama", etiqueta: "Diagrama" },
  { valor: "plano", etiqueta: "Plano" },
  { valor: "procedimiento", etiqueta: "Procedimiento" },
  { valor: "fotografia", etiqueta: "Fotografía" },
  { valor: "video", etiqueta: "Video" },
];

/** Definición del registro de adjunto (documentación): categoría + archivo. */
export function plantillaAdjunto(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.adjunto",
    titulo: "Registrar documentación",
    nodos: [
      {
        clase: "contenedor",
        clave: "meta",
        tipo: "seccion",
        etiqueta: "Metadatos del adjunto",
        hijos: [
          campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", obligatorio: true, opciones: CATEGORIAS_DOC }),
          campo({
            clave: "archivo",
            tipo: "adjunto",
            etiqueta: "Archivo",
            obligatorio: true,
            ayuda: "El binario no se sube: sólo se registran metadatos y el hash sha256.",
          }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Filtros del listado (campos independientes, sin obligatoriedad). */
export function plantillaFiltrosListado(
  estados: OpcionSeleccion[],
  opciones: Partial<Record<NombreCatalogo, OpcionSeleccion[]>> = {},
): DefinicionFormulario {
  const op = (c: NombreCatalogo): OpcionSeleccion[] => opciones[c] ?? [];
  const def: DefinicionFormulario = {
    clave: "activo.filtros",
    titulo: "Filtros",
    nodos: [
      {
        clase: "contenedor",
        clave: "f",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", opciones: op("tipos") }),
          campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", opciones: op("categorias") }),
          campo({ clave: "familia", tipo: "select", etiqueta: "Familia", opciones: op("familias") }),
          campo({ clave: "criticidad", tipo: "select", etiqueta: "Criticidad", opciones: op("criticidades") }),
          campo({ clave: "ubicacionId", tipo: "select", etiqueta: "Ubicación", opciones: op("ubicaciones") }),
          campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/**
 * DELTAOPS LITE-03 §4 · Filtros AVANZADOS del listado (bloque "Más filtros").
 * Complementa a los filtros PRIORITARIOS que la página de Activos expone como
 * controles destacados (Centro de costos, Estado, Tipo, Ubicación): aquí quedan
 * sólo los secundarios (categoría, familia, criticidad, responsable), colapsados
 * por defecto para reducir ruido sin perder capacidad. Mismo `filtros` de estado
 * que los prioritarios: no duplica campos con ellos.
 */
export function plantillaFiltrosAvanzados(
  opciones: Partial<Record<NombreCatalogo, OpcionSeleccion[]>> = {},
): DefinicionFormulario {
  const op = (c: NombreCatalogo): OpcionSeleccion[] => opciones[c] ?? [];
  const def: DefinicionFormulario = {
    clave: "activo.filtros.avanzados",
    titulo: "Más filtros",
    nodos: [
      {
        clase: "contenedor",
        clave: "f",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", opciones: op("categorias") }),
          campo({ clave: "familia", tipo: "select", etiqueta: "Familia", opciones: op("familias") }),
          campo({ clave: "criticidad", tipo: "select", etiqueta: "Criticidad", opciones: op("criticidades") }),
          campo({ clave: "responsable", tipo: "texto", etiqueta: "Responsable" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Filtros de la línea de tiempo. */
export function plantillaFiltrosTimeline(estados: OpcionSeleccion[]): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.timeline.filtros",
    titulo: "Filtros de cronología",
    nodos: [
      {
        clase: "contenedor",
        clave: "f",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "actor", tipo: "texto", etiqueta: "Actor" }),
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "entidadRelacionada", tipo: "texto", etiqueta: "Entidad relacionada" }),
          campo({ clave: "desde", tipo: "fecha", etiqueta: "Desde" }),
          campo({ clave: "hasta", tipo: "fecha", etiqueta: "Hasta" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Selector de tipo de etiqueta (QR activo; barcode/nfc preparados). */
export function plantillaTipoEtiqueta(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.etiqueta.tipo",
    titulo: "Etiqueta",
    nodos: [
      {
        clase: "contenedor",
        clave: "g",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({
            clave: "tipo",
            tipo: "select",
            etiqueta: "Tipo de etiqueta",
            opciones: [
              { valor: "qr", etiqueta: "QR" },
              { valor: "barcode", etiqueta: "Código de barras (preparado)" },
              { valor: "nfc", etiqueta: "NFC (preparado)" },
            ],
          }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Crear/editar comentario (un solo campo de texto largo). */
export function plantillaComentario(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.comentario",
    titulo: "Comentario",
    nodos: [
      {
        clase: "contenedor",
        clave: "g",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "texto", tipo: "texto", etiqueta: "Comentario", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 2000 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Crear relación: tipo (catálogo estático de tipos) + id de activo destino. */
export function plantillaRelacion(tipos: OpcionSeleccion[]): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.relacion",
    titulo: "Crear relación",
    nodos: [
      {
        clase: "contenedor",
        clave: "g",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo de relación", obligatorio: true, opciones: tipos }),
          campo({ clave: "destinoId", tipo: "texto", etiqueta: "Id del activo destino", obligatorio: true, restricciones: { longitudMin: 1 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Entrada manual de escaneo: código o URL del activo. */
export function plantillaEscaneoManual(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "activo.escaneo.manual",
    titulo: "Entrada manual",
    nodos: [
      {
        clase: "contenedor",
        clave: "g",
        tipo: "grupo",
        etiqueta: "Campos",
        hijos: [
          campo({ clave: "codigo", tipo: "texto", etiqueta: "Código o URL del activo", obligatorio: true, restricciones: { longitudMin: 1 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Textarea genérico: fuerza Textarea cuando la longitud máxima es grande. */
export const TEXTAREA_LARGO = 121;
