---
name: Discovery Auth-RLS DGP-023.4
description: Estrategia de login bajo RLS, modelo de roles validado y hallazgos que exigen cambios de código antes de la transición (H-02).
---

# Discovery Auth bajo RLS (DGP-023.4) — hallazgos durables

Doc: `docs/dgp/DGP-023.4-DESCUBRIMIENTO-AUTH-RLS.md` (revisión independiente PASS).

- **STOP-1 resuelto (diseño D+B):** las 4 tablas que login/guards tocan sin contexto tenant (`idn_identities`, `idn_memberships`, `users`, `sessions`) quedan **sin RLS por diseño** ("global/infra by design") con GRANT DML acotado al rol runtime; defensa extra con funciones SECURITY DEFINER (owner=deltaops_owner, search_path fijo) para las 2 críticas. Descartados: RLS+GUC de identidad (rompería login fail-closed) y segundo pool de conexión (sobre-ingeniería).
  **Why:** el login es global por naturaleza (email único global, membresías pre-tenant); forzar RLS ahí exige bypass o duplicar infraestructura.
- **Motor real: Replit Helium, NO Neon** (shared_preload_libraries=timescaledb,helium; base heliumdb; PG 16.10; sin rol neon_superuser). Capacidades de mutación (CREATE ROLE, ALTER OWNER, GRANT, SECURITY DEFINER) = NO VERIFICADAS: exigen el smoke test controlado en staging como primer paso de la implementación (STOP-2 parcial).
- **N-1 (código a corregir antes de la transición):** `listarTenants` usa `withGlobal` sobre `ten_tenants` (RLS=t) confiando en el bypass de superusuario — bajo rol no-superusuario devuelve 0 filas y rompe la consola SUPER_ADMIN.
  **How to apply:** cualquier `withGlobal` sobre tabla CON RLS es una bomba latente; el único caso hoy es este.
- **N-2 (código a corregir):** los eventos `manodeobra.valoracion-registrada/revalorada` emiten payload sin `tenantId` (builder `valoracionAResultado` no lo incluye) y `insertOutbox` no persiste el tenant del envelope. Regla: todo `emitir()` debe inyectar tenantId en el payload — el envelope no basta.
- **Runtime jamás DDL** (verificado: startup sin DDL; sin TRUNCATE/COPY/LOCK en runtime). Migraciones/seed → rol owner vía `DATABASE_MIGRATION_URL` separada; GRANT runtime = CONNECT+USAGE+DML+USAGE/SELECT de la única secuencia (`users_id_seq`)+EXECUTE.
- Ownership actual: 174 tablas + 1 secuencia, todo `postgres`; 0 vistas/funciones/triggers ⇒ transferencia a `deltaops_owner` es acotada y enumerable.
- Batería futura: 15 pruebas de directiva + 5 de atributos del rol + prueba dedicada del evento sin tenantId.
