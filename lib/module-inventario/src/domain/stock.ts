/**
 * DGP-011.1 · Módulo Enterprise Inventory — Modelo de STOCK e invariantes.
 *
 * El stock se representa como un conjunto de "cubetas" por ESTADO. Los estados
 * son fijos por semántica contable (NO clasifican al item: eso son catálogos):
 *   · disponible    — libre para consumir/reservar/transferir.
 *   · reservado     — apartado para una demanda futura concreta (Reserva).
 *   · comprometido  — comprometido a una ejecución en curso (OT/proyecto).
 *   · enTransito    — en movimiento entre ubicaciones/bodegas (Transferencia).
 *   · enInspeccion  — recibido, pendiente de control de calidad.
 *   · bloqueado     — retenido administrativamente (no operable).
 *   · vencido       — caducado; fuera de disponible, pendiente de disposición.
 *
 * INVARIANTES (siempre consistentes, verificadas en pruebas):
 *   1. Todas las cubetas son >= 0.
 *   2. `total = suma de todas las cubetas`.
 *   3. Las MUTACIONES sólo ocurren aplicando un MOVIMIENTO (evento); jamás se
 *      escribe una cubeta directamente desde fuera.
 *   4. Cada movimiento CONSERVA masa salvo entradas/salidas/ajustes explícitos.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Cubetas de stock por estado contable. */
export interface Stock {
  readonly disponible: number;
  readonly reservado: number;
  readonly comprometido: number;
  readonly enTransito: number;
  readonly enInspeccion: number;
  readonly bloqueado: number;
  readonly vencido: number;
}

export const ESTADOS_STOCK = [
  "disponible",
  "reservado",
  "comprometido",
  "enTransito",
  "enInspeccion",
  "bloqueado",
  "vencido",
] as const;
export type EstadoStock = (typeof ESTADOS_STOCK)[number];

export const STOCK_CERO: Stock = Object.freeze({
  disponible: 0,
  reservado: 0,
  comprometido: 0,
  enTransito: 0,
  enInspeccion: 0,
  bloqueado: 0,
  vencido: 0,
});

/** Total de existencias (todas las cubetas). */
export function totalStock(s: Stock): number {
  return (
    s.disponible + s.reservado + s.comprometido + s.enTransito + s.enInspeccion + s.bloqueado + s.vencido
  );
}

/** Verifica que TODAS las cubetas sean no negativas y finitas. */
export function stockConsistente(s: Stock): boolean {
  return ESTADOS_STOCK.every((e) => Number.isFinite(s[e]) && s[e] >= -1e-9);
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

function normalizar(s: Stock): Stock {
  return Object.freeze({
    disponible: redondear(Math.max(0, s.disponible)),
    reservado: redondear(Math.max(0, s.reservado)),
    comprometido: redondear(Math.max(0, s.comprometido)),
    enTransito: redondear(Math.max(0, s.enTransito)),
    enInspeccion: redondear(Math.max(0, s.enInspeccion)),
    bloqueado: redondear(Math.max(0, s.bloqueado)),
    vencido: redondear(Math.max(0, s.vencido)),
  });
}

/* --------------------------- Delta de un movimiento ---------------------- */

/**
 * Un movimiento produce un DELTA por cubeta. Toda mutación de stock es la
 * aplicación pura de un delta sobre el estado previo. El módulo construye estos
 * deltas SÓLO desde eventos de movimiento (nunca desde fuera del dominio).
 */
export type DeltaStock = Partial<Record<EstadoStock, number>>;

/**
 * Aplica un delta al stock manteniendo las invariantes. Falla (sin mutar) si el
 * resultado dejaría alguna cubeta negativa: garantiza que no se puede consumir/
 * mover/liberar más de lo que hay en cada estado.
 */
export function aplicarDelta(actual: Stock, delta: DeltaStock): Result<Stock, KernelError> {
  const siguiente: Stock = {
    disponible: actual.disponible + (delta.disponible ?? 0),
    reservado: actual.reservado + (delta.reservado ?? 0),
    comprometido: actual.comprometido + (delta.comprometido ?? 0),
    enTransito: actual.enTransito + (delta.enTransito ?? 0),
    enInspeccion: actual.enInspeccion + (delta.enInspeccion ?? 0),
    bloqueado: actual.bloqueado + (delta.bloqueado ?? 0),
    vencido: actual.vencido + (delta.vencido ?? 0),
  };
  for (const e of ESTADOS_STOCK) {
    if (siguiente[e] < -1e-9) {
      return fail(
        KernelErrors.conflict(`Stock insuficiente en estado "${e}": disponible ${actual[e]}, requerido ${-(delta[e] ?? 0)}`),
      );
    }
  }
  return ok(normalizar(siguiente));
}

/* ------------------------- Semántica de movimientos ---------------------- */

/**
 * Familias NEUTRAS de movimiento reconocidas por el motor de stock. El tipo de
 * movimiento del tenant (catálogo `tipos-movimiento`) se MAPEA a una de estas
 * familias en la capa de aplicación; el motor sólo entiende la semántica
 * contable, nunca las etiquetas del tenant.
 */
export const FAMILIAS_MOVIMIENTO = [
  "entrada",
  "salida",
  "transferencia-salida",
  "transferencia-entrada",
  "reserva",
  "liberacion",
  "consumo",
  "devolucion",
  "ajuste-positivo",
  "ajuste-negativo",
  "conteo",
  "inicializacion",
  "correccion",
  "bloqueo",
  "desbloqueo",
  "inspeccion-aprobar",
  "vencimiento",
] as const;
export type FamiliaMovimiento = (typeof FAMILIAS_MOVIMIENTO)[number];

export interface EntradaMovimiento {
  readonly familia: FamiliaMovimiento;
  readonly cantidad: number;
  /**
   * Para `conteo`/`correccion`: cantidad objetivo (nuevo disponible). Para
   * `inicializacion`: disponible inicial. Ignorada por el resto de familias.
   */
  readonly objetivo?: number;
}

/**
 * Traduce un movimiento a su DELTA de stock (semántica contable). Es PURA y
 * total: cualquier familia produce un delta bien definido.
 */
export function deltaDeMovimiento(actual: Stock, mov: EntradaMovimiento): Result<DeltaStock, KernelError> {
  const q = mov.cantidad;
  if (mov.familia !== "conteo" && mov.familia !== "correccion" && mov.familia !== "inicializacion") {
    if (!(q > 0)) return fail(KernelErrors.validation("La cantidad del movimiento debe ser positiva"));
  }
  switch (mov.familia) {
    case "entrada":
    case "devolucion":
      return ok({ disponible: +q });
    case "salida":
    case "consumo":
      return ok({ disponible: -q });
    case "reserva":
      return ok({ disponible: -q, reservado: +q });
    case "liberacion":
      return ok({ reservado: -q, disponible: +q });
    case "transferencia-salida":
      return ok({ disponible: -q, enTransito: +q });
    case "transferencia-entrada":
      return ok({ enTransito: -q, disponible: +q });
    case "ajuste-positivo":
      return ok({ disponible: +q });
    case "ajuste-negativo":
      return ok({ disponible: -q });
    case "bloqueo":
      return ok({ disponible: -q, bloqueado: +q });
    case "desbloqueo":
      return ok({ bloqueado: -q, disponible: +q });
    case "inspeccion-aprobar":
      return ok({ enInspeccion: -q, disponible: +q });
    case "vencimiento":
      return ok({ disponible: -q, vencido: +q });
    case "inicializacion": {
      const objetivo = mov.objetivo ?? q;
      if (!(objetivo >= 0)) return fail(KernelErrors.validation("La inicialización requiere una cantidad no negativa"));
      return ok({ disponible: objetivo - actual.disponible });
    }
    case "conteo":
    case "correccion": {
      const objetivo = mov.objetivo ?? q;
      if (!(objetivo >= 0)) return fail(KernelErrors.validation("El conteo/corrección requiere una cantidad objetivo no negativa"));
      // Concilia SOLO la cubeta disponible con lo contado; el resto no cambia.
      return ok({ disponible: objetivo - actual.disponible });
    }
    default:
      return fail(KernelErrors.internal(`Familia de movimiento no soportada: ${String(mov.familia)}`));
  }
}

/**
 * Aplica un movimiento completo: calcula el delta y lo aplica preservando las
 * invariantes. Devuelve el nuevo stock (inmutable) o falla sin mutar.
 */
export function aplicarMovimiento(actual: Stock, mov: EntradaMovimiento): Result<Stock, KernelError> {
  const delta = deltaDeMovimiento(actual, mov);
  if (!delta.ok) return delta;
  return aplicarDelta(actual, delta.value);
}
