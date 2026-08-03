# 18 — Resource Strategy

> **DeltaOps — DGP-000 · v1.0** · La estrategia de recursos: cómo se asigna la capacidad real — personas, apalancamiento de IA y presupuesto de plataforma — al servicio del orden del programa.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Principios de asignación

1. **La capacidad es la real, no la deseada**: la planificación cuenta personas concretas con dedicación concreta; el "equipo" que es media persona compartida entre tres frentes se planifica como media persona (la honestidad de PF-05, ESI-010/24).
2. **El camino crítico se dota primero** (doc 08 §2.1); los frentes paralelos absorben el resto — la regla de oro de la asignación.
3. **La unidad de asignación es el DGP**: las personas se asignan a DGP concretos vía el registro (doc 12); la asignación difusa ("el equipo ve qué hace") produce los DGP eternos de R-04.
4. **Un DGP, un equipo pequeño**: el DGP se dimensiona para un equipo chico con dueño único (doc 10 §3.4); escalar es sumar DGP paralelos legales (doc 09), no engordar equipos.
5. **La capacidad de plataforma se protege**: la fábrica (plataforma de entrega) mantiene capacidad propia continua — el "préstamo temporal" del equipo de plataforma a producto es cómo las fábricas se pudren (ESI-009/27 §3.4).

## 2. El multiplicador de IA

1. La IA es capacidad real bajo el flujo gobernado (ESI-010/16; doc 20): se planifica su apalancamiento por tipo de trabajo — máximo en generación dentro de patrones, pruebas y migraciones mecánicas; menor en fronteras de diseño y decisión.
2. El límite del multiplicador es la revisión humana (R-06): la capacidad efectiva es min(generación, revisión con entendimiento) — planificar por encima de la capacidad de revisión es planificar hallazgos.
3. El apalancamiento se mide por evidencia (ESI-010/16 §2.8): dónde rinde y dónde concentra hallazgos, ajustando la asignación por datos.

## 3. Perfiles y crecimiento

1. **La fase temprana (W0-W2) exige seniority concentrado**: la fundación y el molde los construyen los perfiles más fuertes — los errores de esta fase se heredan n veces; la incorporación masiva antes del molde validado multiplica el caos, no la velocidad.
2. **El crecimiento sigue al molde, no lo precede** (doc 19): se escala equipos cuando existe el molde probado (M2) que los nuevos pueden seguir.
3. **Toda persona nueva entra por el corpus** (ESI-010/17 §3.3): el onboarding por el índice es parte del costo de incorporación planificado, no un lujo recortable.

## Impacto sobre la implementación

La cadencia asigna personas a DGP en el registro; el tablero expone dotación vs. criticidad; el plan de incorporación se ancla a hitos.

## Dependencias

ESI-009/27; ESI-010/16-17, /24; docs 08-12, 17, 19-20, 24.

## Riesgos

- La sobre-asignación crónica (todos al 120%) que vuelve toda estimación ficción; mitigación: capacidad real como dato del registro y la regla min() del multiplicador — la planificación honesta es una compuerta cultural del programa.

## Decisiones habilitadas

- Asignación objetiva alineada al camino crítico.
- Planificación del apalancamiento de IA como capacidad medible.

## Decisiones bloqueadas

- Prohibida la planificación con capacidad aspiracional.
- Prohibido vaciar la plataforma para dotar producto.
- Prohibido planificar generación por encima de la capacidad de revisión.

## Reusable Pattern

Capacidad real + DGP como unidad de asignación + camino crítico primero + IA como multiplicador acotado por revisión: los recursos al servicio del orden, no del ruido.

## Anti-Patterns

- El organigrama que suma "equipos" de fracciones de personas.
- Contratar diez personas para "acelerar" W1.
- El equipo de plataforma disuelto en el primer apuro de producto.

## Knowledge Graph

- **ETS que consume**: ETS-012 (el presupuesto y ambición que la capacidad sirve).
- **ESI que consume**: ESI-009/27 (plataforma protegida); ESI-010/16-17 (IA y humanos).
- **DGP que originará**: todos reciben asignación explícita por este régimen.
- **ADR relacionados**: ADR de asignación por DGP con capacidad real.
- **Módulos que reutilizarán este patrón**: sus equipos se asignan por el mismo régimen.
