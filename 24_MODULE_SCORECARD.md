# 24 — Module Scorecard

> **DeltaOps — ESI-005 · v1.0** · El tablero de evaluación por módulo: las dimensiones, su medición y su uso — evidencia, no opinión.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

El scorecard es la fotografía periódica y comparable de la salud de un módulo. Alimenta la madurez (doc 23), el ciclo de gobierno (ESI-002/28) y las decisiones de inversión. Se calcula por módulo, con la misma estructura para todos, y **de fuentes mecánicas siempre que exista la fuente**.

## 2. Las dimensiones

| Dimensión | Qué mide | Fuente |
|---|---|---|
| **Conformidad** | Simetría con plantillas, cero AP detectados, declaración íntegra | Puerta y verificadores mecánicos (ESI-004/28) |
| **Calidad de pruebas** | Cuatro niveles presentes, baterías patrón instanciadas, cobertura del Charter §9, E2E nombrados en verde | CI |
| **Calidad operativa** | Q-01…Q-07 (ESI-004/27): presupuestos cumplidos, alertas con respuesta, robustez | Telemetría y expediente de calidad |
| **Salud de contratos** | Compatibilidad N/N-1 respetada, consumidores de eventos sin roturas, deprecaciones gestionadas | Catálogo de contratos + CI |
| **Salud del expediente** | Documentación al día según reglas de vida (doc 21) | Revisión por muestreo en gobierno |
| **Adopción y valor** | Tenants con capacidades activas, uso real de comandos/consultas, KPIs consumidos | Telemetría de producto |
| **Deuda declarada** | ADR locales pendientes, adopciones de cambios de patrón pendientes (ESI-004/28 §3.3), parámetros/piezas huérfanos | Inventarios de gobierno |

## 3. Reglas

1. **Semáforo por dimensión, sin nota única**: un promedio esconde el rojo que importa; el scorecard muestra las siete dimensiones y su tendencia.
2. **Cadencia**: se recalcula por release y se revisa en el ciclo de gobierno; entre ciclos, las fuentes mecánicas actualizan en continuo.
3. **Rojo sostenido obliga**: dos ciclos en rojo en cualquier dimensión disparan plan de acción con dueño y plazo — o una decisión explícita de aceptar el estado (registrada, con porqué).
4. **Comparable, no competitivo**: la comparación entre módulos busca patrones sistémicos (¿todos rojos en expediente? el proceso falla, no los equipos).

## Impacto sobre la implementación

La mayoría de fuentes ya existen (puerta, CI, telemetría); el trabajo es el agregador del scorecard y su tablero, que se especifica como pieza de plataforma de gobierno.

## Dependencias

Docs 21, 23 y 25; ESI-004/27-28; ESI-002/14, /21 y /28; Charter §9.

## Riesgos

- El scorecard degenerando en teatro de métricas (optimizar el indicador, no la salud); mitigación: dimensiones con fuentes mecánicas difíciles de maquillar y revisión cualitativa del gobierno sobre las tendencias.

## Decisiones habilitadas

- Gobierno del portafolio sobre evidencia uniforme.
- Detección de problemas sistémicos por comparación entre módulos.

## Decisiones bloqueadas

- Prohibida la nota única promediada.
- Prohibido ignorar rojos sostenidos sin decisión registrada.
- Prohibido usar el scorecard como evaluación de desempeño individual.

## Reusable Pattern

Las siete dimensiones §2 con sus fuentes son fijas para todo módulo; los DGP no lo instancian — nacen sujetos a él desde M1.

## Anti-Patterns

- Scorecards manuales rellenados por el propio equipo sin fuentes.
- Añadir dimensiones ad-hoc por módulo (rompe la comparabilidad).
- Medir actividad (commits, PRs) en lugar de salud.

## Knowledge Graph

- **ETS que consume**: ETS-001 (valor de producto), ETS-012 (compromisos).
- **ESI que consume**: ESI-004/27-28; ESI-002/14 y /28; Charter §9.
- **DGP que originará**: un DGP de plataforma de gobierno para el agregador y tablero del scorecard.
- **ADR relacionados**: ADR de semáforo sin nota única (§3.1).
- **Módulos que reutilizarán este patrón**: todos quedan medidos por él desde su aceptación.
