# 13 — Release Strategy

> **DeltaOps — DGP-000 · v1.0** · La estrategia de releases del programa: cómo lo construido llega a operar — trenes desde el día uno, exposición gradual y releases de programa alineados a hitos.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

La mecánica de liberación está congelada (ESI-009/10-14: trenes, versionado, toggles, exposición gradual, reversa). Esta estrategia decide **cómo el programa la usa**: qué se libera cuándo, hacia qué audiencia y con qué releases nombrados.

## 2. Los niveles de release

| Nivel | Qué es | Régimen |
|---|---|---|
| **Tren continuo** | La liberación regular de la casa desde W0: todo lo integrado viaja al ritmo del tren | ESI-009/10; opera igual en fase interna y productiva |
| **Release de ola** | El corte nombrado que materializa la verdad de cierre de una ola (doc 05) | Coincide con la compuerta de la ola; evidencia PF enlazada |
| **Release de programa** | Los releases oficiales hacia afuera: **R1.0** = Hito B (primer tenant productivo, cierre W3); releases mayores subsecuentes por ola | Doc 27; comunicación comercial anclada a hitos demostrados |

## 3. Reglas normativas

1. **El tren opera desde W0, no desde producción**: la fase interna (W0-W2) libera con la misma mecánica — versionado, RC, señales — hacia entornos internos; el día del primer tenant no se estrena la liberación: se le cambia la audiencia (CP-05).
2. **La audiencia crece por fases**: interno (W0-W2) → tenant piloto único (cierre W3, Hito B) → tenants tempranos (W4-W5) → general (W6). Cada ampliación de audiencia es una decisión con evidencia PF, no un deslizamiento.
3. **La exposición gradual aplica a capacidades nuevas siempre** (ESI-009/13): toggle de entrega → cohorte → general; la capacidad se comercializa solo cuando su toggle murió y su entrada en el catálogo (ESI-010/10) está en Disponible.
4. **Ningún release contiene lo no cerrado**: el contenido de un release de ola/programa es la suma de DGP Cerrados (doc 11) — el DGP "casi listo" viaja en el siguiente; el release no espera (la ley del tren, ESI-009/10).
5. **Los releases de programa llevan notas contra el catálogo**: qué capacidades entran, en qué estado, para qué audiencia — derivadas del registro (doc 12), no redactadas de memoria.
6. **La reversa acompaña cada nivel**: escalera de reversión ensayada antes de cada ampliación de audiencia (ESI-009/14); el simulacro pre-Hito B es obligatorio (doc 08 §3).

## Impacto sobre la implementación

W0 entrega el tren mínimo; los releases de ola y programa se planifican en la cadencia contra el registro y las compuertas.

## Dependencias

ESI-009/10-14; ESI-010/10, /24; docs 05, 08, 11-12, 14, 24, 27.

## Riesgos

- La presión de "mostrar algo" adelantando audiencia sin evidencia PF; mitigación: la ampliación de audiencia es compuerta con criterios congelados (ESI-010/24) — la demo comercial usa entornos internos sin ampliar audiencia real.

## Decisiones habilitadas

- Camino de liberación idéntico de la fase interna a la productiva.
- Releases comerciales anclados a hitos demostrados con notas derivadas.

## Decisiones bloqueadas

- Prohibido estrenar mecánica de liberación con el primer tenant.
- Prohibida la ampliación de audiencia sin compuerta PF.
- Prohibidos releases con contenido de DGP no cerrados.

## Reusable Pattern

Tres niveles de release (tren, ola, programa) + audiencia por compuertas + contenido = DGP cerrados: la liberación como continuidad, no como evento.

## Anti-Patterns

- El "big release" que junta seis meses de trabajo sin ensayo.
- Prometer fecha de R1.0 sin el estado de Hito B en la mano.
- El release note redactado de memoria la noche anterior.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la cadencia comercial que los releases de programa sirven).
- **ESI que consume**: ESI-009/10-14 (mecánica congelada); ESI-010/24 (compuertas de audiencia).
- **DGP que originará**: el DGP del tren mínimo en W0; los demás liberan por él.
- **ADR relacionados**: ADR de niveles de release y audiencias por compuerta.
- **Módulos que reutilizarán este patrón**: todos liberan por los mismos tres niveles.
