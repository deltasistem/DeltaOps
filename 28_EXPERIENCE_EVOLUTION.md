# 28 — Experience Evolution

> **DeltaOps — ESI-008 · v1.0** · Cómo evoluciona la plataforma de experiencia: catálogos que crecen por evidencia, rediseños gobernados y cero deriva silenciosa.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

La evolución hereda el régimen general (ESI-005/28, ESI-006/28, ESI-007/28): decisiones por el proceso (ESI-002/27), expandir-migrar-contraer, N/N-1 donde hay contrato. Lo propio de experiencia: la presión de cambio viene de la evidencia de uso (score, doc 24), de las peticiones de módulos y del gusto — y solo las dos primeras son argumentos.

## 2. Reglas de evolución por dominio

1. **Los catálogos crecen por evidencia, no por preferencia**: layout nuevo, control nuevo, widget nuevo o semántico nuevo exigen ≥3 casos reales demandantes (la regla de generalización, ESI-006/03) y entran por decisión registrada; "me gustaría uno distinto" no es un caso.
2. **Cambiar un marco es cambio de contrato**: los marcos (tabla, formulario, diálogos…) están instanciados por decenas de pantallas; sus cambios de comportamiento siguen N/N-1 con migración planificada y el radio se recorre por el grafo (doc 26 §4.2). El ajuste "pequeño" de un marco es el cambio grande disfrazado.
3. **Los rediseños son proyectos gobernados, no derivas**: un rediseño visual (tokens) o estructural (shell, navegación) se decide con evidencia del score, se ejecuta por capas (la ventaja de las tres capas de tokens, doc 08 §2.4-2.5) y se mide antes/después — el rediseño que no mueve ninguna dimensión del score fue redecoración.
4. **La deriva por pantalla está bloqueada por construcción**: EC-04 (tokens), EC-02 (layouts) y XR-02 (consistencia) hacen que la evolución solo pueda entrar por el estándar — es la propiedad que mantiene la coherencia a años vista.
5. **Las posturas pueden crecer**: dispositivos nuevos (un terminal distinto, un formato nuevo) entran como variante de postura existente o, con evidencia fuerte, como postura nueva — decisión de radio total, con el mismo cuidado que extender escalas (ESI-007/28 §3.1).
6. **El contenido evoluciona con gobierno ligero**: textos del catálogo (doc 10 §2.5) se mejoran continuamente sin proceso pesado — con revisión de consistencia terminológica; la terminología operativa (cómo se llama una OT en superficie) sí es contrato: cambiarla es decisión.
7. **Lo aprendido se promueve**: hallazgos repetidos de XR → EC mecánicos (doc 25 §3.2); patrones repetidos en módulos → candidatos a marco (§2.1); el estándar aprende de su operación como el resto del sistema.

## 3. Declaración (los ocho rubros)

- **Commands/Queries/Capacidades/Permisos**: no aplican — régimen normativo.
- **Servicios**: el score (doc 24) como instrumento de evidencia.
- **Offline**: sin relación directa; los cambios de patrones offline siguen §2.2.
- **KPIs**: dimensiones del score antes/después de cada evolución mayor.
- **IA**: las formas de IA nuevas entran por el catálogo del doc 22 §1, con su misma gobernanza.

## Impacto sobre la implementación

El régimen entra al proceso de decisiones existente; los umbrales de evidencia (≥3 casos, score antes/después) se citan en cada propuesta de evolución de superficie.

## Dependencias

ESI-002/27; ESI-005/28; ESI-006/03, /28; ESI-007/28; docs 07-08, 10, 22, 24-26.

## Riesgos

- Congelamiento excesivo (el estándar como museo mientras el mercado avanza); mitigación: el score y las peticiones de módulos son entradas legítimas y periódicas — la revisión de evolución de superficie tiene calendario, no espera crisis.

## Decisiones habilitadas

- Rediseños mayores ejecutables por capas sin reescribir pantallas.
- Coherencia visual y de comportamiento sostenida a años y decenas de módulos.

## Decisiones bloqueadas

- Prohibida la evolución de marcos fuera de N/N-1 con radio recorrido.
- Prohibidos catálogos crecidos sin evidencia de ≥3 casos.
- Prohibidos rediseños sin medición antes/después.

## Reusable Pattern

Evidencia → decisión → capas → medición: el ciclo de evolución de superficie — la cuarta instancia del régimen de evolución de la casa, con el score como juez.

## Anti-Patterns

- El rediseño anual porque "se ve viejo".
- La excepción "temporal" de un módulo que se vuelve el nuevo estándar de facto.
- Evolucionar el marco y migrar las pantallas "cuando se pueda" (el N-1 eterno).

## Knowledge Graph

- **ETS que consume**: ETS-012 (el mercado como presión legítima de cambio).
- **ESI que consume**: ESI-002/27; ESI-005/28; ESI-006/03, /28; ESI-007/28.
- **DGP que originará**: el calendario de revisión de evolución de superficie en el DGP de gobierno de experiencia.
- **ADR relacionados**: ADR de evolución por evidencia con medición.
- **Módulos que reutilizarán este patrón**: todos evolucionan su superficie por este régimen; ninguno por su cuenta.

---

**Fin de la serie ESI-008.**
