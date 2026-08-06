/** DGP-012 · Módulo Enterprise Maintenance Plans — Nombre canónico del servicio (sin ciclos). */
export const MODULO = "modulo.planes";

/**
 * DGP-012 · Servicio del Motor de Workflow (DGP-007) dedicado al ciclo de vida
 * gobernado de los planes de mantenimiento (borrador→vigente→suspendido→…). Se
 * monta como `extraService` junto al módulo; TODA transición gobernada se ejecuta
 * a través de sus comandos de instancia (el módulo nunca auto-aprueba).
 */
export const MODULO_WORKFLOW = "modulo.planes.workflow";
