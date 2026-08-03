# 20 — AI Construction

> **DeltaOps — DGP-000 · v1.0** · La estrategia de construcción con IA: dónde y cómo el programa aplica el flujo asistido gobernado para multiplicar la construcción sin degradar la fidelidad.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

El régimen está congelado (ESI-010/16: mismo flujo, corpus como contexto, dueño humano, compuertas ciegas al autor). Esta estrategia decide **cómo el programa lo explota**: el mapa de apalancamiento por tipo de trabajo y por ola.

## 2. El mapa de apalancamiento

| Nivel | Trabajo | Regla |
|---|---|---|
| **Máximo** | Generación dentro de patrones establecidos (doc 06 del registro ESI-010): CRUD por el molde, pantallas por contrato de ocho rubros, pruebas de todos los niveles, migraciones mecánicas, documentación derivada | La IA replica el molde; el humano verifica fidelidad |
| **Alto** | Esqueletos de DGP y contratos desde las normas; análisis de impacto recorriendo registros; detección de desviaciones corpus-código | La IA propone sobre el corpus; el humano decide |
| **Medio** | Implementación en superficies nuevas sin patrón previo (primeras piezas del Kernel, primeros contratos) | Pares humano-IA; revisión reforzada |
| **Mínimo** | Decisiones, ADR, diseño de particiones, negociación de alcance, todo lo congelado | La IA analiza; jamás decide (ESI-010/16 §2.5) |

**Por ola**: W0-W1 operan en nivel medio-alto (superficies nuevas, seniority concentrado); desde M2, el molde validado convierte la construcción de módulos en nivel máximo — **el retorno del módulo de referencia es también convertir la construcción en trabajo de patrón, apalancable a fondo**.

## 3. Reglas del programa

1. **El contexto se prepara, no se improvisa**: cada DGP lista en su especificación las normas, patrones y contratos que la IA recibirá como contexto (doc 10) — la tarea a la IA hereda el encuadre del DGP (ESI-010/16 §2.2).
2. **La capacidad efectiva es min(generación, revisión)** (doc 18 §2.2): los DGP se dimensionan para que sus dueños entiendan todo lo integrado; R-06 vigila la señal.
3. **Los hallazgos en salida asistida se rastrean** (ESI-010/16 §2.8): concentración de hallazgos por tipo de trabajo recalibra el mapa §2 — el apalancamiento se gobierna por evidencia como todo.
4. **Lo no-waiveable no se delega a la confianza**: aislamiento, murallas, idempotencia (CP-09) se verifican por baterías intocables sin importar quién generó — la confianza en la IA jamás sustituye la batería.

## Impacto sobre la implementación

Las guías de encuadre (entregable del DGP de plataforma) materializan el mapa; la planificación de capacidad usa el nivel de apalancamiento esperado por DGP.

## Dependencias

ESI-010/06, /16; docs 02 (CP-11), 10, 17-18; ESI-007 (no-waiveables).

## Riesgos

- El mapa aplicado al revés (IA diseñando lo nuevo, humanos tecleando lo mecánico); mitigación: el nivel de apalancamiento se declara por DGP en QG-1 — la asignación invertida es visible en la especificación.

## Decisiones habilitadas

- Multiplicación planificada de la construcción desde M2.
- Recalibración del apalancamiento por evidencia de hallazgos.

## Decisiones bloqueadas

- Prohibido delegar a la IA los niveles mínimos del mapa.
- Prohibido dimensionar DGP por generación sin revisión con entendimiento.
- Prohibido verificar lo no-waiveable por confianza en el generador.

## Reusable Pattern

Mapa de apalancamiento por tipo de trabajo + molde validado como conversor a nivel máximo + recalibración por hallazgos: la IA como multiplicador dirigido, no como apuesta uniforme.

## Anti-Patterns

- Pedirle a la IA el diseño del Kernel "para ganar tiempo".
- El PR asistido gigante que el dueño "revisó por arriba".
- Ignorar la concentración de hallazgos porque "la IA acelera".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-010/16 (régimen congelado); ESI-007 (baterías intocables).
- **DGP que originará**: cada DGP declara su nivel de apalancamiento esperado.
- **ADR relacionados**: ADR de mapa de apalancamiento de IA por tipo de trabajo.
- **Módulos que reutilizarán este patrón**: su construcción por molde es el nivel máximo del mapa.
