/**
 * DGP-019.2 · Helpers PUROS de PRESENTACIÓN de la Ficha Operacional 360°.
 *
 * Estos helpers NO contienen cálculos de dominio (los deltas, L/h, L/100 km y
 * costos los calcula el read model del backend `modulo.utilizacion.resumen`;
 * §18/§19). Aquí sólo hay:
 *   - construcción de ventanas temporales (para pedir el resumen "últimos N
 *     días" y el período anterior) — parametrización de la CONSULTA, no cálculo;
 *   - clasificación de la métrica de combustible a mostrar (L/h para maquinaria,
 *     L/100 km para vehículos) SEGÚN EL MEDIDOR DISPONIBLE (§6);
 *   - derivación de la tendencia (signo/porcentaje) a partir de DOS resultados
 *     ya calculados por el backend — aritmética de presentación, no de dominio;
 *   - mapeo del estado real del activo a la representación visual (§4).
 *
 * Todas las funciones son deterministas: la "ahora" se inyecta desde el
 * componente (Date), nunca se lee dentro (facilita pruebas y respeta el runtime).
 */
import type { EstadoActivo } from "../activos/tipos";
import type { ResultadoCalculo, ResumenActivo } from "./tipos";

/** Ventana temporal [desde, hasta] en ISO-8601. */
export interface Ventana {
  readonly desde: string;
  readonly hasta: string;
}

/** Par de ventanas: la actual y la inmediatamente anterior de igual duración. */
export interface VentanasComparacion {
  readonly actual: Ventana;
  readonly anterior: Ventana;
}

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Construye la ventana actual (últimos `dias` hasta `ahora`) y la ventana
 * anterior contigua de la MISMA duración, para pedir dos resúmenes al backend
 * y derivar la tendencia. No calcula métricas: sólo define los rangos.
 */
export function ventanasComparacion(ahora: Date, dias: number): VentanasComparacion {
  const fin = ahora.getTime();
  const inicio = fin - dias * MS_DIA;
  const inicioAnterior = inicio - dias * MS_DIA;
  return {
    actual: { desde: new Date(inicio).toISOString(), hasta: new Date(fin).toISOString() },
    anterior: { desde: new Date(inicioAnterior).toISOString(), hasta: new Date(inicio).toISOString() },
  };
}

/** Etiqueta legible del período (p. ej. "últimos 30 días"). */
export function etiquetaPeriodo(dias: number): string {
  return `últimos ${dias} días`;
}

/* --------------------------- Clasificación combustible ------------------------ */

export type ClaseActivo = "maquinaria" | "vehiculo" | "indeterminado";

/**
 * Clasifica el activo para elegir la MÉTRICA DE COMBUSTIBLE correcta (§6),
 * basándose EXCLUSIVAMENTE en qué medidor tiene datos en el resumen del backend:
 *   - si hay Δ horómetro (horas) → maquinaria → L/h;
 *   - si hay Δ odómetro (km)     → vehículo   → L/100 km;
 *   - si hay ambos, prioriza el horómetro (maquinaria con odómetro auxiliar);
 *   - si no hay ninguno con datos → indeterminado (se mostrará "Sin datos").
 * No inventa una clase: se apoya en la fuente real del medidor.
 */
export function clasificarActivo(resumen: Pick<ResumenActivo, "deltaHorometro" | "deltaOdometro"> | null | undefined): ClaseActivo {
  const tieneHoras = tieneValor(resumen?.deltaHorometro);
  const tieneKm = tieneValor(resumen?.deltaOdometro);
  if (tieneHoras) return "maquinaria";
  if (tieneKm) return "vehiculo";
  return "indeterminado";
}

/**
 * Devuelve el `ResultadoCalculo` de combustible que corresponde a la clase del
 * activo (L/h para maquinaria; L/100 km para vehículo). El valor viene calculado
 * por el backend; aquí sólo se SELECCIONA cuál mostrar y con qué unidad.
 */
export function metricaCombustible(resumen: ResumenActivo | null | undefined): {
  readonly clase: ClaseActivo;
  readonly resultado: ResultadoCalculo | undefined;
  readonly unidad: string;
} {
  const clase = clasificarActivo(resumen);
  if (clase === "vehiculo") {
    return { clase, resultado: resumen?.litrosPor100Km, unidad: "L/100 km" };
  }
  // maquinaria o indeterminado → L/h (si indeterminado, el resultado será sin-datos)
  return { clase, resultado: resumen?.litrosPorHora, unidad: "L/h" };
}

function tieneValor(r: ResultadoCalculo | undefined | null): boolean {
  return !!r && r.tipo === "valor" && r.valor != null && Number.isFinite(Number(r.valor));
}

/* -------------------------------- Tendencia ---------------------------------- */

export interface Tendencia {
  /** Signo de la variación respecto al período anterior. */
  readonly direccion: "sube" | "baja" | "igual";
  /** Variación porcentual absoluta con signo (p. ej. "▲ 8,2 %"). */
  readonly etiqueta: string;
  /** Tendencia semántica para el DS (mayor consumo = peor). */
  readonly tono: "exito" | "error" | "neutro";
}

/**
 * Deriva la tendencia de una métrica de consumo entre el período actual y el
 * anterior. Ambos valores YA vienen calculados por el backend; esto es sólo
 * aritmética de PRESENTACIÓN (porcentaje y signo). Devuelve `null` cuando falta
 * cualquiera de los dos datos (no se inventa una tendencia sin base real).
 *
 * Semántica de tono: para consumo, SUBIR es negativo (peor) → tono "error";
 * BAJAR es positivo (ahorro) → tono "exito"; igual → "neutro".
 */
export function tendenciaConsumo(actual: ResultadoCalculo | undefined, anterior: ResultadoCalculo | undefined): Tendencia | null {
  if (!tieneValor(actual) || !tieneValor(anterior)) return null;
  const a = Number(actual!.valor);
  const b = Number(anterior!.valor);
  if (b === 0) return null; // sin base comparable
  const variacion = ((a - b) / Math.abs(b)) * 100;
  const abs = Math.abs(variacion);
  const pct = `${abs.toFixed(1).replace(".", ",")} %`;
  if (abs < 0.05) {
    return { direccion: "igual", etiqueta: `Sin cambios · ${pct}`, tono: "neutro" };
  }
  if (variacion > 0) {
    return { direccion: "sube", etiqueta: `▲ ${pct} vs período anterior`, tono: "error" };
  }
  return { direccion: "baja", etiqueta: `▼ ${pct} vs período anterior`, tono: "exito" };
}

/* ------------------------------ Estado visual -------------------------------- */

export type SemaforoEstado = "operativo" | "atencion" | "mantenimiento" | "fuera" | "neutro";

export interface EstadoVisual {
  readonly semaforo: SemaforoEstado;
  /** Punto de color para lectores no-color (icono/emoji semántico del §4). */
  readonly indicador: string;
  readonly etiqueta: string;
  /** Variante de Badge del DS (mismo mapeo que Activos). */
  readonly variante: "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";
}

/**
 * Mapea el estado REAL del dominio de Activos (§4: no inventar estados) a la
 * representación visual del semáforo operacional. "Atención requerida" no es un
 * estado nuevo del dominio: es la lectura visual de REGISTRADO (aún no operativo)
 * — se mantiene dentro de los estados existentes.
 */
export function estadoVisual(estado: EstadoActivo | string): EstadoVisual {
  switch (estado) {
    case "OPERATIVO":
      return { semaforo: "operativo", indicador: "●", etiqueta: "Operativo", variante: "exito" };
    case "MANTENIMIENTO":
      return { semaforo: "mantenimiento", indicador: "●", etiqueta: "En mantenimiento", variante: "advertencia" };
    case "FUERA_SERVICIO":
      return { semaforo: "fuera", indicador: "●", etiqueta: "Fuera de servicio", variante: "error" };
    case "REGISTRADO":
      return { semaforo: "atencion", indicador: "●", etiqueta: "Registrado", variante: "info" };
    case "RETIRADO":
      return { semaforo: "neutro", indicador: "○", etiqueta: "Retirado", variante: "neutro" };
    case "BORRADOR":
      return { semaforo: "neutro", indicador: "○", etiqueta: "Borrador", variante: "neutro" };
    default:
      return { semaforo: "neutro", indicador: "○", etiqueta: String(estado), variante: "neutro" };
  }
}

/* ------------------------------- Formato ------------------------------------- */

/** Formatea un número con separador decimal español y unidad opcional. */
export function fmtNumero(valor: number | null | undefined, decimales = 0, unidad?: string): string {
  if (valor == null || !Number.isFinite(Number(valor))) return "Sin datos";
  const n = Number(valor).toLocaleString("es", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return unidad ? `${n} ${unidad}` : n;
}

/** Fecha/hora legible (es), tolerante a valores ausentes/ inválidos. */
export function fmtFechaHora(iso: string | undefined | null): string {
  if (!iso) return "Sin datos";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("es");
}

/** Fecha corta legible (es). */
export function fmtFecha(iso: string | undefined | null): string {
  if (!iso) return "Sin datos";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("es");
}
