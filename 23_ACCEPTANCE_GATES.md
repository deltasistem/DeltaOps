# 23 — Acceptance Gates

> **DeltaOps — DGP-000 · v1.0** · Las compuertas de aceptación AG-1 y AG-2: el DGP se acepta cuando su capacidad opera de verdad y su rastro queda completo — la diferencia entre terminado y entregado.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

Las QG (doc 22) verifican el proceso; las AG verifican **el resultado**: la capacidad operando y el programa actualizado. Separan lo que la casa ya separa: integrar no es liberar, liberar no es operar (ESI-009/10) — el DGP se acepta contra operación, no contra staging.

## 2. Las compuertas

**AG-1 — Capacidad aceptada en operación** (cierra la etapa 6)
| Verifica | Instrumento |
|---|---|
| Liberación por el tren con exposición gradual cumplida | ESI-009/10, /13; doc 13 |
| Señales de producción confirmadas (interna o real según fase) | ESI-009/10 §2.5 |
| Criterios de aceptación del DGP demostrados **en el entorno operado** — incluidos los caminos tristes | ESI-009/23 |
| Observabilidad del DGP activa: sus señales declaradas emitiendo | Estrategia de observabilidad del DGP (doc 10) |
| Rollback ejercitable: la estrategia declarada verificada (ensayo o evidencia de escalera) | ESI-009/14 |

**AG-2 — Cierre con rastro completo** (cierra la etapa 7)
| Verifica | Instrumento |
|---|---|
| Evidencias archivadas y enlazadas en el registro | Doc 12 §2.7 |
| Registros de la casa actualizados: capacidades, módulos, contratos | ESI-010/10-13; doc 12 §3.4 |
| Deuda del DGP registrada con dueño; sucesores creados para el fuera-de-alcance consciente | ESI-009/16; doc 10 (sucesión) |
| Hallazgos promovidos o registrados en su canal | CP-12; ESI-010/22 |
| Retrospectiva del DGP realizada (proporcional a su tamaño) | ESI-009/15 |
| Toggles de entrega del DGP muertos o con fecha | ESI-009/12 |

## 3. Reglas normativas

1. **AG-1 sin operación no existe**: la capacidad demostrada solo en entornos previos no se acepta — en fase interna (W0-W2), "operación" es la producción interna del programa (CP-05); la vara es la misma, la audiencia cambia.
2. **AG-2 es lo que separa Cerrado de abandonado**: el DGP con capacidad operando pero rastro incompleto sigue abierto — el programa no compra funcionalidad a crédito documental.
3. **La aceptación la constata el dueño del DGP con contraparte**: en W0-W2, un par del núcleo; desde W3, quien representa al consumidor de la capacidad (producto u operación) — la aceptación de quien construyó, solo, no es aceptación.
4. **Las AG alimentan los hitos**: M0…M6 (doc 15) se demuestran con AG de sus DGP — la cadena evidencia-DGP-hito es una sola (ESI-010/14).

## Impacto sobre la implementación

Las AG se materializan en la plantilla de DGP y el registro; sus criterios derivan de instrumentos existentes más los criterios propios de cada DGP.

## Dependencias

ESI-009/10, /12-16, /23; ESI-010/10-14, /22; docs 10-13, 15, 22.

## Riesgos

- AG-2 pospuesta indefinidamente tras AG-1 ("ya funciona, después documentamos"); mitigación: el estado Cerrado exige ambas — el DGP en verificación eterna con capacidad operando es una señal del tablero (edad por estado, doc 11).

## Decisiones habilitadas

- Aceptación uniforme contra operación real en todas las fases.
- Hitos del programa demostrables como suma de AG.

## Decisiones bloqueadas

- Prohibido aceptar capacidades demostradas solo en entornos previos.
- Prohibido cerrar DGP con rastro incompleto.
- Prohibida la auto-aceptación sin contraparte.

## Reusable Pattern

AG-1 (opera de verdad) + AG-2 (rastro completo) con contraparte: la aceptación como hecho operativo y documental, no como sensación de terminado.

## Anti-Patterns

- La demo en staging como evidencia de aceptación.
- "Cerrado" con la retrospectiva y la deuda "para la semana que viene".
- El toggle del DGP cerrado vivo seis meses después.

## Knowledge Graph

- **ETS que consume**: los criterios de negocio que cada DGP demuestra en AG-1.
- **ESI que consume**: ESI-009/10-16 (operación y cierre); ESI-010/10-14 (registros actualizados).
- **DGP que originará**: todos cierran por AG-1/AG-2.
- **ADR relacionados**: ADR de aceptación contra operación con rastro completo.
- **Módulos que reutilizarán este patrón**: cada capacidad suya se acepta igual.
