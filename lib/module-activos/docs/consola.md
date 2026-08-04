# Consola técnica de administración — DGP-008.2 (ítem 12)

`modulo.activos.consola` (query) expone el **estado operativo** del módulo para
diagnóstico y administración. Está **restringida a administradores**: exige el
permiso `modulo.activos.admin`; un usuario normal recibe `KRN-AUTH-*` → **403**.

Toda la información es **tenant-scoped** (lecturas con `withTenantRead` / RLS por
`app.tenant_id`; el outbox del Kernel no tiene columna de tenant, por lo que se
filtra por `event_type LIKE 'modulo.activos.%'` y `payload->>'tenantId'`).

## Forma del payload

```jsonc
{
  "modulo": "modulo.activos",
  "version": "1.0.0",
  "estados": [...],
  "eventos": [...],                 // incluye relacion-creada / -eliminada
  "policies": [...],
  "catalogos": [...],
  "tiposRelacion": [ { "tipo", "categoria", "inverso" }, ... ],
  "configuracion": { ... },         // configuración efectiva por tenant

  // (d) PROYECCIONES: conteos + lastEventId por read model.
  "readModels": {
    "activos":    { "total": n, "porEstado": { ... }, "lastEventId": "..."|null },
    "relaciones": { "total": n, "lastEventId": "..."|null },
    "historial":  { "total": n, "lastEventId": "..."|null }
  },

  // (a) OUTBOX del módulo (sólo lectura; NO reclama registros).
  "outbox": {
    "pendientes": n,
    "procesados": n,
    "ultimos": [ { "id", "tipo", "processedAt": iso|null, "occurredAt": iso }, ... ]  // últimos 10
  },

  // (b)/(c) SINCRONIZACIÓN: recibos por estado, últimos N y conflictos con detalle.
  "sincronizacion": {
    "total": n,
    "porEstado": { "pendiente": n, "aplicada": n, "idempotente": n, "conflicto": n, "rechazada": n },
    "ultimos":  [ { "opId", "comando", "estado", "clienteId", "createdAt": iso|null }, ... ],  // últimos 10
    "conflictos": [ { "opId", "comando", "estado", "clienteId", "createdAt", "resultado" }, ... ]
  },

  // (e) COLABORACIÓN: actividad del módulo + comentarios/adjuntos de plataforma.
  "colaboracion": {
    "timelineModulo": n,            // entradas de act_historial del tenant
    "comentarios": n,               // vía platform.comment.byEntity (queries de plataforma)
    "adjuntos": n,                  // vía platform.attachment.byEntity
    "activosInspeccionados": n,
    "truncado": bool,
    "nota": "..."                   // describe la limitación de conteo agregado
  },

  "rls": {
    "tablas": ["act_activos", "act_activos_read", "act_sync_receipts",
               "act_relaciones", "act_relaciones_read",
               "act_ubicaciones_hist", "act_responsables_hist", "act_historial"],
    "aislamiento": "app.tenant_id (RLS por tenant)"
  }
}
```

## Origen de cada sección (CQRS estricto)

- **readModels / outbox / sincronización / colaboración** se calculan SIEMPRE
  desde read models, el outbox del Kernel, la tabla de recibos y las **queries de
  plataforma** — nunca desde el aggregate ni con SQL directo a tablas de otros
  servicios.
- **outbox** usa una lectura de sólo diagnóstico sobre `deltaops.kernel_outbox`;
  **no** emplea `claimPending`, de modo que no perturba al procesador de outbox.
- **conflictos** son los recibos en estado `conflicto` con su `resultado`
  completo (incluye el estado actual del activo para diagnóstico del cliente).

## Limitación documentada de colaboración

La plataforma expone `platform.comment.byEntity` y `platform.attachment.byEntity`
(por `entityRef`), pero **no** una query de **conteo agregado por tenant**. Por
ello la consola agrega los conteos recorriendo los activos del read model,
acotado a **200 activos** (`activosInspeccionados`); por encima marca
`truncado: true` y el conteo es **parcial**. Las llamadas se hacen con principal
de sistema para no depender de que el administrador tenga permisos de lectura de
plataforma. El binario de los adjuntos nunca se lee: sólo se cuentan sus
metadatos.
