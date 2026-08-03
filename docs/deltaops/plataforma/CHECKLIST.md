# Checklist de cumplimiento DGP-003

## Servicios (14/14)
- [x] Notification Service — colas, plantillas, preferencias, agrupación
- [x] Attachment Service — versiones, hashes, URLs firmadas, retención
- [x] Comment Service — hilos, menciones, edición, borrado lógico
- [x] Timeline Service — 100% por eventos, reconstruible
- [x] Task Service — asignaciones, prioridades, vencimientos, recordatorios
- [x] Search Service — índice global/contextual, reindexación
- [x] Export Service — jobs, estados, progreso, cancelación
- [x] Import Service — sesiones, validación, preview, ejecución vía comandos
- [x] Report Service — plantillas, jobs, versiones, histórico
- [x] QR/Barcode/NFC Service — etiquetas, resolución, validaciones, acciones
- [x] Dashboard Service — widgets, layouts, preferencias, configuración
- [x] KPI Service — catálogo, definiciones versionadas, snapshots (sin KPIs de negocio)
- [x] Integration Service — conectores, webhooks, reintentos, dead letter
- [x] AI Platform Service — registries + Provider Interface + Fake Provider (sin OpenAI)

## Por servicio
- [x] Interfaces sobre el Kernel (comandos/consultas/eventos DGP-002)
- [x] Registro automático (único camino: `registerPlatformService`)
- [x] Configuración por tenant con precedencia
- [x] Capacidades y permisos declarados
- [x] Eventos vía outbox; auditoría en el mismo UoW
- [x] Health check + observabilidad
- [x] Adaptador Fake (offline) y adaptador PostgreSQL
- [x] Integración completa con `createKernelRuntime()`

## Registros (5/5, escritura sellada)
- [x] Shared Service Registry
- [x] Capability Registry
- [x] Dependency Registry (con validación al arranque)
- [x] Knowledge Graph
- [x] Observability Registry
- [x] Registro manual prohibido (verificado por test)

## Base de datos
- [x] Migración oficial `0004_platform_services.sql` aplicada
- [x] RLS por tenant en ambas tablas
- [x] Versionado (concurrencia optimista) y borrado lógico
- [x] Compatibilidad DGP-002 (outbox/dead letter intactos)
- [x] Espejo Drizzle exportado

## Frontend
- [x] Consola Técnica `/plataforma` (servicios, salud, dependencias,
      capacidades, trabajos, almacenamiento, configuración, auditoría)
- [x] Sin pantallas funcionales de negocio

## Pruebas (29, todas verdes)
- [x] Unitarias de núcleo (registries, record store, config, auditoría)
- [x] De servicio con adaptadores Fake (= modo offline)
- [x] De permisos (denegación)
- [x] De multitenancy (aislamiento)
- [x] De integración PostgreSQL (persistencia, rollback, outbox)
- [x] De concurrencia (optimista, doble escritura)
- [x] De auditoría (persistencia atómica)
- [x] CI actualizado

## Prohibiciones respetadas
- [x] NINGÚN módulo de negocio implementado
- [x] Sin OpenAI ni proveedores de IA reales
- [x] Sin registro manual en registries
- [x] Sin secretos persistidos en claro
