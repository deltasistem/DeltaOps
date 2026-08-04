# Read models (CQRS estricto) — DGP-008.2

El módulo mantiene **read models especializados** poblados EXCLUSIVAMENTE desde el
payload de los eventos de dominio (payload-only) e **idempotentes** por
`last_event_id`. Las consultas **nunca** leen el aggregate (fuente de verdad);
sólo los comandos lo leen.

## Tablas (migraciones `0008` / `0009`, RLS por tenant)

| Tabla | Propósito | Proyectada desde |
|-------|-----------|------------------|
| `act_activos_read` | Listado y detalle | eventos de activo (0007) |
| `act_relaciones_read` | Árbol / relacionados / componentes | `relacion-creada`, `relacion-eliminada` |
| `act_ubicaciones_hist` | Historial de ubicaciones (append-only) | `registrado`, `ubicacion-actualizada` |
| `act_responsables_hist` | Historial de responsables (append-only) | `registrado`, `responsable-actualizado` |
| `act_historial` | Historial cronológico del activo (read model interno, append-only) | todos los eventos de dominio |

La fuente de verdad de las relaciones es la tabla `act_relaciones` (grafo dirigido
tipado); `act_relaciones_read` es su proyección desnormalizada con código/nombre
de ambos extremos para la UI.

## Bitácora de eventos durable (`act_eventos`, migración `0009`)

**No es un read model**, sino el **event log canónico** del módulo: `event_id`
(PK con `tenant_id`), `tipo`, `payload jsonb`, `occurred_at`. Se escribe en la
**misma UoW** que emite cada evento del módulo (junto a `uow.registerEvent`, con
el mismo `event.id`). Es la **fuente de verdad del replay** de reproyección,
**independiente** del outbox del Kernel y de su retención/estado de
procesamiento. Ver `reconstruccion-cqrs.md`.

## Consultas

- `modulo.activos.listar` — listado filtrable (estado/criticidad/ubicación/tipo).
- `modulo.activos.detalle` — detalle por id.
- `modulo.activos.relacionados` — salientes + entrantes (filtro `categoria`).
- `modulo.activos.arbol` — hijos (padre-de saliente) y padres (padre-de entrante).
- `modulo.activos.componentes` — componentes (compuesto-por) y pertenencia.
- `modulo.activos.historial-ubicaciones` / `-responsables` — histórico append-only.
- `modulo.activos.timeline` — línea de tiempo del activo.

## Idempotencia

Cada proyección aplica `ON CONFLICT (…) DO UPDATE … WHERE last_event_id <>
EXCLUDED.last_event_id` (o `DO NOTHING` en las tablas append-only con PK por
`event_id`). Una reentrega tardía del mismo evento no vuelve a proyectar.
