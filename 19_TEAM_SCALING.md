# 19 — Team Scaling

> **DeltaOps — DGP-000 · v1.0** · La estrategia de escalado de equipos: crecer por células sobre el molde validado — el escalado como consecuencia de hitos, no como apuesta previa.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. El modelo de escalado

1. **La célula es la unidad de escalado**: un equipo chico, con dueño, capaz de ejecutar DGP completos por el molde (el DGP del módulo de referencia como plantilla viva, doc 06 W2.2). Escalar el programa = añadir células, no engordar las existentes.
2. **El escalado sigue a los hitos**:
   - W0-W2: **núcleo único** de seniority concentrado (doc 18 §3.1) — fundación y molde.
   - M2 (fábrica validada): **primeras células de módulo** — el molde existe, los nuevos lo siguen.
   - M3 (primer tenant): **células de expansión** para W4/W5, más la capacidad operativa (soporte, on-call sostenible).
   - M4/M5: células según la evidencia de rendimiento de las existentes.
3. **Cada célula nace con madrina**: una persona del núcleo o de una célula madura acompaña a la nueva durante sus primeros DGP — el conocimiento tácito viaja por personas mientras el corpus cubre lo explícito (ESI-010/22 §3.1).

## 2. Reglas normativas

1. **No se escala sobre fábrica en rojo**: añadir células con puertas inestables, molde sin validar o camino crítico bloqueado multiplica el problema (la lección Brooks institucionalizada) — el escalado tiene compuerta: los hitos.
2. **Las fronteras organizacionales son las arquitectónicas** (ESI-010/18 §2.2): cada célula posee módulos o servicios completos con sus contratos; dos células dentro del mismo módulo es una partición pendiente o un error de asignación.
3. **La plataforma escala con el programa**: la razón células-de-producto / capacidad-de-plataforma se vigila (doc 18 §1.5); N células generando y una plataforma estrangulada es el cuello de botella clásico del escalado.
4. **Cada célula opera lo suyo**: construye, libera y responde por sus módulos (la propiedad de ESI-009); el escalado no crea castas de "los que construyen" y "los que operan".
5. **La absorción se mide**: células nuevas tardan en rendir; la planificación usa rendimiento demostrado (métricas de flujo por célula, ESI-009/18 — del sistema, no del individuo), no el nominal del día uno.

## Impacto sobre la implementación

El plan de incorporación se ancla a M2/M3; el registro asigna DGP por célula; las fronteras de células se declaran sobre el catálogo de módulos.

## Dependencias

ESI-009/18; ESI-010/18, /22; docs 06, 08, 10, 12, 15, 18.

## Riesgos

- El escalado por presión ("contratemos ya que hay que llegar") ignorando la compuerta de hitos; mitigación: R-10 con señal en el registro y la regla §2.1 — el escalado sin molde validado es el riesgo nombrado más caro del programa después de R-02/R-03.

## Decisiones habilitadas

- Crecimiento planificado con compuertas y absorción medible.
- Autonomía de células con fronteras arquitectónicas limpias.

## Decisiones bloqueadas

- Prohibido escalar antes de M2 salvo decisión de radio máximo.
- Prohibidas células compartiendo la propiedad de un módulo.
- Prohibido el escalado de producto sin escalado de plataforma.

## Reusable Pattern

Células con propiedad completa + escalado por hitos + madrinas + absorción medida: crecer copiando un molde probado, no apostando a la masa.

## Anti-Patterns

- Duplicar el equipo el mes anterior al hito que se está por perder.
- La célula "frontend" y la célula "backend" del mismo módulo.
- Medir a la célula nueva con la vara de la madura desde el día uno.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la ambición de escala que el crecimiento sirve).
- **ESI que consume**: ESI-009/18 (rendimiento por sistema); ESI-010/18 (fronteras como idioma).
- **DGP que originará**: los DGP se asignan a células conforme el escalado avanza.
- **ADR relacionados**: ADR de escalado por células con compuerta de hitos.
- **Módulos que reutilizarán este patrón**: cada módulo nuevo recibe célula por este régimen.
