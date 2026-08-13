---
name: Discovery de hardening DGP-023
description: Hallazgos CRÍTICOS/ALTOS abiertos de la auditoría de producción (routers legacy sin auth, RLS inactiva por superusuario) y roadmap de hardening pendiente de aprobación
---

# DGP-023 — Discovery de hardening para producción (sin código)

## CRÍTICOS abiertos (bloquean producción; pendientes de decisión de Dirección)
- **H-01 — CRUD legacy SGMA sin autenticación:** los routers legacy (`/api/work-orders`, `/api/assets`, `dashboard`, `spare-parts`, `locations`, `work-centers`, `technicians`, `suppliers`, `maintenance-plans`) se montan SIN sesión ni tenant. Verificado: GET anónimo ⇒ 200 con datos; POST/PATCH/DELETE presentes. Los datos vivos son prototipo (`public.*`), pero la superficie es explotable.
  **Decisión requerida:** autenticar, aislar por tenant, o eliminar la superficie legacy.
- **H-02 — RLS inactiva en runtime:** la app conecta a Postgres como superusuario `postgres` (`rolbypassrls=true`) ⇒ todas las políticas RLS se ignoran; el aislamiento multitenant depende 100% de la capa de app (`set_config('app.tenant_id')` + WHERE por repo). Tablas de negocio con `relforcerowsecurity=f`.
  **Decisión requerida:** rol de aplicación no-superuser + FORCE RLS antes de producción.

## ALTOS (bloquean producción)
- Tablas de identidad sin RLS (`idn_memberships`, `users`, `idn_identities`, `sessions`).
- Sin rate limiting (login/forgot/sync/uploads) — sin 429.
- Sin headers de seguridad (CSP/HSTS/X-Content-Type-Options/…); `X-Powered-By` expuesto.
- Sin backups/DR/rollback documentados; sin RPO/RTO.

## Contexto durable
- **Why:** una lectura anónima que devuelve datos de negocio y una RLS que el motor ignora son contención rota, no "mejores prácticas". El programa distingue bloqueante real de preferencia.
- **How to apply:** antes de cualquier piloto real hay que resolver H-01 (exposición anónima inmediata); antes de producción general, H-02 + ALTOS. Roadmap propuesto DGP-023.1..023.8 (HTTP/API → Auth/Sesiones → RLS/Multitenancy → Infra/Secrets → Backups/DR → Observabilidad → Frontend/Perf → validación final). No iniciar ninguna sub-fase sin aprobación expresa.
- Controles ya sólidos (no re-inventar): bcrypt r=12, tokens 32B hasheados 1-uso + anti-enumeración, cookies HttpOnly/SameSite/Secure(prod), session.regenerate anti-fixation, auth_epoch fail-closed, CORS wildcard SIN Allow-Credentials (por eso MEDIO, no crítico), deps con vulns solo dev/build.
