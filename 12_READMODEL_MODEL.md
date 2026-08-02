# 12 — Modelo de Read Models

> **DeltaOps — ESI-005 · v1.0** · El estándar de modelos de lectura en módulos de negocio: cuándo proyectar, cómo mantener y quién puede leer qué.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Todo modelo de lectura sigue ESI-004/15: proyección mantenida por consumidor idempotente, reconstruible por diseño, un solo escritor, verificación de divergencia, jamás fuente de decisiones de escritura.

## 2. Lo que añade el estándar para dominios reales

1. **Cuándo proyectar**: la lectura directa de las tablas del agregado (vía lector del plano de lectura) es el default; se proyecta cuando hay agregación (resúmenes, contadores), desnormalización cara (listados con datos de varios agregados propios) o historia acumulada (saldos de inventario por bodega). Cada proyección del DGP declara cuál de las tres razones la justifica.
2. **Saldos y acumulados**: los dominios de Inventario y Combustible viven de acumulados (stock por bodega, consumo por equipo). El estándar los trata como proyecciones desde eventos de movimiento — el saldo **no** es un campo del agregado que se actualiza a mano; es derivado, reconstruible desde los movimientos, con verificación de divergencia periódica. Cuando una invariante de escritura necesita el saldo (no despachar sin stock), esa invariante usa el conteo transaccional del propio módulo dentro de la UoW (patrón ESI-004/09-10), no la proyección.
3. **Proyecciones multi-módulo**: la única forma legal de vista combinada (doc 07 §2.4) — un módulo (o el módulo dueño de la pantalla) proyecta desde eventos publicados de otros. La proyección vive en el módulo consumidor y se reconstruye desde sus bandejas; nunca lee tablas ajenas.
4. **Retención propia**: las proyecciones con historia declaran su horizonte (ETS-009); reconstruible no significa infinito.

## Impacto sobre la implementación

Las proyecciones se generan con su consumidor idempotente y su verificación de divergencia incluidos; el DGP entrega el inventario de proyecciones con razón, fuente de eventos y horizonte.

## Dependencias

ESI-004/15; docs 07-08; ETS-007 (frontera con analítica), ETS-009; ESI-003/21.

## Riesgos

- Confundir proyecciones operativas con analítica: los tableros históricos y comparativos pertenecen a la ruta analítica de ETS-007, no a proyecciones transaccionales; mitigación: la frontera se revisa en el inventario del DGP (doc 13 la retoma para KPIs).

## Decisiones habilitadas

- Saldos confiables, reconstruibles y verificables en los dominios de stock y consumo.
- Pantallas combinadas sin acoplar módulos por tablas.

## Decisiones bloqueadas

- Prohibido decidir escrituras leyendo proyecciones.
- Prohibidos saldos como campos mutables mantenidos a mano.
- Prohibidas proyecciones leyendo tablas de otro módulo.

## Reusable Pattern

Las tres razones para proyectar §2.1 como criterio del formulario; el patrón de saldos §2.2 (derivado + invariante por conteo transaccional) para todo dominio con acumulados.

## Anti-Patterns

- Proyección sin reconstrucción (AP-09).
- "Cachear el saldo en el agregado" para evitar el consumidor.
- Proyecciones que se corrigen a mano en producción en vez de reconstruirse.

## Knowledge Graph

- **ETS que consume**: ETS-007 (frontera analítica), ETS-009 (retención).
- **ESI que consume**: ESI-004/15; ESI-003/21.
- **DGP que originará**: la sección "inventario de proyecciones" de cada DGP-módulo.
- **ADR relacionados**: ADR de saldos derivados (este documento §2.2, a instanciar por Inventario y Combustible).
- **Módulos que reutilizarán este patrón**: Inventario y Combustible (saldos), OT (resúmenes de carga de trabajo), todos para listados desnormalizados.
