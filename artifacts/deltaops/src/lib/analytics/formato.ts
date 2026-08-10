/**
 * DGP-016 · Formateo declarativo de valores de indicadores.
 *
 * El `formato` es una cadena declarativa del indicador (p.ej. "porcentaje",
 * "horas", "moneda", "entero", "decimal"). El formateo es de PRESENTACIÓN: no
 * altera el valor calculado por el backend.
 */

/** Formatea un número según el formato declarativo del indicador + unidad. */
export function formatearValor(valor: number, formato?: string, unidad?: string): string {
  if (!Number.isFinite(valor)) return "—";
  const f = (formato ?? "").toLowerCase();
  switch (f) {
    case "porcentaje":
    case "percent":
    case "%":
      return `${redondear(valor, 1)}%`;
    case "moneda":
    case "currency":
      return new Intl.NumberFormat("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(valor);
    case "entero":
    case "integer":
      return new Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(Math.round(valor));
    case "horas":
    case "hours":
      return `${redondear(valor, 1)} ${unidad || "h"}`;
    case "dias":
    case "días":
    case "days":
      return `${redondear(valor, 1)} ${unidad || "d"}`;
    case "decimal":
    default:
      return `${new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(valor)}${unidad ? ` ${unidad}` : ""}`;
  }
}

function redondear(v: number, dec: number): number {
  const p = Math.pow(10, dec);
  return Math.round(v * p) / p;
}

/** Formatea un timestamp ISO a fecha/hora legible en español. */
export function formatearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

/** Formatea un timestamp ISO a fecha corta (sin hora). */
export function formatearFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { dateStyle: "medium" });
}
