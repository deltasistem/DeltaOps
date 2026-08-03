# 15 — Milestone Strategy

> **DeltaOps — DGP-000 · v1.0** · La estrategia de hitos: los hitos oficiales M0…M6 del programa, su relación con las compuertas congeladas y las reglas que los mantienen honestos.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

Las compuertas existen (PR-01…10, PF-01…08; ESI-010/23-24). Esta estrategia las **encadena como hitos nombrados del programa** — los puntos donde el programa declara, con evidencia, que cambió de naturaleza.

## 2. Los hitos oficiales

| Hito | Nombre | Se demuestra con | Cierra |
|---|---|---|---|
| **M0** | Programa listo | PR-01…10 en verde (ESI-010/23) | W0 |
| **M1** | Fundación ejercitable | Verdad de cierre W1 (doc 05): módulo de prueba apoyado íntegramente en el suelo común | W1 |
| **M2** | Fábrica validada | Hito A: PF-01/02 — el módulo de referencia operando en producción interna | W2 |
| **M3** | Primer tenant productivo | Hito B: PF-03/04 — R1.0 liberado a audiencia piloto | W3 |
| **M4** | Cadena operativa completa | PF-05/06 de W4: flujos cruzados por contratos en operación | W4 |
| **M5** | Plataforma analítica viva | PF-05/06 de W5: analítica, exportes, IA de producto e integración externa operando | W5 |
| **M6** | Escala comercial | Hito D: PF-07/08 — catálogo pleno, operación sin héroes | W6 |

## 3. Reglas normativas

1. **El hito es una demostración, no una fecha**: M-N se alcanza cuando su evidencia existe (ESI-010/24 §3.1); las fechas estimadas viven en la planificación de cadencia y se revisan por evidencia — el programa promete orden y compuertas, no calendario.
2. **Los hitos no se degradan para alcanzarse**: renegociar los criterios de un hito a la baja es una decisión de radio máximo (doc 28), pública y registrada — jamás una interpretación flexible la semana del hito.
3. **La vara acumula** (ESI-010/24 §3.3): cada hito mantiene en verde los anteriores; M4 con la seguridad de M3 degradada no es M4.
4. **El hito fallido produce plan, no vergüenza**: criterios en rojo → plan con dueño y nueva verificación (ESI-010/24 §3.2); el aprendizaje del fallo entra por los canales (ESI-010/22).
5. **La comunicación externa usa hitos demostrados**: lo dicho a clientes y mercado se ancla en el último hito con evidencia, no en el próximo deseado (la honestidad de ETS-012; doc 13 §3.2).

## Impacto sobre la implementación

La cadencia del programa gestiona hacia el próximo hito; el tablero (doc 25) muestra el estado de criterios del hito en curso permanentemente — no solo la semana de la verificación.

## Dependencias

ESI-010/22-24; ETS-012; docs 04-05, 13, 24-25, 27-28.

## Riesgos

- El "hito de calendario" (celebrar la fecha, no la evidencia); mitigación: el hito se declara desde el tablero con sus criterios enlazados — la celebración sin enlace no declara nada.

## Decisiones habilitadas

- Narrativa de progreso del programa en siete demostraciones verificables.
- Compromisos externos anclados a evidencia existente.

## Decisiones bloqueadas

- Prohibido declarar hitos sin evidencia enlazada.
- Prohibida la renegociación silenciosa de criterios de hito.
- Prohibido avanzar de hito con los anteriores degradados.

## Reusable Pattern

Hitos = compuertas congeladas encadenadas con nombre + vara acumulativa + comunicación sobre lo demostrado: el progreso como serie de hechos.

## Anti-Patterns

- La fiesta de M3 con PF-04 "pendiente de detalles".
- El roadmap comercial que promete M5 con M2 sin cerrar.
- Redefinir "fábrica validada" la semana que la fábrica no valida.

## Knowledge Graph

- **ETS que consume**: ETS-012 (los compromisos que los hitos respaldan).
- **ESI que consume**: ESI-010/23-24 (las compuertas encadenadas).
- **DGP que originará**: ninguno; los hitos se demuestran con evidencia de los DGP cerrados.
- **ADR relacionados**: ADR de hitos M0…M6 como demostraciones.
- **Módulos que reutilizarán este patrón**: sus entregas se agregan en hitos del mismo régimen.
