/**
 * DGP-021.1 · Fundación del Módulo de Costos de Mantenimiento — Identidad del
 * servicio de plataforma.
 *
 * El módulo se registra como Shared Platform Service con nombre canónico
 * `modulo.costos`. Es una FUNDACIÓN AUDITABLE de HECHOS ECONÓMICOS de
 * mantenimiento: materializa costos exactos, verificables y multitenant, con
 * SNAPSHOT histórico INMUTABLE y estados mínimos ACTIVO/ANULADO.
 *
 * NO calcula agregados (costo total OT/activo, costo/hora, costo/km), NO expone
 * dashboards/KPIs y NO duplica fuentes de verdad: mano de obra, combustible y
 * materiales viven en sus módulos ORIGEN. Cuando necesita el costo exacto de un
 * material, lo consume por el CONTRATO PÚBLICO de Abastecimiento (DGP-021.0)
 * `modulo.abastecimiento.costos-exactos`; nunca lee tablas ajenas ni el endpoint
 * float legacy.
 */
export const MODULO = "modulo.costos";

/** Contrato público de Órdenes (DGP-009.x): existencia de OT y relación OT→activo. */
export const MODULO_ORDENES = "modulo.ordenes";

/** Contrato público de Abastecimiento (DGP-021.0): costo exacto de un artículo. */
export const MODULO_ABASTECIMIENTO = "modulo.abastecimiento";
