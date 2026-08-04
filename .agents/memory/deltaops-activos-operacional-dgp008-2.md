---
name: Activos operacional DGP-008.2
description: Lecciones de persistencia/CQRS/offline del módulo de Activos (read models, timeline, replay, contract-first).
---

# Activos — Persistencia, CQRS & Offline (DGP-008.2)

Reglas duras (hallazgos de la revisión, ya corregidos — no repetir):
- **El outbox NO es un event store**: la reconstrucción de read models exige bitácora durable propia del módulo (`act_eventos`, escrita en la MISMA UoW con el mismo event.id que registra el outbox). Nunca reproyectar filtrando por processed_at ni depender de la retención del outbox.
- **"Integración con Shared Timeline" significa comandos de plataforma**, no un feed propietario: platform.timeline.record/query (idempotente por entryId, filtros actor/estado/entidad/fechas). Un read model de historial interno es legítimo solo si se documenta como read model. Extensión ADITIVA de un servicio de plataforma congelado es aceptable cuando el servicio sigue siendo propietario del dato.
- **Colaboración offline**: la cola de sync necesita lista blanca explícita para operaciones que delegan en plataforma (comentar/adjuntar); sin ella el prefijo forzado del módulo las hace insincronizables.
- **Contract-First con api-spec congelado**: generador determinista de OpenAPI desde los Zod del módulo + test de drift (regenerar == comprometido, operationId por comando/query).
- Catálogos configurables con semántica vacío⇒canónico se extendió a tiposRelacion (pares inversos declarativos).
- Plataforma no expone conteos agregados de comentarios/adjuntos por tenant, solo byEntity — la consola agrega recorriendo activos (acotado, marca truncado).
- El rol de conexión dev es owner y las tablas no usan FORCE ROW LEVEL SECURITY: las policies RLS no aplican al owner; el aislamiento se garantiza por puertos tenant-scoped (mejora registrada: FORCE RLS).
