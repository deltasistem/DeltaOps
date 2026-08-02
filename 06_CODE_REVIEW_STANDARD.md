# 06 — Code Review Standard

> **DeltaOps — ESI-009 · v1.0** · El estándar de revisión de código: qué revisa el humano, con qué severidades, en qué plazos y con revisión reforzada donde el riesgo lo exige.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué es la revisión

La revisión humana juzga lo que la puerta no puede: corrección semántica, diseño, encaje con lo congelado y riesgo. Es la quinta instancia del patrón de revisión de la casa (R de ESI-004/26, RS de ESI-006/25, SR de ESI-007/23, XR de ESI-008/25) — mismo régimen, dominio propio.

## 2. Reglas normativas

1. **Toda integración requiere al menos una aprobación** de alguien que no es el autor y entiende el dominio tocado; la auto-aprobación no existe.
2. **El revisor verifica contrato contra diff**: ¿el cambio hace lo que su Objetivo declara, y nada más? El cambio oculto dentro de un PR con otro propósito es hallazgo de bloqueo — la versión de código del XR-03 ("la pantalla que inventa").
3. **Preguntas obligatorias del revisor (DR-01…DR-06)**:
   | # | Pregunta | Qué caza |
   |---|---|---|
   | DR-01 | ¿Respeta lo congelado (ETS/ESI citados) o lo reinterpreta? | La erosión del estándar |
   | DR-02 | ¿Los casos de error y borde están tratados o solo el flujo feliz? | El optimismo |
   | DR-03 | ¿Las pruebas prueban el comportamiento declarado o solo suben cobertura? | El teatro de pruebas |
   | DR-04 | ¿Introduce acoplamiento entre módulos fuera de los contratos (ESI-005/04)? | La fuga arquitectónica |
   | DR-05 | ¿El rollback declarado funcionaría de verdad? | La reversibilidad de papel |
   | DR-06 | ¿Hay datos sensibles, permisos ampliados o superficies nuevas sin marcar? | El riesgo silencioso |
4. **Severidades con contrato**: **bloqueante** (no se integra), **importante** (se resuelve o se registra como deuda con dueño, doc 17), **sugerencia** (el autor decide). El revisor clasifica; el debate de estilo sin regla escrita es sugerencia por definición — y si se repite, se propone como regla mecánica (doc 07 §2.6).
5. **Revisión reforzada por categoría**: migraciones, contratos N/N-1, seguridad (las categorías del doc 05 §2.8) exigen un segundo revisor del dominio — el equivalente del step-up (ESI-007/03) en la fábrica.
6. **Plazo de primera respuesta**: el DGP fija el umbral (horas hábiles, no días); la revisión que duerme bloquea la integración diaria y aparece en métricas (doc 18).
7. **La revisión es del cambio, no del autor**: hallazgos con cita a norma o razonamiento técnico; el tono es parte del estándar.

## Impacto sobre la implementación

Reglas de aprobación y categorías reforzadas se configuran en la plataforma de repositorio; DR-01…DR-06 entran a la plantilla de revisión.

## Dependencias

Docs 05, 07, 17-18; ESI-004/26; ESI-005/04; ESI-006/25; ESI-007/03, /23; ESI-008/25.

## Riesgos

- La revisión como cuello de botella de la integración diaria; mitigación: PR chicos (doc 05 §2.3), plazo con métrica (§2.6) y puertas que filtran lo mecánico — el revisor solo juzga lo que merece juicio.

## Decisiones habilitadas

- Calidad de diseño sostenida por juicio humano enfocado.
- Conocimiento circulando entre equipos por la revisión cruzada.

## Decisiones bloqueadas

- Prohibida la auto-aprobación y la aprobación sin dominio.
- Prohibido integrar con bloqueantes abiertos.
- Prohibida la revisión reforzada omitida en categorías marcadas.

## Reusable Pattern

DR-01…DR-06 + severidades con contrato + refuerzo por categoría: la quinta instancia del patrón de revisión de la casa — el juicio humano donde la máquina no llega.

## Anti-Patterns

- El "LGTM" en dos minutos a un PR de mil líneas.
- El revisor reescribiendo el cambio a su gusto vía cincuenta sugerencias.
- Discusiones de estilo sin regla escrita bloqueando integración.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-004/26; ESI-005/04; ESI-006/25; ESI-007/23; ESI-008/25 (el patrón de revisión).
- **DGP que originará**: plantilla DR, plazos y categorías reforzadas en el DGP de entrega.
- **ADR relacionados**: ADR de revisión con severidades contractuales.
- **Módulos que reutilizarán este patrón**: todos; la revisión reforzada protege sus superficies sensibles.
