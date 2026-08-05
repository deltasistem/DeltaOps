/** DGP-009.1 · Módulo Órdenes de Trabajo — Nombre canónico del servicio (sin ciclos). */
export const MODULO = "modulo.ordenes";

/**
 * Servicio del Motor de Workflow (DGP-007) dedicado al ciclo de vida de las
 * órdenes. Se monta como `extraService` junto al módulo; TODA transición de
 * estado de una OT se ejecuta a través de sus comandos de instancia. El módulo
 * NUNCA implementa lógica de transición propia (mandato DGP-009.1).
 */
export const MODULO_WORKFLOW = "modulo.ordenes.workflow";
