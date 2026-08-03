# DGP-004 · Módulo de Referencia — "Elemento de Referencia"

Módulo ejecutable y **completamente neutro** que sirve como molde oficial de
todos los módulos futuros de DeltaOps. No representa ningún concepto de
negocio: solo demuestra la arquitectura completa Kernel (DGP-002) +
Plataforma (DGP-003) de extremo a extremo.

## Dominio

- **Aggregate**: `ElementoReferencia` (`lib/module-reference/src/domain/elemento.ts`), puro.
- **Estados**: `BORRADOR → ACTIVO → ARCHIVADO` (ARCHIVADO es inmutable y terminal).
  `BORRADOR → ARCHIVADO` solo si la configuración `archivado-directo` del tenant es `"true"`.
- **Invariantes**: nombre obligatorio, longitud máxima configurable
  (`max-longitud-nombre`), versión monotónica (+1 por cambio).
- **Domain Service**: unicidad de nombre por tenant (case-insensitive).
- **Policies** (Kernel PolicyEngine, registradas automáticamente):
  - `modulo.referencia.puede-editar` — prohíbe editar ARCHIVADO.
  - `modulo.referencia.puede-archivar` — exige ACTIVO, o BORRADOR + archivado directo.
- **Eventos**: `modulo.referencia.{creado,actualizado,activado,archivado}`
  (payload con `tenantId`, `id`, `entityRef: ref:<id>`, `nombre`, `estado`, `actorId`).

## Aplicación

- Comandos: `crear` (idempotente por id de cliente), `editar`, `activar`,
  `archivar` (todos con `expectedVersion`, concurrencia optimista),
  `reproyectar` (replay del read model), `sugerirDescripcion` (AI Hook).
- Consultas (CQRS, solo read model): `listar`, `detalle`, `dashboard`, `consola`.
- Proyección: event handlers idempotentes (`last_event_id`) alimentan
  `deltaops.ref_elementos_read`.

## Infraestructura

- Tablas propias (los módulos **no** usan el Record Store de la plataforma):
  `deltaops.ref_elementos` (aggregate) y `deltaops.ref_elementos_read`
  (read model), migración `lib/db/migrations/deltaops/0005_reference_module.sql`,
  ambas con RLS por `app.tenant_id` (set_config transaccional en cada escritura).
- Adaptadores PostgreSQL y Fake (offline) intercambiables (`createReferenceRuntime`).

## Shared services utilizados

| Servicio | Uso |
| --- | --- |
| Search | indexación automática en creado/actualizado |
| Notification | notificación in-app al creador en activación |
| KPI | snapshot "elementos activos" en activación (definición auto-asegurada por código) |
| Integration | webhook opcional (`webhook-activacion`) en activación |
| AI | `sugerirDescripcion` → `platform.ai.infer` (Fake Provider) |
| Comment / Attachment / Timeline | por `entityRef = ref:<id>`; el Timeline proyecta comentarios y adjuntos |
| Dashboard/Config | stats del módulo y configuración por tenant |

## API y frontend

- API: `/api/deltaops/referencia/*` (sesión obligatoria; principal según rol:
  `platform_admin`/`admin`, `operador`, resto lectura). Incluye
  `POST /sync` para colas offline (resultados por operación).
- Frontend (`artifacts/deltaops`): `/referencia` (listado, dashboard,
  configuración, consola del módulo, modo offline con cola en localStorage y
  sincronización con conflictos visibles) y `/referencia/:id` (detalle,
  editar, activar, archivar, timeline, comentarios, adjuntos).

## Offline

- IDs generados por el cliente ⇒ `crear` idempotente en re-sincronización.
- `expectedVersion` ⇒ conflictos deterministas (KRN-CFL-001) mostrados en UI.
- `reproyectar` demuestra el replay del read model.

## Pruebas

- `lib/module-reference/src/__tests__/module.test.ts` (Fake, 22) y
  `module.pg.test.ts` (PostgreSQL, 6): dominio, registro automático,
  pipeline, policies, permisos, multitenancy, auditoría, offline
  (idempotencia/conflicto/replay), shared services, RLS, rollback,
  concurrencia y outbox. En CI (`.github/workflows/ci.yml`).
