# 19 — Engineering Score

> **DeltaOps — ESI-009 · v1.0** · El score de ingeniería: ocho dimensiones E1-E8 con fuentes mecánicas, umbrales con consecuencia y sin ajustes editoriales.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El score condensa la salud del sistema de entrega en dimensiones comparables en el tiempo — el instrumento que juzga al proceso mismo (doc 01 §2.8). Es la instancia de entrega de la familia de scores de la casa (scorecard ESI-005/24, score de seguridad ESI-007/20, score UX ESI-008/24): mismas reglas, dominio propio.

## 2. Las dimensiones (E1-E8)

| # | Dimensión | Se alimenta de (doc 18) |
|---|---|---|
| **E1** | Flujo | Tiempo de ciclo, frecuencia de liberación, tamaño de cambio |
| **E2** | Estabilidad | Tasa de fallo de cambio, tiempo de restauración |
| **E3** | Calidad estática | Estado de puertas, densidad de hallazgos bloqueantes en revisión |
| **E4** | Salud de pruebas | Pisos de cobertura, cuarentena, duración de suites |
| **E5** | Reversibilidad | Ensayos de reversa realizados, cambios sin peldaño declarado |
| **E6** | Higiene | Zombis, toggles vencidos, edad de deuda |
| **E7** | Deuda | Flujo registrada/pagada, deuda prioritaria abierta |
| **E8** | Cumplimiento de proceso | Contratos completos, retrospectivas con acciones cerradas, waivers vigentes |

## 3. Reglas normativas

1. **Solo fuentes mecánicas** (doc 18 §3.1): el score se calcula, no se declara; sin autoevaluaciones ni ajustes editoriales — la regla de oro de todos los scores de la casa.
2. **Por equipo y agregado, jamás por individuo** (doc 18 §3.2).
3. **Umbrales con consecuencia**: cada dimensión define en el DGP sus franjas (sano / atención / intervención); la franja de intervención obliga a plan con dueño y plazo en la cadencia (doc 20) — el score sin consecuencia es un adorno.
4. **El score no se promedia hasta la anestesia**: las ocho dimensiones se reportan siempre; el promedio único esconde la dimensión enferma (la lección del score UX por postura, ESI-008/24 §2).
5. **Tendencia con memoria**: el score se conserva histórico; toda evolución del proceso (doc 28) se juzga por su efecto antes/después — el mismo contrato de medición de la casa.
6. **El score evalúa también la ceremonia**: E1 y E8 en tensión deliberada — el proceso que cumple todo pero no fluye está tan enfermo como el que vuela sin contrato; el balance es el objetivo, y la poda de ceremonia (doc 28) se argumenta con E1.

## Impacto sobre la implementación

Cálculo, franjas y tablero se materializan en el DGP de entrega sobre las métricas del doc 18; el histórico se conserva desde el primer ciclo.

## Dependencias

Docs 01, 18, 20, 28; ESI-005/24; ESI-007/20; ESI-008/24 (la familia de scores).

## Riesgos

- El score convertido en instrumento de presión gerencial sobre equipos; mitigación: la regla §3.2, la lectura balanceada §3.6 y la propiedad del score por los propios equipos en su cadencia — es un espejo, no un látigo.

## Decisiones habilitadas

- Conversaciones de mejora ancladas en evidencia comparable.
- Evolución del proceso (doc 28) juzgada por efecto medido.

## Decisiones bloqueadas

- Prohibidos ajustes manuales del score.
- Prohibido el score individual.
- Prohibido reportar solo el promedio agregado.

## Reusable Pattern

Dimensiones con fuentes mecánicas + franjas con consecuencia + histórico: la cuarta instancia de la familia de scores — el proceso mirándose al espejo con las mismas reglas que impone.

## Anti-Patterns

- Ajustar la fórmula cuando el número incomoda.
- Celebrar E1 alto ignorando E2 desplomado.
- El score presentado a dirección pero oculto a los equipos.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-005/24; ESI-007/20; ESI-008/24 (patrones de la familia).
- **DGP que originará**: fórmulas, franjas y tablero en el DGP de entrega.
- **ADR relacionados**: ADR de score E1-E8 con fuentes mecánicas.
- **Módulos que reutilizarán este patrón**: todos los equipos se miden con las mismas ocho dimensiones.
