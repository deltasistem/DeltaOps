/**
 * DGP-021.3 · Capacidades de PRESENTACIÓN de la composición de costos (§22).
 *
 * La composición es LECTURA: no hay CTAs de escritura en estas superficies. El
 * backend es la AUTORIDAD (403 sin permiso) y RECORTA los datos por rol/tenant
 * (p. ej. un TECNICO sólo ve su propia mano de obra). Este helper deriva qué
 * mostrar/ocultar; nunca es un bypass.
 *
 * Mapeo por rol canónico:
 *   SUPER_ADMIN / TENANT_ADMIN / SUPERVISOR / PLANIFICADOR → leen la composición.
 *   TECNICO                                                → lee (recorte del backend).
 *   CONSULTA / desconocido                                 → sólo lectura.
 */
import type { Sesion } from "../identidad/tipos";

export interface CapacidadesCostos {
  /** Ver la composición de costos (todo rol con acceso al módulo). */
  readonly leer: boolean;
  /** Aviso de recorte: el TECNICO ve una vista parcial (su mano de obra). */
  readonly vistaRecortada: boolean;
}

export function capacidadesCostos(
  sesion: Pick<Sesion, "rol"> | null | undefined,
): CapacidadesCostos {
  if (!sesion) return { leer: false, vistaRecortada: false };
  const rol = String(sesion.rol ?? "").toUpperCase();
  return {
    leer: true,
    vistaRecortada: rol === "TECNICO",
  };
}
