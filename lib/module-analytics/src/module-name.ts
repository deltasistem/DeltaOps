/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — identidad del servicio.
 *
 * El nombre del servicio de plataforma. NEUTRO (DGP-006/007): sin nombres de
 * negocio reservados. Módulo de SOLO LECTURA: consume contratos públicos de los
 * módulos de dominio (Órdenes/Inventario/Activos/Correctivo/Preventivo/
 * Abastecimiento/Planes) y del Shared Timeline; JAMÁS modifica sus datos.
 */
export const MODULO = "modulo.analytics" as const;
