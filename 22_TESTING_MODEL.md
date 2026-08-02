# 22 — Modelo de Testing

> **DeltaOps — ESI-005 · v1.0** · El estándar de pruebas de módulos de negocio: los cuatro niveles del patrón, escalados a dominios reales.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

El reparto de ESI-004/19 completo: cuatro niveles espejo (dominio, aplicación con fakes, adaptadores con BD efímera, E2E), cada regla probada en el nivel donde vive, baterías patrón instanciadas, deterministas, nombres en español de comportamiento, puertas de ESI-002/14.

## 2. Lo que añade el estándar para dominios reales

1. **La máquina de estados se prueba completa**: por cada agregado, la tabla de transiciones legales e ilegales es exhaustiva (doc 11 §2.4); la combinatoria de estados × comandos se cubre en dominio, jamás en E2E.
2. **Baterías patrón obligatorias por tipo de pieza** (heredadas, no rediseñadas): idempotencia y concurrencia por comando; aislamiento y contrato por repositorio/lector; cursor estable por listado; reconstrucción y divergencia por proyección; valores límite por Policy; ida-y-vuelta por adaptador de integración contra su fake.
3. **Escenarios de negocio con nombre** en E2E: cada módulo define sus flujos canónicos de punta a punta (el ciclo de vida completo de una OT; el ciclo compra→recepción→stock) como pruebas E2E nombradas sobre el seed oficial; son pocos, estables y sirven de documentación ejecutable del dominio.
4. **Pruebas entre módulos**: la colaboración por eventos se prueba en tres capas — el emisor prueba que emite (contrato del evento), el consumidor prueba su reacción contra eventos fabricados (aplicación), y un E2E de flujo cruzado por pareja de módulos con tráfico real (OT cierra → Inventario descuenta) valida el cableado. Sin pruebas "integradas" combinatorias de N módulos.
5. **Datos de prueba del dominio**: cada módulo mantiene constructores de escenario ("una OT planificada con dos tareas") reutilizables entre niveles; el seed oficial (ESI-002/12) crece con escenarios de negocio nombrados por módulo.
6. **Offline y conflictos**: los comandos aptos-offline (doc 18) añaden la batería de sincronización tardía: duplicado absorbido, mundo cambiado → resolución declarada.

## Impacto sobre la implementación

Los DGP derivan su plan de pruebas mecánicamente: baterías por pieza del inventario + tabla de transiciones por agregado + escenarios E2E nombrados; la infraestructura ya existe.

## Dependencias

ESI-004/19; ESI-002/12 y /14; docs 06-12, 18-19; ETS-002 (flujos canónicos).

## Riesgos

- La combinatoria de dominios reales desbordando el E2E; mitigación: la regla §2.1/§2.4 confina la combinatoria a dominio y limita E2E a flujos nombrados — el recuento de E2E por módulo se revisa, crecer ahí es señal de reparto roto.

## Decisiones habilitadas

- Planes de prueba derivables y comparables entre DGP.
- Flujos canónicos como documentación ejecutable del negocio.

## Decisiones bloqueadas

- Prohibido cubrir combinatoria de reglas por HTTP.
- Prohibidas pruebas integradas de N módulos como red por defecto.
- Prohibido mergear piezas sin sus baterías patrón.

## Reusable Pattern

La derivación mecánica del plan (inventario → baterías; agregados → tablas; flujos → E2E nombrados) como sección fija del DGP; los constructores de escenario §2.5 como entregable reutilizable.

## Anti-Patterns

- Fixtures compartidas mutables entre pruebas.
- E2E que re-prueban validaciones de dominio una a una.
- Constructores de escenario que llaman al API real "para ser realistas" en niveles bajos.

## Knowledge Graph

- **ETS que consume**: ETS-002 (flujos canónicos), ETS-011 (fakes).
- **ESI que consume**: ESI-004/19; ESI-002/12 y /14.
- **DGP que originará**: la sección "plan de pruebas" de cada DGP-módulo, derivada de sus inventarios.
- **ADR relacionados**: ADR de reparto por niveles (ESI-004/19).
- **Módulos que reutilizarán este patrón**: todos; los E2E cruzados §2.4 nacen en las parejas OT↔Inventario y Compras↔Inventario.
