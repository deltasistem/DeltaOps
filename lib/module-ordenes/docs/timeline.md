# Shared Timeline — DGP-009.2

El módulo publica en la **línea de tiempo compartida de plataforma**
(`platform.timeline`) para dar trazabilidad transversal (correlacionable con activos,
etc.). NO se implementa una timeline propia.

## Registro

`registrarEnTimeline()` ejecuta el comando `platform.timeline.record` con contexto
SYSTEM y `correlationId` heredado. Se invoca desde los `eventHandlers` tanto para
eventos del agregado como operacionales. Campos enviados:

- `entryId` (id del evento, idempotente), `entityRef` (referencia de la OT),
- `eventType`, `actorId`, `occurredAt`,
- `resumen`, `estado`, `entidadRelacionada`, `payload`.

## Consulta

La lectura de la timeline se hace vía `platform.timeline.query` (plataforma), con los
filtros que ésta ofrece. El módulo no duplica ese almacenamiento.

`platform.timeline` es un servicio oficial de plataforma (no requiere registro manual);
se declara en `dependsOn` del servicio del módulo.
