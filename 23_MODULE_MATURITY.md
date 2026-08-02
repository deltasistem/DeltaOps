# 23 — Business Module Maturity Model

> **DeltaOps — ESI-005 · v1.0** · Los niveles de madurez de un módulo de negocio: una escala honesta para gobernar el portafolio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El ciclo de vida (doc 03) dice en qué estado está un módulo; la madurez dice **qué tan bien está** en ese estado. Es la herramienta de gobierno del portafolio: dónde invertir, qué exigir antes de vender, qué módulo necesita rescate.

## 2. Los niveles

| Nivel | Nombre | Criterio (acumulativo) |
|---|---|---|
| **M0** | Esqueleto | Anatomía y declaración en pie; arranca; sin funcionalidad completa. Solo legítimo "en construcción" |
| **M1** | Conforme | Checklist de implementación (doc 25) completo: patrón cumplido, cuatro niveles de prueba, expediente, seed. Es el mínimo para "Disponible" |
| **M2** | Operado | Adoptado por tenants reales; presupuestos de calidad (ESI-004/27) medidos en producción; alertas ensayadas; cero AP conocidos; scorecard (doc 24) completo y en verde |
| **M3** | Probado por el uso | Sobrevivió evolución real: cambios de contrato N/N-1 ejecutados, migraciones expandir-migrar-contraer en producción, conflictos offline reales resueltos por su semántica declarada; sus patrones alimentaron mejoras al estándar |
| **M4** | Referente | Usado como material de contraste en revisiones y onboarding junto al módulo de referencia; sus constructores de escenario y baterías se reutilizan por otros |

## 3. Reglas

1. **La madurez se evalúa con el scorecard** (doc 24): evidencia, no autoevaluación de equipo.
2. **No se salta ni se regala**: M2 exige producción real; M3 exige historia real. Un módulo recién aceptado es M1 por definición, y eso está bien.
3. **La madurez puede bajar**: AP detectados en `main`, scorecard en rojo sostenido o divergencia con el estándar degradan el nivel; la degradación es visible y dispara plan de rescate.
4. **Usos de gobierno**: compromisos comerciales fuertes (SLA, clientes ancla) exigen M2+; los módulos M1 se venden como disponibles con expectativa calibrada; el portafolio se revisa por nivel en el ciclo de gobierno (ESI-002/28).

## Impacto sobre la implementación

Añade el nivel de madurez al catálogo de módulos (junto al estado, doc 03) y la revisión periódica de niveles al ciclo de gobierno.

## Dependencias

Docs 03, 24-25; ESI-004/23, /25 y /27; ESI-002/21 y /28; ETS-010.

## Riesgos

- La escala usada como ranking de equipos en vez de herramienta de inversión; mitigación: la madurez califica módulos y su contexto (edad, adopción), no personas; el uso §3.4 es el legítimo.

## Decisiones habilitadas

- Decisiones de portafolio (inversión, rescate, compromisos comerciales) con base común.
- Expectativas comerciales calibradas por nivel.

## Decisiones bloqueadas

- Prohibido declarar M2+ sin evidencia de producción.
- Prohibido comprometer SLA sobre módulos M1.
- Prohibido ocultar degradaciones de nivel.

## Reusable Pattern

La escala M0-M4 con criterios acumulativos es única para todos los módulos; cada DGP declara el nivel objetivo de su entrega (normalmente M1) y qué quedaría para alcanzar M2.

## Anti-Patterns

- Inflación de niveles por presión comercial.
- Madurez evaluada una vez y nunca revisada.
- Confundir antigüedad con madurez (viejo ≠ M3).

## Knowledge Graph

- **ETS que consume**: ETS-001 (objetivos de producto), ETS-012 (compromisos de servicio).
- **ESI que consume**: ESI-004/25 y /27; ESI-002/28.
- **DGP que originará**: cada DGP-módulo declara nivel objetivo; posibles DGP de rescate para módulos degradados.
- **ADR relacionados**: ADR de gobierno de portafolio (ciclo ESI-002/28).
- **Módulos que reutilizarán este patrón**: todos; la escala es transversal al portafolio.
