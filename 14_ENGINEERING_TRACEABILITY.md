# 14 — Engineering Traceability

> **DeltaOps — ESI-010 · v1.0** · La trazabilidad de ingeniería: el hilo continuo requisito→norma→decisión→cambio→versión→operación, tejido por los rastros que el sistema ya deja.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La trazabilidad no es un sistema nuevo: es la **propiedad emergente** de los rastros ya obligatorios — el contrato de PR cita ETS/ESI/DGP (ESI-009/05), el commit referencia su elemento (ESI-009/04), la versión lista sus cambios (ESI-009/10), los criterios citan normas (ESI-009/23), las capacidades enlazan promesa y código (doc 10). Este documento norma cómo se recorre el hilo completo.

## 2. Los recorridos garantizados

1. **Hacia adelante (¿qué pasó con X?)**: requisito ETS → capacidad (doc 10) → módulo/DGP (doc 11) → elementos de trabajo → PR con contrato → versión liberada → señales confirmadas en producción.
2. **Hacia atrás (¿por qué existe X?)**: código → PR → elemento → criterios → capacidad/requisito; y norma → ADR (doc 07) → contexto de la decisión.
3. **Lateral (¿qué depende de X?)**: contrato → consumidores (doc 13); norma → citantes (grafos); patrón → usos (doc 06 §3.2); servicio → módulos (doc 12).
4. **Del incidente al origen**: incidente → versión → cambios → contratos de PR → la retrospectiva audita los contratos de los cambios implicados (ESI-009/05 §riesgos, /15).

## 3. Reglas normativas

1. **La trazabilidad es subproducto, no formulario**: cada eslabón ya es obligatorio por su norma fuente; lo que este documento prohíbe es **romper el hilo** — el eslabón omitido (el PR sin ETS citado, el commit sin elemento) es el defecto, y las puertas de forma ya lo detectan.
2. **El hilo se recorre con los registros**: docs 04-13 son las tablas de salto; la pregunta de trazabilidad que exige arqueología manual revela un registro incompleto (hallazgo, doc 22).
3. **La trazabilidad sirve a cuatro clientes**: la auditoría (ESI-004/17, ESI-007), la retrospectiva (ESI-009/15), el análisis de impacto (doc 05) y el onboarding (doc 04) — se diseña para recorridos de minutos, no para informes anuales.
4. **Proporcionalidad heredada**: el hilo del cambio trivial es corto (elemento→PR→versión); nadie fabrica eslabones ficticios para rellenar — la cadena honesta corta vale más que la larga inventada.

## Impacto sobre la implementación

Ningún sistema nuevo: los enlaces viven en los instrumentos ya normados; los registros de esta serie los hacen navegables.

## Dependencias

ESI-004/17; ESI-007; ESI-009/04-05, /10, /15, /23; docs 04-13, 22.

## Riesgos

- Los eslabones degradándose a citas rituales sin contenido (el "ETS-001" pegado en todo PR); mitigación: la revisión verifica coherencia contrato-diff (ESI-009/06 §2.2) y la retrospectiva expone las citas falsas donde duele.

## Decisiones habilitadas

- Auditorías y análisis de impacto como consultas, no como proyectos.
- Confianza externa (clientes enterprise) demostrable con el hilo completo.

## Decisiones bloqueadas

- Prohibido romper eslabones obligatorios del hilo.
- Prohibido un sistema paralelo de trazabilidad manual.
- Prohibidas citas rituales sin correspondencia real.

## Reusable Pattern

Trazabilidad como propiedad emergente de rastros obligatorios + registros como tablas de salto: el hilo que se teje solo — y solo hay que no cortarlo.

## Anti-Patterns

- La matriz de trazabilidad en hoja de cálculo mantenida a mano.
- El PR que cita todos los ETS "por si acaso".
- Reconstruir el hilo de memoria durante la auditoría.

## Knowledge Graph

- **ETS que consume**: todos (el extremo del hilo hacia atrás).
- **ESI que consume**: ESI-004/17; ESI-007 (auditoría); ESI-009 (los rastros del flujo).
- **DGP que originará**: ninguno; el hilo usa los instrumentos existentes.
- **ADR relacionados**: ADR de trazabilidad por subproducto.
- **Módulos que reutilizarán este patrón**: todo su trabajo queda en el hilo sin esfuerzo adicional.
