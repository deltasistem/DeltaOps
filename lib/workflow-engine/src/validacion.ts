/**
 * DGP-007 · Workflow Engine — Validación estructural de definiciones.
 *
 * Reutiliza el patrón de `andamiaje/validacion.ts` del Business Foundation
 * (palabras reservadas de negocio, errores explícitos que citan la regla) y lo
 * especializa para workflows:
 *   - Nombres/comandos/estados neutros y bien formados (camelCase / kebab).
 *   - Exactamente 1 estado inicial; sin estados duplicados.
 *   - Transiciones coherentes: referencian estados existentes; sin ambigüedad
 *     (de+comando único).
 *   - Todos los estados ALCANZABLES desde el inicial (BFS).
 *   - Estados no-finales deben tener salida (o ser suspendibles/cancelables).
 *   - Aprobaciones referenciadas por transiciones existen y son válidas (Zod).
 *   - CERO vocabulario de negocio en cualquier identificador.
 *
 * Función pura, sin efectos.
 */
import { PALABRAS_RESERVADAS_NEGOCIO } from "@workspace/business-foundation";
import { validarExpresion } from "./condiciones";
import { DefinicionAprobacionSchema } from "./aprobaciones";
import {
  estadoInicialWorkflow,
  operacionesEstandarEfectivas,
  type DefinicionWorkflow,
} from "./definicion";

export interface ErrorValidacionWorkflow {
  readonly ruta: string;
  readonly mensaje: string;
}

export interface ResultadoValidacionWorkflow {
  readonly valido: boolean;
  readonly errores: readonly ErrorValidacionWorkflow[];
}

const RE_CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const RE_KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function palabrasDe(identificador: string): string[] {
  return identificador
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((seg) => seg.split(/(?=[A-Z])/))
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 0);
}

function reservada(ruta: string, identificador: string): ErrorValidacionWorkflow | undefined {
  const palabras = new Set(palabrasDe(identificador));
  for (const r of PALABRAS_RESERVADAS_NEGOCIO) {
    if (palabras.has(r)) {
      return {
        ruta,
        mensaje:
          `"${identificador}" contiene la palabra reservada de negocio "${r}". ` +
          `Regla DGP-007: el motor y las definiciones deben ser NEUTROS (cero nombres de negocio).`,
      };
    }
  }
  return undefined;
}

/** Valida una DefinicionWorkflow. Devuelve la lista de errores (vacía ⇒ válida). */
export function validarWorkflow(def: DefinicionWorkflow): ResultadoValidacionWorkflow {
  const errores: ErrorValidacionWorkflow[] = [];
  const push = (e?: ErrorValidacionWorkflow) => {
    if (e) errores.push(e);
  };

  // Clave del workflow.
  if (!RE_KEBAB.test(def.clave)) {
    errores.push({ ruta: "clave", mensaje: `Clave "${def.clave}" inválida: debe ser kebab-case.` });
  }
  push(reservada("clave", def.clave));

  if (def.estados.length === 0) {
    errores.push({ ruta: "estados", mensaje: "El workflow debe declarar al menos un estado." });
    return { valido: false, errores };
  }

  // Estados: camelCase, neutros, sin duplicados, 1 inicial.
  const nombresEstado = new Set<string>();
  def.estados.forEach((e, i) => {
    const ruta = `estados[${i}].nombre`;
    if (!RE_CAMEL.test(e.nombre)) {
      errores.push({ ruta, mensaje: `Estado "${e.nombre}" inválido: debe ser camelCase.` });
    }
    push(reservada(ruta, e.nombre));
    if (nombresEstado.has(e.nombre)) {
      errores.push({ ruta, mensaje: `Estado duplicado "${e.nombre}".` });
    }
    nombresEstado.add(e.nombre);
  });

  const iniciales = def.estados.filter((e) => e.inicial);
  if (iniciales.length !== 1) {
    errores.push({
      ruta: "estados",
      mensaje: `El workflow debe declarar exactamente 1 estado inicial (tiene ${iniciales.length}).`,
    });
  }

  // Estados estándar (cancelado/suspendido) se añaden al universo alcanzable.
  const ops = operacionesEstandarEfectivas(def);
  const universo = new Set(nombresEstado);
  if (ops.cancelar) universo.add(ops.cancelar.estado);
  if (ops.suspender) universo.add(ops.suspender.estado);

  // Transiciones: estados existentes, comando neutro, sin ambigüedad.
  const vistas = new Set<string>();
  def.transiciones.forEach((t, i) => {
    const ruta = `transiciones[${i}]`;
    if (!nombresEstado.has(t.de)) {
      errores.push({ ruta: `${ruta}.de`, mensaje: `Estado origen inexistente "${t.de}".` });
    }
    if (!nombresEstado.has(t.a)) {
      errores.push({ ruta: `${ruta}.a`, mensaje: `Estado destino inexistente "${t.a}".` });
    }
    if (!RE_CAMEL.test(t.comando)) {
      errores.push({ ruta: `${ruta}.comando`, mensaje: `Comando "${t.comando}" inválido: debe ser camelCase.` });
    }
    push(reservada(`${ruta}.comando`, t.comando));
    const clave = `${t.de}::${t.comando}`;
    if (vistas.has(clave)) {
      errores.push({ ruta, mensaje: `Transición ambigua: ya existe "${t.comando}" desde "${t.de}".` });
    }
    vistas.add(clave);

    // Condiciones válidas (Zod del motor de condiciones).
    (t.precondiciones ?? []).forEach((c, j) => {
      if (!validarExpresion(c).success) {
        errores.push({ ruta: `${ruta}.precondiciones[${j}]`, mensaje: "Precondición malformada." });
      }
    });
    (t.postcondiciones ?? []).forEach((c, j) => {
      if (!validarExpresion(c).success) {
        errores.push({ ruta: `${ruta}.postcondiciones[${j}]`, mensaje: "Postcondición malformada." });
      }
    });

    // Aprobación inline que gobierna la transición: forma válida (Zod), nombre
    // neutro y estado de rechazo (si se declara) existente.
    if (t.aprobacion) {
      const rutaAp = `${ruta}.aprobacion`;
      if (!DefinicionAprobacionSchema.safeParse(t.aprobacion).success) {
        errores.push({ ruta: rutaAp, mensaje: "Definición de aprobación malformada." });
      }
      push(reservada(`${rutaAp}.nombre`, t.aprobacion.nombre));
    }
    if (t.rechazoA && !nombresEstado.has(t.rechazoA)) {
      errores.push({ ruta: `${ruta}.rechazoA`, mensaje: `Estado de rechazo inexistente "${t.rechazoA}".` });
    }
  });

  // Alcanzabilidad: BFS desde el inicial siguiendo transiciones declaradas.
  if (iniciales.length === 1) {
    const inicial = estadoInicialWorkflow(def);
    const alcanzables = new Set<string>([inicial]);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const t of def.transiciones) {
        if (!alcanzables.has(t.de)) continue;
        if (!alcanzables.has(t.a)) {
          alcanzables.add(t.a);
          cambio = true;
        }
        // El destino de rechazo del gate también es alcanzable desde el origen.
        if (t.rechazoA && !alcanzables.has(t.rechazoA)) {
          alcanzables.add(t.rechazoA);
          cambio = true;
        }
      }
    }
    for (const e of def.estados) {
      // Estados estándar (cancelado/suspendido) son alcanzables por operación.
      if (!alcanzables.has(e.nombre)) {
        errores.push({
          ruta: `estados`,
          mensaje: `El estado "${e.nombre}" no es alcanzable desde el inicial "${inicial}".`,
        });
      }
    }
    // Estados no-finales deben tener salida (transición, suspensión o cancelación).
    for (const e of def.estados) {
      if (e.final) continue;
      const tieneSalida =
        def.transiciones.some((t) => t.de === e.nombre) ||
        (e.suspendible && ops.suspender) ||
        (ops.cancelar && e.nombre !== ops.cancelar.estado);
      if (!tieneSalida) {
        errores.push({
          ruta: `estados`,
          mensaje: `El estado no-final "${e.nombre}" no tiene ninguna transición de salida.`,
        });
      }
    }
  }

  return { valido: errores.length === 0, errores };
}

/** Igual que `validarWorkflow` pero lanza un Error explícito si es inválida. */
export function asegurarWorkflowValido(def: DefinicionWorkflow): void {
  const r = validarWorkflow(def);
  if (!r.valido) {
    const detalle = r.errores.map((e) => `  - [${e.ruta}] ${e.mensaje}`).join("\n");
    throw new Error(`Definición de workflow inválida (DGP-007):\n${detalle}`);
  }
}
