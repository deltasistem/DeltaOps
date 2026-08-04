# Reconstrucción CQRS (reproyección por *replay* del event stream) — DGP-008.2

El comando `modulo.activos.reproyectar` (permiso `modulo.activos.admin`)
reconstruye **todos** los read models del módulo **releyendo el flujo de
eventos** desde la **bitácora durable del módulo**, reaplicando las mismas
proyecciones payload-only. No usa snapshots del agregado.

## Fuente de verdad del replay: la bitácora `act_eventos` (NO el outbox)

El outbox transaccional del Kernel (`kernel_outbox`) **no es un event store**:

- filtra por `processed_at` (los eventos **pendientes** tras un fallo del
  procesador quedarían fuera), y
- está sujeto a **retención/limpieza** (los eventos antiguos pueden borrarse).

Reconstruir desde el outbox dejaría la reconstrucción **incompleta**. Por eso el
módulo mantiene su propia **bitácora de eventos durable e íntegra**
(`deltaops.act_eventos`, migración `0009`, RLS por tenant):

- `event_id` (PK con `tenant_id`), `tipo`, `payload jsonb`, `occurred_at`.
- Se escribe en la **MISMA UoW** que emite cada evento del módulo: el helper
  `emitirEvento` hace `eventLog.append(...)` **y** `uow.registerEvent(...)` con el
  **mismo `event.id`**, de modo atómico. Es una tabla **propia del módulo** (no
  de plataforma), por lo que escribirla junto al `registerEvent` es legítimo.
- Usar el mismo `event.id` garantiza que el replay produce read models **bit a
  bit idénticos** (mismo `lastEventId`/`eventId` que la proyección en vivo).

La bitácora es **independiente** del outbox y de su estado de procesamiento; la
consola técnica puede seguir mostrando el outbox como **diagnóstico**.

## Algoritmo

1. **Limpia** los read models del tenant: `act_activos_read`,
   `act_relaciones_read`, `act_ubicaciones_hist`, `act_responsables_hist` y
   `act_historial`. El vaciado **reinicia el guard de idempotencia** por
   `event_id` para que el replay (que reusa los mismos ids) repueble las filas.
2. Lee `adapters.eventLog.stream(tenant)` — flujo COMPLETO del tenant en orden
   cronológico determinista (`occurred_at asc, event_id asc`), *tenant-scoped* y
   **sólo lectura**.
3. Para **cada** evento reaplica las **MISMAS funciones de proyección
   payload-only** que usan los `eventHandlers` en caliente (`reproyectarEvento`).

Devuelve `{ eventos, relaciones }`. Es **idempotente**.

## Backfill (puente única vez)

Como los eventos ya emitidos antes de esta subfase no estaban en `act_eventos`,
la migración `0009` incluye un **backfill best-effort** desde el outbox
existente (`INSERT ... SELECT` de `event_type LIKE 'modulo.activos.%'` con
`ON CONFLICT DO NOTHING`), documentado como **puente único**. A partir de ahí la
bitácora se puebla **en línea**. Para tenants nuevos la bitácora es completa
desde el primer evento; el replay funciona **desde ahora** con o sin backfill.

## Garantías verificadas (fake + PG)

- **Equivalencia total**: tras operaciones variadas (transición, ubicación,
  responsable, relaciones incl. una baja), el replay produce read models
  **idénticos** (igualdad completa, no sólo conteos).
- **Independiente de `processed_at`**: con eventos **aún pendientes** en el
  outbox (o forzados a `processed_at NULL`), el replay los reconstruye igual.
- **Resistente a retención**: tras **borrar** las filas del outbox del módulo, el
  replay desde la bitácora sigue **completo**.
- **Aislamiento por tenant** de `act_eventos`.

## Orden determinista

Para sostener la equivalencia ante empates de `registrado_at`/`actualizado_at`,
las consultas de historial y de relaciones aplican un **desempate determinista**
(`event_id` / `id`).

## Shared Timeline

`reproyectar` reconstruye los read models del módulo; las entradas del Shared
Timeline de plataforma se re-registran vía `platform.timeline.record`
(idempotente por `entryId`).
