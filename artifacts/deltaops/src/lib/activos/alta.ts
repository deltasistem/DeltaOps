/**
 * DGP-008.3 · Lógica pura del alta de activo (borradores + mapeo a CrearInput).
 * Extraída para pruebas unitarias, reutilizada por la página del wizard.
 */
import type { ValoresFormulario } from "../forms/tipos";
import { claveBorrador } from "./constantes";

/** Traduce los valores planos del formulario al `CrearInput` del módulo. */
export function construirInput(v: ValoresFormulario): Record<string, unknown> {
  const s = (k: string): string | undefined => {
    const x = v[k];
    return x == null || x === "" ? undefined : String(x);
  };
  const n = (k: string): number | undefined => {
    const x = v[k];
    return x == null || x === "" ? undefined : Number(x);
  };
  const input: Record<string, unknown> = {
    codigoEmpresarial: s("codigoEmpresarial"),
    nombre: s("nombre"),
    descripcion: s("descripcion"),
    tipo: s("tipo"),
    categoria: s("categoria"),
    familia: s("familia"),
    subfamilia: s("subfamilia"),
    criticidad: s("criticidad"),
    prioridad: s("prioridad"),
    fabricante: s("fabricante"),
    modelo: s("modelo"),
    serie: s("serie"),
    anio: n("anio"),
    vidaUtil: n("vidaUtil"),
    responsable: s("responsable"),
    supervisor: s("supervisor"),
    // §16 · Centro de costos: capturado en el alta (LITE-06 lo omitía). Fuente
    // de verdad = activo; el módulo lo persiste y valida contra `centros-costo`.
    centroCosto: s("centroCosto"),
    fechaCompra: s("fechaCompra"),
    fechaPuestaServicio: s("fechaPuestaServicio"),
    proveedor: s("proveedor"),
    observaciones: s("observaciones"),
  };
  const ubicacionId = s("ubicacionId");
  if (ubicacionId) {
    input.ubicacion = { ubicacionId, etiqueta: s("ubicacionEtiqueta") ?? ubicacionId };
  }
  const garantiaMeses = n("garantiaMeses");
  if (garantiaMeses != null) input.garantia = { meses: garantiaMeses };
  for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];
  return input;
}

/** Lee el borrador del wizard desde localStorage. */
export function leerBorrador(tenant: string): ValoresFormulario {
  try {
    const raw = localStorage.getItem(claveBorrador(tenant));
    return raw ? (JSON.parse(raw) as ValoresFormulario) : {};
  } catch {
    return {};
  }
}

/** Guarda el borrador del wizard en localStorage. */
export function guardarBorrador(tenant: string, valores: ValoresFormulario): void {
  try {
    localStorage.setItem(claveBorrador(tenant), JSON.stringify(valores));
  } catch {
    /* cuota excedida: se ignora */
  }
}

/** Elimina el borrador del wizard. */
export function borrarBorrador(tenant: string): void {
  try {
    localStorage.removeItem(claveBorrador(tenant));
  } catch {
    /* noop */
  }
}
