# Línea de tiempo — DGP-008.2

Hay **dos** artefactos distintos y deliberadamente separados:

1. **Shared Timeline de plataforma** (`platform.timeline`) — la línea de tiempo
   **canónica y compartida** entre módulos.
2. **`act_historial`** — un **read model interno** del módulo (historial
   cronológico del activo). **No** es "el Shared Timeline".

## 1) Shared Timeline (canónico, plataforma)

`platform.timeline` proyectaba originalmente sólo eventos nativos de plataforma
(`COMMENT_*`, `ATTACHMENT_*`, `TASK_*`) y carecía de un comando genérico para
registrar entradas desde un módulo. Para integrar el módulo **sin** escribir
nunca directamente en las tablas de plataforma, se añadió a `platform.timeline`:

- **`platform.timeline.record`** — comando idempotente (por `entryId`, que es el
  `id` del evento del módulo) que registra una entrada en el timeline compartido
  con `eventType`, `entityRef`, `actorId`, `resumen`, `estado`,
  `entidadRelacionada`, `payload` y `occurredAt`.
- **`platform.timeline.query`** — consulta con filtros `entityRef`, `actorId`,
  `eventType`, `estado`, `entidadRelacionada`, `desde`, `hasta`, `limit`
  (orden `occurredAt` descendente).

El módulo proyecta **CADA** evento (todos los de `EVENTOS_MODULO` **y** de
`EVENTOS_RELACION`) al Shared Timeline mediante un `eventHandler`
(`timeline-compartido:<evento>`) que invoca `platform.timeline.record` con el
principal de sistema — patrón **module-reference**, nunca escritura directa. La
idempotencia por `entryId` evita duplicados ante reentregas del outbox. En los
eventos de relación, `entidadRelacionada` se rellena con el destino.

### Consulta con filtros obligatorios

`modulo.activos.timeline { id, actor?, estado?, entidadRelacionada?, desde?,
hasta?, limit? }` delega en `platform.timeline.query` (fijando
`entityRef = activo:<id>`) y expone los filtros por **actor**, **rango de
fechas** (`desde`/`hasta`), **estado** y **entidad relacionada**.

> `platform.timeline.rebuild` sólo reconstruye eventos nativos de plataforma;
> las entradas proyectadas por el módulo se re-registran durante la
> reproyección del propio módulo (ver `reconstruccion-cqrs.md`).

## 2) `act_historial` (read model interno)

Read model append-only del historial cronológico del activo, poblado por el
`eventHandler` `historial:<evento>` para **todos** los eventos del módulo
(activos **y** relaciones). Cada fila lleva `entity_ref` (`activo:<id>`),
`tipo_evento`, `estado`, `version`, `actor_id`, `resumen` y `registrado_at`; es
idempotente por `event_id` (PK). Se consulta con
`modulo.activos.historial { id }` (orden `registrado_at` desc, con `event_id`
como desempate determinista para que la reproyección sea equivalente).

## Colaboración

Comentarios y adjuntos por activo usan `platform.comment` / `platform.attachment`
sobre `entityRef = activo:<id>`; sus eventos los proyecta la plataforma a su
propio timeline. Ver `colaboracion.md`.
