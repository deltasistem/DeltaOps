# DeltaOps · Shared Platform Services (DGP-003)

## Propósito

La Plataforma de Servicios Compartidos materializa la capa transversal
definida en ESI-006: **14 servicios** de infraestructura que cualquier módulo
funcional futuro (activos, inventarios, OT, etc.) podrá consumir **sin
modificar la plataforma**. La plataforma se construye íntegramente sobre el
Kernel DGP-002 (`@workspace/kernel`) y NO contiene ningún módulo de negocio.

## Paquete

`lib/platform` → `@workspace/platform`. Punto de composición oficial:

```ts
import { createPlatformRuntime } from "@workspace/platform";

const platform = createPlatformRuntime({ pool }); // PG; sin pool → Fake (offline)
```

`createPlatformRuntime()`:
1. Monta el Kernel (`createKernelRuntime`).
2. Selecciona adaptadores: `PgRecordStore`/`PgAuditTrail` si hay `pool`,
   `FakeRecordStore`/`FakeAuditTrail` en caso contrario (modo offline/tests).
3. Crea los **cinco registros oficiales** (Shared Service, Capability,
   Dependency, Knowledge Graph, Observability).
4. Registra automáticamente los 15 servicios oficiales (config + 14 DGP-003)
   vía `registerPlatformService()` — el ÚNICO camino de registro.
5. Valida el grafo de dependencias; si falta un servicio declarado, falla
   explícitamente al arrancar.

## Los 14 servicios

| Servicio | Nombre | Resumen |
|---|---|---|
| Notification | `platform.notification` | Plantillas, preferencias, colas, agrupación, entrega |
| Attachment | `platform.attachment` | Metadatos, versiones, hashes, URLs firmadas, retención |
| Comment | `platform.comment` | Hilos, menciones, edición del autor, borrado lógico |
| Timeline | `platform.timeline` | Proyección 100% por eventos; `rebuild` desde auditoría |
| Task | `platform.task` | Asignaciones, prioridades, vencimientos, recordatorios |
| Search | `platform.search` | Índice global/contextual alimentado por comandos y eventos |
| Export | `platform.export` | Jobs con estados, progreso, cancelación y auditoría |
| Import | `platform.import` | Sesiones, validación, preview; ejecuta filas vía comandos |
| Report | `platform.report` | Plantillas, jobs, versiones e histórico |
| QR/Barcode/NFC | `platform.qr` | Etiquetas, tipos, validaciones, resolución, acciones |
| Dashboard | `platform.dashboard` | Widgets, layouts, preferencias, configuración |
| KPI | `platform.kpi` | Catálogo, definiciones versionadas, snapshots, resultados |
| Integration | `platform.integration` | Conectores, webhooks, credenciales (referencias), reintentos |
| AI Platform | `platform.ai` | Registries + Provider Interface + Fake Provider (sin OpenAI) |

Más `platform.config` (soporte transversal de configuración por tenant).

## Garantías transversales (todas heredadas del Kernel o del marco declarativo)

- **Multitenancy**: `tenantOf(ctx)` exige `ctx.metadata.tenantId`; los datos
  se aíslan por tenant en memoria y con RLS en PostgreSQL.
- **Permisos**: cada comando/consulta declara `authorization.permissions`.
- **Auditoría**: toda escritura registra una entrada en el trail dentro del
  mismo Unit of Work (atómica).
- **Eventos**: emitidos vía `uow.registerEvent` → outbox del Kernel
  (at-least-once, reintentos, dead letter).
- **Concurrencia optimista**: columna `version` en `platform_records`.
- **Observabilidad**: health check por servicio; telemetría del Kernel.
- **Offline**: adaptadores Fake completos con la misma semántica.

## Criterio de aceptación

Cualquier módulo futuro consume cualquier servicio ejecutando sus comandos y
consultas a través del Kernel (`kernel.commands.execute` /
`kernel.queries.execute`) o suscribiéndose a sus eventos — sin tocar el código
de la plataforma. Extensiones se agregan con `extraServices` en
`createPlatformRuntime`, usando el mismo mecanismo declarativo.
