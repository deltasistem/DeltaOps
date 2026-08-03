# 15 — Documentation Lifecycle

> **DeltaOps — ESI-010 · v1.0** · El ciclo de vida documental: estados, propiedad y actualización del corpus — el documento como artefacto gobernado, no como sedimento.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Tipos y estados

| Tipo | Estados | Régimen |
|---|---|---|
| **ETS / Charter** | Congelado; se extiende por documento nuevo, jamás se muta | Fundacional |
| **ESI (series)** | Vigente → congelado al cierre de serie; extensión por serie o decisión | ESI-002/27 |
| **DGP** | Vivo: refleja las normas + calibraciones registradas | Series /27 de cada dominio |
| **ADR** | Propuesta → vigente → reemplazada (doc 07) | ESI-002/27 |
| **Registros e índice** (docs 04-13) | Vivos: derivados de fuentes mecánicas o actualizados como paso del proceso | Esta serie |
| **Documentación operativa** (runbooks, guías) | Viva con dueño y revisión al usarse | DGP de entrega |

## 2. Reglas normativas

1. **Todo documento tiene dueño y estado visible**: el ciclo del artefacto (doc 03) aplica; el documento sin dueño es huérfano y se adopta o se retira — no se deja pudrir.
2. **La actualización viaja con el cambio**: DoD-05 (ESI-009/22) ya lo exige — el cambio que altera comportamiento actualiza su documentación en el mismo flujo; la documentación "para después" es deuda instantánea registrada.
3. **Los documentos normativos van por el flujo completo**: rama, PR, revisión (ESI-009/03 §2.6); el documento cambia como cambia el código, con el mismo rastro.
4. **Congelado significa congelado**: las series cerradas no se editan; el error real detectado en una norma congelada va al proceso de decisión — la corrección entra por decisión con rastro, jamás por edición silenciosa (la inmutabilidad de las etiquetas, ESI-009/11 §2.3, aplicada al corpus).
5. **La documentación operativa se verifica usándose**: el runbook se revisa tras cada uso real (incidente, reversa, simulacro — ESI-009/14-15); el runbook nunca usado y nunca revisado es una hipótesis con formato.
6. **Un solo corpus**: prohibidos los espejos ("el resumen del equipo", "la guía extraoficial") que mutan por su cuenta — el resumen legítimo cita y enlaza; la verdad práctica divergente del corpus es el defecto documental número uno (doc 04 anti-patterns).
7. **La poda documental existe**: lo obsoleto se marca retirado con puntero a su sucesor, no se borra (la historia es rastro) ni se deja como trampa para el lector.

## Impacto sobre la implementación

Sin mecanismo nuevo: el flujo de entrega ya gobierna los cambios documentales; los estados se exponen con el índice (doc 04).

## Dependencias

ESI-002/27; ESI-009/03, /11, /14-15, /22; docs 03-04, 07, 22.

## Riesgos

- El corpus creciendo más rápido que su mantenimiento; mitigación: derivar lo derivable (registros desde fuentes mecánicas), documentación operativa revisada por uso, y la poda como práctica normada — el corpus sano es el navegable, no el exhaustivo.

## Decisiones habilitadas

- Confianza en que lo escrito refleja lo vigente.
- Corrección de normas congeladas con rastro y sin erosión.

## Decisiones bloqueadas

- Prohibida la edición silenciosa de documentos congelados.
- Prohibidos espejos documentales que mutan por su cuenta.
- Prohibido liberar cambios sin su actualización documental (DoD-05).

## Reusable Pattern

Documento = artefacto con dueño, estado, flujo y poda: la documentación gobernada con las mismas leyes que el código.

## Anti-Patterns

- El documento "final_v3_DEFINITIVO" fuera del repositorio.
- Corregir la norma congelada con un edit rápido "porque era un typo".
- El runbook de reversa que nadie tocó desde su estreno.

## Knowledge Graph

- **ETS que consume**: ninguno directo; protege su inmutabilidad.
- **ESI que consume**: ESI-002/27; ESI-009 (flujo, DoD-05, inmutabilidad como patrón).
- **DGP que originará**: ninguno; la documentación operativa vive en el DGP de entrega.
- **ADR relacionados**: ADR de corpus único con corrección por decisión.
- **Módulos que reutilizarán este patrón**: toda su documentación sigue este ciclo.
