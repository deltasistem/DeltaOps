---
name: Inventario persistencia DGP-011.2
description: Lecciones de persistencia/CQRS/motor operacional de module-inventario.
---

# Enterprise Inventory — persistencia/CQRS (DGP-011.2)

- **La integración con Shared Timeline es parte obligatoria de toda fase de persistencia**: eventHandlers debe incluir un handler `timeline:<eventType>` por CADA evento que invoque el comando `platform.timeline.record` (nunca escritura directa), con `entryId = event.id` para idempotencia at-least-once, y `dependsOn: platform.timeline`. Olvidarla fue el único MAYOR de la ronda 1. Test: drenado múltiple del outbox ⇒ una entrada por evento + aislamiento de tenant.
- **`drizzle-kit push` puede reportar "no changes" aunque el espejo esté exportado** (tablas pgSchema nuevas no detectadas); los `.sql` de migraciones son la fuente de verdad — aplicarlos directo con `psql -v ON_ERROR_STOP=1 -f` crea tablas + RLS. No depender de push para tablas nuevas de deltaops.
- El motor de Workflow real valida nombres: estados en camelCase (traducir en el adapter, p.ej. `enTransito` ↔ dominio `en-transito`) y claves sin palabras de negocio reservadas (usar claves neutrales `ciclo-*`).
- Verificar cifras reportadas por el builder contra la suite real: un conteo inflado (26 vs 13) fue detectado por el revisor.
- Patrón 009.2 replicado íntegro: claim durable en procesarCola, event log propio misma UoW/mismo eventId, detalle vía read model con test de sabotaje, RLS lecturas+escrituras, consola solo admin leyendo kernel_outbox, OpenAPI congelado + drift con cobertura de todos los comandos/queries literales.
