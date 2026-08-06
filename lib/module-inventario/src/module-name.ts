/** DGP-011.1 · Módulo Enterprise Inventory — Nombre canónico del servicio (sin ciclos). */
export const MODULO = "modulo.inventario";

/**
 * DGP-011.2 · Servicio del Motor de Workflow (DGP-007) dedicado al ciclo de vida
 * gobernado del inventario (transferencias, ajustes, conteos). Se monta como
 * `extraService` junto al módulo; TODA transición de un proceso gobernado se
 * ejecuta a través de sus comandos de instancia (el módulo nunca auto-aprueba).
 */
export const MODULO_WORKFLOW = "modulo.inventario.workflow";
