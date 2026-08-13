---
name: Discovery de hardening DGP-023
description: Hallazgos CRÍTICOS/ALTOS abiertos de la auditoría de producción (routers legacy sin auth, RLS inactiva por superusuario) y roadmap de hardening pendiente de aprobación
---

# DGP-023 — Discovery de hardening para producción (sin código)

## Estado de los CRÍTICOS
- **H-01 — CERRADO (DGP-023.2):** SGMA retirado por completo (frontend, 10 routers legacy, 9 tablas public.*, seed, contratos). Rutas legacy ⇒ 404. Tag `pre-retiro-sgma` + backup `backups/sgma-public-pre-drop.sql` (gitignored) para rollback.
- **H-02 — ABIERTO — RLS inactiva en runtime:** la app conecta a Postgres como superusuario `postgres` (`rolbypassrls=true`) ⇒ todas las políticas RLS se ignoran; el aislamiento multitenant depende 100% de la capa de app (`set_config('app.tenant_id')` + WHERE por repo). Tablas de negocio con `relforcerowsecurity=f`.
  **Decisión requerida:** rol de aplicación no-superuser + FORCE RLS antes de producción.

## Lecciones del retiro (DGP-023.2)
- El health gate de deploy del api-server ahora apunta a `/api/deltaops/platform/health` (no existe `/api/healthz`).
- Al retirar una superficie de un contrato compartido: editar solo paths/schemas exclusivos y regenerar clientes en el MISMO cambio (Error/useDeltaops* se conservaron); routers+spec+codegen atómico evitó romper typecheck.
- Los "errores legacy" en logs durante validación pueden ser los propios curls de verificación negativa — atribuir origen antes de tratarlos como regresión.
- Los 400 `KRN-VAL-001` en `inventario/catalogos/tipos|estados` desde el frontend son deuda preexistente ajena al retiro (página carga igual).

## ALTOS (bloquean producción)
- Tablas de identidad sin RLS (`idn_memberships`, `users`, `idn_identities`, `sessions`).
- Sin rate limiting (login/forgot/sync/uploads) — sin 429.
- Sin headers de seguridad (CSP/HSTS/X-Content-Type-Options/…); `X-Powered-By` expuesto.
- Sin backups/DR/rollback documentados; sin RPO/RTO.

## H-01 profundizado (DGP-023-H01, análisis de dependencias)
- La superficie legacy (43 rutas, 9 tablas `public.*` con ~52 filas demo) **NO es eliminable unilateralmente**: `artifacts/sgma` es un producto vivo (workflow corriendo, deploy configurado) que la consume vía hooks generados desde `lib/api-spec/openapi.yaml` (`baseUrl:/api`). Retirar paths del contrato rompe su compilación al regenerar el cliente.
- **DeltaOps probado independiente:** cero referencias a hooks/rutas/tablas legacy en `artifacts/deltaops` y en `lib/module-*`/`routes/deltaops/*`; esquemas disjuntos (public.* vs deltaops.*, sin FKs cruzadas); `seed-sgma` es script manual sin cableado.
- Recomendación entregada: **B) aislamiento temporal** ya (cerrar CRUD anónimo sin romper sgma) → luego C (migrar) o A (eliminar) según decida Dirección el futuro de sgma. Pendiente de decisión.

## Retiro de SGMA aprobable (DGP-023.1, Discovery PASS)
- **Decisión de Dirección:** SGMA oficialmente RETIRADO (nunca fue a producción); DeltaOps es el único producto. Retiro pendiente de aprobación de ejecución.
- DB confirmada trivial de retirar: esquema `public` contiene SOLO las 9 tablas SGMA, 0 FKs (ni cross-schema con deltaops.*), 0 vistas/triggers/funciones, ~52 filas 100% demo/seed. DROP futuro seguro con `pg_dump` previo.
- **2 acoplamientos de infraestructura (no bloqueantes, condicionan la ejecución):**
  1. Health gate de deploy del api-server apunta a `/api/healthz`, servido SOLO por el router legacy — repuntar a `/api/deltaops/platform/health` ANTES/atómico con eliminar `health.ts`.
  2. `openapi.yaml` + `api-client-react` + `api-zod` son COMPARTIDOS: el schema `Error` lo usan rutas `/deltaops/auth/*` y los hooks `useDeltaops*` viven en el mismo cliente generado ⇒ editar solo paths/schemas SGMA y regenerar clientes en el MISMO cambio atómico que retira los routers (jamás borrar los paquetes).
- Secuencia validada: retirar artifacts/sgma → migrar health gate → routers+spec+regeneración atómica → seed/schemas drizzle/barrel db → docs/config → pg_dump+DROP por migración → validación completa DeltaOps. Rollback: tag pre-retiro + git revert + dump.

## Contexto durable
- **Why:** una lectura anónima que devuelve datos de negocio y una RLS que el motor ignora son contención rota, no "mejores prácticas". El programa distingue bloqueante real de preferencia.
- **How to apply:** antes de cualquier piloto real hay que resolver H-01 (exposición anónima inmediata); antes de producción general, H-02 + ALTOS. Roadmap propuesto DGP-023.1..023.8 (HTTP/API → Auth/Sesiones → RLS/Multitenancy → Infra/Secrets → Backups/DR → Observabilidad → Frontend/Perf → validación final). No iniciar ninguna sub-fase sin aprobación expresa.
- Controles ya sólidos (no re-inventar): bcrypt r=12, tokens 32B hasheados 1-uso + anti-enumeración, cookies HttpOnly/SameSite/Secure(prod), session.regenerate anti-fixation, auth_epoch fail-closed, CORS wildcard SIN Allow-Credentials (por eso MEDIO, no crítico), deps con vulns solo dev/build.
