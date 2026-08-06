/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — identidad del servicio.
 *
 * El nombre del servicio de plataforma y la clave raíz del proceso de workflow.
 * NEUTROS (DGP-006/007): sin nombres de negocio reservados. El motor de workflow
 * multiplexa por `clave` bajo un único proceso `modulo.preventivo.workflow`
 * (corrección DGP-013), de modo que varias definiciones (programa/actividad/
 * generación) conviven bajo el mismo proceso.
 */
export const MODULO = "modulo.preventivo" as const;
export const MODULO_WORKFLOW = "modulo.preventivo.workflow" as const;
