# Read models (CQRS) — DGP-009.2

Las **consultas** del módulo se sirven EXCLUSIVAMENTE desde read models (proyecciones),
nunca desde el agregado ni por join sobre la tabla de escritura. Los read models se
proyectan ÚNICAMENTE a partir del **payload autosuficiente** de cada evento (ver
`eventos.md`), mediante handlers **idempotentes** disparados por el outbox.

Esto incluye `detalle`: lee **sólo** de `ord_ordenes_read` (read model de detalle) y
**no** consulta el aggregate/repositorio ni tiene *fallback* a él; tras `reproyectar`
responde desde el read model reconstruido. Un test lo verifica saboteando el
repositorio (lanza si `findById` se invoca durante la consulta).

## Tablas de proyección (esquema `deltaops`, prefijo `ord_`)

| Read model | Tabla | Consulta(s) que sirve |
|---|---|---|
| Listado / detalle | `ord_ordenes_read` | `listar`, `detalle` |
| Agenda / calendario | `ord_agenda_read` | `agenda`, `calendario` |
| Asignaciones | `ord_asignaciones_read` | `asignaciones` |
| Responsables (histórico) | `ord_responsables_read` | `responsables` |
| Relaciones | `ord_relaciones_read` | `relaciones`, `activos-relacionados`, `dependencias` |
| Historial cronológico | `ord_historial_read` | `historial` |
| Bitácora operacional | `ord_bitacora_read` | `bitacora` |
| Documentación | `ord_documentacion_read` | `documentacion`, `formularios`, `checklists` |

> 8 tablas cubren las 13 lecturas requeridas: `calendario` deriva de la agenda
> (agrupada por día); `activos-relacionados` y `dependencias` filtran relaciones por
> categoría (`activo`/`orden`); `formularios`/`checklists` filtran documentación por clase.

## Idempotencia

Cada handler de proyección aplica el evento de forma idempotente:

- Read models de estado (ordenes/agenda/relaciones/documentación): *upsert* por clave
  natural; se ignora el evento si su `eventId` ya fue aplicado (o su versión es menor).
- Read models append-only (historial/bitácora/asignaciones/responsables): inserción con
  guarda por `(tabla, tenant, eventId)` — reaplicar el mismo evento no duplica filas.

## RLS

Todas las tablas de lectura tienen Row Level Security habilitada con la política
`tenant_id = current_setting('app.tenant_id', true)` en **lectura y escritura**. El
adaptador PostgreSQL fija `app.tenant_id` por transacción (`set_config`).
