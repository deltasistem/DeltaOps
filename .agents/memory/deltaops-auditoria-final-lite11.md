---
name: Auditoría final LITE-11
description: Lecciones del hardening final — aislamiento de BD de test, fail-fast de conexión, Tabs perezosas, veredicto RC
---

- **Guard de BD de test B1–B4 fail-closed** (`@workspace/db/test-guard`, subpath SIN efectos): B1 nunca en producción; B2 sin DATABASE_TEST_URL ⇒ skip limpio (jamás DATABASE_URL); B3 test≠runtime; B4 marcador en vivo `deltaops.is_test_database` o allowlist exacta o patrón por TOKEN (`(^|[-_])tests?([-_]|$)`, no `/test/i`). Las 29 suites destructivas lo usan; el seed verifica `runtimeEsBdDeTest` antes de sembrar.
- **Un guard exportado desde un barrel con efectos es inusable**: `lib/db/src/index.ts` lanza si falta DATABASE_URL al cargar ⇒ el guard debe exportarse por subpath dedicado sin side-effects.
- **Fail-fast de conexión en prod**: sin DELTAOPS_APP_PASSWORD ⇒ lanzar (no caer al admin del proveedor); también con DELTAOPS_DB_ROLE=owner sin OWNER_PASSWORD (el borde owner-sin-password caía al admin en silencio).
- **Lazy mount de Tabs debe ser PERSISTENTE**: desmontar pestañas al salir destruye borradores (formularios inline). Patrón correcto: montar en primera visita, mantener montada con `hidden`. La ficha de activo tenía 14 paneles eager ⇒ 44 s de TTI; con 1 panel inicial baja a ~2-3 s.
- **Importador**: idempotencia por opId real (Δ=0 en re-corridas); una re-importación puede AÑADIR filas legítimas si el estado previo estaba incompleto (activo faltante) — no confundir con duplicación; la prueba decisiva es la corrida siguiente con Δ=0.
- **HMAC de adjuntos separado**: ATTACHMENT_URL_SECRET opcional con fallback a SESSION_SECRET, mismo resolver al firmar y verificar.
- **E2E con subagentes concurrentes se sabotea solo**: audits RBAC que hacen login/logout de las mismas cuentas invalidan sesiones por epoch (AUTH_STALE) y las importaciones pesadas causan 502 — serializar tester vs auditores.
- **Veredicto LITE-11**: RELEASE CANDIDATE condicionado; 🟡 abiertos: backup del proveedor NO VERIFICADO, health gate del deploy apunta a /health (no /ready), CORS_ORIGINS y secretos de prod por configurar, rollback documentado sin ensayar.
