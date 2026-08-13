---
name: Discovery RLS DGP-023.3
description: Hallazgos del discovery de RLS enforcement y diseño de rol de aplicación (H-02); STOPs previos a implementar DGP-023.4.
---

# Discovery RLS (DGP-023.3) — hallazgos durables

Doc: `docs/dgp/DGP-023.3-DESCUBRIMIENTO-RLS.md` (revisión independiente PASS).

- **RLS inefectiva por dos causas independientes:** runtime como `postgres` (superuser+BYPASSRLS) **y** owner de las 174 tablas = mismo rol runtime con 0 tablas FORCE. Quitar el superusuario no basta: sin FORCE, el owner sigue evadiendo RLS.
  **Why:** relforcerowsecurity=f en todo `deltaops.*`; ambas condiciones deben resolverse juntas.
- **Matriz:** 167/174 tablas con RLS (policy uniforme `tenant_id = current_setting('app.tenant_id', true)`, roles={public}, USING=WITH CHECK); sin RLS: `idn_memberships` (tenant-scoped ⇒ crítica), `users` (espejo con password_hash), `idn_identities`, `sessions`, `kernel_outbox`, `kernel_dead_letter`, `ntf_email_templates`.
- **STOP-1 (bloqueante para 023.4):** la ruta de login usa `withGlobal` (db-helpers) sin contexto tenant sobre identidad/membresías; activar RLS/FORCE ahí sin estrategia rompe la autenticación fail-closed. Diseñar excepción explícita (rol/función) antes de mover el runtime.
- **STOP-2:** validar en el proveedor (Neon/Replit) que se pueden crear roles LOGIN y transferir ownership antes de la Fase A.
- **"Todo evento outbox lleva tenantId" NO es invariante del kernel:** existen eventos reales sin tenantId en payload (`manodeobra.valoracion-registrada`). Un handler futuro sobre un evento sin tenant fallaría-cerrado con RLS activa — cubrir en la batería de pruebas antes de FORCE.
  **How to apply:** al añadir eventos/handlers, exigir tenantId en payload o documentar por qué no aplica.
- **Diseño aprobado a proponer:** `deltaops_owner` (DDL/migraciones/seed) → `deltaops_app_rw` (NOLOGIN con DML mínimo) → `deltaops_app` (LOGIN runtime, no owner, sin bypass). Rollback nunca "superuser permanente".
- `system:utilizacion-sync` es actor de aplicación tenant-scoped; no requiere privilegio DB especial ni SECURITY DEFINER.
- Tenant context sano: set_config transaction-local en todos los repos, tenant siempre server-side, pooling sin contaminación (GUC local a transacción).
