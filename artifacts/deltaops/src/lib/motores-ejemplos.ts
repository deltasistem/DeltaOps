/**
 * DGP-007 · Ejemplos NEUTROS precargados para la galería técnica y el playground
 * de los motores (@workspace/dynamic-forms y @workspace/workflow-engine).
 *
 * Cero vocabulario de negocio: todo se describe como "solicitud genérica" /
 * "revisión genérica". Solo DATOS declarativos que los runtimes reales
 * interpretan en tiempo de ejecución (client-side puro).
 */
import type { DefinicionFormulario } from "@workspace/dynamic-forms/definicion";
import type { ReglasCampo } from "@workspace/dynamic-forms/condiciones";
import type { ValidacionCruzada } from "@workspace/dynamic-forms/validacion";
import type { DefinicionWorkflow } from "@workspace/workflow-engine/definicion";

/** Definición de formulario neutra de ejemplo (contenedores wizard + sección). */
export const definicionFormularioEjemplo: DefinicionFormulario = {
  clave: "solicitud-generica",
  titulo: "Solicitud genérica",
  descripcion:
    "Formulario declarativo de ejemplo neutro. Interpretado por el Dynamic Forms Engine.",
  nodos: [
    {
      clase: "contenedor",
      clave: "wiz",
      tipo: "wizard",
      etiqueta: "Proceso de solicitud",
      pasos: [
        {
          clave: "paso-datos",
          etiqueta: "Datos generales",
          hijos: [
            {
              clase: "contenedor",
              clave: "sec-basicos",
              tipo: "seccion",
              etiqueta: "Información básica",
              hijos: [
                {
                  clase: "campo",
                  clave: "titulo",
                  tipo: "texto",
                  etiqueta: "Título de la solicitud",
                  obligatorio: true,
                  restricciones: { longitudMin: 3, longitudMax: 80 },
                  ayuda: "Entre 3 y 80 caracteres.",
                },
                {
                  clase: "campo",
                  clave: "categoria",
                  tipo: "select",
                  etiqueta: "Categoría",
                  obligatorio: true,
                  opciones: [
                    { valor: "tipo-a", etiqueta: "Tipo A" },
                    { valor: "tipo-b", etiqueta: "Tipo B" },
                    { valor: "otro", etiqueta: "Otro" },
                  ],
                },
                {
                  clase: "campo",
                  clave: "detalleOtro",
                  tipo: "texto",
                  etiqueta: "Detalle (si categoría = Otro)",
                  ayuda: "Se muestra y exige solo cuando la categoría es «Otro».",
                },
              ],
            },
          ],
        },
        {
          clave: "paso-cuantificacion",
          etiqueta: "Cuantificación",
          hijos: [
            {
              clase: "contenedor",
              clave: "sec-numeros",
              tipo: "seccion",
              etiqueta: "Valores",
              hijos: [
                {
                  clase: "campo",
                  clave: "cantidad",
                  tipo: "numero",
                  etiqueta: "Cantidad",
                  obligatorio: true,
                  restricciones: { minimo: 1, maximo: 999 },
                },
                {
                  clase: "campo",
                  clave: "precioUnitario",
                  tipo: "decimal",
                  etiqueta: "Valor unitario",
                  obligatorio: true,
                  restricciones: { minimo: 0 },
                },
                {
                  clase: "campo",
                  clave: "total",
                  tipo: "decimal",
                  etiqueta: "Total (calculado)",
                  soloLectura: true,
                  ayuda: "Se calcula automáticamente: cantidad × valor unitario.",
                },
                {
                  clase: "campo",
                  clave: "urgente",
                  tipo: "booleano",
                  etiqueta: "Marcar como prioritaria",
                },
                {
                  clase: "campo",
                  clave: "justificacion",
                  tipo: "texto",
                  etiqueta: "Justificación de prioridad",
                  ayuda: "Obligatoria solo si se marca como prioritaria.",
                },
              ],
            },
          ],
        },
        {
          clave: "paso-cierre",
          etiqueta: "Confirmación",
          hijos: [
            {
              clase: "contenedor",
              clave: "sec-cierre",
              tipo: "seccion",
              etiqueta: "Observaciones finales",
              hijos: [
                {
                  clase: "campo",
                  clave: "observaciones",
                  tipo: "texto",
                  etiqueta: "Observaciones",
                  restricciones: { longitudMax: 240 },
                },
                {
                  clase: "campo",
                  clave: "correoContacto",
                  tipo: "texto",
                  etiqueta: "Correo de contacto",
                  restricciones: { formato: "email" },
                  ayuda: "Formato de correo electrónico válido.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Reglas condicionales del formulario de ejemplo (motor de condiciones). */
export const reglasCampoEjemplo: ReglasCampo[] = [
  {
    campo: "detalleOtro",
    visibleCuando: { campo: "categoria", operador: "igual", valor: "otro" },
    obligatorioCuando: { campo: "categoria", operador: "igual", valor: "otro" },
  },
  {
    campo: "justificacion",
    obligatorioCuando: { campo: "urgente", operador: "igual", valor: true },
  },
  {
    campo: "total",
    calculadoCuando: {
      expresion: {
        op: "*",
        args: [{ ref: "cantidad" }, { ref: "precioUnitario" }],
      },
    },
  },
];

/** Validaciones cruzadas a nivel de formulario (ejemplo neutro). */
export const cruzadasEjemplo: ValidacionCruzada[] = [
  {
    cuando: { campo: "total", operador: "mayor", valor: 10000 },
    campo: "total",
    severidad: "advertencia",
    mensaje: "El total supera 10.000: requerirá revisión adicional.",
    regla: "limite-total",
  },
];

/** JSON neutro precargado para el editor del playground (definición + reglas). */
export const jsonEditorEjemplo = JSON.stringify(
  {
    definicion: definicionFormularioEjemplo,
    reglasCampo: reglasCampoEjemplo,
    cruzadas: cruzadasEjemplo,
  },
  null,
  2,
);

/** Definición de workflow neutra de ejemplo (estados + transiciones + guardas). */
export const definicionWorkflowEjemplo: DefinicionWorkflow = {
  clave: "solicitud-generica",
  etiqueta: "Proceso de solicitud genérica",
  estados: [
    { nombre: "borrador", inicial: true, etiqueta: "Borrador" },
    { nombre: "enRevision", etiqueta: "En revisión", suspendible: true },
    { nombre: "aprobada", etiqueta: "Aprobada" },
    { nombre: "rechazada", etiqueta: "Rechazada", final: true },
    { nombre: "cerrada", etiqueta: "Cerrada", final: true },
  ],
  transiciones: [
    {
      de: "borrador",
      a: "enRevision",
      comando: "enviar",
      permiso: "solicitud.enviar",
      precondiciones: [
        { campo: "titulo", operador: "existe" },
        { campo: "total", operador: "mayor", valor: 0 },
      ],
    },
    {
      // La aprobación inline GOBIERNA la transición (gate): "aprobar" no cambia
      // estado hasta que se resuelve el modo; "rechazar" mueve a rechazoA.
      de: "enRevision",
      a: "aprobada",
      comando: "aprobar",
      permiso: "solicitud.aprobar",
      precondiciones: [{ campo: "revisado", operador: "igual", valor: true }],
      rechazoA: "rechazada",
      aprobacion: {
        nombre: "revision-doble",
        modo: "mayoria",
        permiso: "solicitud.aprobar",
        aprobadores: ["rol-revisor-a", "rol-revisor-b", "rol-revisor-c"],
        minAprobaciones: 2,
        vencimientoMinutos: 1440,
        alVencer: "rechazar",
      },
    },
    {
      de: "enRevision",
      a: "rechazada",
      comando: "rechazar",
      permiso: "solicitud.rechazar",
    },
    {
      de: "aprobada",
      a: "cerrada",
      comando: "cerrar",
      permiso: "solicitud.cerrar",
    },
  ],
};

/** Estado de datos (payload) neutro precargado para probar guardas de transición. */
export const datosWorkflowEjemplo: Record<string, unknown> = {
  titulo: "Solicitud de ejemplo",
  total: 1250,
  revisado: false,
};
