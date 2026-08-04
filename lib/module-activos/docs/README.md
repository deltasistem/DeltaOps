# Módulo Activos Empresariales (`@workspace/module-activos`)

DGP-008.1 · Módulo de dominio de DeltaOps para la gestión del ciclo de vida de
activos empresariales (equipos móviles, maquinaria, instalaciones). Construido
sobre el Kernel y la Plataforma reutilizando el molde de `module-reference` y el
runtime de máquinas de estados de `business-foundation`.

## Índice de documentación

| Documento | Contenido |
|-----------|-----------|
| [dominio.md](./dominio.md) | Aggregate `Activo`, campos mínimos y Value Objects inmutables. |
| [maquina-estados.md](./maquina-estados.md) | Máquina de estados declarativa y transiciones. |
| [catalogos.md](./catalogos.md) | Catálogos configurables por tenant vía Record Store. |
| [policies.md](./policies.md) | Las 8 políticas configurables en el PolicyEngine. |
| [eventos.md](./eventos.md) | Eventos de dominio autosuficientes y CQRS. |
| [sync.md](./sync.md) | Sincronización offline por orquestación (`sincronizar`) con RECLAMACIÓN durable por `opId` (claim→ejecutar→finalizar), recuperación por reconciliación y **cobertura de TODAS las operaciones** (DGP-008.2). |
| [configuracion.md](./configuracion.md) | `configDefaults` + `tenantConfig`. |
| [read-models.md](./read-models.md) | **DGP-008.2** · Read models especializados (payload-only, idempotentes) y consultas. |
| [reconstruccion-cqrs.md](./reconstruccion-cqrs.md) | **DGP-008.2** · `reproyectar`: reconstrucción de todos los read models. |
| [relaciones.md](./relaciones.md) | **DGP-008.2** · Grafo dirigido tipado, inversos, anticiclo, proyecciones. |
| [timeline.md](./timeline.md) | **DGP-008.2** · Línea de tiempo del módulo (append-only) y decisión sobre `platform.timeline`. |
| [colaboracion.md](./colaboracion.md) | **DGP-008.2** · Comentarios y adjuntos por referencia vía comandos de plataforma. |
| [consola.md](./consola.md) | **DGP-008.2** · Consola técnica (solo admin) del estado operativo. |
| [api.md](./api.md) | **DGP-008.2/008.3** · Contrato REST (Contract-First; Zod como fuente de verdad). |
| [busqueda.md](./busqueda.md) | **DGP-008.3** · Búsqueda rápida/contextual e indexación automática vía `platform.search`. |
| [qr.md](./qr.md) | **DGP-008.3** · Etiquetas QR/barcode/NFC (emitir idempotente, resolver) vía `platform.qr`. |

## Arranque rápido

```ts
import { crearActivosRuntime, MODULO } from "@workspace/module-activos";

// En memoria (offline / pruebas): sin pool.
const rt = crearActivosRuntime();

// PostgreSQL real:
import { pool } from "@workspace/db";
const rt = crearActivosRuntime({ pool });

const ctx = /* ExecutionContext con principal + metadata.tenantId */;
await rt.platform.kernel.commands.execute(ctx, `${MODULO}.crear`, {
  codigoEmpresarial: "EXC-001",
  nombre: "Excavadora CAT 320",
  tipo: "movil",
  categoria: "maquinaria",
  familia: "excavadoras",
});
await rt.platform.kernel.outboxProcessor.processPending(); // proyecta al read model
```

## Estructura del paquete

```
src/
  domain/          value-objects · maquina-estados · activo · policies · catalogos
  infrastructure/  repository (puertos + Fake/PG) · catalogo-service (Record Store)
  module.ts        PlatformServiceDefinition (comandos, queries, handlers, health)
  runtime.ts       crearActivosRuntime({ pool? })
  index.ts         API pública
```

## Frontera arquitectónica

- El aggregate `Activo` usa **tablas propias** (`deltaops.act_activos`,
  `act_activos_read`, `act_sync_receipts`) — nunca tablas ad-hoc por tenant. La
  idempotencia offline es durable, **concurrente** y tenant-scoped por `opId`:
  el recibo se **reclama** en estado `pendiente` ANTES de ejecutar (INSERT ON
  CONFLICT DO NOTHING) y se **finaliza** al estado terminal; los `pendiente`
  viejos se **recuperan por reconciliación** contra el agregado.
- Los **catálogos** viven en el **Record Store** de la Plataforma
  (`deltaops.platform_records`, `recordType = catalogo:<nombre>`).
- El router HTTP (`artifacts/api-server`) es **fino**: sólo traduce
  HTTP → Command/Query del Kernel. Sin lógica de dominio.
- Migración oficial: `lib/db/migrations/deltaops/0007_activos_module.sql`
  (fuente de verdad; el espejo Drizzle en `lib/db/src/schema/deltaops-activos.ts`
  sólo tipa el esquema). **DGP-008.2** añade `0008_activos_operacional.sql`
  (idempotente, aditiva): `act_relaciones`, `act_relaciones_read`,
  `act_ubicaciones_hist`, `act_responsables_hist`, `act_historial` (todas con RLS
  por `app.tenant_id`).
