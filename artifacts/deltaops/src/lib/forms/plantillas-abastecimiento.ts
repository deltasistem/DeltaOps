/**
 * DGP-013 · Plantillas de formularios de Abastecimiento (Dynamic Forms Engine).
 *
 * TODA la captura de la experiencia de Abastecimiento se declara aquí como
 * `DefinicionFormulario` y la pinta el renderer genérico `FormularioDinamico`.
 * No hay controles construidos a mano fuera del renderer. Importa SÓLO de
 * `@workspace/dynamic-forms/definicion` (seguro para el bundle del navegador).
 * Todos los títulos son no vacíos (evita DEF_VACIA). Las líneas (solicitud,
 * cotización, OC, recepción) se capturan como `tabla` declarativa.
 */
import {
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import {
  TIPOS_ARTICULO,
  METODOS_VALORACION,
  PRIORIDADES,
  ORIGENES_SOLICITUD,
} from "../abastecimiento/constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

const opc = (arr: readonly { valor: string; etiqueta: string }[]): OpcionSeleccion[] =>
  arr.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

function selectOTexto(clave: string, etiqueta: string, opciones: OpcionSeleccion[] | undefined, obligatorio: boolean, ayuda?: string): CampoFormulario {
  return opciones?.length
    ? campo({ clave, tipo: "select", etiqueta, obligatorio, opciones, ayuda })
    : campo({ clave, tipo: "texto", etiqueta, obligatorio, ayuda, restricciones: { longitudMin: obligatorio ? 1 : 0, longitudMax: 80 } });
}

/* --------------------------- Filtros de listado ------------------------- */

export function plantillaFiltrosArticulos(tipos?: OpcionSeleccion[], familias?: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "abastecimiento.filtros-articulos",
    titulo: "Filtros de artículos",
    descripcion: "Filtra el catálogo de artículos",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
      hijos: [
        campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", opciones: opc(TIPOS_ARTICULO).concat(tipos ?? []) }),
        campo({ clave: "familia", tipo: "select", etiqueta: "Familia", opciones: familias ?? [] }),
      ],
    }],
  };
}

export function plantillaFiltrosProveedores(tipos?: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "abastecimiento.filtros-proveedores",
    titulo: "Filtros de proveedores",
    descripcion: "Filtra el directorio de proveedores",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
      hijos: [campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo de proveedor", opciones: tipos ?? [] })],
    }],
  };
}

export function plantillaFiltrosSolicitudes(estados: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "abastecimiento.filtros-solicitudes",
    titulo: "Filtros de solicitudes",
    descripcion: "Filtra las solicitudes de compra",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
      hijos: [
        campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
        campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", opciones: opc(PRIORIDADES) }),
      ],
    }],
  };
}

export function plantillaFiltrosOrdenes(estados: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "abastecimiento.filtros-ordenes",
    titulo: "Filtros de órdenes de compra",
    descripcion: "Filtra las órdenes de compra",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
      hijos: [campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados })],
    }],
  };
}

/* ------------------------------- Artículo ------------------------------- */

export interface OpcionesArticulo {
  tipos?: OpcionSeleccion[];
  familias?: OpcionSeleccion[];
  unidades?: OpcionSeleccion[];
  metodosValoracion?: OpcionSeleccion[];
  monedas?: OpcionSeleccion[];
}

export function plantillaArticulo(op: OpcionesArticulo = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.articulo",
    titulo: "Nuevo artículo",
    descripcion: "Alta declarativa de un artículo del catálogo",
    nodos: [{
      clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nuevo artículo",
      pasos: [
        {
          clave: "generales", etiqueta: "Datos generales",
          hijos: [
            campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
            campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
            selectOTexto("tipo", "Tipo", op.tipos?.length ? op.tipos : opc(TIPOS_ARTICULO), true, "Se toma del catálogo de tenant."),
            selectOTexto("familia", "Familia", op.familias, false),
            selectOTexto("unidad", "Unidad de medida", op.unidades, true),
          ],
        },
        {
          clave: "costos", etiqueta: "Valoración y costos",
          hijos: [
            selectOTexto("metodoValoracion", "Método de valoración", op.metodosValoracion?.length ? op.metodosValoracion : opc(METODOS_VALORACION), true),
            selectOTexto("moneda", "Moneda", op.monedas, true),
            campo({ clave: "costoEstandar", tipo: "decimal", etiqueta: "Costo estándar", restricciones: { minimo: 0 }, ayuda: "Opcional." }),
            campo({ clave: "toleranciaSobreRecepcion", tipo: "decimal", etiqueta: "Tolerancia sobre-recepción (0..1)", restricciones: { minimo: 0, maximo: 1 }, ayuda: "Fracción admitida por encima de lo pedido." }),
          ],
        },
        {
          clave: "integracion", etiqueta: "Integración",
          hijos: [
            campo({ clave: "inventarioItemId", tipo: "texto", etiqueta: "Item de inventario vinculado (id)", ayuda: "Opcional: enlaza el artículo con un item de inventario existente." }),
          ],
        },
      ],
    }],
  };
}

/** Formulario de edición del artículo (subconjunto editable + versión). */
export function plantillaEditarArticulo(op: OpcionesArticulo = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.editar-articulo",
    titulo: "Editar artículo",
    descripcion: "Edita los datos del artículo (control de versión optimista)",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Datos",
      hijos: [
        campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", restricciones: { longitudMax: 200 } }),
        campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
        selectOTexto("familia", "Familia", op.familias, false),
        selectOTexto("unidad", "Unidad de medida", op.unidades, false),
        selectOTexto("metodoValoracion", "Método de valoración", op.metodosValoracion?.length ? op.metodosValoracion : opc(METODOS_VALORACION), false),
        campo({ clave: "costoEstandar", tipo: "decimal", etiqueta: "Costo estándar", restricciones: { minimo: 0 } }),
        campo({ clave: "toleranciaSobreRecepcion", tipo: "decimal", etiqueta: "Tolerancia sobre-recepción (0..1)", restricciones: { minimo: 0, maximo: 1 } }),
        campo({ clave: "inventarioItemId", tipo: "texto", etiqueta: "Item de inventario vinculado (id)" }),
      ],
    }],
  };
}

/* ------------------------------- Proveedor ------------------------------ */

export interface OpcionesProveedor {
  tipos?: OpcionSeleccion[];
  monedas?: OpcionSeleccion[];
}

function pasosProveedor(op: OpcionesProveedor) {
  return [
    {
      clave: "comercial", etiqueta: "Datos comerciales",
      hijos: [
        campo({ clave: "razonSocial", tipo: "texto", etiqueta: "Razón social", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
        campo({ clave: "nombreComercial", tipo: "texto", etiqueta: "Nombre comercial", restricciones: { longitudMax: 200 } }),
        campo({ clave: "identificacionTributaria", tipo: "texto", etiqueta: "Identificación tributaria", restricciones: { longitudMax: 60 } }),
        selectOTexto("tipo", "Tipo de proveedor", op.tipos, true),
        selectOTexto("monedaPreferida", "Moneda preferida", op.monedas, false),
      ],
    },
    {
      clave: "contactos", etiqueta: "Contactos",
      hijos: [
        campo({
          clave: "contactos", tipo: "tabla", etiqueta: "Contactos",
          subcampos: [
            campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", restricciones: { longitudMax: 120 } }),
            campo({ clave: "cargo", tipo: "texto", etiqueta: "Cargo", restricciones: { longitudMax: 80 } }),
            campo({ clave: "email", tipo: "texto", etiqueta: "Email", restricciones: { longitudMax: 120 } }),
            campo({ clave: "telefono", tipo: "texto", etiqueta: "Teléfono", restricciones: { longitudMax: 40 } }),
          ],
        }),
      ],
    },
    {
      clave: "certificaciones", etiqueta: "Certificaciones y SLA",
      hijos: [
        campo({
          clave: "certificaciones", tipo: "tabla", etiqueta: "Certificaciones",
          subcampos: [
            campo({ clave: "nombre", tipo: "texto", etiqueta: "Certificación", restricciones: { longitudMax: 120 } }),
            campo({ clave: "emisor", tipo: "texto", etiqueta: "Emisor", restricciones: { longitudMax: 120 } }),
            campo({ clave: "vigenteHasta", tipo: "fecha", etiqueta: "Vigente hasta" }),
          ],
        }),
        campo({ clave: "slaTiempoRespuestaHoras", tipo: "numero", etiqueta: "SLA · tiempo de respuesta (h)", restricciones: { minimo: 0 } }),
        campo({ clave: "slaPlazoEntregaDias", tipo: "numero", etiqueta: "SLA · plazo de entrega (días)", restricciones: { minimo: 0 } }),
        campo({ clave: "slaNivelServicio", tipo: "decimal", etiqueta: "SLA · nivel de servicio (0..1)", restricciones: { minimo: 0, maximo: 1 } }),
      ],
    },
  ];
}

export function plantillaProveedor(op: OpcionesProveedor = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.proveedor",
    titulo: "Nuevo proveedor",
    descripcion: "Alta declarativa de un proveedor",
    nodos: [{ clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nuevo proveedor", pasos: pasosProveedor(op) }],
  };
}

export function plantillaEditarProveedor(op: OpcionesProveedor = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.editar-proveedor",
    titulo: "Editar proveedor",
    descripcion: "Edita los datos del proveedor (control de versión optimista)",
    nodos: [{ clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Editar proveedor", pasos: pasosProveedor(op) }],
  };
}

/** Calificación multi-criterio del proveedor (0..5). */
export function plantillaCalificarProveedor(): DefinicionFormulario {
  const criterio = (clave: string, etiqueta: string) =>
    campo({ clave, tipo: "decimal", etiqueta, obligatorio: true, restricciones: { minimo: 0, maximo: 5 } });
  return {
    clave: "abastecimiento.calificar",
    titulo: "Calificar proveedor",
    descripcion: "Registra una evaluación de desempeño (0 a 5 por criterio)",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Criterios",
      hijos: [
        criterio("calidad", "Calidad"),
        criterio("tiempo", "Cumplimiento de tiempos"),
        criterio("precio", "Precio"),
        criterio("servicio", "Servicio"),
        campo({ clave: "nota", tipo: "texto", etiqueta: "Nota", restricciones: { longitudMax: 500 } }),
      ],
    }],
  };
}

/* ------------------------------- Solicitud ------------------------------ */

export interface OpcionesSolicitud {
  prioridades?: OpcionSeleccion[];
  origenes?: OpcionSeleccion[];
  unidades?: OpcionSeleccion[];
}

export function plantillaSolicitud(op: OpcionesSolicitud = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.solicitud",
    titulo: "Nueva solicitud de compra",
    descripcion: "Alta declarativa de una solicitud de compra",
    nodos: [{
      clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nueva solicitud",
      pasos: [
        {
          clave: "generales", etiqueta: "Datos generales",
          hijos: [
            campo({ clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
            campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
            selectOTexto("prioridad", "Prioridad", op.prioridades?.length ? op.prioridades : opc(PRIORIDADES), true),
          ],
        },
        {
          clave: "origen", etiqueta: "Origen de la necesidad",
          hijos: [
            campo({ clave: "origenTipo", tipo: "select", etiqueta: "Origen", obligatorio: true, opciones: op.origenes?.length ? op.origenes : opc(ORIGENES_SOLICITUD), ayuda: "De dónde nace la necesidad (inventario, orden, plan o usuario)." }),
            campo({ clave: "origenReferenciaTipo", tipo: "texto", etiqueta: "Tipo de referencia", restricciones: { longitudMax: 40 }, ayuda: "Opcional: p. ej. item, orden, plan." }),
            campo({ clave: "origenReferenciaId", tipo: "texto", etiqueta: "Id de referencia", restricciones: { longitudMax: 120 }, ayuda: "Opcional: id de la entidad de origen (crea un deep link)." }),
            campo({ clave: "origenEtiqueta", tipo: "texto", etiqueta: "Etiqueta", restricciones: { longitudMax: 120 } }),
          ],
        },
        {
          clave: "lineas", etiqueta: "Líneas",
          hijos: [
            campo({
              clave: "lineas", tipo: "tabla", etiqueta: "Líneas de la solicitud", obligatorio: true,
              ayuda: "Cada línea describe un requerimiento. Vincula un artículo del catálogo por id si aplica.",
              subcampos: [
                campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 300 } }),
                campo({ clave: "articuloId", tipo: "texto", etiqueta: "Artículo (id)" }),
                campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
                selectOTexto("unidad", "Unidad", op.unidades, true),
                campo({ clave: "notas", tipo: "texto", etiqueta: "Notas", restricciones: { longitudMax: 300 } }),
              ],
            }),
          ],
        },
      ],
    }],
  };
}

/* ------------------------------ Cotización ------------------------------ */

export interface OpcionesCotizacion {
  proveedores?: OpcionSeleccion[];
  monedas?: OpcionSeleccion[];
  unidades?: OpcionSeleccion[];
}

export function plantillaCotizacion(op: OpcionesCotizacion = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.cotizacion",
    titulo: "Registrar cotización",
    descripcion: "Registra la oferta de un proveedor para la solicitud",
    nodos: [{
      clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nueva cotización",
      pasos: [
        {
          clave: "cabecera", etiqueta: "Cabecera",
          hijos: [
            selectOTexto("proveedorId", "Proveedor", op.proveedores, true),
            selectOTexto("moneda", "Moneda", op.monedas, true),
            campo({ clave: "condicionesPago", tipo: "texto", etiqueta: "Condiciones de pago", restricciones: { longitudMax: 200 } }),
            campo({ clave: "vigenteHasta", tipo: "fecha", etiqueta: "Vigente hasta" }),
          ],
        },
        {
          clave: "lineas", etiqueta: "Líneas cotizadas",
          hijos: [
            campo({
              clave: "lineas", tipo: "tabla", etiqueta: "Líneas de la cotización", obligatorio: true,
              subcampos: [
                campo({ clave: "numeroLineaSolicitud", tipo: "numero", etiqueta: "N.º línea solicitud", restricciones: { minimo: 1 } }),
                campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 300 } }),
                campo({ clave: "articuloId", tipo: "texto", etiqueta: "Artículo (id)" }),
                campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
                selectOTexto("unidad", "Unidad", op.unidades, true),
                campo({ clave: "precioUnitario", tipo: "decimal", etiqueta: "Precio unitario", obligatorio: true, restricciones: { minimo: 0 } }),
                campo({ clave: "plazoEntregaDias", tipo: "numero", etiqueta: "Plazo entrega (días)", restricciones: { minimo: 0 } }),
              ],
            }),
          ],
        },
      ],
    }],
  };
}

/* --------------------------- Orden de compra ---------------------------- */

export interface OpcionesOC {
  proveedores?: OpcionSeleccion[];
  monedas?: OpcionSeleccion[];
  unidades?: OpcionSeleccion[];
}

export function plantillaOrdenCompra(op: OpcionesOC = {}): DefinicionFormulario {
  return {
    clave: "abastecimiento.orden-compra",
    titulo: "Nueva orden de compra",
    descripcion: "Alta declarativa de una orden de compra",
    nodos: [{
      clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nueva orden de compra",
      pasos: [
        {
          clave: "cabecera", etiqueta: "Cabecera",
          hijos: [
            selectOTexto("proveedorId", "Proveedor", op.proveedores, true),
            selectOTexto("moneda", "Moneda", op.monedas, true),
            campo({ clave: "solicitudId", tipo: "texto", etiqueta: "Solicitud de origen (id)" }),
            campo({ clave: "cotizacionId", tipo: "texto", etiqueta: "Cotización seleccionada (id)" }),
            campo({ clave: "condicionesPago", tipo: "texto", etiqueta: "Condiciones de pago", restricciones: { longitudMax: 200 } }),
            campo({ clave: "condicionesEntrega", tipo: "texto", etiqueta: "Condiciones de entrega", restricciones: { longitudMax: 200 } }),
          ],
        },
        {
          clave: "lineas", etiqueta: "Líneas",
          hijos: [
            campo({
              clave: "lineas", tipo: "tabla", etiqueta: "Líneas de la orden", obligatorio: true,
              subcampos: [
                campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 300 } }),
                campo({ clave: "articuloId", tipo: "texto", etiqueta: "Artículo (id)" }),
                campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", obligatorio: true, restricciones: { minimo: 0 } }),
                selectOTexto("unidad", "Unidad", op.unidades, true),
                campo({ clave: "precioUnitario", tipo: "decimal", etiqueta: "Precio unitario", obligatorio: true, restricciones: { minimo: 0 } }),
                campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega destino (id)" }),
              ],
            }),
          ],
        },
      ],
    }],
  };
}

/* ------------------------------ Recepción ------------------------------- */

export interface LineaRecepcionPlantilla {
  numeroLineaOC: number;
  descripcion: string;
  unidad?: string;
}

/**
 * Recepción por líneas de una OC concreta. Se pre-carga una fila por cada línea
 * pendiente de la OC (numeroLineaOC fijo); el operario registra cantidad
 * recibida (parcial o total) y novedades.
 */
export function plantillaRecepcion(lineasOC: LineaRecepcionPlantilla[], novedades?: OpcionSeleccion[]): DefinicionFormulario {
  const filasDefecto = lineasOC.map((l) => ({
    numeroLineaOC: l.numeroLineaOC,
    descripcion: l.descripcion,
    unidad: l.unidad ?? "unidad",
    cantidad: 0,
  }));
  return {
    clave: "abastecimiento.recepcion",
    titulo: "Registrar recepción",
    descripcion: "Registra la recepción física por líneas (parcial o total)",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Recepción",
      hijos: [
        campo({ clave: "nota", tipo: "texto", etiqueta: "Nota de recepción", restricciones: { longitudMax: 500 } }),
        campo({
          clave: "lineas", tipo: "tabla", etiqueta: "Líneas recibidas", obligatorio: true,
          valorDefecto: filasDefecto,
          ayuda: "Ingresa la cantidad recibida por línea (0 = no recibida en este acto). Registra novedades si aplica.",
          subcampos: [
            campo({ clave: "numeroLineaOC", tipo: "numero", etiqueta: "N.º línea OC", obligatorio: true, restricciones: { minimo: 1 } }),
            campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción" }),
            campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad recibida", obligatorio: true, restricciones: { minimo: 0 } }),
            campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad" }),
            novedades?.length
              ? campo({ clave: "novedad", tipo: "select", etiqueta: "Novedad", opciones: novedades })
              : campo({ clave: "novedad", tipo: "texto", etiqueta: "Novedad", restricciones: { longitudMax: 200 } }),
            campo({ clave: "bodegaId", tipo: "texto", etiqueta: "Bodega (id)" }),
            campo({ clave: "lote", tipo: "texto", etiqueta: "Lote" }),
            campo({ clave: "serie", tipo: "texto", etiqueta: "Serie" }),
          ],
        }),
      ],
    }],
  };
}

/* -------------------- Selección de cotización (pesos) ------------------- */

export function plantillaSeleccionCotizacion(): DefinicionFormulario {
  return {
    clave: "abastecimiento.seleccion-cotizacion",
    titulo: "Ponderar comparación",
    descripcion: "Ajusta los pesos del ranking del comparador",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Pesos",
      hijos: [
        campo({ clave: "precio", tipo: "decimal", etiqueta: "Peso precio", restricciones: { minimo: 0 }, valorDefecto: 0.5 }),
        campo({ clave: "plazoEntrega", tipo: "decimal", etiqueta: "Peso plazo de entrega", restricciones: { minimo: 0 }, valorDefecto: 0.3 }),
        campo({ clave: "calificacion", tipo: "decimal", etiqueta: "Peso calificación", restricciones: { minimo: 0 }, valorDefecto: 0.2 }),
      ],
    }],
  };
}

/* ------------------------------- Catálogo ------------------------------- */

export function plantillaCatalogoUpsert(): DefinicionFormulario {
  return {
    clave: "abastecimiento.catalogo-upsert",
    titulo: "Entrada de catálogo",
    descripcion: "Crea o actualiza una entrada de catálogo de tenant",
    nodos: [{
      clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Entrada",
      hijos: [
        campo({ clave: "catalogo", tipo: "texto", etiqueta: "Catálogo", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } }),
        campo({ clave: "clave", tipo: "texto", etiqueta: "Clave", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } }),
        campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 120 } }),
        campo({ clave: "posicion", tipo: "numero", etiqueta: "Posición", restricciones: { minimo: 0 } }),
        campo({ clave: "padre", tipo: "texto", etiqueta: "Clave padre (jerarquía)", restricciones: { longitudMax: 60 } }),
      ],
    }],
  };
}
