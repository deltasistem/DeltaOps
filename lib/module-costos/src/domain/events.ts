/**
 * DGP-021.1 · Eventos de dominio del Módulo de Costos.
 *
 * TODOS los eventos son AUTOSUFICIENTES: el payload contiene el estado completo
 * del hecho (identidad + snapshot + auditoría) para proyectar read models e
 * inscribir el Shared Timeline sin releer el aggregate. El módulo NO emite
 * eventos sobre datos ajenos: describe SÓLO sus propios hechos económicos.
 */

/** Un hecho económico fue MATERIALIZADO (ACTIVO, snapshot congelado). */
export const HECHO_MATERIALIZADO = "modulo.costos.hecho-materializado";

/** Un hecho económico fue ANULADO (append-only, auditable). */
export const HECHO_ANULADO = "modulo.costos.hecho-anulado";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [HECHO_MATERIALIZADO, HECHO_ANULADO] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
