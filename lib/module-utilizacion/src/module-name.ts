/**
 * DGP-019.1 · Módulo de Utilización — Identidad del servicio de plataforma.
 *
 * Servicio ÚNICO `modulo.utilizacion` (dominio de utilización, medidores y
 * combustible). Prefijo de tablas `utl_`; rutas `/api/deltaops/utilizacion`.
 *
 * A DIFERENCIA de correctivo, este módulo NO usa (aún) el Workflow Engine:
 * no existe `MODULO_WORKFLOW`. Toda la maquinaria de gobierno de ciclo, órdenes,
 * inventario, abastecimiento, dynamic forms y cuadrillas queda fuera de alcance.
 */
export const MODULO = "modulo.utilizacion" as const;
