---
name: Business Foundation DGP-006
description: Convenios del framework genérico (@workspace/business-foundation) que todo módulo futuro debe seguir.
---

# Business Foundation Framework (DGP-006)

Paquete `lib/business-foundation` — runtimes 100% genéricos (cero nombres de negocio) sobre Kernel + Plataforma. Familias: `nucleo/` (DefinicionEntidad/Modulo, entidad, máquina de estados, repositorio sobre RecordStorePort, CRUD, `crearModuloGenerico`), `consulta/` (filtro, búsqueda, catálogo, árbol), `operaciones/` (asignación, aprobación, lote, importación, exportación), `colaboracion/` (comentarios, adjuntos, historial, cronología, KPI, panel), `andamiaje/` (scaffolding programático, validación, bootstrap HTTP).

Reglas duras (surgieron de la revisión arquitectónica — no repetir):
- **ExtrasModulo debe componer TODO el contrato**: eventos, capacidades, permisos, dependeDe y configuracionDefaults, no solo comandos/queries/handlers. `crearModuloGenerico` fusiona con dedupe.
- **Convenio de configuración**: `registerDefaults` recibe claves SIN prefijo (el servicio las prefija); los handlers leen `tenantConfig.get(tenant, '<servicio>.<clave>')`. Mezclarlo produce claves `<servicio>.<servicio>...` que nunca resuelven.
- **Offline First en /sync**: `crear` exige `id` de cliente (UUID) — la deduplicación durable es id de cliente + `_opIds`; nunca recibos en memoria (fuga cross-tenant y pérdida tras reinicio).
- **Mutaciones multi-registro (p.ej. mover árbol)**: una sola UoW con el repositorio directo, jamás comandos anidados (UoW independientes → estado parcial).
- **Vocabulario prohibido** incluso en genéricos: activo/inventario/orden/compra/combustible/sst — usar habilitado/deshabilitado, posicion, vigente. El validador de andamiaje lo rechaza.
- Test PG del kernel (`lease concurrente`) asume outbox sin pendientes ajenos: eventos `platform.notification.queued` residuales del dev runtime lo rompen; marcar `processed_at` antes de correr.
