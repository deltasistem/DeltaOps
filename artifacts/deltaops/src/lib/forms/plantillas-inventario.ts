/**
 * DGP-011.3 · Plantillas de formularios de Inventario (Dynamic Forms Engine).
 *
 * TODA la captura de la experiencia de Inventario se declara aquí como
 * `DefinicionFormulario` y la pinta el renderer genérico `FormularioDinamico`.
 * No hay controles construidos a mano fuera del renderer. Importa SOLO de
 * `@workspace/dynamic-forms/definicion` (seguro para el bundle del navegador).
 * Todos los títulos son no vacíos (evita DEF_VACIA).
 */
import {
  validarDefinicion,
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import { MODOS_TRAZABILIDAD, TIPOS_AJUSTE, MOTIVOS_AJUSTE, TIPOS_MOVIMIENTO, TIPOS_CONTEO } from "../inventario/constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

const opc = (arr: readonly { valor: string; etiqueta: string }[]): OpcionSeleccion[] =>
  arr.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

/* ------------------------------ Creación item --------------------------- */

export const PASOS_ITEM: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "identificacion", etiqueta: "Identificación", campos: ["sku", "nombre", "descripcion", "tipoItem"] },
  { clave: "clasificacion", etiqueta: "Clasificación", campos: ["categoria", "familia", "subcategoria", "marca"] },
  { clave: "unidad", etiqueta: "Unidad y trazabilidad", campos: ["unidadClave", "unidadEtiqueta", "modoTrazabilidad", "controlaVencimiento"] },
  { clave: "reposicion", etiqueta: "Reposición", campos: ["minimo", "maximo", "puntoReorden", "leadTimeDias"] },
];

export interface OpcionesItem {
  tipos?: OpcionSeleccion[];
  categorias?: OpcionSeleccion[];
  familias?: OpcionSeleccion[];
}

/** Wizard de creación de un item de inventario. */
export function plantillaItem(op: OpcionesItem = {}): DefinicionFormulario {
  const campoTipo = (op.tipos?.length)
    ? campo({ clave: "tipoItem", tipo: "select", etiqueta: "Tipo de item", obligatorio: true, opciones: op.tipos })
    : campo({ clave: "tipoItem", tipo: "texto", etiqueta: "Tipo de item", obligatorio: true, ayuda: "Ej.: herramienta, lubricante, filtro, EPP.", restricciones: { longitudMin: 1, longitudMax: 60 } });
  const def: DefinicionFormulario = {
    clave: "inventario.item.creacion",
    titulo: "Nuevo item de inventario",
    descripcion: "Alta de un item de inventario",
    nodos: [
      {
        clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nuevo item",
        pasos: [
          {
            clave: "identificacion", etiqueta: "Identificación",
            hijos: [
              campo({ clave: "sku", tipo: "texto", etiqueta: "SKU", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } }),
              campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
              campoTipo,
            ],
          },
          {
            clave: "clasificacion", etiqueta: "Clasificación",
            hijos: [
              (op.categorias?.length)
                ? campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", opciones: op.categorias })
                : campo({ clave: "categoria", tipo: "texto", etiqueta: "Categoría", restricciones: { longitudMax: 60 } }),
              campo({ clave: "familia", tipo: "texto", etiqueta: "Familia", restricciones: { longitudMax: 60 } }),
              campo({ clave: "subcategoria", tipo: "texto", etiqueta: "Subcategoría", restricciones: { longitudMax: 60 } }),
              campo({ clave: "marca", tipo: "texto", etiqueta: "Marca", restricciones: { longitudMax: 60 } }),
            ],
          },
          {
            clave: "unidad", etiqueta: "Unidad y trazabilidad",
            hijos: [
              campo({ clave: "unidadClave", tipo: "texto", etiqueta: "Unidad base (clave)", obligatorio: true, ayuda: "Ej.: u, kg, L, m.", restricciones: { longitudMin: 1, longitudMax: 20 } }),
              campo({ clave: "unidadEtiqueta", tipo: "texto", etiqueta: "Unidad base (etiqueta)", restricciones: { longitudMax: 40 } }),
              campo({ clave: "modoTrazabilidad", tipo: "select", etiqueta: "Modo de trazabilidad", obligatorio: true, opciones: opc(MODOS_TRAZABILIDAD) }),
              campo({ clave: "controlaVencimiento", tipo: "booleano", etiqueta: "Controla vencimiento" }),
            ],
          },
          {
            clave: "reposicion", etiqueta: "Reposición",
            hijos: [
              campo({ clave: "minimo", tipo: "decimal", etiqueta: "Stock mínimo", restricciones: { minimo: 0 } }),
              campo({ clave: "maximo", tipo: "decimal", etiqueta: "Stock máximo", restricciones: { minimo: 0 } }),
              campo({ clave: "puntoReorden", tipo: "decimal", etiqueta: "Punto de reorden", restricciones: { minimo: 0 } }),
              campo({ clave: "leadTimeDias", tipo: "numero", etiqueta: "Lead time (días)", restricciones: { minimo: 0 } }),
            ],
          },
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Edición de un item (campos editables básicos). */
export function plantillaEdicionItem(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.item.edicion",
    titulo: "Editar item",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
          campo({ clave: "estado", tipo: "texto", etiqueta: "Estado", ayuda: "Ej.: ACTIVO, INACTIVO." }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Filtros del listado de inventario. */
export function plantillaFiltrosItems(estados: OpcionSeleccion[], tipos: OpcionSeleccion[], categorias: OpcionSeleccion[]): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.filtros",
    titulo: "Filtros de inventario",
    nodos: [
      {
        clase: "contenedor", clave: "f", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "tipoItem", tipo: "select", etiqueta: "Tipo", opciones: tipos }),
          campo({ clave: "categoria", tipo: "select", etiqueta: "Categoría", opciones: categorias }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* ------------------------------ Movimiento ------------------------------ */

/** Registro de un movimiento de stock. */
export function plantillaMovimiento(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.movimiento",
    titulo: "Registrar movimiento",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "ubicacionId", tipo: "texto", etiqueta: "Ubicación", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_MOVIMIENTO) }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
          campo({ clave: "loteId", tipo: "texto", etiqueta: "Lote (opcional)" }),
          campo({ clave: "serieId", tipo: "texto", etiqueta: "Serie (opcional)" }),
          campo({ clave: "referencia", tipo: "texto", etiqueta: "Referencia (opcional)", restricciones: { longitudMax: 120 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* -------------------------------- Reserva ------------------------------- */

/** Creación de una reserva. */
export function plantillaReserva(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.reserva",
    titulo: "Crear reserva",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "ubicacionId", tipo: "texto", etiqueta: "Ubicación", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
          campo({ clave: "demandaTipo", tipo: "texto", etiqueta: "Tipo de demanda", obligatorio: true, ayuda: "Ej.: orden, proyecto.", restricciones: { longitudMin: 1, longitudMax: 40 } }),
          campo({ clave: "demandaId", tipo: "texto", etiqueta: "Id de la demanda", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 120 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Motivo de liberación/consumo de una reserva. */
export function plantillaLiberarReserva(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.reserva.liberar",
    titulo: "Liberar o consumir reserva",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", ayuda: "Ej.: liberacion, consumo.", restricciones: { longitudMax: 200 } })],
      },
    ],
  };
  return validarDefinicion(def);
}

/* ----------------------------- Transferencia ---------------------------- */

/** Creación de una transferencia (origen/destino + una línea). */
export function plantillaTransferencia(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.transferencia",
    titulo: "Crear transferencia",
    nodos: [
      {
        clase: "contenedor", clave: "origen", tipo: "seccion", etiqueta: "Origen",
        hijos: [
          campo({ clave: "origenBodega", tipo: "texto", etiqueta: "Bodega origen", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "origenUbicacion", tipo: "texto", etiqueta: "Ubicación origen", obligatorio: true, restricciones: { longitudMin: 1 } }),
        ],
      },
      {
        clase: "contenedor", clave: "destino", tipo: "seccion", etiqueta: "Destino",
        hijos: [
          campo({ clave: "destinoBodega", tipo: "texto", etiqueta: "Bodega destino", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "destinoUbicacion", tipo: "texto", etiqueta: "Ubicación destino", obligatorio: true, restricciones: { longitudMin: 1 } }),
        ],
      },
      {
        clase: "contenedor", clave: "linea", tipo: "seccion", etiqueta: "Línea",
        hijos: [
          campo({ clave: "itemId", tipo: "texto", etiqueta: "Item", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
          campo({ clave: "loteCodigo", tipo: "texto", etiqueta: "Lote (opcional)" }),
          campo({ clave: "serieNumero", tipo: "texto", etiqueta: "Serie (opcional)" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* -------------------------------- Ajuste -------------------------------- */

/** Registro de un ajuste (positivo/negativo + motivo). */
export function plantillaAjuste(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.ajuste",
    titulo: "Registrar ajuste",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "ubicacionId", tipo: "texto", etiqueta: "Ubicación", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_AJUSTE) }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
          campo({ clave: "motivo", tipo: "select", etiqueta: "Motivo", obligatorio: true, opciones: opc(MOTIVOS_AJUSTE) }),
          campo({ clave: "loteId", tipo: "texto", etiqueta: "Lote (opcional)" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* -------------------------------- Conteo -------------------------------- */

/** Programación de un conteo. */
export function plantillaConteo(items: OpcionSeleccion[] = []): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.conteo",
    titulo: "Programar conteo",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo de conteo", obligatorio: true, opciones: opc(TIPOS_CONTEO) }),
          campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega (alcance)", restricciones: { longitudMin: 0 } }),
          campo({ clave: "items", tipo: "multiSelect", etiqueta: "Items a contar", obligatorio: true, opciones: items }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Registro de una lectura de conteo (existencia + cantidad contada). */
export function plantillaRegistrarConteo(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.conteo.registrar",
    titulo: "Registrar conteo",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "inventarioId", tipo: "texto", etiqueta: "Existencia (inventario)", obligatorio: true, restricciones: { longitudMin: 1 } }),
          campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad contada", obligatorio: true, restricciones: { minimo: 0 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* ----------------------------- Lote / serie ----------------------------- */

/** Creación de un lote. */
export function plantillaLote(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.lote",
    titulo: "Crear lote",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "codigo", tipo: "texto", etiqueta: "Código de lote", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 80 } }),
          campo({ clave: "vencimiento", tipo: "fecha", etiqueta: "Vencimiento (opcional)" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Registro de una serie. */
export function plantillaSerie(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.serie",
    titulo: "Registrar serie",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "numero", tipo: "texto", etiqueta: "Número de serie", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 120 } }),
          campo({ clave: "loteId", tipo: "texto", etiqueta: "Lote (opcional)" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* --------------------------- Bodega / ubicación ------------------------- */

/** Creación de una bodega. */
export function plantillaBodega(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.bodega",
    titulo: "Crear bodega",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "codigo", tipo: "texto", etiqueta: "Código", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 40 } }),
          campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 120 } }),
          campo({ clave: "tipo", tipo: "texto", etiqueta: "Tipo", obligatorio: true, ayuda: "Ej.: central, obra, transito.", restricciones: { longitudMin: 1, longitudMax: 40 } }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Creación de una ubicación. */
export function plantillaUbicacion(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.ubicacion",
    titulo: "Crear ubicación",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "nivel", tipo: "texto", etiqueta: "Nivel", obligatorio: true, ayuda: "Ej.: zona, pasillo, estante, posición.", restricciones: { longitudMin: 1, longitudMax: 40 } }),
          campo({ clave: "valor", tipo: "texto", etiqueta: "Valor", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 80 } }),
          campo({ clave: "padreId", tipo: "texto", etiqueta: "Ubicación padre (opcional)" }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/* ------------------------------ Comentario ------------------------------ */

/** Comentario (platform.comment). */
export function plantillaComentario(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.comentario",
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

/** Adjunto referencia-only (categoría + archivo). */
export function plantillaAdjunto(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.adjunto",
    titulo: "Agregar adjunto",
    nodos: [
      {
        clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Campos",
        hijos: [
          campo({ clave: "categoria", tipo: "texto", etiqueta: "Categoría", obligatorio: true, ayuda: "Ej.: factura, ficha técnica, foto." }),
          campo({ clave: "archivo", tipo: "adjunto", etiqueta: "Archivo", obligatorio: true, ayuda: "El binario no se sube: sólo metadatos y hash (Attachment Service, referencia-only)." }),
        ],
      },
    ],
  };
  return validarDefinicion(def);
}

/** Entrada manual de escaneo de QR (código o URL). */
export function plantillaEscaneoInventario(): DefinicionFormulario {
  const def: DefinicionFormulario = {
    clave: "inventario.escaneo.manual",
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
