---
name: Preparación producción PDC-01
description: Hechos de plataforma y decisiones para la producción controlada de DeltaOps Lite
---

- **Backup del proveedor (Replit)**: PITR automático de la BD de PRODUCCIÓN — retención 7 días (Core) / 28 días (Pro/Teams); el restore se hace desde el Database pane a una instancia SEPARADA (no sobreescribe producción). La BD de producción solo existe tras publicar; dev y prod están separadas y el esquema se aplica al publicar. Rollback del deploy: ya no hay rollback in-place — checkpoint + republicar.
- **Health gate configurable por artefacto**: `artifact.toml → [services.production.health.startup] path`. PDC-01 lo reapuntó a `/api/deltaops/platform/ready` (SELECT 1 + SESSION_SECRET, 200/503). `/health` queda como liveness. Pendiente validar comportamiento de reintentos de autoscale en el primer deploy real.
- **Demo vs producción — recomendación Opción C**: conservar `delta-demo` como demo y crear tenant productivo nuevo poblado con el importador (los ids UUIDv5 incluyen el tenant en la clave ⇒ re-importar a otro tenant no colisiona). **Why:** la Opción A (convertir delta-demo) deja la seed demo como trampa destructiva sobre datos reales.
- **Conteos históricos canónicos** se cuentan en `platform_records` con `service='platform.timeline'` y `data->>'eventType' LIKE 'historico.%'` (jornada 1971 + preop 3736 + rutina 48 + correctivo 61 = 5816). El timeline total del tenant incluye además los eventos vivos `modulo.*` — no confundir al auditar (un auditor reportó falsa discrepancia por contar el total).
- **Veredicto PDC-01**: 🟡 PRODUCCIÓN CONTROLADA CONDICIONADA — 0 bloqueantes técnicos; pendientes de Dirección/Infra: publicar (aprovisiona BD prod), ensayo de restore, dominio + CORS_ORIGINS, rotación de secretos/credenciales demo, decisión demo-vs-prod, piloto (guion 15 pasos).
