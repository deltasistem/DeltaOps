# 05 — Wave Objectives

> **DeltaOps — DGP-000 · v1.0** · Los objetivos oficiales por ola: qué debe ser verdad al cierre de cada una — objetivos verificables, no aspiraciones.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Regla de formulación

El objetivo de una ola se enuncia como **estado verificable del sistema al cierre**, comprobable con los instrumentos existentes (registros, scores, compuertas). El objetivo que no se puede verificar no es objetivo del programa.

## 2. Objetivos por ola

**W0 — Plataforma de entrega**
- Objetivo: todo cambio futuro atraviesa flujo completo (rama→PR→puertas→revisión→tren) con puertas mecánicas operativas.
- Verdad al cierre: un cambio trivial recorre la fábrica de punta a punta; PR-03 en verde; compuertas ciegas al autor funcionando para humanos e IA.

**W1 — Fundación**
- Objetivo: el suelo común sobre el que todo módulo se apoya existe y es ejercitable: Kernel con identidad, tenancy y RLS dos murallas activas, permisos `MODULO.RECURSO.ACCION`, auditoría, idempotencia; chasis de experiencia con tokens, layouts y navegación; fundamento backend ESI-003 operativo.
- Verdad al cierre: un módulo de prueba puede registrarse, autenticar, autorizar, persistir con aislamiento probado por baterías intocables y renderizar en el chasis — sin construir nada de eso por su cuenta.

**W2 — Módulo de referencia**
- Objetivo: la fábrica completa validada por un módulo real operando en producción interna (Hito A: PF-01/02).
- Verdad al cierre: el módulo de referencia atravesó las siete etapas (doc 03) con todos los instrumentos usados de verdad; hallazgos de fábrica promovidos; el molde de construcción de módulos queda probado y documentado en su DGP.

**W3 — Corazón CMMS**
- Objetivo: el producto vendible mínimo — activos, órdenes de trabajo, mantenimiento preventivo y servicios de Ola 1 — operando para el primer tenant productivo (Hito B: PF-03/04).
- Verdad al cierre: un tenant real trabaja su mantenimiento diario en DeltaOps; las promesas enterprise (aislamiento, auditoría, seguridad en franja sana) son demostrables; reversa e incidentes ensayados.

**W4 — Expansión operativa**
- Objetivo: la cadena de suministro del mantenimiento (inventario, almacenes, compras, proveedores) integrada al corazón sin romperlo.
- Verdad al cierre: los flujos cruzados (orden de trabajo consume repuesto, reposición dispara compra) operan por contratos registrados; PF-05/06 de la ola en verde.

**W5 — Expansión analítica y de integración**
- Objetivo: el valor agregado sobre los datos operativos — KPIs, reportería, exportes, IA de producto e integraciones externas — sin tocar la operación que los alimenta.
- Verdad al cierre: capacidades analíticas consumiendo por contratos de lectura; IA de producto bajo su régimen congelado (ESI-006/13, ESI-008/22); primera integración externa real operando.

**W6 — Escala**
- Objetivo: el catálogo comercial completo, honesto y operable a escala (Hito D: PF-07/08).
- Verdad al cierre: registro de capacidades sin divergencia promesa/código; operación sin héroes con métricas de estabilidad sostenidas; la maquinaria de olas lista para el crecimiento posterior al programa.

## 3. Régimen

1. El objetivo de ola es el criterio maestro de sus DGP: todo DGP de la ola contribuye demostrablemente a su verdad de cierre — el DGP que no contribuye pertenece a otra ola o a ninguna.
2. Las verdades de cierre se verifican en la compuerta de la ola siguiente; el detalle de entregables vive en doc 06.

## Impacto sobre la implementación

Los DGP de cada ola citan el objetivo de su ola como criterio maestro; la cadencia evalúa el avance contra la verdad de cierre.

## Dependencias

ESI-003; ESI-006/13, /26; ESI-008/22; ESI-010/23-24, /27; docs 04, 06, 16.

## Riesgos

- Objetivos degradados a lemas ("tener la fundación lista"); mitigación: cada verdad de cierre está formulada como comprobación concreta con instrumento existente.

## Decisiones habilitadas

- Evaluación binaria del cierre de cada ola.
- Filtro de pertenencia: qué DGP entra a qué ola y por qué.

## Decisiones bloqueadas

- Prohibido cerrar olas contra objetivos reinterpretados.
- Prohibidos DGP que no contribuyen a la verdad de cierre de su ola.
- Prohibido verificar objetivos con instrumentos ad-hoc.

## Reusable Pattern

Objetivo = estado verificable al cierre + instrumento de comprobación: la ola con criterio maestro que filtra y ordena sus DGP.

## Anti-Patterns

- El objetivo tan amplio que cualquier trabajo lo "avanza".
- Declarar la ola cerrada porque sus DGP están "casi todos".
- Verdades de cierre negociadas a la baja al final de la ola.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (W3); ETS-012 (W6).
- **ESI que consume**: ESI-003 (W1); ESI-004 (W2); ESI-005/006 (W3-W5); ESI-010/23-24 (verificación).
- **DGP que originará**: cada DGP funcional cita el objetivo de su ola.
- **ADR relacionados**: ADR de objetivos verificables por ola.
- **Módulos que reutilizarán este patrón**: todos contribuyen a la verdad de cierre de su ola.
