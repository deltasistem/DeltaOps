/**
 * DGP-014 · Plantillas de formularios del módulo preventivo (Dynamic Forms).
 *
 * TODA la captura de la experiencia preventiva se declara aquí como
 * `DefinicionFormulario` y la pinta el renderer genérico `FormularioDinamico`.
 * No hay controles a mano fuera del renderer. Importa SOLO de
 * `@workspace/dynamic-forms/definicion`. Los planes, activos, checklists y
 * repuestos se referencian por selección real (opciones inyectadas desde los
 * módulos existentes: modulo.planes, activos, forms/plantillas, inventario y
 * abastecimiento). Todos los títulos son no vacíos (evita DEF_VACIA).
 */
import {
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import {
  TIPOS_FRECUENCIA,
  ORIGENES_GENERACION,
  AMBITOS_SUSPENSION,
} from "../preventivo/constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}
const opc = (arr: readonly { valor: string; etiqueta: string }[]): OpcionSeleccion[] =>
  arr.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

/* --------------------------- Filtros del listado ------------------------ */

export function plantillaFiltrosProgramas(estados: OpcionSeleccion[], tipos: OpcionSeleccion[]): DefinicionFormulario {
  return {
    clave: "preventivo.filtros",
    titulo: "Filtros de programas",
    descripcion: "Filtra el listado de programas preventivos",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", opciones: tipos }),
        ],
      },
    ],
  };
}

/* ---------------------------- Wizard de programa ------------------------ */

export interface OpcionesPrograma {
  tipos?: OpcionSeleccion[];
  clasificaciones?: OpcionSeleccion[];
  padres?: OpcionSeleccion[];
  planes?: OpcionSeleccion[];
  activos?: OpcionSeleccion[];
}

/**
 * Wizard multi-paso de alta de un programa preventivo: datos generales
 * (catálogos de tenant), jerarquía (padre), planes referenciados (selección
 * real de modulo.planes), alcance de activos (selección real) y vigencia/SLA.
 */
export function plantillaPrograma(op: OpcionesPrograma = {}): DefinicionFormulario {
  const campoTipo = op.tipos?.length
    ? campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo de programa", obligatorio: true, opciones: op.tipos })
    : campo({ clave: "tipo", tipo: "texto", etiqueta: "Tipo de programa", obligatorio: true, ayuda: "Ej.: preventivo, predictivo, legal, lubricación.", restricciones: { longitudMin: 1, longitudMax: 60 } });
  const campoClasif = op.clasificaciones?.length
    ? campo({ clave: "clasificacion", tipo: "select", etiqueta: "Clasificación", opciones: op.clasificaciones })
    : campo({ clave: "clasificacion", tipo: "texto", etiqueta: "Clasificación", restricciones: { longitudMax: 60 } });
  const campoPadre = op.padres?.length
    ? campo({ clave: "padreId", tipo: "select", etiqueta: "Programa padre", opciones: op.padres, ayuda: "Opcional: crea un sub-programa jerárquico." })
    : campo({ clave: "padreId", tipo: "texto", etiqueta: "Programa padre (id)", ayuda: "Opcional: id de un programa existente." });

  const subcampoPlan = op.planes?.length
    ? campo({ clave: "planId", tipo: "select", etiqueta: "Plan", obligatorio: true, opciones: op.planes })
    : campo({ clave: "planId", tipo: "texto", etiqueta: "Plan (id)", obligatorio: true });
  const subcampoActivo = op.activos?.length
    ? campo({ clave: "activoId", tipo: "select", etiqueta: "Activo", obligatorio: true, opciones: op.activos })
    : campo({ clave: "activoId", tipo: "texto", etiqueta: "Activo (id)", obligatorio: true });

  return {
    clave: "preventivo.programa.creacion",
    titulo: "Nuevo programa preventivo",
    descripcion: "Alta declarativa de un programa de mantenimiento preventivo",
    nodos: [
      {
        clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nuevo programa",
        pasos: [
          {
            clave: "generales", etiqueta: "Datos generales",
            hijos: [
              campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre del programa", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campo({ clave: "codigo", tipo: "texto", etiqueta: "Código", restricciones: { longitudMax: 60 } }),
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
              campoTipo,
              campoClasif,
              campo({ clave: "disparador", tipo: "select", etiqueta: "Disparador principal", opciones: opc(TIPOS_FRECUENCIA), ayuda: "Presentación: el detalle vive en los planes referenciados." }),
            ],
          },
          {
            clave: "jerarquia", etiqueta: "Jerarquía",
            hijos: [campoPadre],
          },
          {
            clave: "planes", etiqueta: "Planes referenciados",
            hijos: [
              campo({
                clave: "planes", tipo: "tabla", etiqueta: "Planes de mantenimiento",
                ayuda: "Cada programa COMPONE planes congelados de modulo.planes por (id + versión ≥ 1).",
                subcampos: [
                  subcampoPlan,
                  campo({ clave: "version", tipo: "numero", etiqueta: "Versión", obligatorio: true, restricciones: { minimo: 1 } }),
                ],
              }),
            ],
          },
          {
            clave: "alcance", etiqueta: "Alcance de activos",
            hijos: [
              campo({
                clave: "activos", tipo: "tabla", etiqueta: "Activos cubiertos",
                ayuda: "Selección real de activos del inventario.",
                subcampos: [subcampoActivo],
              }),
            ],
          },
          {
            clave: "vigencia", etiqueta: "Vigencia y SLA",
            hijos: [
              campo({ clave: "vigenciaDesde", tipo: "fecha", etiqueta: "Vigente desde", obligatorio: true }),
              campo({ clave: "vigenciaHasta", tipo: "fecha", etiqueta: "Vigente hasta (opcional)" }),
            ],
          },
        ],
      },
    ],
  };
}

/* ------------------------------ Actividad ------------------------------- */

export interface OpcionesActividad {
  checklists?: OpcionSeleccion[];
  actividades?: OpcionSeleccion[];
  repuestos?: OpcionSeleccion[];
  herramientas?: OpcionSeleccion[];
}

/**
 * Alta/edición de una actividad del programa: checklist real (plantilla del
 * motor de formularios), dependencias (otras actividades), recursos (personal,
 * herramientas), repuestos (inventario/abastecimiento real), tiempos y costos.
 */
export function plantillaActividad(op: OpcionesActividad = {}): DefinicionFormulario {
  const campoChecklist = op.checklists?.length
    ? campo({ clave: "checklistPlantillaId", tipo: "select", etiqueta: "Checklist (plantilla)", obligatorio: true, opciones: op.checklists })
    : campo({ clave: "checklistPlantillaId", tipo: "texto", etiqueta: "Checklist (plantilla id)", obligatorio: true });
  const subDep = op.actividades?.length
    ? campo({ clave: "actividadId", tipo: "select", etiqueta: "Depende de", obligatorio: true, opciones: op.actividades })
    : campo({ clave: "actividadId", tipo: "texto", etiqueta: "Depende de (id)", obligatorio: true });
  const subRepuesto = op.repuestos?.length
    ? campo({ clave: "referenciaId", tipo: "select", etiqueta: "Repuesto", obligatorio: true, opciones: op.repuestos })
    : campo({ clave: "referenciaId", tipo: "texto", etiqueta: "Repuesto (id)", obligatorio: true });
  const subHerr = op.herramientas?.length
    ? campo({ clave: "referenciaId", tipo: "select", etiqueta: "Herramienta", obligatorio: true, opciones: op.herramientas })
    : campo({ clave: "referenciaId", tipo: "texto", etiqueta: "Herramienta (id)", obligatorio: true });

  return {
    clave: "preventivo.actividad",
    titulo: "Actividad del programa",
    descripcion: "Define una actividad con checklist, dependencias, recursos y costos",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Datos de la actividad",
        hijos: [
          campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
          campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
          campo({ clave: "orden", tipo: "numero", etiqueta: "Orden", obligatorio: true, valorDefecto: 0, restricciones: { minimo: 0 } }),
          campoChecklist,
          campo({ clave: "checklistVersion", tipo: "numero", etiqueta: "Versión del checklist", obligatorio: true, valorDefecto: 1, restricciones: { minimo: 1 } }),
        ],
      },
      {
        clase: "contenedor", clave: "sec-tiempo", tipo: "seccion", etiqueta: "Tiempos y costos",
        hijos: [
          campo({ clave: "tiempoValor", tipo: "decimal", etiqueta: "Tiempo estimado", obligatorio: true, valorDefecto: 1, restricciones: { minimo: 0 } }),
          campo({ clave: "tiempoUnidad", tipo: "texto", etiqueta: "Unidad de tiempo", obligatorio: true, valorDefecto: "h", restricciones: { longitudMax: 12 } }),
          campo({ clave: "moneda", tipo: "texto", etiqueta: "Moneda", obligatorio: true, valorDefecto: "USD", restricciones: { longitudMin: 1, longitudMax: 8 } }),
          campo({ clave: "costoEstimado", tipo: "decimal", etiqueta: "Costo estimado", restricciones: { minimo: 0 } }),
        ],
      },
      {
        clase: "contenedor", clave: "sec-dep", tipo: "seccion", etiqueta: "Dependencias",
        hijos: [
          campo({ clave: "dependencias", tipo: "tabla", etiqueta: "Depende de las actividades", subcampos: [subDep] }),
        ],
      },
      {
        clase: "contenedor", clave: "sec-rec", tipo: "seccion", etiqueta: "Recursos",
        hijos: [
          campo({
            clave: "personal", tipo: "tabla", etiqueta: "Personal (por rol)",
            subcampos: [
              campo({ clave: "rol", tipo: "texto", etiqueta: "Rol", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } }),
              campo({ clave: "cantidad", tipo: "numero", etiqueta: "Cantidad", restricciones: { minimo: 0 } }),
              campo({ clave: "horas", tipo: "decimal", etiqueta: "Horas", restricciones: { minimo: 0 } }),
            ],
          }),
          campo({
            clave: "herramientas", tipo: "tabla", etiqueta: "Herramientas",
            subcampos: [
              subHerr,
              campo({ clave: "cantidad", tipo: "numero", etiqueta: "Cantidad", restricciones: { minimo: 0 } }),
            ],
          }),
          campo({
            clave: "repuestos", tipo: "tabla", etiqueta: "Repuestos",
            ayuda: "Selección real de artículos de inventario/abastecimiento.",
            subcampos: [
              subRepuesto,
              campo({ clave: "cantidad", tipo: "decimal", etiqueta: "Cantidad", restricciones: { minimo: 0 } }),
              campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad", restricciones: { longitudMax: 12 } }),
              campo({ clave: "fuente", tipo: "select", etiqueta: "Fuente", opciones: opc([{ valor: "inventario", etiqueta: "Inventario" }, { valor: "abastecimiento", etiqueta: "Abastecimiento" }]) }),
            ],
          }),
        ],
      },
    ],
  };
}

/* --------------------- Acciones de programación ------------------------- */

export function plantillaReprogramar(motivos: OpcionSeleccion[]): DefinicionFormulario {
  const campoMotivo = motivos.length
    ? campo({ clave: "motivo", tipo: "select", etiqueta: "Motivo", obligatorio: true, opciones: motivos })
    : campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } });
  return {
    clave: "preventivo.reprogramar",
    titulo: "Reprogramar ocurrencia",
    descripcion: "Cambia la fecha de una ocurrencia planificada",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Reprogramación",
        hijos: [
          campo({ clave: "fechaOriginal", tipo: "fecha", etiqueta: "Fecha original", obligatorio: true }),
          campo({ clave: "fechaNueva", tipo: "fecha", etiqueta: "Fecha nueva", obligatorio: true }),
          campoMotivo,
        ],
      },
    ],
  };
}

export function plantillaSuspender(motivos: OpcionSeleccion[]): DefinicionFormulario {
  const campoMotivo = motivos.length
    ? campo({ clave: "motivo", tipo: "select", etiqueta: "Motivo", obligatorio: true, opciones: motivos })
    : campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } });
  return {
    clave: "preventivo.suspender",
    titulo: "Suspender",
    descripcion: "Suspende el programa, una actividad o un activo",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Suspensión",
        hijos: [
          campo({ clave: "ambito", tipo: "select", etiqueta: "Ámbito", obligatorio: true, opciones: opc(AMBITOS_SUSPENSION) }),
          campo({ clave: "sujetoId", tipo: "texto", etiqueta: "Sujeto (id del ámbito)", obligatorio: true, ayuda: "Id del programa, la actividad o el activo según el ámbito." }),
          campo({ clave: "desde", tipo: "fecha", etiqueta: "Desde", obligatorio: true }),
          campo({ clave: "hasta", tipo: "fecha", etiqueta: "Hasta (opcional)" }),
          campoMotivo,
        ],
      },
    ],
  };
}

export function plantillaExcluir(motivos: OpcionSeleccion[]): DefinicionFormulario {
  const campoMotivo = motivos.length
    ? campo({ clave: "motivo", tipo: "select", etiqueta: "Motivo", obligatorio: true, opciones: motivos })
    : campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } });
  return {
    clave: "preventivo.excluir",
    titulo: "Excluir rango",
    descripcion: "Excluye un rango de fechas de la generación preventiva",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Exclusión",
        hijos: [
          campo({ clave: "desde", tipo: "fecha", etiqueta: "Desde", obligatorio: true }),
          campo({ clave: "hasta", tipo: "fecha", etiqueta: "Hasta", obligatorio: true }),
          campoMotivo,
        ],
      },
    ],
  };
}

export function plantillaGenerar(actividades: OpcionSeleccion[], activos: OpcionSeleccion[]): DefinicionFormulario {
  const campoAct = actividades.length
    ? campo({ clave: "actividadId", tipo: "select", etiqueta: "Actividad", obligatorio: true, opciones: actividades })
    : campo({ clave: "actividadId", tipo: "texto", etiqueta: "Actividad (id)", obligatorio: true });
  const campoActivo = activos.length
    ? campo({ clave: "activoId", tipo: "select", etiqueta: "Activo", obligatorio: true, opciones: activos })
    : campo({ clave: "activoId", tipo: "texto", etiqueta: "Activo (id)", obligatorio: true });
  return {
    clave: "preventivo.generar",
    titulo: "Generar orden de trabajo",
    descripcion: "Materializa manualmente una OT preventiva (idempotente)",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Generación",
        hijos: [
          campoAct,
          campoActivo,
          campo({ clave: "fechaObjetivo", tipo: "fecha", etiqueta: "Fecha objetivo", obligatorio: true }),
          campo({ clave: "ventana", tipo: "texto", etiqueta: "Ventana", obligatorio: true, valorDefecto: "programada", restricciones: { longitudMin: 1, longitudMax: 40 } }),
          campo({ clave: "origen", tipo: "select", etiqueta: "Origen", obligatorio: true, valorDefecto: "manual", opciones: opc(ORIGENES_GENERACION) }),
        ],
      },
    ],
  };
}
