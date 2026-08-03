# 28 — Construction Evolution

> **DeltaOps — DGP-000 · v1.0** · La evolución del programa de construcción: cómo cambia DGP-000 — por evidencia de ejecución, con decisión registrada y sin tocar jamás el corpus congelado.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Norma base

DGP-000 es la máxima autoridad de planificación, no un documento congelado como los ETS/ESI: **debe poder aprender de la ejecución** — pero solo por su canal. La regla constitutiva: el programa evoluciona por decisión registrada (ESI-010/07) fundada en evidencia de construcción; jamás por deriva, y jamás modificando ETS, Charter o ESI — la frontera de autoridad es absoluta.

## 2. Qué evoluciona y con qué vara

| Pieza | Vara de cambio |
|---|---|
| Composición fina de olas, entregables, matriz estructural | Decisión registrada + recálculo del camino crítico (docs 06, 16; doc 08 §2.4) |
| Estructura profunda: orden de olas, hitos, catálogo de estados, QG/AG, principios CP | Decisión de **radio máximo**: propuesta escrita, radio recorrido por el grafo (doc 26), transición explícita |
| Calibraciones de conducción: límite de WIP, ritmo de cadencia, umbrales de edad | El registro de conducción (doc 24 §2.3) — proporcional, con rastro |
| Riesgos mayores R-NN | Revisión en hitos (doc 17 §3) |

## 3. Reglas de evolución

1. **La evidencia primero**: toda propuesta de cambio declara la fricción o señal que la origina (DGP que no cierran, colisiones, hitos fallidos, hallazgos de retrospectiva) — el programa se corrige por datos de su propio registro, no por preferencias (el régimen de ESI-009/28 aplicado a la planificación).
2. **Los hitos son los puntos de revisión del programa**: en cada M-N se pregunta formalmente qué del programa ayudó, qué estorbó y qué falta — la retrospectiva de programa es proporcional pero obligatoria; sus salidas entran por este canal.
3. **La necesidad arquitectónica jamás se resuelve aquí**: si la ejecución revela un problema del corpus, el canal es DGP → ADR → Revisión Arquitectónica → actualización del documento correspondiente → continuación — el programa registra el bloqueo y espera; no parchea arquitectura con planificación.
4. **El programa termina**: con M6 demostrado, DGP-000 se cierra como todo DGP — retrospectiva final, evidencia archivada, subgrafo como historia (doc 26 §3.4); la construcción posterior a la escala se gobierna con la maquinaria permanente de la casa (ESI-009/20, ESI-010) y las decisiones que entonces se tomen.
5. **La versión del programa es rastro**: cada evolución material incrementa la versión de DGP-000 con su decisión enlazada — qué programa estaba vigente en cada momento es siempre reconstruible (la inmutabilidad de ESI-009/11 aplicada a la planificación).

## Impacto sobre la implementación

El régimen entra al proceso de decisiones desde el arranque; las retrospectivas de hito se agendan como parte del bucle de conducción.

## Dependencias

ESI-002/27; ESI-009/11, /20, /28; ESI-010/07, /26; docs 02, 06, 08, 10, 16-17, 24, 26-27.

## Riesgos

- El programa mutando tan seguido que deja de ser referencia estable; mitigación: la vara de radio máximo para la estructura profunda y la evidencia obligatoria — la estabilidad es el valor por defecto, el cambio es la excepción fundada.

## Decisiones habilitadas

- Un programa que aprende de su ejecución sin perder autoridad.
- Cierre limpio del programa con historia completa y navegable.

## Decisiones bloqueadas

- Prohibido modificar ETS/Charter/ESI desde la evolución del programa.
- Prohibida la evolución estructural sin decisión de radio máximo.
- Prohibido el programa eterno: M6 lo cierra.

## Reusable Pattern

Autoridad de planificación con evolución por evidencia + frontera absoluta con el corpus + fin explícito: el programa que gobierna, aprende y termina.

## Anti-Patterns

- Replanificar el programa cada vez que una semana sale mal.
- "Ajustar" una norma ESI desde un documento de planificación.
- El programa vigente en tres versiones simultáneas según a quién se pregunte.

## Knowledge Graph

- **ETS que consume**: ninguno directo; respeta su inmutabilidad absoluta.
- **ESI que consume**: ESI-002/27 (el canal); ESI-009/28 y ESI-010/28 (los regímenes precedentes de evolución).
- **DGP que originará**: las versiones futuras de DGP-000 con decisión enlazada.
- **ADR relacionados**: ADR de régimen de evolución del programa maestro.
- **Módulos que reutilizarán este patrón**: sus planes locales evolucionan con la misma lógica.

---

**Fin de DGP-000 — Master Construction Program.**
