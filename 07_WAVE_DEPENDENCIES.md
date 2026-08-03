# 07 — Wave Dependencies

> **DeltaOps — DGP-000 · v1.0** · Las dependencias entre olas: qué habilita qué, con qué tipo de dependencia y qué solapes son legales — el orden hecho explícito.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Tipos de dependencia

| Tipo | Significado |
|---|---|
| **Dura** | La ola no puede abrir sin el cierre verificado de la anterior (compuerta) |
| **De contrato** | La ola puede abrir cuando los contratos que consume están publicados, aunque la implementación siga madurando (N/N-1 protege) |
| **De capacidad** | La ola puede abrir solo si existe equipo real sin canibalizar la ola en curso (doc 18) |

## 2. La cadena oficial

| Dependencia | Tipo | Fundamento |
|---|---|---|
| W0 → W1 | **Dura** | Sin fábrica no hay flujo gobernado; PR-03 es compuerta (ESI-010/23) |
| W1 → W2 | **Dura** | El módulo de referencia existe para ejercitar la fundación; sin Kernel operable no hay qué ejercitar |
| W2 → W3 | **Dura** | Hito A (PF-01/02): la fábrica se valida antes de fabricar en serie — la dependencia más protegida del programa |
| W3 → W4 | Dura en operación, **de contrato** en preparación | Los DGP de W4 pueden especificarse y contratar fronteras durante W3 tardío; su construcción abre con Hito B |
| W3 → W5 | **De contrato** | La analítica consume contratos de lectura del corazón; puede prepararse en paralelo, construir cuando los contratos estén publicados y estables |
| W4 ∥ W5 | **De capacidad** | Solape legal con fronteras contratadas (CP-06) y equipos reales (doc 18) |
| W4/W5 → W6 | **Dura** | PF-07/08 exigen el catálogo operando; la escala no se adelanta |

## 3. Reglas normativas

1. **Las dependencias duras son compuertas, no opiniones**: su verificación usa los criterios PR/PF ya congelados (ESI-010/23-24); la "apertura provisional" de una ola con dependencia dura en rojo no existe.
2. **La dependencia de contrato habilita preparación, no construcción anticipada de todo**: especificar DGP, contratar fronteras y esqueletizar pruebas es legal; implementar contra contratos no publicados es construir sobre arena (CP-02 violado).
3. **La dependencia de capacidad se declara con nombres**: "tenemos equipo para W5" significa personas concretas asignadas sin vaciar W4 — la capacidad aspiracional no abre olas (ESI-010/24 PF-05).
4. **Dentro de cada ola rige la matriz fina** (doc 16): esta cadena gobierna entre olas; los DGP individuales declaran las suyas en el registro.

## Impacto sobre la implementación

La cadencia de programa consulta esta cadena antes de abrir cualquier frente; el registro (doc 12) valida la ola de cada DGP contra ella.

## Dependencias

ESI-010/13 (N/N-1), /23-24; docs 04-06, 09, 12, 16, 18.

## Riesgos

- La dependencia "de contrato" usada como puerta trasera para construir W5 completo durante W3; mitigación: la regla §3.2 distingue preparación de construcción, y el registro expone DGP de W5 en estado Construcción antes de su habilitación como violación del programa.

## Decisiones habilitadas

- Apertura de frentes con base objetiva y tipos de dependencia claros.
- Preparación anticipada legal que acorta el camino crítico (doc 08).

## Decisiones bloqueadas

- Prohibida la apertura de olas con dependencia dura en rojo.
- Prohibida la construcción contra contratos no publicados.
- Prohibido abrir frentes con capacidad aspiracional.

## Reusable Pattern

Dependencias tipificadas (dura/contrato/capacidad) + compuertas congeladas + preparación legal anticipada: el orden explícito que maximiza paralelismo sin colisión.

## Anti-Patterns

- "Abrimos W3 provisionalmente mientras W2 termina".
- El equipo fantasma que figura en dos olas a la vez.
- Tratar toda dependencia como dura (serialización innecesaria) o como blanda (colisión garantizada).

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009/11 (N/N-1 como protector); ESI-010/23-24 (compuertas).
- **DGP que originará**: cada DGP hereda las dependencias de su ola más las propias.
- **ADR relacionados**: ADR de cadena de dependencias entre olas.
- **Módulos que reutilizarán este patrón**: sus dependencias se declaran con la misma tipificación.
