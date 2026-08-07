/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — identidad del servicio.
 *
 * El nombre del servicio de plataforma y la clave raíz del proceso de workflow.
 * NEUTROS (DGP-006/007): sin nombres de negocio reservados. El motor de workflow
 * multiplexa por `clave` bajo un único proceso `modulo.correctivo.workflow`, de
 * modo que varias definiciones (solicitud/intervencion/generacion) conviven bajo
 * el mismo proceso.
 */
export const MODULO = "modulo.correctivo" as const;
export const MODULO_WORKFLOW = "modulo.correctivo.workflow" as const;
