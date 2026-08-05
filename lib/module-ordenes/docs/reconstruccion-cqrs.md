# Reconstrucción CQRS por replay — DGP-009.2

El comando administrativo `modulo.ordenes.reproyectar` (permiso `modulo.ordenes.admin`)
**reconstruye todos los read models** del tenant a partir del event log durable
`ord_eventos`, con **equivalencia** respecto a la proyección en vivo.

## Algoritmo

1. Se limpian (por tenant, RLS-scoped) las tablas de proyección.
2. Se recorre `ord_eventos` del tenant en orden determinista (`stream`, `seq`).
3. Cada evento se reaplica con las MISMAS funciones puras de `projection.ts`
   (`aplicarEventoAggregate` / `aplicarEventoOperacional`) que usan los handlers en
   vivo. Al compartir código, el resultado es idéntico (equivalencia garantizada por
   construcción, no por comparación ad hoc).
4. Se audita el resultado (`{ eventos }`).

## Equivalencia verificada

La prueba de integración (`module.pg.test.ts`) crea órdenes, planifica y registra
bitácora, drena el outbox (proyección en vivo), captura el listado, ejecuta
`reproyectar` y verifica que el listado resultante es **idéntico** (mismos ids). El
replay es idempotente: reejecutarlo no altera el resultado.

## Por qué el outbox no basta

El outbox se drena y sus filas se marcan `processed_at`; no es un histórico apto para
reconstrucción. `ord_eventos` es inmutable y ordenado, por lo que es la única fuente
válida para replay.
