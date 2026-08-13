---
name: Auditoría de producto DGP-022
description: Resultado de la auditoría integral pre-producción (CRÍTICO de consola de plataforma, veredicto piloto/producción, deudas MAYORES de hardening)
---

# DGP-022 — Auditoría integral de producto (fase sin código)

## CRÍTICO ABIERTO — PLATFORM-CONSOLE-ACL (pendiente de fix aprobado)
La consola técnica de plataforma autoriza el rol legacy `admin` además de `platform_admin`; el RBAC canónico mapea TENANT_ADMIN→`admin` ⇒ un TENANT_ADMIN obtiene 200 en los 10 endpoints `/api/deltaops/platform/*` con fuga cross-tenant real (logs sin scope de tenant, agregados globales). Verificado en vivo 2026-08-13 (SUPERVISOR/CONSULTA 403, anónimo 401).
**Why:** el guard usa el espejo legacy `deltaops.users.rol`, no un rol de plataforma real.
**How to apply:** ningún piloto/onboarding hasta corregirlo (fix mínimo: exigir rol de plataforma real y/o scope+403) y verificar 403 de TENANT_ADMIN en CADA endpoint platform/* con SUPER_ADMIN intacto. Requiere aprobación de Dirección (solicitada en el documento).

## Lección de auditoría
- Probar la denegación en la RUTA UI no prueba la superficie API: hay que verificar cada endpoint directo con curl por rol. La UI de /administracion/saas denegaba limpio mientras la API /platform/* filtraba datos.
- La memoria del programa ya contenía el hallazgo (dgp017) pero el documento inicial lo omitió: al auditar, contrastar SIEMPRE la memoria contra el informe antes de declarar «sin críticos».

## Veredicto vigente (documento docs/dgp/DGP-022-DESCUBRIMIENTO.md)
- Piloto controlado: SÍ CONDICIONADO al fix del CRÍTICO. Producción general: NO — hardening imprescindible (DGP-023 sugerido).
- MAYORES de hardening: CORS abierto, sin rate limiting, sin helmet/CSP/HSTS, tablas de identidad sin RLS (solo app-layer), bundle único 1.4 MB, colapso de 6 roles canónicos a 3 legacy (SUPERVISOR/PLANIFICADOR/TECNICO indistinguibles a nivel de comando), backups/monitoreo/rollback no declarados.
- GAPs de dominio no bloqueantes de piloto (degradan honesto a SIN_DATOS): GAP-FUEL-MONEY/OT, GAP-MO-PERIODO, GAP-INV-CANT, GAP-CLOCK.
- Ruta recomendada: aprobación+fix CRÍTICO → verificación negativa → piloto → DGP-023 hardening → producción → DGP-024 (RBAC granular/UX técnico) y DGP-025 (exactitud financiera) según convenga.
