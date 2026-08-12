/**
 * DGP-020.2 · Presentación de duraciones de sesiones de trabajo.
 *
 * IMPORTANTE (§21/§22): la FUENTE DE VERDAD de efectivo/pausado/transcurrido es
 * el READ MODEL del backend (`GET /sesiones/duraciones`), calculado desde los
 * tramos append-only. El frontend NO recorre eventos ni recompone la duración.
 *
 * Para una sesión ABIERTA, los valores del read model son acumulados «hasta el
 * momento de la lectura». Para que el cronómetro no se vea congelado entre
 * refrescos, extrapolamos localmente un tick a partir del último valor del read
 * model + su marca base (`iniciadoAt`/lectura), SIN presentarlo como definitivo:
 * al refrescar, la cifra persistida SIEMPRE gana. La extrapolación es lineal y
 * trivial (suma de milisegundos transcurridos localmente); no reconstruye la
 * lógica de tramos/pausas del dominio.
 */

/** Formatea una duración en milisegundos como `HH:MM:SS` (horas sin límite). */
export function formatearDuracion(ms: number): string {
  const seguro = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  const totalSeg = Math.floor(seguro / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const dos = (n: number): string => String(n).padStart(2, "0");
  return `${dos(h)}:${dos(m)}:${dos(s)}`;
}

/**
 * Extrapola localmente los ms «efectivo» y «transcurrido» de una sesión ABIERTA
 * para animar el cronómetro entre refrescos. Sólo avanza el tiempo cuando la
 * sesión está ABIERTA (efectivo corre); en PAUSADA/CERRADA devuelve las cifras
 * del read model sin tocar. `pausado` nunca se extrapola en cliente.
 *
 * @param base       Cifras del read model (fuente de verdad).
 * @param estado     Estado actual de la sesión.
 * @param leidoEnMs  Instante local (ms) en que se leyó `base` del read model.
 * @param ahoraMs    Instante local (ms) actual (tick).
 */
export function extrapolar(
  base: { efectivoMs: number; pausadoMs: number; transcurridoMs: number },
  estado: string,
  leidoEnMs: number,
  ahoraMs: number,
): { efectivoMs: number; pausadoMs: number; transcurridoMs: number } {
  if (estado !== "ABIERTA") return { ...base };
  const delta = Math.max(0, ahoraMs - leidoEnMs);
  return {
    efectivoMs: base.efectivoMs + delta,
    pausadoMs: base.pausadoMs,
    transcurridoMs: base.transcurridoMs + delta,
  };
}
