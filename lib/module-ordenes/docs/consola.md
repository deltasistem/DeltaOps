# Consola técnica — DGP-009.2

La **Consola Técnica** es una consulta administrativa (`modulo.ordenes.consola`,
permiso `modulo.ordenes.admin`) para diagnóstico operativo. **Solo API**; no es un
dashboard, no incluye analítica ni IA.

## Contenido del reporte

- `modulo`, `version`.
- `eventos`: catálogo de tipos de evento del módulo.
- `catalogos`: nombres de catálogos disponibles.
- `readModels`: conteos/estadísticas de las proyecciones y último `eventId` aplicado.
- `eventLog`: total de eventos durables (`ord_eventos`).
- `outbox`: resumen del outbox del kernel (pendientes/procesados/muestra reciente).
- `sincronizacion`: muestra de recibos recientes.
- `rls`: listado de tablas del módulo con RLS habilitada (verificación declarativa).

## Aislamiento

Toda la información es **tenant-scoped** (contexto de ejecución). El adaptador
PostgreSQL de la consola (`PgConsolaStore`) consulta el outbox del kernel por SQL; el
adaptador en memoria usa un accesor perezoso al outbox in-memory.
