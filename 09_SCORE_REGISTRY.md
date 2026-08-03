# 09 — Score Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de scores: la familia completa de instrumentos de medición de la casa, sus reglas comunes y la lectura conjunta sin promedio anestésico.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La familia consolidada

| Score | Mide | Dimensiones | Fuente |
|---|---|---|---|
| **Scorecard de módulo** | Salud de cada módulo de negocio | Las de su serie | ESI-005/24 |
| **Score de seguridad** | Postura y madurez de seguridad | Con escalas O/I/P/S | ESI-007/20-21 |
| **Score UX** | Salud de la experiencia, por postura | X1-X8 | ESI-008/24 |
| **Score de ingeniería** | Salud del sistema de entrega | E1-E8 | ESI-009/19 |
| **Métricas de entrega** | Flujo, estabilidad, higiene (alimentan E1-E8) | Catálogo | ESI-009/18 |

## 2. Reglas comunes (ya establecidas por las fuentes; aquí consolidadas)

1. **Solo fuentes mecánicas**: ningún score de la casa admite autoevaluación ni ajuste editorial.
2. **Sistema y equipo, jamás individuo** (ESI-009/18 §3.2): la regla vale para toda la familia.
3. **Franjas con consecuencia**: cada score define sano/atención/intervención; la franja de intervención obliga plan con dueño — el score sin consecuencia es decoración.
4. **Sin promedio anestésico**: las dimensiones se reportan siempre desglosadas (la lección compartida de ESI-008/24 §2 y ESI-009/19 §3.4).
5. **Histórico obligatorio**: toda evolución (de producto, proceso o norma) se juzga antes/después contra la familia.
6. **La lectura conjunta es la del tablero** (doc 25): los scores se miran juntos porque se compensan — la entrega veloz (E1) con seguridad degradada no es salud sino transferencia de riesgo; el tablero expone la transferencia.

## 3. Reglas del registro

1. **Scores nuevos entran por su serie** con decisión (doc 07); el registro refleja, no crea — la proliferación de índices ad-hoc ("nuestro score interno del equipo") está bloqueada: o es de la familia o no es un score de la casa.
2. **Las fórmulas viven en los DGP de sus dueños**; el registro indexa qué existe, qué mide, dónde se calcula.
3. **La coherencia entre scores se audita**: la misma métrica alimentando dos scores lo hace con la misma definición; la divergencia de definiciones es defecto del registro.

## Impacto sobre la implementación

El registro se materializa como la sección de instrumentos del tablero (doc 25); las fórmulas y fuentes ya están normadas por sus series.

## Dependencias

ESI-005/24; ESI-007/20-21; ESI-008/24; ESI-009/18-19; docs 07, 25.

## Riesgos

- La familia usada como instrumento de presión entre áreas ("tu score está peor"); mitigación: la lectura conjunta con propiedad por equipo (los espejos son de quien se mira, ESI-009/19 §3) y la regla anti-individuo.

## Decisiones habilitadas

- Salud integral del sistema legible en una familia coherente.
- Evolución de cualquier dominio juzgada con instrumentos comparables.

## Decisiones bloqueadas

- Prohibidos scores fuera de la familia sin serie dueña y decisión.
- Prohibidos ajustes editoriales y promedios que oculten dimensiones.
- Prohibidas definiciones divergentes de la misma métrica.

## Reusable Pattern

Familia de scores con reglas comunes + lectura conjunta + entrada por serie dueña: la medición como sistema coherente — muchos espejos, una sola óptica.

## Anti-Patterns

- El score paralelo del equipo que "se entiende mejor".
- Optimizar un score degradando otro sin que nadie lo vea.
- La métrica con dos definiciones según quién la reporte.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-005/24; ESI-007/20-21; ESI-008/24; ESI-009/18-19.
- **DGP que originará**: ninguno; las fórmulas viven en los DGP dueños.
- **ADR relacionados**: ADR de familia de scores con óptica única.
- **Módulos que reutilizarán este patrón**: todos se leen con los mismos instrumentos.
