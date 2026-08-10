/**
 * DeltaOps · DGP-017 — Siembra idempotente de roles del sistema por tenant.
 * Los roles Enterprise son DATOS (deltaops.idn_roles). Se siembran al crear un
 * tenant y en el seed DEMO. Idempotente (ON CONFLICT DO NOTHING).
 */
import { withTenant } from "./db-helpers";
import { CATALOGO_ROLES } from "./rbac";

export async function seedRolesDeTenant(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    for (const rol of CATALOGO_ROLES) {
      await client.query(
        `INSERT INTO deltaops.idn_roles (tenant_id, clave, nombre, descripcion, es_sistema)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (tenant_id, clave) DO NOTHING`,
        [tenantId, rol.clave, rol.nombre, rol.descripcion],
      );
    }
  });
}
