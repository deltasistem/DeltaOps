/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — Nombre canónico del servicio.
 *
 * El identificador del servicio es NEUTRO y estable: `modulo.abastecimiento`. Se
 * usa como prefijo de comandos/consultas/eventos/permisos/policies del módulo.
 */
export const MODULO = "modulo.abastecimiento";

/**
 * Servicio del Motor de Workflow montado por este módulo (DGP-007). Neutro y
 * estable; se usa para namespacing de definiciones/instancias del ciclo de vida
 * gobernado (solicitud / orden de compra / recepción).
 */
export const MODULO_WORKFLOW = "modulo.abastecimiento.workflow";
