# 21 — Definition of Ready

> **DeltaOps — ESI-009 · v1.0** · La definición de listo: qué debe saber un trabajo antes de empezar — la compuerta que evita construir sobre niebla.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

"Listo" es la compuerta de entrada al ciclo (doc 20 §2.2): un elemento de trabajo está listo cuando el equipo puede empezar sin descubrir a mitad de camino que no sabía qué construir. No exige diseño total anticipado — exige lo mínimo para no trabajar a ciegas. Es el equivalente de flujo del principio "la declaración precede" (ESI-008/05, doc 05).

## 2. Criterios (DoR-01…DoR-08)

| # | Criterio |
|---|---|
| **DoR-01** | Objetivo claro en términos de usuario o sistema: qué cambia y para quién (los roles de ETS-001 cuando aplica) |
| **DoR-02** | Criterios de aceptación escritos y verificables (doc 23) |
| **DoR-03** | Alcance acotado: cabe en el ciclo; lo grande se partió antes de entrar |
| **DoR-04** | Normas aplicables identificadas: qué ETS/ESI/DGP toca; si toca contratos, esquema, permisos o superficie, la categoría reforzada (doc 05 §2.8) se conoce desde ya |
| **DoR-05** | Dependencias declaradas: de otros elementos, equipos o decisiones pendientes — sin "ya veremos" |
| **DoR-06** | Riesgos conocidos anotados: migraciones, rupturas potenciales, zonas sensibles |
| **DoR-07** | Estrategia de exposición esbozada: ¿tras toggle? ¿gradual? (docs 12-13) |
| **DoR-08** | Cabida de verificación: se sabe cómo se probará (niveles, doc 08) y qué señal lo confirmará en producción |

## 3. Reglas normativas

1. **Sin listo no entra al ciclo**: el elemento incompleto se termina de preparar, no se "empieza mientras tanto" — empezar sin listo es cómo el ciclo se llena de trabajo estancado.
2. **Listo es proporcional**: la corrección chica satisface los criterios en cinco líneas; la funcionalidad grande, en una página; el formulario ceremonial idéntico para todo es el anti-patrón, no el estándar.
3. **Preparar es trabajo visible**: el refinamiento que produce elementos listos consume capacidad declarada del ciclo (doc 20 §2.3) — la preparación invisible es la capacidad fantasma.
4. **Listo no es congelado**: el aprendizaje durante la construcción ajusta el elemento con rastro; listo evita la niebla inicial, no prohíbe aprender.

## Impacto sobre la implementación

DoR-01…08 entran como plantilla del elemento de trabajo en la herramienta de gestión; la planificación del ciclo los verifica como compuerta.

## Dependencias

Docs 05, 08, 12-13, 20, 22-23; ETS-001; ESI-008/05 (patrón declaración-precede).

## Riesgos

- La compuerta degenerando en burocracia de formularios; mitigación: proporcionalidad (§3.2) y la retrospectiva del ciclo podando criterios que no evitan problemas reales (doc 28).

## Decisiones habilitadas

- Ciclos con menos trabajo estancado a mitad de camino.
- Estimación y partición informadas antes de comprometer.

## Decisiones bloqueadas

- Prohibido admitir al ciclo elementos sin DoR completo.
- Prohibida la preparación como trabajo invisible sin capacidad.
- Prohibido usar DoR como excusa para diseño total anticipado.

## Reusable Pattern

Compuerta de entrada proporcional + declaración mínima suficiente: el "listo" que evita la niebla sin congelar el aprendizaje.

## Anti-Patterns

- Empezar "mientras se aclara" y descubrir el bloqueo en el día ocho.
- El DoR de veinte campos que todos rellenan con "N/A".
- Partir el trabajo recién al descubrir que no cabe.

## Knowledge Graph

- **ETS que consume**: ETS-001 (los roles en que DoR-01 se expresa).
- **ESI que consume**: ESI-008/05 (la declaración precede como patrón de la casa).
- **DGP que originará**: plantilla DoR en la herramienta de gestión del DGP de entrega.
- **ADR relacionados**: ADR de compuerta de entrada proporcional.
- **Módulos que reutilizarán este patrón**: todo trabajo de todo equipo entra por la misma compuerta.
