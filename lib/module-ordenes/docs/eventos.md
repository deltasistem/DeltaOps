# Eventos de dominio y event log durable — DGP-009.2

## Event log durable (`ord_eventos`)

El módulo mantiene un **log de eventos durable** propio, `deltaops.ord_eventos`,
que es la fuente de verdad para reconstrucción/replay. Se escribe en la **misma
Unit of Work** que el agregado y con **el mismo `event.id`** que el registro del
outbox (`emitirEvento` llama a `uow.registerEvent` con ese id). El outbox **NO es**
el almacén de eventos: es el mecanismo de entrega asíncrona a los handlers de
proyección; `ord_eventos` es el registro histórico inmutable.

Cada fila incluye: `tenant_id`, `id` (uuid del evento), `stream` (id del agregado),
`seq` (orden determinista dentro del stream), `tipo`, `payload` (JSON autosuficiente),
`ocurrido_at`. Inserción `ON CONFLICT DO NOTHING` (idempotente ante reintentos).

## Payload autosuficiente

Todo evento transporta en su `payload` la información necesaria para proyectar los
read models **sin volver a leer el agregado ni otros read models**. Las proyecciones
(`projection.ts`) son funciones **puras** de `payload → filas`, reutilizadas tanto por
los handlers en vivo como por el replay (garantiza equivalencia).

## Tipos de evento

- **Del agregado** (`EVENTOS_MODULO`): creación, edición, transición de estado,
  asignación, ejecución, asociación de formulario/checklist, evidencia.
- **Operacionales** (`EVENTOS_OPERACIONALES`):
  `BITACORA_REGISTRADA`, `PLANIFICACION_ACTUALIZADA`, `PLANIFICACION_BLOQUEADA`,
  `ASIGNACION_REGISTRADA`, `RECURSO_REGISTRADO`, `SLA_ACTUALIZADO`, `RELACION_CREADA`.

`events` del servicio = `[...EVENTOS_MODULO, ...EVENTOS_OPERACIONALES]`.
