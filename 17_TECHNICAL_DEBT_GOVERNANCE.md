# 17 — Technical Debt Governance

> **DeltaOps — ESI-009 · v1.0** · El gobierno de la deuda técnica: deuda declarada con dueño, presupuesto de pago permanente y la prohibición de la deuda invisible.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La deuda técnica legítima es un préstamo consciente: velocidad hoy a cambio de interés mañana. Lo prohibido no es endeudarse — es endeudarse **sin declararlo**: la deuda invisible no se paga, se descubre en el incidente. Este documento le da a la deuda el mismo régimen que a todo lo excepcional de la casa: registro, dueño, caducidad, visibilidad (el patrón de los waivers, ESI-007/18, y los toggles, doc 12).

## 2. Reglas normativas

1. **Toda deuda se registra al nacer**: qué se debe, por qué se aceptó, qué interés cobra (riesgo, lentitud, fragilidad), dueño y horizonte de pago; la marca en código apunta al registro — el comentario `TODO` huérfano no es un registro, es basura.
2. **Fuentes reconocidas de deuda**: la decisión consciente en revisión ("importante" convertido en deuda, doc 06 §2.4), los toggles vencidos (doc 12 §3.1), los hallazgos de retrospectiva (doc 15), el hotfix repetido en la misma zona (doc 16 §2.7), la desviación temporal de una norma congelada con waiver. Todas convergen al mismo registro único.
3. **La deuda se clasifica por interés, no por antigüedad**: la que toca seguridad, aislamiento o corrección de datos es de pago prioritario obligatorio; la cosmética puede esperar declaradamente; el registro ordena por costo real, no por ruido.
4. **Presupuesto de pago permanente**: cada ciclo (doc 20) reserva capacidad explícita para pago de deuda — la proporción la fija el DGP; "cuando haya tiempo" es el mecanismo conocido de la deuda eterna. El presupuesto se audita en métricas (doc 18).
5. **La deuda prescribe en decisión**: la deuda que nadie pagará se cierra explícitamente ("se acepta para siempre", decisión registrada) o se paga; el registro no es un cementerio de buenas intenciones — cada entrada tiene un desenlace.
6. **Prohibida la deuda estructural silenciosa**: violar una norma congelada (fronteras de módulos, contratos, RLS) "temporalmente" sin waiver registrado no es deuda: es un defecto bloqueante en revisión y puerta.
7. **El registro es visible para producto**: la deuda compite por capacidad con la funcionalidad a la vista de todos; ocultarle el costo del interés a quien prioriza es la mentira que este régimen elimina.

## Impacto sobre la implementación

El registro de deuda, su clasificación y el presupuesto de pago se materializan en la herramienta de gestión del trabajo definida en el DGP de entrega.

## Dependencias

ESI-007/18 (patrón de vida gobernada); docs 06, 12, 15-16, 18, 20.

## Riesgos

- El registro creciendo sin pagos hasta perder credibilidad; mitigación: presupuesto obligatorio (§2.4), prescripción por decisión (§2.5) y la métrica de edad/flujo de deuda (doc 18) con umbrales en el score (doc 19).

## Decisiones habilitadas

- Endeudarse con velocidad de manera consciente y auditable.
- Priorización honesta entre funcionalidad y salud del sistema.

## Decisiones bloqueadas

- Prohibida la deuda sin registro, dueño y horizonte.
- Prohibido el ciclo sin presupuesto de pago.
- Prohibida la violación de normas congeladas como "deuda" sin waiver.

## Reusable Pattern

Registro único + dueño y horizonte + presupuesto permanente + prescripción por decisión: la deuda como préstamo gobernado — nunca como sorpresa.

## Anti-Patterns

- El "sprint de deuda" anual como única forma de pago.
- TODO de hace tres años sin dueño ni contexto.
- Renombrar deuda como "mejora futura" para sacarla del registro.

## Knowledge Graph

- **ETS que consume**: ninguno directo; protege la velocidad sostenida que ETS-012 exige.
- **ESI que consume**: ESI-007/18 (régimen dueño+caducidad+visibilidad).
- **DGP que originará**: registro, clasificación y presupuesto en el DGP de entrega.
- **ADR relacionados**: ADR de deuda declarada obligatoria; ADR de presupuesto de pago.
- **Módulos que reutilizarán este patrón**: todos registran en el mismo libro; ninguno lleva contabilidad propia.
