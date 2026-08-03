/**
 * DGP-006 · Business Foundation Framework — Validador de definiciones (andamiaje).
 *
 * Antes de generar los artefactos de un módulo nuevo, se valida que la
 * DefinicionModulo/DefinicionEntidad sea coherente y NEUTRA:
 *   - Slugs/nombres con forma kebab-case y campos/comandos en camelCase válido.
 *   - Sin palabras reservadas de negocio (regla DGP-006: el framework y todo lo
 *     generado deben ser neutros — cero nombres de negocio).
 *   - Máquinas de estados coherentes: un único estado inicial, todas las
 *     transiciones referencian estados existentes, sin duplicados de+comando.
 *   - Permisos CRUD completos en cada entidad.
 *
 * El resultado es una lista de errores explícitos (cada uno cita la regla que
 * incumple). Función pura, sin efectos.
 */
import type {
  DefinicionEntidad,
  DefinicionModulo,
} from "../nucleo/definicion";

/**
 * Palabras reservadas de negocio prohibidas en CUALQUIER identificador del
 * scaffolding (DGP-006). El framework es neutro: estos conceptos pertenecen a
 * los módulos de negocio y NO pueden filtrarse al andamiaje genérico.
 */
export const PALABRAS_RESERVADAS_NEGOCIO: readonly string[] = [
  "activo",
  "inventario",
  "orden",
  "compra",
  "combustible",
  "sst",
];

export interface ErrorValidacion {
  /** Ruta del elemento inválido, p. ej. `entidades[0].campos[2].nombre`. */
  readonly ruta: string;
  /** Mensaje explícito, cita la regla DGP-006 cuando aplica. */
  readonly mensaje: string;
}

export interface ResultadoValidacion {
  readonly valido: boolean;
  readonly errores: readonly ErrorValidacion[];
}

const RE_KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RE_CAMEL = /^[a-z][a-zA-Z0-9]*$/;
/** Slug de servicio: segmentos kebab separados por punto, p. ej. `modulo.demo`. */
const RE_SLUG_SERVICIO = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;

/** Extrae todas las palabras alfabéticas de un identificador para comparar. */
function palabrasDe(identificador: string): string[] {
  return identificador
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((seg) => seg.split(/(?=[A-Z])/))
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Comprueba que un identificador no contenga ninguna palabra reservada de
 * negocio. Devuelve el error (citando DGP-006) o `undefined`.
 */
function reservada(ruta: string, identificador: string): ErrorValidacion | undefined {
  const palabras = new Set(palabrasDe(identificador));
  for (const reservada of PALABRAS_RESERVADAS_NEGOCIO) {
    if (palabras.has(reservada)) {
      return {
        ruta,
        mensaje:
          `"${identificador}" contiene la palabra reservada de negocio "${reservada}". ` +
          `Regla DGP-006: el framework y el código generado deben ser NEUTROS (cero nombres de negocio).`,
      };
    }
  }
  return undefined;
}

function validarEntidad(
  entidad: DefinicionEntidad,
  ruta: string,
  errores: ErrorValidacion[],
): void {
  // Nombre técnico (recordType): kebab/simple + neutro.
  if (!RE_KEBAB.test(entidad.nombre)) {
    errores.push({
      ruta: `${ruta}.nombre`,
      mensaje: `Nombre de entidad "${entidad.nombre}" inválido: debe ser kebab-case (p. ej. "mi-entidad").`,
    });
  }
  const nombreReservado = reservada(`${ruta}.nombre`, entidad.nombre);
  if (nombreReservado) errores.push(nombreReservado);

  const servicioReservado = reservada(`${ruta}.servicio`, entidad.servicio);
  if (servicioReservado) errores.push(servicioReservado);

  // Campos: camelCase + neutro.
  entidad.campos.forEach((campo, i) => {
    const rutaCampo = `${ruta}.campos[${i}].nombre`;
    if (!RE_CAMEL.test(campo.nombre)) {
      errores.push({
        ruta: rutaCampo,
        mensaje: `Nombre de campo "${campo.nombre}" inválido: debe ser camelCase (p. ej. "miCampo").`,
      });
    }
    const campoReservado = reservada(rutaCampo, campo.nombre);
    if (campoReservado) errores.push(campoReservado);
    if (campo.tipo === "enum" && (!campo.enumValores || campo.enumValores.length === 0)) {
      errores.push({
        ruta: `${ruta}.campos[${i}]`,
        mensaje: `El campo enum "${campo.nombre}" debe declarar al menos un valor en enumValores.`,
      });
    }
  });

  // Permisos CRUD completos.
  const clavesPermiso: readonly string[] = ["leer", "crear", "editar", "eliminar", "admin"];
  for (const clave of clavesPermiso) {
    const valor = entidad.permisos?.[clave];
    if (typeof valor !== "string" || valor.length === 0) {
      errores.push({
        ruta: `${ruta}.permisos.${clave}`,
        mensaje: `Falta el permiso obligatorio "${clave}" en la entidad "${entidad.nombre}".`,
      });
    }
  }

  // Máquina de estados coherente (si existe).
  const m = entidad.maquinaEstados;
  if (m) {
    if (m.estados.length === 0) {
      errores.push({
        ruta: `${ruta}.maquinaEstados.estados`,
        mensaje: `La máquina de estados de "${entidad.nombre}" no declara ningún estado.`,
      });
    }
    const nombresEstado = new Set<string>();
    m.estados.forEach((e, i) => {
      const rutaEstado = `${ruta}.maquinaEstados.estados[${i}].nombre`;
      if (!RE_CAMEL.test(e.nombre)) {
        errores.push({
          ruta: rutaEstado,
          mensaje: `Nombre de estado "${e.nombre}" inválido: debe ser camelCase.`,
        });
      }
      const estadoReservado = reservada(rutaEstado, e.nombre);
      if (estadoReservado) errores.push(estadoReservado);
      if (nombresEstado.has(e.nombre)) {
        errores.push({
          ruta: rutaEstado,
          mensaje: `Estado duplicado "${e.nombre}".`,
        });
      }
      nombresEstado.add(e.nombre);
    });

    // Exactamente un estado inicial.
    const iniciales = m.estados.filter((e) => e.inicial);
    if (iniciales.length !== 1) {
      errores.push({
        ruta: `${ruta}.maquinaEstados.estados`,
        mensaje:
          `La máquina de estados de "${entidad.nombre}" debe declarar exactamente 1 estado inicial ` +
          `(tiene ${iniciales.length}).`,
      });
    }

    // Transiciones: estados existentes + comando neutro + sin duplicados.
    const vistas = new Set<string>();
    m.transiciones.forEach((t, i) => {
      const rutaTr = `${ruta}.maquinaEstados.transiciones[${i}]`;
      if (!nombresEstado.has(t.de)) {
        errores.push({ ruta: `${rutaTr}.de`, mensaje: `La transición referencia un estado origen inexistente "${t.de}".` });
      }
      if (!nombresEstado.has(t.a)) {
        errores.push({ ruta: `${rutaTr}.a`, mensaje: `La transición referencia un estado destino inexistente "${t.a}".` });
      }
      if (!RE_CAMEL.test(t.comando)) {
        errores.push({ ruta: `${rutaTr}.comando`, mensaje: `Comando de transición "${t.comando}" inválido: debe ser camelCase.` });
      }
      const comandoReservado = reservada(`${rutaTr}.comando`, t.comando);
      if (comandoReservado) errores.push(comandoReservado);
      const clave = `${t.de}::${t.comando}`;
      if (vistas.has(clave)) {
        errores.push({
          ruta: rutaTr,
          mensaje: `Transición ambigua: ya existe "${t.comando}" desde el estado "${t.de}".`,
        });
      }
      vistas.add(clave);
    });
  }
}

/**
 * Valida una DefinicionModulo completa para el scaffolding. Devuelve la lista
 * de errores (vacía ⇒ válido). No lanza excepciones.
 */
export function validarDefinicionModulo(def: DefinicionModulo): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];

  if (!RE_SLUG_SERVICIO.test(def.servicio)) {
    errores.push({
      ruta: "servicio",
      mensaje: `Slug de servicio "${def.servicio}" inválido: use segmentos kebab-case separados por punto (p. ej. "modulo.demo").`,
    });
  }
  const servicioReservado = reservada("servicio", def.servicio);
  if (servicioReservado) errores.push(servicioReservado);

  if (def.entidades.length === 0) {
    errores.push({ ruta: "entidades", mensaje: "El módulo debe declarar al menos una entidad." });
  }

  def.entidades.forEach((entidad, i) => validarEntidad(entidad, `entidades[${i}]`, errores));

  return { valido: errores.length === 0, errores };
}

/**
 * Igual que validarDefinicionModulo pero lanza un Error explícito si la
 * definición es inválida. Útil como guardia previa a la generación.
 */
export function asegurarDefinicionValida(def: DefinicionModulo): void {
  const r = validarDefinicionModulo(def);
  if (!r.valido) {
    const detalle = r.errores.map((e) => `  - [${e.ruta}] ${e.mensaje}`).join("\n");
    throw new Error(`Definición de módulo inválida (DGP-006):\n${detalle}`);
  }
}
