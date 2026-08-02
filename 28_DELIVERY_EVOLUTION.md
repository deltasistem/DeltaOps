# 28 — Delivery Evolution

> **DeltaOps — ESI-009 · v1.0** · Cómo evoluciona el modelo de entrega: cambios por evidencia del score, poda de ceremonia como deber y cero deriva por costumbre.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

La evolución hereda el régimen general (ESI-005/28, ESI-006/28, ESI-007/28, ESI-008/28): decisiones por el proceso (ESI-002/27), expandir-migrar-contraer también para el proceso, N/N-1 donde hay contrato. Lo propio de entrega: **el proceso se juzga con sus propias métricas** (docs 18-19) — el modelo que exige evidencia a todos se la exige a sí mismo primero.

## 2. Reglas de evolución por dominio

1. **Todo cambio de proceso declara su hipótesis medible**: qué dimensión del score (E1-E8) o métrica mejorará; se mide antes/después en la ventana definida — el cambio de proceso que no movió nada se revierte, exactamente como un cambio de código (doc 14 §3.4 aplicado al proceso mismo).
2. **La poda de ceremonia es un deber, no una concesión**: puertas (doc 07 §3.7), métricas (doc 18 §3.5), criterios de checklist (docs 24-25), ceremonias del ciclo (doc 20 §2.4) — todo lo que no previene defectos ni mejora flujo se retira por decisión; E1 contra E8 (doc 19 §3.6) es el argumento estructural de la poda.
3. **Los catálogos crecen por la regla de la casa**: tipos de rama (doc 03), familias de puertas, criterios de QC/RC — con evidencia real (≥3 casos o incidente/retrospectiva que lo exige), jamás por moda de la industria; la práctica de moda sin problema propio que resolver es ceremonia importada.
4. **Los umbrales se calibran, las reglas se deciden**: ajustar un umbral (tamaño de PR, presupuesto de pipeline, franjas del score) es calibración del DGP con rastro; cambiar una regla estructural (el flujo, las definiciones, el contrato de nueve rubros) es decisión del proceso con radio recorrido (doc 26 §4.2).
5. **Las promociones son el motor ordinario**: hallazgo de revisión repetido → puerta (doc 07 §3.6); barrera faltante de retrospectiva → puerta/prueba/alerta (doc 15 §2.8); hotfix repetido → deuda estructural (doc 16 §2.7) — el modelo aprende de su operación por los canales ya normados, sin esperar revisiones anuales.
6. **Las herramientas cambian; el modelo decide**: migrar de plataforma de CI, repositorio o gestión es una decisión reversible mientras la herramienta nueva satisfaga el modelo — la indirección del doc 01 §1 es lo que la hace barata; la herramienta que exige cambiar el modelo invierte la jerarquía y se rechaza.
7. **Lo congelado sigue congelado**: esta serie no habilita reinterpretar ETS ni ESI previos; la evolución de entrega opera dentro del marco — los conflictos reales con normas congeladas van al proceso de decisión general, no se resuelven "en la práctica".

## 3. Declaración (contrato de nueve rubros)

Como régimen normativo: **Objetivo**: mantener el modelo eficaz sin acumular ceremonia. **ETS**: ETS-012. **ESI**: los citados. **DGP**: el de entrega (calibraciones). **Riesgos**: ver abajo. **Evidencias**: score histórico antes/después. **Pruebas**: la medición de cada hipótesis. **Rollback**: revertir el cambio de proceso que no midió mejora. **Observabilidad**: métricas y score de los docs 18-19.

## Impacto sobre la implementación

El régimen entra al proceso de decisiones existente; toda propuesta de cambio de proceso cita su hipótesis, su medición y su reversa.

## Dependencias

ESI-002/27; ESI-005/28; ESI-006/28; ESI-007/28; ESI-008/28; docs 01, 07, 14-16, 18-20, 24-26.

## Riesgos

- La mejora continua degenerando en cambio continuo (el proceso como experimento perpetuo que nadie domina); mitigación: hipótesis medible obligatoria, ventana de medición antes del siguiente cambio en la misma zona, y la estabilidad como valor por defecto — se cambia por evidencia, no por inquietud.

## Decisiones habilitadas

- Un modelo de entrega que mejora con evidencia y se poda a sí mismo.
- Migraciones de herramientas baratas y sin drama.

## Decisiones bloqueadas

- Prohibidos cambios de proceso sin hipótesis medible y reversa.
- Prohibida la adopción de prácticas por moda sin problema propio.
- Prohibida la herramienta que exige invertir la jerarquía modelo→herramienta.

## Reusable Pattern

Hipótesis medible → cambio → medición → conservar o revertir + poda como deber: el proceso tratado con la misma disciplina que el código — la quinta instancia del régimen de evolución de la casa.

## Anti-Patterns

- Adoptar "lo que hace la industria" sin métrica propia que lo pida.
- La ceremonia que sobrevive porque "siempre estuvo".
- Cambiar tres cosas del proceso a la vez y no saber cuál funcionó.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la eficacia comercial que el modelo debe sostener).
- **ESI que consume**: ESI-002/27; ESI-005/28; ESI-006/28; ESI-007/28; ESI-008/28.
- **DGP que originará**: el registro de cambios de proceso con hipótesis y medición en el DGP de entrega.
- **ADR relacionados**: ADR de evolución de proceso por evidencia medida.
- **Módulos que reutilizarán este patrón**: todos los equipos proponen y miden por este régimen; ninguno muta el proceso por costumbre.

---

**Fin de la serie ESI-009.**
