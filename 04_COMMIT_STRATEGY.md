# 04 — Commit Strategy

> **DeltaOps — ESI-009 · v1.0** · La estrategia de commits: mensajes convencionales y declarativos, unidades coherentes y la historia como activo de auditoría.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El commit como declaración

El commit es la unidad mínima de rastro: quién, qué, por qué. En un sistema donde todo comando declara su intención (`clave_idempotencia`, ESI-003), el commit es el equivalente en la fábrica: la historia de la principal es evidencia de auditoría de primera clase (ESI-004/17), no un log privado del autor.

## 2. Reglas normativas

1. **Formato convencional obligatorio**: `tipo(ámbito): resumen imperativo` — tipos de catálogo cerrado (`feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`, `revert`), ámbito = módulo o paquete del monorepo. El formato es mecánicamente verificable en puerta (doc 07) y alimenta el versionado (doc 11 §2.2) y las notas de liberación (doc 10 §2.6) sin trabajo manual.
2. **El resumen dice qué cambia para el sistema, no qué hizo el autor**: "corrige doble descuento de stock en cierre de OT", no "arreglos"; el cuerpo explica el porqué cuando no es obvio — el porqué es lo único que el diff no puede decir.
3. **Marcadores de ruptura explícitos**: el cambio incompatible con N-1 se marca en el commit y se justifica; el versionado (doc 11) y la revisión (doc 06) lo tratan con la severidad de un cambio de contrato.
4. **La principal recibe unidades coherentes**: dentro de la rama de trabajo el autor commitea con libertad; al integrar, el cambio llega como uno o pocos commits coherentes que compilan y pasan pruebas cada uno — la historia bisecable es una herramienta de diagnóstico, no estética.
5. **Referencia al elemento de trabajo**: cada commit integrado referencia su PR/elemento; el rastro intención → cambio → liberación se recorre en ambos sentidos (doc 18 lo explota para métricas sin fricción).
6. **Nada sensible en la historia**: ni secretos, ni datos de clientes, ni volcados de producción — la historia es permanente e inmutable; lo que entra no sale. La puerta (doc 07 §2.4) detecta secretos mecánicamente.
7. **Revertir es un commit de primera clase**: `revert` con referencia al commit revertido y motivo; deshacer es parte normal del flujo (doc 14), no una vergüenza que se esconde en un merge.

## Impacto sobre la implementación

Verificación de formato y detección de secretos entran a las puertas; las plantillas de commit y la guía de ámbitos viven en el DGP de entrega.

## Dependencias

Docs 03, 05-07, 10-11, 14, 18; ESI-003 (intención declarada); ESI-004/17 (auditoría).

## Riesgos

- El formato degenerando en cumplimiento vacío ("fix: fix"); mitigación: la revisión (doc 06) trata el mensaje pobre como hallazgo real, y las métricas de reversa exponen los cambios ilegibles cuando más duele.

## Decisiones habilitadas

- Versionado y notas de liberación derivables mecánicamente de la historia.
- Diagnóstico por bisección sobre una historia que compila en cada punto.

## Decisiones bloqueadas

- Prohibidos commits fuera del formato en la principal.
- Prohibido material sensible en la historia.
- Prohibidas rupturas sin marcador y justificación.

## Reusable Pattern

Historia = declaración de intención verificable en puerta y explotable por máquinas: el commit tratado como el comando — con contrato.

## Anti-Patterns

- Mensajes "wip", "cambios", "ahora sí".
- El commit gigante que mezcla refactor, feature y formato.
- Reescribir historia ya integrada en la principal.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-003 (patrón de intención declarada); ESI-004/17 (rastro de auditoría).
- **DGP que originará**: catálogo de ámbitos y plantillas en el DGP de entrega.
- **ADR relacionados**: ADR de commits convencionales como fuente del versionado.
- **Módulos que reutilizarán este patrón**: todos; el ámbito del commit es su módulo.
