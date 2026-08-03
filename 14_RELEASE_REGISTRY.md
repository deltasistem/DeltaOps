# 14 — Release Registry

> **DeltaOps — DGP-000 · v1.0** · El registro de releases: el libro de todo lo liberado — versiones, contenido por DGP, audiencia, señales y reversas — la memoria operativa del programa.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Propósito

Complementa el registro de construcción (doc 12): aquel dice qué se construyó; este dice **qué se liberó, cuándo, hacia quién y cómo le fue**. Junto con la inmutabilidad del versionado (ESI-009/11), forma la memoria auditable de la operación del programa.

## 2. Contenido por entrada

1. **Identidad**: versión (el esquema congelado de ESI-009/11), nivel (tren / ola / programa, doc 13) y fecha.
2. **Contenido**: los DGP cerrados incluidos (enlace al doc 12) y las capacidades que activa o amplía (ESI-010/10).
3. **Audiencia**: interna / piloto / temprana / general — y la compuerta que autorizó la audiencia (doc 13 §3.2).
4. **Trayecto**: la cadena de entornos recorrida, RC aprobado, exposición gradual aplicada (cohortes y ritmo).
5. **Señales**: la confirmación en producción (ESI-009/10 §2.5) — las señales verificadas y su resultado.
6. **Incidencias**: reversas ejecutadas, hotfixes derivados, incidentes asociados — con enlace a sus retrospectivas (ESI-009/15).

## 3. Reglas normativas

1. **Todo release tiene entrada, sin excepción de nivel**: el tren rutinario registra compacto (mecánicamente, desde el pipeline); los releases de ola y programa registran completo — la proporcionalidad de siempre, nunca la omisión.
2. **El registro se llena al liberar, no después**: la entrada nace con el release y se completa con sus señales; la arqueología de releases pasados es el síntoma de que el registro murió.
3. **Derivado del pipeline**: versiones, contenido y trayecto salen del rastro mecánico (la regla ESI-010/25 §3.1); las señales e incidencias se enlazan desde sus instrumentos — nada se redacta de memoria.
4. **El registro responde las tres preguntas operativas**: ¿qué versión tiene cada audiencia ahora? ¿qué cambió entre dos versiones? ¿qué release introdujo este comportamiento? — si alguna exige investigación manual, el registro está incompleto (el espejo de ESI-010/14 §3.2).
5. **Las incidencias enlazadas alimentan la mejora**: la tasa de fallo de cambio y el tiempo de restauración (ESI-009/18) se calculan de aquí — el registro es también la fuente de las métricas de estabilidad.

## Impacto sobre la implementación

Se materializa en W0 junto al tren mínimo; las entradas de tren derivan del pipeline sin trabajo manual.

## Dependencias

ESI-009/10-11, /15, /18; ESI-010/10, /14, /25; docs 12-13.

## Riesgos

- Duplicación con el registro de construcción; mitigación: fronteras nítidas — doc 12 gobierna el construir (DGP y estados), este gobierna el operar (versiones y señales); se enlazan, no se copian (la regla anti-duplicación de ESI-010).

## Decisiones habilitadas

- Respuesta inmediata a "¿qué está corriendo dónde?" en cualquier momento.
- Métricas de estabilidad calculadas de un libro completo y mecánico.

## Decisiones bloqueadas

- Prohibidos releases sin entrada en el registro.
- Prohibido redactar entradas de memoria en vez de derivarlas.
- Prohibida la duplicación de contenido con el registro de construcción.

## Reusable Pattern

Libro de releases derivado del pipeline + tres preguntas operativas siempre respondibles: la memoria de operación como subproducto de liberar bien.

## Anti-Patterns

- "¿Qué versión tiene el piloto?" respondido con una llamada.
- El release note como único rastro de lo liberado.
- Reconstruir la línea de tiempo del incidente desde el chat.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009/10-11 (versionado y tren); ESI-009/18 (métricas alimentadas).
- **DGP que originará**: se materializa dentro del DGP del tren mínimo (W0).
- **ADR relacionados**: ADR de registro de releases derivado del pipeline.
- **Módulos que reutilizarán este patrón**: todo lo suyo liberado queda en el libro.
