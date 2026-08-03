# Operaciones de la Plataforma (DGP-003)

## Composición en el API server

`artifacts/api-server/src/routes/deltaops/platform-console.ts` crea un
runtime singleton con el pool PostgreSQL de `@workspace/db` y expone la
Consola Técnica bajo `/api/deltaops/platform/*`:

| Endpoint | Contenido |
|---|---|
| `GET /services` | Shared Service Registry |
| `GET /capabilities` | Capability Registry |
| `GET /dependencies` | Dependency Registry |
| `GET /knowledge-graph` | Nodos y aristas del Knowledge Graph |
| `GET /services/health` | Health checks (503 si alguno falla) |
| `GET /queues` | Outbox pendiente/procesado y dead letter |
| `GET /jobs` | Jobs/sesiones por servicio y estado |
| `GET /storage` | Registros y tenants por servicio |
| `GET /config-defaults` | Defaults de configuración por servicio |
| `GET /logs` | Auditoría técnica reciente |

## Consola Técnica (frontend)

`artifacts/deltaops` → ruta `/plataforma`. Pestañas: Servicios, Salud,
Dependencias, Capacidades, Trabajos, Almacenamiento, Configuración,
Auditoría. Sin pantallas funcionales de negocio.

## Base de datos

- Migración oficial: `lib/db/migrations/deltaops/0004_platform_services.sql`
  (aditiva; se aplica con SQL directo — `drizzle-kit push` exige TTY).
- Tablas: `deltaops.platform_records`, `deltaops.platform_audit`, ambas con
  RLS por `current_setting('app.tenant_id', true)`.
- Espejo Drizzle: `lib/db/src/schema/deltaops-platform.ts`.

## Procesamiento de eventos

Los eventos de plataforma viajan por el outbox del Kernel. En producción debe
ejecutarse periódicamente `kernel.outboxProcessor.processPending()` (mismo
mecanismo que DGP-002). Los handlers son idempotentes: reprocesar es seguro.

## CI

`.github/workflows/ci.yml` ejecuta typecheck global y
`pnpm --filter @workspace/platform run test` (además de kernel y api-server).

## Configuración por tenant

Override en caliente: comando `platform.config.set`
(`{ key: "platform.<svc>.<clave>", value }`). Sin reinicio.
