# 26 — Construction Knowledge Graph

> **DeltaOps — DGP-000 · v1.0** · El grafo de conocimiento de la construcción: cómo el programa se integra al grafo global — los nodos y aristas que la fase de construcción aporta.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

El grafo global existe (ESI-010/26): nodos, aristas por régimen, radio calculable. La construcción **lo puebla**: cada DGP, release e hito es un nodo nuevo; cada derivación, implementación y evidencia, una arista. Este documento fija cómo — por los regímenes existentes, jamás a mano.

## 2. Lo que la construcción aporta al grafo

**Nodos nuevos**: DGP-000 y sus 28 documentos; los DGP funcionales; los releases (doc 14); los hitos M0…M6 demostrados; las células (doc 19) como dueños.

**Aristas nuevas** (cada una con su fuente mecánica):
| Arista | Significado | Fuente |
|---|---|---|
| *deriva-de* | DGP funcional ← entregable ← ola ← programa | Registro (doc 12 §2.2) |
| *implementa* | DGP → capacidad/contrato/módulo que materializa | Registros de la casa actualizados en AG-2 |
| *libera* | Release → DGP cerrados que contiene | Registro de releases (doc 14 §2.2) |
| *demuestra* | Hito → las AG y compuertas que lo evidencian | Doc 15; evidencia enlazada |
| *sucede-a* | DGP sucesor → predecesor; deuda originada | Doc 10 (sucesión) |
| *decide-sobre* | ADR de construcción → DGP bloqueado/desbloqueado | El canal DGP→ADR (doc 10 §3.2) |

## 3. Reglas normativas

1. **El grafo de construcción es subgrafo del global**: mismas leyes (ESI-010/26 §3) — toda cita resoluble, crecimiento por régimen, radio por aristas; no existe un "grafo del programa" separado.
2. **Los recorridos de construcción quedan garantizados**: ¿qué DGP materializó esta capacidad? ¿qué release la liberó? ¿qué evidencia demostró este hito? ¿qué quedó pendiente de aquel DGP? — todos como consulta de aristas, no como arqueología (la promesa de ESI-010/14 extendida a la construcción).
3. **El corpus normativo y el grafo de construcción se enlazan por las referencias exactas**: las citas ETS/ESI de cada DGP (anatomía obligatoria) son las aristas corpus→construcción — la trazabilidad requisito→norma→DGP→código→release en un solo tejido.
4. **Al cierre del programa, el subgrafo queda como historia navegable**: cómo se construyó DeltaOps, consultable para siempre — el equivalente en grafo del registro archivado (doc 12 §3.5).

## Impacto sobre la implementación

Sin herramienta nueva obligatoria: las aristas nacen de los registros ya normados; la navegabilidad acompaña al índice y al grafo global.

## Dependencias

ESI-010/14, /26; docs 10, 12, 14-15, 19, 23.

## Riesgos

- Aristas declaradas pero no mantenidas (el grafo como aspiración); mitigación: cada arista tiene fuente mecánica en un registro vivo — el grafo deriva; no se dibuja.

## Decisiones habilitadas

- Trazabilidad completa corpus→construcción→operación como consultas.
- Historia navegable y permanente de cómo se construyó el sistema.

## Decisiones bloqueadas

- Prohibido un grafo de construcción separado del global.
- Prohibidas aristas sin fuente mecánica en registros.
- Prohibido purgar el subgrafo de construcción al cierre.

## Reusable Pattern

La construcción como pobladora del grafo global: nodos y aristas por régimen desde los registros — el conocimiento de construcción integrado, no anexado.

## Anti-Patterns

- El diagrama del programa dibujado aparte y venerado.
- La evidencia de hito que nadie puede reencontrar.
- Preguntar "¿quién construyó esto?" a la memoria colectiva.

## Knowledge Graph

- **ETS que consume**: todos (extremo del hilo corpus→construcción).
- **ESI que consume**: ESI-010/14, /26 (trazabilidad y grafo global).
- **DGP que originará**: todos son nodos con aristas por régimen.
- **ADR relacionados**: ADR de subgrafo de construcción por regímenes.
- **Módulos que reutilizarán este patrón**: su historia de construcción queda en el mismo tejido.
