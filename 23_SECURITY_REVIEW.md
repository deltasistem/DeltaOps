# 23 — Security Review

> **DeltaOps — ESI-007 · v1.0** · La revisión de seguridad: las preguntas del revisor humano SR-01…SR-08 — la intención donde la puerta solo ve la forma.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Tercera instancia del patrón de revisión (R de módulos ESI-004/26, RS del estrato ESI-006/25): la máquina verifica SC-01…SC-12 (doc 22); el revisor caza intención, fronteras y deriva. Proporcional al riesgo: cambios en componentes R1 exigen revisor senior de seguridad; R2 revisión reforzada; R3/R4 el flujo normal con estas preguntas presentes.

## 2. Las preguntas del revisor (SR-01…SR-08)

| # | Pregunta | Qué caza |
|---|---|---|
| **SR-01** | ¿El cambio evalúa autorización por el pipeline o aparece un atajo ("ya lo comprobamos antes", caché de decisión, verificación en cliente)? | La erosión de las cuatro verdades (doc 04) |
| **SR-02** | ¿Aparece confianza por origen (red interna, pieza hermana, IP) en lugar de identidad? | La zona de confianza que ZT prohíbe (doc 17) |
| **SR-03** | ¿Los errores y bitácoras nuevos revelan algo (existencia, interiores, datos P/S)? | Fugas por canales laterales (docs 04 §2.2, 09 §2.6, 13 §2.6) |
| **SR-04** | ¿Los datos nuevos declaran clasificación y la heredan sus derivados? ¿Algún campo P/S disfrazado de O? | La clasificación evadida (doc 16) |
| **SR-05** | ¿El cambio introduce material que debería ser secreto (llaves, credenciales, tokens) fuera del almacén o re-mostrable? | La deriva de secretos (doc 11) |
| **SR-06** | ¿Los permisos nuevos siguen el catálogo y los patrones (propio/derivado/doble llave)? ¿Se inventó un permiso para atajar? | Autorización ad-hoc (docs 04, 07) |
| **SR-07** | ¿El componente cambió de perfil (más datos sensibles, más tenants, más alcance) sin re-evaluar su riesgo? | El nivel de riesgo desactualizado (doc 19 §2.4) |
| **SR-08** | ¿Lo auditado sigue completo tras el cambio (eventos de negocio y seguridad, rastro doble en delegación)? ¿Algo dejó de dejar rastro? | La regresión de imputabilidad (docs 06, 13) |

## 3. Reglas de aplicación

1. **SR-01, SR-02 y SR-05 son de bloqueo** en cualquier nivel de riesgo; el resto bloquea en R1/R2 y admite seguimiento con dueño en R3/R4.
2. **Cita o "no aplica" razonado por pregunta** (el régimen de sus hermanos); sin marcas ciegas.
3. **Hallazgos repetidos se promueven a puerta** (la regla de ESI-002/17): tres apariciones de un SR → candidato a validación mecánica en SC.
4. **El revisor senior de seguridad es rol, no héroe**: nombrado, con suplencia, y su carga es métrica de gobierno (cuello de botella visible).

## Impacto sobre la implementación

Las preguntas entran a la plantilla de revisión, activadas por el nivel de riesgo del componente tocado; sin herramienta nueva.

## Dependencias

Docs 04, 06-07, 09, 11, 13, 16-17, 19, 22; ESI-002/17; ESI-004/26; ESI-006/25.

## Riesgos

- Revisión de seguridad como cuello de botella universal; mitigación: proporcionalidad por riesgo §1 — el rigor senior se concentra en R1/R2; R3/R4 fluyen con el checklist mecánico y las preguntas presentes.

## Decisiones habilitadas

- Defensa humana sistemática de las fronteras que la puerta no ve.
- Mejora continua del checklist por promoción de hallazgos.

## Decisiones bloqueadas

- Prohibido aprobar con SR-01/02/05 abiertos.
- Prohibidas revisiones R1 sin revisor senior de seguridad.
- Prohibidas marcas ciegas sin cita o razonamiento.

## Reusable Pattern

SR-01…SR-08 con bloqueo escalonado por riesgo y promoción a puerta: la instancia de seguridad del patrón de revisión; toda serie futura con revisión replica la estructura.

## Anti-Patterns

- El "LGTM de seguridad" en cambios R1 de gran tamaño.
- Revisar el diff sin mirar las declaraciones (rubros, riesgo, clasificación).
- El revisor senior como aprobador de todo (diluye el juicio donde importa).

## Knowledge Graph

- **ETS que consume**: ETS-010 (calidad exigible).
- **ESI que consume**: ESI-002/17; ESI-004/26; ESI-006/25.
- **DGP que originará**: la plantilla de revisión por riesgo en todos los DGP.
- **ADR relacionados**: ADR de bloqueo escalonado por riesgo (doc 26).
- **Módulos que reutilizarán este patrón**: todos; sus revisiones previas (R, RN, RS) siguen vigentes y estas preguntas se superponen por riesgo.
