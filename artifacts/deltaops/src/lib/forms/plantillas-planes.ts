/**
 * DGP-012 · Plantillas de formularios de Planes (Dynamic Forms Engine).
 *
 * TODA la captura de la experiencia de Planes se declara aquí como
 * `DefinicionFormulario` y la pinta el renderer genérico `FormularioDinamico`.
 * No hay controles construidos a mano fuera del renderer. Importa SOLO de
 * `@workspace/dynamic-forms/definicion` (seguro para el bundle del navegador).
 * Todos los títulos son no vacíos (evita DEF_VACIA).
 *
 * Las frecuencias (simples y combinadas "lo que ocurra primero"), las
 * actividades de la rutina y las ventanas del calendario se capturan como
 * `tabla` declarativa (subcampos), 100% Dynamic Forms.
 */
import {
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import {
  TIPOS_FRECUENCIA,
  MODOS_FRECUENCIA,
  ORIGENES_GENERACION,
  AMBITOS_CALENDARIO,
  TIPOS_VENTANA,
} from "../planes/constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

const opc = (arr: readonly { valor: string; etiqueta: string }[]): OpcionSeleccion[] =>
  arr.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));

/* --------------------------- Filtros del listado ------------------------ */

export function plantillaFiltrosPlanes(
  estados: OpcionSeleccion[],
  tipos: OpcionSeleccion[],
  estrategias: OpcionSeleccion[],
): DefinicionFormulario {
  return {
    clave: "planes.filtros",
    titulo: "Filtros de planes",
    descripcion: "Filtra el listado de planes de mantenimiento",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Filtros",
        hijos: [
          campo({ clave: "estado", tipo: "select", etiqueta: "Estado", opciones: estados }),
          campo({ clave: "tipoPlan", tipo: "select", etiqueta: "Tipo de plan", opciones: tipos }),
          campo({ clave: "estrategia", tipo: "select", etiqueta: "Estrategia", opciones: estrategias }),
        ],
      },
    ],
  };
}

/* ---------------------------- Wizard de creación ------------------------ */

export interface OpcionesPlan {
  tipos?: OpcionSeleccion[];
  estrategias?: OpcionSeleccion[];
  prioridades?: OpcionSeleccion[];
  calendarios?: OpcionSeleccion[];
}

/**
 * Wizard multi-paso de creación de un plan. Datos generales (catálogos de
 * tenant), alcance declarativo, frecuencias declarativas (tabla de reglas +
 * modo de combinación), rutina (tabla de actividades con recursos por
 * referencia) y programación/calendario.
 */
export function plantillaPlan(op: OpcionesPlan = {}): DefinicionFormulario {
  const campoTipo = op.tipos?.length
    ? campo({ clave: "tipoPlan", tipo: "select", etiqueta: "Tipo de plan", obligatorio: true, opciones: op.tipos })
    : campo({ clave: "tipoPlan", tipo: "texto", etiqueta: "Tipo de plan", obligatorio: true, ayuda: "Ej.: preventivo, predictivo, inspección, legal, lubricación.", restricciones: { longitudMin: 1, longitudMax: 60 } });
  const campoEstrategia = op.estrategias?.length
    ? campo({ clave: "estrategia", tipo: "select", etiqueta: "Estrategia", obligatorio: true, opciones: op.estrategias })
    : campo({ clave: "estrategia", tipo: "texto", etiqueta: "Estrategia", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 60 } });
  const campoPrioridad = op.prioridades?.length
    ? campo({ clave: "prioridad", tipo: "select", etiqueta: "Prioridad", obligatorio: true, opciones: op.prioridades })
    : campo({ clave: "prioridad", tipo: "texto", etiqueta: "Prioridad", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 40 } });

  const campoCalendario = op.calendarios?.length
    ? campo({ clave: "calendarioId", tipo: "select", etiqueta: "Calendario operacional", opciones: op.calendarios, ayuda: "Opcional: aplica festivos/ventanas/paradas." })
    : campo({ clave: "calendarioId", tipo: "texto", etiqueta: "Calendario operacional (id)", ayuda: "Opcional: id de un calendario existente." });

  return {
    clave: "planes.creacion",
    titulo: "Nuevo plan de mantenimiento",
    descripcion: "Alta declarativa de un plan de mantenimiento empresarial",
    nodos: [
      {
        clase: "contenedor", clave: "wiz", tipo: "wizard", etiqueta: "Nuevo plan",
        pasos: [
          {
            clave: "generales", etiqueta: "Datos generales",
            hijos: [
              campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre del plan", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 1000 } }),
              campoTipo,
              campoEstrategia,
              campoPrioridad,
            ],
          },
          {
            clave: "alcance", etiqueta: "Alcance de activos",
            hijos: [
              campo({ clave: "alcanceActivos", tipo: "texto", etiqueta: "Activos (ids separados por coma)", ayuda: "Un plan puede cubrir uno o muchos activos concretos." }),
              campo({ clave: "alcanceCategorias", tipo: "texto", etiqueta: "Categorías (separadas por coma)" }),
              campo({ clave: "alcanceFamilias", tipo: "texto", etiqueta: "Familias (separadas por coma)" }),
              campo({ clave: "alcanceSubfamilias", tipo: "texto", etiqueta: "Subfamilias (separadas por coma)" }),
              campo({ clave: "alcanceEmpresas", tipo: "texto", etiqueta: "Empresas (separadas por coma)" }),
              campo({ clave: "alcanceProyectos", tipo: "texto", etiqueta: "Proyectos (separados por coma)" }),
              campo({ clave: "alcanceUbicaciones", tipo: "texto", etiqueta: "Ubicaciones (separadas por coma)" }),
              campo({ clave: "alcanceClases", tipo: "texto", etiqueta: "Clases de activos (separadas por coma)" }),
            ],
          },
          {
            clave: "frecuencia", etiqueta: "Frecuencias",
            hijos: [
              campo({ clave: "frecuenciaModo", tipo: "select", etiqueta: "Modo de combinación", obligatorio: true, opciones: opc(MODOS_FRECUENCIA), valorDefecto: "simple", ayuda: "«Lo que ocurra primero» combina varias reglas (p. ej. 30 días O 250 horas)." }),
              campo({
                clave: "reglas", tipo: "tabla", etiqueta: "Reglas de frecuencia", obligatorio: true,
                ayuda: "Cada regla dispara la generación según su tipo. Añade varias para combinarlas.",
                subcampos: [
                  campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_FRECUENCIA) }),
                  campo({ clave: "cada", tipo: "decimal", etiqueta: "Cada (N)", restricciones: { minimo: 0 } }),
                  campo({ clave: "unidad", tipo: "texto", etiqueta: "Unidad", restricciones: { longitudMax: 20 } }),
                  campo({ clave: "evento", tipo: "texto", etiqueta: "Evento (si aplica)", restricciones: { longitudMax: 60 } }),
                ],
              }),
              campo({ clave: "toleranciaAntes", tipo: "decimal", etiqueta: "Tolerancia antes", restricciones: { minimo: 0 } }),
              campo({ clave: "toleranciaDespues", tipo: "decimal", etiqueta: "Tolerancia después", restricciones: { minimo: 0 } }),
            ],
          },
          {
            clave: "rutina", etiqueta: "Rutina y actividades",
            hijos: [
              campo({ clave: "rutinaNombre", tipo: "texto", etiqueta: "Nombre de la rutina", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
              campo({ clave: "duracionTotalMin", tipo: "numero", etiqueta: "Duración total estimada (min)", restricciones: { minimo: 0 } }),
              campo({
                clave: "actividades", tipo: "tabla", etiqueta: "Actividades planificadas", obligatorio: true,
                ayuda: "Recursos, herramientas, EPP, materiales, repuestos, checklists y documentación se referencian por id (reutilizando los módulos existentes).",
                subcampos: [
                  campo({ clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 200 } }),
                  campo({ clave: "tipo", tipo: "texto", etiqueta: "Tipo", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 40 } }),
                  campo({ clave: "descripcion", tipo: "texto", etiqueta: "Descripción", restricciones: { longitudMax: 500 } }),
                  campo({ clave: "disciplina", tipo: "texto", etiqueta: "Disciplina", restricciones: { longitudMax: 60 } }),
                  campo({ clave: "duracionMin", tipo: "numero", etiqueta: "Duración (min)", restricciones: { minimo: 0 } }),
                  campo({ clave: "herramientas", tipo: "texto", etiqueta: "Herramientas (ids, coma)" }),
                  campo({ clave: "epp", tipo: "texto", etiqueta: "EPP (ids, coma)" }),
                  campo({ clave: "materiales", tipo: "texto", etiqueta: "Materiales (ids, coma)" }),
                  campo({ clave: "repuestos", tipo: "texto", etiqueta: "Repuestos (ids, coma)" }),
                  campo({ clave: "checklists", tipo: "texto", etiqueta: "Checklists (ids, coma)" }),
                  campo({ clave: "documentacion", tipo: "texto", etiqueta: "Documentación (ids, coma)" }),
                  campo({ clave: "riesgos", tipo: "texto", etiqueta: "Riesgos (categorías, coma)" }),
                  campo({ clave: "observaciones", tipo: "texto", etiqueta: "Observaciones", restricciones: { longitudMax: 500 } }),
                ],
              }),
            ],
          },
          {
            clave: "programacion", etiqueta: "Programación y calendario",
            hijos: [
              campo({ clave: "vigenteDesde", tipo: "fecha", etiqueta: "Vigente desde", obligatorio: true }),
              campo({ clave: "vigenteHasta", tipo: "fecha", etiqueta: "Vigente hasta (opcional)" }),
              campoCalendario,
            ],
          },
        ],
      },
    ],
  };
}

/* ----------------------------- Calendario ------------------------------- */

/** Alta de un calendario operacional (empresa/proyecto/activo). */
export function plantillaCalendario(): DefinicionFormulario {
  return {
    clave: "planes.calendario.creacion",
    titulo: "Nuevo calendario operacional",
    descripcion: "Días laborales, turnos, ventanas, paradas y exclusiones",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Calendario",
        hijos: [
          campo({ clave: "nombre", tipo: "texto", etiqueta: "Nombre", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 120 } }),
          campo({ clave: "tipo", tipo: "texto", etiqueta: "Tipo", obligatorio: true, ayuda: "Ej.: operacional, produccion, administrativo.", restricciones: { longitudMin: 1, longitudMax: 40 } }),
          campo({ clave: "ambito", tipo: "select", etiqueta: "Ámbito", obligatorio: true, opciones: opc(AMBITOS_CALENDARIO) }),
        ],
      },
      {
        clase: "contenedor", clave: "sec-ventanas", tipo: "seccion", etiqueta: "Festivos, ventanas y paradas",
        hijos: [
          campo({
            clave: "ventanas", tipo: "tabla", etiqueta: "Ventanas / festivos / paradas",
            subcampos: [
              campo({ clave: "tipo", tipo: "select", etiqueta: "Tipo", obligatorio: true, opciones: opc(TIPOS_VENTANA) }),
              campo({ clave: "desde", tipo: "fecha", etiqueta: "Desde", obligatorio: true }),
              campo({ clave: "hasta", tipo: "fecha", etiqueta: "Hasta", obligatorio: true }),
              campo({ clave: "etiqueta", tipo: "texto", etiqueta: "Etiqueta", restricciones: { longitudMax: 120 } }),
            ],
          }),
        ],
      },
    ],
  };
}

/* ----------------------------- Generación ------------------------------- */

/** Evaluación de generación de un plan para un activo (sin efectos). */
export function plantillaEvaluar(activos: OpcionSeleccion[] = []): DefinicionFormulario {
  const campoActivo = activos.length
    ? campo({ clave: "activoId", tipo: "select", etiqueta: "Activo", obligatorio: true, opciones: activos })
    : campo({ clave: "activoId", tipo: "texto", etiqueta: "Activo (id)", obligatorio: true, restricciones: { longitudMin: 1, longitudMax: 80 } });
  return {
    clave: "planes.evaluar",
    titulo: "Evaluar generación",
    descripcion: "Determina si el plan debe generar una orden ahora",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Evaluación",
        hijos: [
          campoActivo,
          campo({ clave: "origen", tipo: "select", etiqueta: "Origen", obligatorio: true, opciones: opc(ORIGENES_GENERACION), valorDefecto: "manual" }),
          campo({ clave: "desde", tipo: "fecha", etiqueta: "Anclaje desde", obligatorio: true, ayuda: "Fecha de referencia de la última ejecución." }),
          campo({ clave: "ocurrenciaManual", tipo: "fecha", etiqueta: "Ocurrencia manual (opcional)" }),
        ],
      },
    ],
  };
}

/** Generación manual idempotente de órdenes preventivas. */
export function plantillaGenerar(): DefinicionFormulario {
  return {
    clave: "planes.generar",
    titulo: "Generar órdenes preventivas",
    descripcion: "Orquestación idempotente: nunca duplica",
    nodos: [
      {
        clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Generación",
        hijos: [
          campo({ clave: "limite", tipo: "numero", etiqueta: "Límite de órdenes", restricciones: { minimo: 1, maximo: 200 }, valorDefecto: 10 }),
          campo({ clave: "tipoOrden", tipo: "texto", etiqueta: "Tipo de orden (opcional)", restricciones: { longitudMax: 40 } }),
        ],
      },
    ],
  };
}

/* --------------------------- Transición Workflow ------------------------ */

/**
 * Motivo (obligatorio) y horizonte de una transición. `pideHasta` añade el
 * campo de fecha `hasta` para posponer/extender/reprogramar.
 */
export function plantillaTransicion(pideHasta: boolean): DefinicionFormulario {
  const hijos: CampoFormulario[] = [
    campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", obligatorio: true, ayuda: "El motivo es obligatorio y queda en la bitácora del plan.", restricciones: { longitudMin: 1, longitudMax: 500 } }),
    campo({ clave: "nota", tipo: "texto", etiqueta: "Nota (opcional)", restricciones: { longitudMax: 500 } }),
  ];
  if (pideHasta) {
    hijos.splice(1, 0, campo({ clave: "hasta", tipo: "fecha", etiqueta: "Hasta", obligatorio: true, ayuda: "Fecha objetivo del aplazamiento/extensión." }));
  }
  return {
    clave: "planes.transicion",
    titulo: "Transición del plan",
    descripcion: "Decisión explícita gobernada por Workflow",
    nodos: [{ clase: "contenedor", clave: "grp", tipo: "grupo", etiqueta: "Transición", hijos }],
  };
}
