# 19 — Testing del Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Los cuatro niveles de prueba de un módulo, con su reparto exacto y sus baterías patrón.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los cuatro niveles (espejo de ESI-002/03, instanciados)

| Nivel | Prueba | Infraestructura | Qué cubre en el ejemplar |
|---|---|---|---|
| **Dominio** | Agregado, Policy, servicio de dominio, en tabla | Ninguna | Todas las transiciones (legales e ilegales), invariantes, valores límite de la Policy, asignación de códigos |
| **Aplicación** | Casos de uso y consumidores con fakes del Kernel | Ninguna | Todos los caminos del comando (éxito + 4 denegaciones), idempotencia, atomicidad afirmada sobre el fake de UoW, consumidor idempotente |
| **Adaptadores** | Repositorio, lector, proyección contra BD efímera | PostgreSQL efímero con RLS activo | Batería de contrato compartida fake/real (doc 12), aislamiento de tenant, cursor estable, mapeo ETS-010 |
| **E2E** | Flujos completos por HTTP contra el sistema arrancado | Sistema completo local (ESI-002/11) | El Golden Path (doc 22), las denegaciones visibles por API, la traza completa, la convergencia de la proyección |

## 2. El reparto normativo

1. **La pirámide es consecuencia, no meta**: dominio y aplicación concentran los casos porque ahí viven las decisiones; adaptadores prueban contratos, no reglas; E2E prueba integración, no combinatoria. La combinatoria de reglas jamás se prueba por HTTP.
2. **Cada regla se prueba en el nivel donde vive** (doc 08): la invariante en dominio, la orquestación en aplicación, el mapeo en adaptadores, el cableado en E2E. Una regla probada en dos niveles es sospecha de regla duplicada.
3. **Nombres en español describiendo comportamiento** (ESI-003/26): "rechaza activar un elemento archivado".
4. **Deterministas**: reloj fake, datos propios por prueba, cero dependencia del orden; la BD efímera se levanta por batería, no se comparte entre desarrolladores.
5. **Las baterías patrón son producto de este módulo**: idempotencia, concurrencia, contrato de puerto, aislamiento de tenant, cursor estable, reconstrucción de proyección — quedan como infraestructura de prueba reutilizable de plataforma.

## 3. Puertas

El módulo pasa los cuatro peldaños de ESI-002/14: dominio+aplicación en pre-commit/local (rápidos, sin infraestructura), adaptadores+E2E en la puerta de CI. La cobertura exigida es la del Charter §9 (Definition of Done); el ejemplar la cumple sin exención.

## Impacto sobre la implementación

El DGP del módulo construye las pruebas junto a cada pieza (las plantillas las incluyen, ESI-002/18); las baterías patrón se promueven a plataforma al cerrar el módulo.

## Dependencias

Docs 05-15; ESI-002/03, /11, /14 y /18; ETS-011 (fakes); Charter §9.

## Riesgos

- Baterías patrón divergiendo de las plantillas con el tiempo; mitigación: plantilla, generador y ejemplo cambian en el mismo PR (ESI-002/18); el módulo de referencia es "el ejemplo".

## Decisiones habilitadas

- Kit de baterías patrón reutilizable por todos los módulos.
- Criterio de nivel único por regla para revisión de pruebas.

## Decisiones bloqueadas

- Prohibido probar combinatoria de negocio por HTTP.
- Prohibidas pruebas dependientes de orden o de datos compartidos.
- Prohibido mockear lo que tiene fake oficial del Kernel.

## Reusable Pattern

Los DGP futuros copian: la tabla §1 como plan de pruebas obligatorio (sustituyendo contenidos), el criterio de nivel único, y las baterías patrón §2.5 como dependencias directas.

## Anti-Patterns

- Mocks artesanales por pieza en lugar de los fakes del contrato.
- Pruebas E2E como red exclusiva ("si pasa E2E, está bien").
- Cobertura inflada con pruebas sin aserciones de comportamiento.
