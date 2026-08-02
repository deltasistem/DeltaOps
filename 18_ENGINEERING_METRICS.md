# 18 — Engineering Metrics

> **DeltaOps — ESI-009 · v1.0** · Las métricas de ingeniería: pocas, mecánicas, del sistema y no de las personas — el flujo, la estabilidad y la higiene medidos sin ceremonia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Las métricas juzgan **el proceso**, no a las personas: miden si el sistema de entrega fluye, resiste y se mantiene sano. Se derivan mecánicamente del rastro que el proceso ya deja (commits, PR, pipeline, liberaciones, incidentes) — la instrumentación sin formularios, el mismo principio de las fuentes mecánicas del score UX (ESI-008/24).

## 2. Catálogo

**De flujo:**
| Métrica | Mide |
|---|---|
| Tiempo de ciclo del cambio | De primer commit a producción |
| Frecuencia de liberación | Liberaciones por período |
| Tiempo de primera revisión | De PR listo a primer hallazgo (doc 06 §2.6) |
| Tamaño de cambio | Distribución de tamaño de PR (doc 05 §2.3) |

**De estabilidad:**
| Métrica | Mide |
|---|---|
| Tasa de fallo de cambio | Proporción de liberaciones con reversa, hotfix o incidente |
| Tiempo de restauración | De detección a servicio restablecido (doc 15) |
| Tiempo en rojo de la principal | Acumulado por período (doc 09 §2.5) |
| Frecuencia de hotfix | Con umbral (doc 16) |

**De higiene:**
| Métrica | Mide |
|---|---|
| Ramas y PR zombis | Más allá de umbrales (docs 03, 05) |
| Toggles vivos y vencidos | Contra umbral (doc 12) |
| Edad y flujo de deuda | Registrada vs. pagada (doc 17) |
| Pruebas en cuarentena | Cantidad y edad (doc 08 §3.5) |

## 3. Reglas normativas

1. **Solo fuentes mecánicas**: ninguna métrica exige reporte manual; lo que no se puede derivar del rastro, no se mide — el formulario de autoreporte produce ficción.
2. **Métricas de sistema, jamás de individuo**: no existen rankings de personas por commits, líneas o velocidad; la métrica usada para evaluar individuos se corrompe a sí misma (la ley de Goodhart) y corrompe la colaboración. La unidad mínima de lectura es el equipo.
3. **Tendencia sobre foto**: las métricas se leen como series con contexto; el número absoluto de una semana no dispara decisiones — la deriva sostenida sí.
4. **Cada métrica tiene consecuencia definida**: umbral → conversación estructurada del equipo (doc 20 §2.5) o entrada al score (doc 19); la métrica sin consecuencia es decoración y se retira (§3.5).
5. **El catálogo también se poda**: métricas que nadie usa o que inducen comportamiento perverso se retiran por decisión — el mismo régimen de las puertas (doc 07 §3.7).
6. **Visibles para todos**: el tablero de entrega es abierto al equipo completo y a producto; las métricas secretas invitan a la política.

## Impacto sobre la implementación

La derivación desde el rastro y el tablero se materializan en el DGP de entrega; los umbrales por métrica se fijan ahí y se revisan por evidencia.

## Dependencias

ESI-008/24 (fuentes mecánicas como patrón); docs 03, 05-06, 08-09, 12, 15-17, 19-20.

## Riesgos

- Goodhart: optimizar la métrica en vez del resultado (partir PR artificialmente, liberar vacío para subir frecuencia); mitigación: leer las métricas como conjunto balanceado (flujo *y* estabilidad *e* higiene — mejorar una degradando otra se ve), y el juicio del equipo en la conversación, no el número solo.

## Decisiones habilitadas

- Diagnóstico del proceso con evidencia en vez de sensaciones.
- Poda de ceremonia justificada con datos (doc 28).

## Decisiones bloqueadas

- Prohibidas métricas de evaluación individual.
- Prohibidas métricas por autoreporte manual.
- Prohibidas métricas sin consecuencia definida.

## Reusable Pattern

Fuentes mecánicas + sistema-no-individuo + tendencia + consecuencia definida: la medición que informa sin corromper — cuarta instancia del patrón de score de la casa.

## Anti-Patterns

- El ranking de desarrolladores por líneas de código.
- El tablero de cuarenta métricas que nadie mira.
- Reaccionar a cada pico semanal con una reorganización.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-008/24 (patrón de fuentes mecánicas y umbrales con consecuencia).
- **DGP que originará**: derivación, tablero y umbrales en el DGP de entrega.
- **ADR relacionados**: ADR de métricas de sistema; ADR de catálogo podable.
- **Módulos que reutilizarán este patrón**: todos los equipos se leen con el mismo catálogo.
