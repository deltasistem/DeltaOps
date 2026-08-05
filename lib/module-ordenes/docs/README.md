# Módulo Órdenes de Trabajo Empresariales (DGP-009.1) — Dominio

`@workspace/module-ordenes` (servicio `modulo.ordenes`) implementa **solo el
DOMINIO** del módulo de Órdenes de Trabajo (OT) empresariales sobre la
plataforma DeltaOps, reutilizando corpus congelado (ETS/Charter/ESI/DGP-000…008.3).

## Alcance de esta entrega (SOLO dominio)

Incluye: aggregate `OrdenTrabajo`, objetos de valor, catálogos configurables,
ciclo de vida **declarativo gobernado por el Workflow Engine (DGP-007)** con
**estados/transiciones extendidos por tenant OPERABLES** (composición base +
extensión declarativa, validada y activada en el motor), formularios/checklists
(Dynamic Forms), evidencias (referencia a `platform.attachment`), policies,
permisos/capacidades, offline-first con **recibos de idempotencia**, consecutivo
configurable, y lectura mínima del aggregate (`detalle`).

**Excluido** (corresponde a DGP-009.2 u otras entregas): infraestructura HTTP,
rutas, OpenAPI, UI, dashboards, IA, reportes y analítica; y todo el **read-side**
(read models materializados `listar`/dashboard, proyección CQRS, **bitácora
durable**, indexación de búsqueda). **No** se crean migraciones SQL ni tablas.

## Alcance 009.1 · dominio con puertos + fakes

Esta subfase entrega **solo el dominio**. La persistencia y colaboradores
indispensables se declaran como **puertos** en `domain/ports.ts` —
`OrdenRepository`, `CatalogoPort` (incl. `extensionMaquina`), `ConsecutivoPort`,
`PlantillasPort` y `ReciboPort` (offline)— y en 009.1 se inyectan **fakes en
memoria** (`infrastructure/fakes.ts`). Los **adaptadores concretos** (PostgreSQL
/ Record Store) y **todo el read-side** (proyección CQRS a read model, bitácora
durable, dashboard, indexación de búsqueda) llegan en **DGP-009.2**. La única
lectura del dominio es `modulo.ordenes.detalle`, que lee el **aggregate** del
repositorio (no un read model materializado).

## Composición del runtime (pruebas)

El harness de pruebas (`__tests__/harness.ts`) monta en un único runtime de
plataforma **tres** servicios adicionales (`extraServices`) — es infraestructura
de prueba, no de producción:

1. `modulo.formularios` — motor de Dynamic Forms (plantillas de formularios y checklists).
2. `modulo.ordenes.workflow` — motor de Workflow (fuente de verdad del ciclo de vida).
3. `modulo.ordenes` — este módulo de negocio (con fakes de sus puertos).

## Documentos

- `dominio.md` — aggregate, objetos de valor e invariantes.
- `maquina-estados.md` — ciclo de vida declarativo y mapeo motor↔negocio.
- `workflow.md` — orquestación de transiciones y cierre con aprobación.
- `catalogos.md` — catálogos configurables (canónico vs presente+habilitado).
- `formularios-checklists.md` — asociación anclada a versión y evidencias.
- `offline.md` — idempotencia por `opId` y sincronización de colas.
- `permisos.md` — permisos, capacidades y multitenancy.

## Pruebas

`pnpm --filter @workspace/module-ordenes run test` (fakes en memoria + harness
con los motores reales de Workflow y Dynamic Forms, 0 pruebas omitidas).
