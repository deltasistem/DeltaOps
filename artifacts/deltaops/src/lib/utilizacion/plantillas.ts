/**
 * DGP-019.1 · Plantillas de formularios de Utilización (Dynamic Forms Engine).
 *
 * TODAS las formas de captura de la experiencia se declaran aquí como
 * `DefinicionFormulario` y las pinta el renderer genérico `FormularioDinamico`
 * (patrón literal DGP-008.3). No hay controles construidos a mano fuera del
 * renderer. Importa SÓLO de `@workspace/dynamic-forms/definicion` (seguro para
 * el bundle del navegador). Los campos coinciden con los del contrato
 * (`RegistrarLectura`, `RegistrarTanqueo`).
 */
import {
  type CampoFormulario,
  type DefinicionFormulario,
  type OpcionSeleccion,
} from "@workspace/dynamic-forms/definicion";
import { TIPOS_MEDIDOR, ETIQUETA_TIPO_MEDIDOR } from "./constantes";

function campo(c: Omit<CampoFormulario, "clase">): CampoFormulario {
  return { clase: "campo", ...c };
}

/** Opciones de tipo de medidor para el select (horómetro/odómetro). */
export const OPCIONES_TIPO_MEDIDOR: OpcionSeleccion[] = TIPOS_MEDIDOR.map((t) => ({
  valor: t,
  etiqueta: ETIQUETA_TIPO_MEDIDOR[t] ?? t,
}));

/** Claves de los campos del formulario de lectura (para validación). */
export const CAMPOS_LECTURA = ["activoId", "tipoMedidor", "valor", "fechaHora", "observacion"] as const;

/**
 * Formulario de registro de lectura de medidor. El `activoId` se captura con un
 * selector propio (fuera del renderer, por requerir consulta a Activos), por lo
 * que aquí se declara como campo de texto de sólo apoyo cuando se embebe; los
 * consumidores pueden ocultarlo vía `soloClaves`.
 */
export function plantillaLectura(): DefinicionFormulario {
  return {
    clave: "utilizacion.lectura",
    titulo: "Registrar lectura",
    descripcion: "Lectura de horómetro/odómetro de un activo.",
    nodos: [
      {
        clase: "contenedor",
        clave: "datos",
        tipo: "seccion",
        etiqueta: "Datos de la lectura",
        hijos: [
          campo({ clave: "tipoMedidor", tipo: "select", etiqueta: "Tipo de medidor", obligatorio: true, opciones: OPCIONES_TIPO_MEDIDOR }),
          campo({ clave: "valor", tipo: "decimal", etiqueta: "Valor", obligatorio: true, ayuda: "Horas (h) u odómetro (km) según el tipo.", restricciones: { minimo: 0, decimales: 2 } }),
          campo({ clave: "fechaHora", tipo: "fechaHora", etiqueta: "Fecha y hora", obligatorio: true }),
          campo({ clave: "observacion", tipo: "texto", etiqueta: "Observación", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
}

/** Claves de los campos del formulario de tanqueo (para validación). */
export const CAMPOS_TANQUEO = [
  "fechaHora",
  "litros",
  "tipoCombustible",
  "precioUnitario",
  "costoTotal",
  "moneda",
  "proveedorId",
  "observacion",
] as const;

/**
 * Formulario de registro de tanqueo. `tipoCombustible` usa el catálogo del
 * tenant (`tipos-combustible`); si está vacío, se degrada a texto libre. El
 * `activoId` y el enlace a la lectura del medidor los aporta el contenedor.
 */
export function plantillaTanqueo(combustibles: OpcionSeleccion[] = []): DefinicionFormulario {
  const campoCombustible = combustibles.length
    ? campo({ clave: "tipoCombustible", tipo: "select", etiqueta: "Tipo de combustible", obligatorio: true, opciones: combustibles })
    : campo({ clave: "tipoCombustible", tipo: "texto", etiqueta: "Tipo de combustible", obligatorio: true, ayuda: "Clave del catálogo (p.ej. diesel).", restricciones: { longitudMin: 1, longitudMax: 60 } });
  return {
    clave: "utilizacion.tanqueo",
    titulo: "Registrar tanqueo",
    descripcion: "Carga de combustible de un activo.",
    nodos: [
      {
        clase: "contenedor",
        clave: "datos",
        tipo: "seccion",
        etiqueta: "Datos del tanqueo",
        hijos: [
          campo({ clave: "fechaHora", tipo: "fechaHora", etiqueta: "Fecha y hora", obligatorio: true }),
          campo({ clave: "litros", tipo: "decimal", etiqueta: "Litros", obligatorio: true, ayuda: "Debe ser mayor que 0.", restricciones: { minimo: 0, decimales: 2 } }),
          campoCombustible,
        ],
      },
      {
        clase: "contenedor",
        clave: "costos",
        tipo: "seccion",
        etiqueta: "Costos (opcional)",
        hijos: [
          campo({ clave: "precioUnitario", tipo: "decimal", etiqueta: "Precio unitario", restricciones: { minimo: 0, decimales: 4 } }),
          campo({ clave: "costoTotal", tipo: "decimal", etiqueta: "Costo total", restricciones: { minimo: 0, decimales: 2 } }),
          campo({ clave: "moneda", tipo: "texto", etiqueta: "Moneda", restricciones: { longitudMax: 8 } }),
          campo({ clave: "proveedorId", tipo: "texto", etiqueta: "Proveedor", ayuda: "Referencia libre (sin FK dura).", restricciones: { longitudMax: 120 } }),
          campo({ clave: "observacion", tipo: "texto", etiqueta: "Observación", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
}

/** Claves del formulario de reinicio de medidor. */
export const CAMPOS_REINICIO = ["tipoMedidor", "valorNuevo", "fechaHora", "motivo", "observacion"] as const;

/** Formulario de regularización de medidor (reinicio de tramo auditado). */
export function plantillaReinicio(): DefinicionFormulario {
  return {
    clave: "utilizacion.reinicio",
    titulo: "Regularizar medidor",
    descripcion: "Reinicio de tramo auditado; el motivo es obligatorio.",
    nodos: [
      {
        clase: "contenedor",
        clave: "datos",
        tipo: "seccion",
        etiqueta: "Reinicio de medidor",
        hijos: [
          campo({ clave: "tipoMedidor", tipo: "select", etiqueta: "Tipo de medidor", obligatorio: true, opciones: OPCIONES_TIPO_MEDIDOR }),
          campo({ clave: "valorNuevo", tipo: "decimal", etiqueta: "Nuevo valor", obligatorio: true, restricciones: { minimo: 0, decimales: 2 } }),
          campo({ clave: "fechaHora", tipo: "fechaHora", etiqueta: "Fecha y hora", obligatorio: true }),
          campo({ clave: "motivo", tipo: "texto", etiqueta: "Motivo", obligatorio: true, ayuda: "Justificación auditable (obligatoria).", restricciones: { longitudMin: 1, longitudMax: 500 } }),
          campo({ clave: "observacion", tipo: "texto", etiqueta: "Observación", restricciones: { longitudMax: 500 } }),
        ],
      },
    ],
  };
}
