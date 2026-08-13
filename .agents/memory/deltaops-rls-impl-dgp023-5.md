---
name: Implementación RLS DGP-023.5 (COMPLETADA)
description: N-1/N-2/N-5 corregidos; separación de roles PostgreSQL + FORCE RLS efectiva; aislamiento A/B validado como deltaops_app.
---

# Implementación RLS (DGP-023.5) — estado durable: PASS

Doc: `docs/dgp/DGP-023.5-CIERRE-RLS-POSTGRES.md`. Tag rollback: `pre-dgp-023.5`.

- **FASES 0–13 COMPLETADAS. Veredicto PASS.** Único pendiente OPERATIVO: reiniciar el
  workflow «artifacts/api-server: API Server» (lo hace el agente principal) para que el
  proceso vivo reconecte como `deltaops_app`. Toda la superficie ya validada por conexión
  directa como `deltaops_app` + suites PG.
- **Roles (secretos Replit `DELTAOPS_OWNER_PASSWORD`/`DELTAOPS_APP_PASSWORD`):**
  `deltaops_owner` (LOGIN, dueño de todo, NO super/bypass), `deltaops_app_rw` (NOLOGIN, DML),
  `deltaops_app` (LOGIN runtime, mínimo privilegio; hereda de app_rw). Migración
  `0051_role_separation.sql`.
- **FORCE RLS:** 166 tablas tenant-scoped (`0052_force_rls.sql`). `ten_tenants` EXCLUIDA
  (para que la función SD N-1, dueño owner, liste todos los tenants). Las 7 globales sin RLS.
- **N-1:** `deltaops.tenants_para_super_admin()` SECURITY DEFINER (mig 0050); `service.ts` la usa.
- **N-2:** `tenantId` server-side en valoración + `tenant_id` en outbox (mig 0049 aditiva).
- **N-5 (NUEVO, descubierto en FASE 12):** `PgRecordStore.findById/list` y `PgAuditTrail.list`
  leían con `pool.query` SIN fijar `app.tenant_id` → 0 filas bajo FORCE con rol sin bypass.
  Corregido envolviendo las lecturas en tx con `set_config`. Archivos:
  `lib/platform/src/core/record-store.ts`, `lib/platform/src/core/audit.ts`.
- **Composición de URLs (FASE 7):** `lib/db/src/index.ts` prefiere URL de runtime compuesta
  desde env (`deltaops_app` + `DELTAOPS_APP_PASSWORD`); si `DELTAOPS_DB_ROLE=owner` usa owner;
  fallback a `DATABASE_URL`. `drizzle.config.ts` idem para migraciones. Scripts `db:push`,
  `seed:demo`, `seed:deltaops` exportan `DELTAOPS_DB_ROLE=owner`. Test de api-server corre con
  `DELTAOPS_DB_ROLE=owner` (owner para truncar; los tests SQL de aislamiento usan deltaops_app).
- **Seed wipe:** ya NO usa `SET session_replication_role=replica` (requiere superusuario);
  usa `SET CONSTRAINTS ALL DEFERRED` + borrado topológico por FKs + `set_config` del tenant.
- **Atributos runtime verificados EN deltaops_app:** super=f, bypassrls=f, createrole=f,
  createdb=f, replication=f, posee 0 objetos, 166 FORCE, DDL denegado. Aislamiento A/B: cross
  SELECT/INSERT/UPDATE/DELETE/IDOR bloqueados; sin-contexto/tenant-inexistente = 0 filas.
- **Regresión:** typecheck+build OK; todas las suites verdes (api-server 220/220). Flakiness
  conocida en kernel (lease-race) y module-ordenes/sesion.pg (contención outbox compartido):
  verde al correr en serie/aislado; NO es regresión.
- ROLLBACK runtime: borrar `DELTAOPS_APP_PASSWORD` → vuelve a DATABASE_URL sin tocar código.
- NO se comiteó. NO se inició DGP-023.6.
