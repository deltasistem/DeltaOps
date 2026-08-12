/**
 * DGP-020.3 · Tarifa de mano de obra VERSIONABLE — DOMINIO PURO.
 *
 * Punto de diseño §8 resuelto: la tarifa aplica a un SUJETO polimórfico
 * (`sujetoTipo` = 'CATEGORIA' | 'IDENTIDAD'). En ESTA FASE se opera por
 * CATEGORIA (sujetoId = categoriaClave); el esquema/contrato ya admite
 * 'IDENTIDAD' para el futuro SIN romper snapshots (el snapshot copia el valor,
 * no la referencia).
 *
 * INVARIANTES:
 *  - Versionable (§8): NUNCA se sobrescribe una tarifa histórica utilizada.
 *    Cambiar = CERRAR la vigencia abierta (poner vigenciaHasta) + CREAR una nueva
 *    fila (orquestado en una sola UoW en la capa de aplicación).
 *  - Unidad: sólo 'HORA' (§7). Otra ⇒ rechazo de negocio.
 *  - SOLAPE de vigencias del mismo sujeto ⇒ rechazo determinista.
 *  - Auditoría completa (§24): quién/cuándo + valor anterior/nuevo en el cierre.
 * Sin reloj interno: fecha/actor llegan como INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { esUnidadSoportada, redondear, type UnidadTarifa } from "./dinero";

export const SUJETOS_TARIFA = ["CATEGORIA", "IDENTIDAD"] as const;
export type SujetoTarifa = (typeof SUJETOS_TARIFA)[number];

export const ESTADOS_TARIFA = ["VIGENTE", "CERRADA"] as const;
export type EstadoTarifa = (typeof ESTADOS_TARIFA)[number];

export interface Tarifa {
  readonly id: string;
  readonly tenantId: string;
  readonly sujetoTipo: SujetoTarifa;
  readonly sujetoId: string;
  readonly valor: number; // numeric(18,6) en PG; hasta 6 decimales
  readonly moneda: string;
  readonly unidad: UnidadTarifa;
  readonly vigenciaDesde: Date;
  readonly vigenciaHasta: Date | null; // null = abierta
  readonly estado: EstadoTarifa;
  readonly creadoAt: Date;
  readonly creadoPor: string;
  readonly actualizadoAt: Date;
  readonly actualizadoPor: string;
  /** Auditoría del cambio que la cerró/creó (§24). */
  readonly valorAnterior: number | null;
  readonly motivo: string | null;
}

export interface CrearTarifaInput {
  readonly id: string;
  readonly tenantId: string;
  readonly sujetoTipo: SujetoTarifa;
  readonly sujetoId: string;
  readonly valor: number;
  readonly moneda: string;
  readonly unidad: string;
  readonly vigenciaDesde: Date;
  readonly vigenciaHasta?: Date | null;
  readonly actorId: string;
  readonly ahora: Date;
  readonly valorAnterior?: number | null;
  readonly motivo?: string | null;
  /** Todas las tarifas EXISTENTES del mismo sujeto (para detectar solape). */
  readonly existentes: readonly Tarifa[];
}

/** ¿Dos intervalos [d1,h1) y [d2,h2) (h null = +∞) se solapan? */
function solapan(d1: Date, h1: Date | null, d2: Date, h2: Date | null): boolean {
  const finA = h1 ? h1.getTime() : Number.POSITIVE_INFINITY;
  const finB = h2 ? h2.getTime() : Number.POSITIVE_INFINITY;
  return d1.getTime() < finB && d2.getTime() < finA;
}

/**
 * Crea una tarifa validando unidad, valor, coherencia de vigencia y AUSENCIA de
 * solape con cualquier otra tarifa del mismo sujeto.
 */
export function crearTarifa(input: CrearTarifaInput): Result<Tarifa, KernelError> {
  if (input.sujetoId.trim() === "") return fail(KernelErrors.validation("sujetoId es obligatorio"));
  if (!SUJETOS_TARIFA.includes(input.sujetoTipo)) return fail(KernelErrors.validation(`sujetoTipo inválido: ${input.sujetoTipo}`));
  if (!esUnidadSoportada(input.unidad)) {
    return fail(KernelErrors.validation(`Unidad de tarifa no soportada: "${input.unidad}" (sólo HORA)`));
  }
  if (!Number.isFinite(input.valor) || input.valor < 0) {
    return fail(KernelErrors.validation("El valor de tarifa debe ser finito y no negativo"));
  }
  if (input.moneda.trim() === "") return fail(KernelErrors.validation("moneda es obligatoria"));
  if (input.vigenciaHasta && input.vigenciaHasta.getTime() <= input.vigenciaDesde.getTime()) {
    return fail(KernelErrors.validation("vigenciaHasta debe ser posterior a vigenciaDesde"));
  }
  for (const t of input.existentes) {
    if (t.id === input.id) continue;
    if (t.sujetoTipo !== input.sujetoTipo || t.sujetoId !== input.sujetoId) continue;
    if (solapan(input.vigenciaDesde, input.vigenciaHasta ?? null, t.vigenciaDesde, t.vigenciaHasta)) {
      return fail(
        KernelErrors.conflict(
          `Solape de vigencias para ${input.sujetoTipo}:${input.sujetoId} con la tarifa ${t.id}`,
        ),
      );
    }
  }
  return ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      sujetoTipo: input.sujetoTipo,
      sujetoId: input.sujetoId,
      valor: redondear(input.valor, 6),
      moneda: input.moneda,
      unidad: input.unidad,
      vigenciaDesde: input.vigenciaDesde,
      vigenciaHasta: input.vigenciaHasta ?? null,
      estado: (input.vigenciaHasta ? "CERRADA" : "VIGENTE") as EstadoTarifa,
      creadoAt: input.ahora,
      creadoPor: input.actorId,
      actualizadoAt: input.ahora,
      actualizadoPor: input.actorId,
      valorAnterior: input.valorAnterior ?? null,
      motivo: input.motivo ?? null,
    }),
  );
}

/** Cierra una tarifa VIGENTE poniendo vigenciaHasta (nunca reabre) (§8). */
export function cerrarTarifa(
  tarifa: Tarifa,
  vigenciaHasta: Date,
  actorId: string,
  ahora: Date,
  motivo?: string | null,
): Result<Tarifa, KernelError> {
  if (tarifa.estado === "CERRADA" && tarifa.vigenciaHasta) {
    return fail(KernelErrors.conflict(`La tarifa ${tarifa.id} ya está cerrada`));
  }
  if (vigenciaHasta.getTime() <= tarifa.vigenciaDesde.getTime()) {
    return fail(KernelErrors.validation("vigenciaHasta debe ser posterior a vigenciaDesde"));
  }
  return ok(
    Object.freeze({
      ...tarifa,
      vigenciaHasta,
      estado: "CERRADA" as EstadoTarifa,
      actualizadoAt: ahora,
      actualizadoPor: actorId,
      motivo: motivo ?? tarifa.motivo,
    }),
  );
}

/**
 * Selecciona la tarifa VIGENTE del sujeto en un instante dado (`en`): la fila
 * cuyo intervalo [vigenciaDesde, vigenciaHasta) contiene `en`. Determinista: si
 * hubiese varias (no debería, por la invariante de no-solape), toma la de
 * vigenciaDesde mayor.
 */
export function tarifaVigenteEn(tarifas: readonly Tarifa[], en: Date): Tarifa | null {
  const t = en.getTime();
  const candidatas = tarifas
    .filter((x) => x.vigenciaDesde.getTime() <= t && (x.vigenciaHasta === null || x.vigenciaHasta.getTime() > t))
    .sort((a, b) => b.vigenciaDesde.getTime() - a.vigenciaDesde.getTime());
  return candidatas[0] ?? null;
}

/** ¿La sesión [iniciadoAt, cerradoAt) cruza más de un período tarifario? (§16) */
export function cruzaPeriodos(tarifas: readonly Tarifa[], iniciadoAt: Date, cerradoAt: Date | null): boolean {
  if (!cerradoAt) return false;
  const desde = iniciadoAt.getTime();
  const hasta = cerradoAt.getTime();
  // Cuenta cuántas tarifas del sujeto tienen un borde de vigencia estrictamente
  // dentro del intervalo abierto de la sesión.
  let bordes = 0;
  for (const t of tarifas) {
    const d = t.vigenciaDesde.getTime();
    if (d > desde && d < hasta) bordes += 1;
    if (t.vigenciaHasta) {
      const h = t.vigenciaHasta.getTime();
      if (h > desde && h < hasta) bordes += 1;
    }
  }
  return bordes > 0;
}
