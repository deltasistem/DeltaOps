/**
 * DGP-020.3 · Fundación de Mano de Obra — Identidad del servicio de plataforma.
 *
 * El módulo se registra como Shared Platform Service con nombre canónico
 * `modulo.manodeobra`. Es una FUNDACIÓN AUDITABLE de mano de obra: compone (SOLO
 * LECTURA) la fuente única de tiempo de DGP-020.2 (sesiones de trabajo) para
 * derivar valoraciones de costo con snapshot histórico inmutable. NUNCA duplica
 * el tiempo ni recalcula tramos: `efectivo_ms` de la query pública de duraciones
 * de Órdenes es la AUTORIDAD.
 */
export const MODULO = "modulo.manodeobra";

/** Servicio público de Órdenes (DGP-020.2) del que se consume el tiempo real. */
export const MODULO_ORDENES = "modulo.ordenes";
