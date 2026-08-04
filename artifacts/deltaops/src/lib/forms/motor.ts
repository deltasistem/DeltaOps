/**
 * DGP-008.3 · Motor del renderer de Dynamic Forms (lógica pura, testeable).
 *
 * Deriva estados de campo (visibilidad/obligatoriedad/solo-lectura/calculado)
 * desde las reglas condicionales, y valida los datos combinando el esquema Zod
 * derivado de la definición con los mensajes condicionales activos.
 */
import {
  camposHoja,
  esquemaCampo,
  type CampoFormulario,
  type DefinicionFormulario,
} from "@workspace/dynamic-forms/definicion";
import {
  evaluarReglasCampo,
  type EstadoCampoEvaluado,
} from "@workspace/dynamic-forms/condiciones";
import type { HallazgoCampo, MapaReglas, ValoresFormulario } from "./tipos";

/** Estado efectivo de todos los campos según sus reglas. */
export function evaluarEstados(
  def: DefinicionFormulario,
  reglas: MapaReglas,
  datos: ValoresFormulario,
): Record<string, EstadoCampoEvaluado> {
  const out: Record<string, EstadoCampoEvaluado> = {};
  for (const campo of camposHoja(def)) {
    const r = reglas[campo.clave];
    out[campo.clave] = r
      ? evaluarReglasCampo(r, datos, { obligatorio: campo.obligatorio, soloLectura: campo.soloLectura })
      : {
          campo: campo.clave,
          visible: true,
          obligatorio: campo.obligatorio ?? false,
          soloLectura: campo.soloLectura ?? false,
          validacionesActivas: [],
        };
  }
  return out;
}

/** Aplica valores calculados sobre una copia de los datos. */
export function aplicarCalculados(
  estados: Record<string, EstadoCampoEvaluado>,
  datos: ValoresFormulario,
): ValoresFormulario {
  const copia = { ...datos };
  for (const e of Object.values(estados)) {
    if (e.valorCalculado !== undefined) copia[e.campo] = e.valorCalculado;
  }
  return copia;
}

/**
 * Valida los datos del formulario. Devuelve hallazgos por campo:
 *  - obligatoriedad (campos visibles + obligatorios vacíos),
 *  - restricciones Zod del campo,
 *  - reglas de validación condicional activas.
 */
export function validar(
  def: DefinicionFormulario,
  reglas: MapaReglas,
  datos: ValoresFormulario,
): HallazgoCampo[] {
  const estados = evaluarEstados(def, reglas, datos);
  const hallazgos: HallazgoCampo[] = [];
  const porClave = new Map<string, CampoFormulario>(camposHoja(def).map((c) => [c.clave, c]));

  for (const [clave, estado] of Object.entries(estados)) {
    if (!estado.visible) continue;
    const campo = porClave.get(clave)!;
    const valor = datos[clave];
    const vacio =
      valor == null ||
      valor === "" ||
      (Array.isArray(valor) && valor.length === 0);

    if (estado.obligatorio && vacio) {
      hallazgos.push({ campo: clave, mensaje: "Campo obligatorio", severidad: "error" });
      continue;
    }
    // Los campos de archivo (adjunto/imagen) capturan un File/Blob local: su
    // esquema Zod espera un id de plataforma, por lo que NO se valida contra Zod
    // (se valida sólo su presencia por obligatoriedad).
    const esArchivoLocal =
      (campo.tipo === "adjunto" || campo.tipo === "imagen") &&
      typeof Blob !== "undefined" &&
      valor instanceof Blob;
    if (!vacio && !esArchivoLocal) {
      // Validación de restricciones Zod del campo.
      const res = esquemaCampo(campo).safeParse(valor);
      if (!res.success) {
        const msg = res.error.issues[0]?.message ?? "Valor no válido";
        hallazgos.push({ campo: clave, mensaje: msg, severidad: "error" });
      }
    }
    // Reglas de validación condicional activas.
    for (const v of estado.validacionesActivas) {
      hallazgos.push({
        campo: clave,
        mensaje: v.mensaje,
        severidad: v.severidad === "advertencia" ? "advertencia" : v.severidad === "bloqueo" ? "bloqueo" : "error",
      });
    }
  }
  return hallazgos;
}

/** ¿Hay hallazgos que bloqueen el envío (error o bloqueo)? */
export function hayBloqueos(hallazgos: HallazgoCampo[]): boolean {
  return hallazgos.some((h) => h.severidad === "error" || h.severidad === "bloqueo");
}

/** Hallazgos de una lista de claves (para validar un paso del wizard). */
export function hallazgosDe(hallazgos: HallazgoCampo[], claves: readonly string[]): HallazgoCampo[] {
  return hallazgos.filter((h) => claves.includes(h.campo));
}
