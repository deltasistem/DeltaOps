# 24 — UX Score

> **DeltaOps — ESI-008 · v1.0** · El score de experiencia: la calidad de UX medida con fuentes mecánicas por dimensión y postura — hermano del score de seguridad y del scorecard de módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Las dimensiones

Siguiendo el patrón establecido (ESI-005/24, ESI-007/20): dimensiones con fuentes mecánicas, umbrales con consecuencias, tendencia sobre foto.

| # | Dimensión | Fuente mecánica |
|---|---|---|
| X1 | **Rendimiento percibido** | Tiempos de carga por pantalla vs. presupuesto (doc 12), estabilidad de layout, tiempo a interactivo del shell |
| X2 | **Tarea completada** | Tasa de finalización de asistentes (doc 17), tiempo de captura vs. presupuesto de campo (doc 23), abandono por pantalla |
| X3 | **Errores y fricción** | Errores de sistema por sesión (doc 13), errores de validación por campo (doc 19), confirmaciones canceladas (doc 16) |
| X4 | **Consistencia** | % de pantallas en catálogo de layouts (doc 07), valores sueltos detectados (doc 8), tablas fuera de marco (doc 20) |
| X5 | **Accesibilidad** | Verificaciones mecánicas de contraste/semántica/foco en puerta (doc 10), hallazgos abiertos |
| X6 | **Offline y campo** | Honestidad de frescura, conflictos por sincronización (doc 11), completado en campo (doc 23) — medida por postura |
| X7 | **Atención** | Ratio de silenciado por tipo (doc 15), críticas atendidas a tiempo, widgets ocultados (doc 18) |
| X8 | **Adopción de superficie** | Uso de búsqueda con clic (doc 21), vacíos de primera vez que convierten (doc 14), aceptación editada de IA (doc 22) |

## 2. Reglas

1. **Por postura, no en promedio**: X1, X2 y X6 se reportan separadas por campo/planta/oficina (doc 09 §2.5) — el promedio esconde exactamente la postura que más importa y menos se mira.
2. **Fuentes mecánicas primero** (el régimen de ESI-007/20 §2.1): telemetría de producto sin datos sensibles (ESI-007/13 §2.6); lo cualitativo (investigación con usuarios) entra como acta de ritual, no como número inventado.
3. **Umbrales con consecuencias**: X4 bajo congela excepciones nuevas de catálogo hasta podar; X5 con hallazgos abiertos bloquea producción de lo afectado; X2 de campo en deterioro adelanta la revisión de experiencia (doc 25) — el score dispara, no decora.
4. **El score no se negocia, se mejora** (ESI-007/20 §2.2): sin ajustes editoriales; la métrica incómoda es la valiosa.
5. **Tendencia sobre foto**: la evaluación mira series; los cambios de definición de métricas se versionan y anotan (el patrón de KPIs, ESI-006/16 §2.4).

## 3. Declaración (los ocho rubros)

- **Commands/Capacidades/Permisos**: los del tablero interno que lo muestre; el score se deriva, no se edita.
- **Queries**: el colector de telemetría de experiencia y las fuentes de puerta.
- **Servicios**: KPIs (el score entra al catálogo con dueño, ESI-006/16), telemetría.
- **Offline**: la telemetría de campo se encola y viaja con la sincronización (sin costo perceptible).
- **KPIs**: el score ES el KPI; sus dimensiones se registran en el catálogo oficial.
- **IA**: ninguna en el cálculo; opcional en síntesis del informe, marcada.

## Impacto sobre la implementación

El colector de telemetría de experiencia (respetando ESI-007/13 §2.6) y el tablero del score entran al DGP de experiencia; los umbrales-consecuencia, al calendario de gobierno.

## Dependencias

Docs 07-23, 25; ESI-005/24; ESI-006/16; ESI-007/13, /20.

## Riesgos

- Goodhart de experiencia (optimizar completado empujando al usuario, no ayudándolo); mitigación: métricas por pares (completado **y** errores post-acción; aceptación de IA **editada**, no bruta) y la revisión humana sobre patrones sospechosos — el mismo antídoto de ESI-007/20.

## Decisiones habilitadas

- Prioridades de mejora de UX por evidencia, postura a postura.
- La conversación "la app va lenta" convertida en dimensión y número.

## Decisiones bloqueadas

- Prohibidos ajustes editoriales del score.
- Prohibido promediar posturas en X1/X2/X6.
- Prohibida telemetría de experiencia con datos sensibles.

## Reusable Pattern

Dimensiones mecánicas + separación por postura + umbrales que disparan: la tercera instancia del patrón de score (módulos, seguridad, experiencia) — ya es el estándar de la casa.

## Anti-Patterns

- Medir solo oficina porque es donde está la telemetría fácil.
- El NPS trimestral como única "métrica de UX".
- Dimensiones sin dueño que nadie mueve.

## Knowledge Graph

- **ETS que consume**: ETS-011 (posturas), ETS-012 (adopción medible).
- **ESI que consume**: ESI-005/24; ESI-006/16; ESI-007/13, /20 (patrón y régimen).
- **DGP que originará**: colector y tablero del score en el DGP de experiencia.
- **ADR relacionados**: ADR de score por postura.
- **Módulos que reutilizarán este patrón**: todos aportan telemetría por sus pantallas declaradas.
