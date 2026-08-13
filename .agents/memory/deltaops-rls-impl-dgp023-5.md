---
name: Implementación RLS DGP-023.5 (parcial)
description: N-1/N-2 corregidos y smoke test PostgreSQL PASS; separación de roles DETENIDA por almacenamiento seguro de credenciales.
---

# Implementación RLS (DGP-023.5) — estado durable

Doc: `docs/dgp/DGP-023.5-CIERRE-RLS-POSTGRES.md`. Tag rollback: `pre-dgp-023.5`.

- **FASES 0–3 PASS; FASES 4–13 DETENIDAS (STOP).** No es PASS de DGP-023.5.
- **N-1 corregido:** `listarTenants` ya no depende de bypass. Migración
  `0050_tenants_super_admin_secdef.sql` crea `deltaops.tenants_para_super_admin()`
  (SECURITY DEFINER, owner previsto `deltaops_owner`, search_path fijo, sin params, solo SELECT).
  `service.ts::listarTenants` la invoca. Autorización SUPER_ADMIN sigue en HTTP (`requireSuperAdmin`).
- **N-2 corregido:** `valoracionAResultado(v, tenantId)` inyecta tenant server-side en el payload
  (los 2 emisores + todos los usos). `insertOutbox`/`bury` persisten `tenant_id` desde
  `payload->>'tenantId'` (helper `tenantIdDe`). Migración aditiva `0049_kernel_outbox_tenant.sql`
  (ADD COLUMN tenant_id en kernel_outbox/kernel_dead_letter + índice parcial) aplicada con psql.
  Los 163 eventos históricos quedan con tenant_id NULL (NO falsificados; backfill exige aprobación).
- **Validación:** typecheck completo verde; module-manodeobra 42/42; kernel 31/31 (flakiness de
  contención PG en primera corrida → verde en reintento serie). Nuevos eventos persisten tenant_id.
- **HALLAZGO CRÍTICO de diseño (smoke test):** FORCE RLS somete TAMBIÉN al owner ⇒ una función
  SECURITY DEFINER cross-tenant SOLO funciona si su tabla está en RLS ENABLE (no FORCE). Por eso
  `ten_tenants` DEBE quedar EXCLUIDA de FORCE en FASE 10. Además, el owner de la función necesita
  USAGE del esquema (automático cuando `deltaops_owner` sea dueño de `deltaops`).
- **STOP (por qué):** `DATABASE_URL` y `PG*` son runtime-managed por Replit (no modificables por el
  mecanismo de secretos). `setEnvVars` guarda vars NO secretas (una connection string con contraseña
  quedaría legible ⇒ inseguro y prohibido). `requestSecrets` exige que una persona teclee el valor y
  detiene el turno. ⇒ No hay vía para que el agente GENERE la credencial y la almacene en un secret
  store real sin exponerla. Capacidad del motor (CREATE ROLE/GRANT/ALTER OWNER/SECDEF/FORCE/LOGIN)
  está VERIFICADA en FASE 3; persistencia de roles tras reinicio del clúster sigue NO VERIFICADA.
- **Env recomendado (pendiente de desbloqueo):** conservar admin como DATABASE_ADMIN_URL/rollback;
  DATABASE_MIGRATION_URL (owner) + DATABASE_RUNTIME_URL (app) como SECRETOS; el pool debe preferir
  DATABASE_RUNTIME_URL con fallback a DATABASE_URL (cambio aditivo NO aplicado aún).
- NO se comiteó (working tree listo para revisión del agente principal). NO se inició DGP-023.6.
