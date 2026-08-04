/** DGP-008.3 · Constantes del módulo de Activos en el cliente. */
export const MODULO = "modulo.activos";

/** Clave de borrador del wizard, por tenant. */
export function claveBorrador(tenant: string): string {
  return `deltaops:activos:borrador:${tenant}`;
}
