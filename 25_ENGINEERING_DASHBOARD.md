# 25 — Engineering Dashboard Model

> **DeltaOps — ESI-010 · v1.0** · El modelo del tablero de ingeniería: una sola superficie de lectura del sistema completo — scores, higiene, gobierno y hitos — derivada de fuentes mecánicas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Los instrumentos existen dispersos por diseño (cada serie el suyo); el tablero los **compone en una lectura única** para la cadencia (ESI-009/20 §2.5) y el gobierno (doc 19 §3.5). Es un modelo de composición, no un producto nuevo: define qué se lee junto y por qué — la herramienta que lo materialice se elige en el DGP de entrega contra este modelo.

## 2. Las vistas del modelo

| Vista | Compone | Fuentes |
|---|---|---|
| **Salud** | La familia de scores completa, desglosada, con franjas y tendencia | Doc 09 (scorecards, seguridad, UX, E1-E8) |
| **Flujo** | Métricas de flujo y estabilidad del período; principal en rojo; trenes liberados | ESI-009/18 |
| **Higiene** | Zombis, toggles vencidos, cuarentenas, waivers por vencer, deuda prioritaria, estados terminales no ejecutados | ESI-009/18; docs 03, 08 |
| **Gobierno** | Decisiones recientes y sin evidencia, waivers activos, compuertas saltadas (debería ser cero), retrospectivas con acciones abiertas | Docs 07, 19; ESI-009/15 |
| **Inventario** | Módulos, servicios y contratos por estado; capacidades por cobertura | Docs 10-13 |
| **Hitos** | Estado PR/PF con criterios y evidencia | Docs 23-24 |

## 3. Reglas normativas

1. **Todo derivado, nada declarado**: el tablero lee registros y rastros (la regla de fuentes mecánicas, doc 09 §2.1); la celda que exige actualización manual es un defecto del modelo.
2. **Una superficie, lecturas por audiencia**: el equipo lee su recorte; la cadencia, el agregado; el gobierno, su vista — pero es el mismo tablero con los mismos números: la versión "para dirección" con otros números es la mentira institucionalizada.
3. **El tablero señala, los foros deciden**: la franja de intervención dispara la conversación en su foro (doc 19); el tablero no ejecuta consecuencias — expone.
4. **Lo verde es silencioso**: el tablero optimiza para excepciones (rojo, tendencia mala, vencimientos); la lectura sana toma minutos — el tablero que exige una hora de ceremonia semanal viola su propósito.
5. **El tablero también se poda**: la vista que nadie consulta se retira (el régimen de métricas, ESI-009/18 §3.5); su composición evoluciona por evidencia de uso.

## Impacto sobre la implementación

El DGP de entrega selecciona la herramienta y materializa las vistas contra este modelo; las fuentes ya emiten todo lo necesario.

## Dependencias

ESI-009/15, /18, /20; docs 03, 07-13, 19, 23-24.

## Riesgos

- El tablero como teatro de gestión (mirado en la reunión, ignorado al decidir); mitigación: las franjas con consecuencia ya son normativas en cada score — el tablero expone obligaciones existentes, no sugiere lecturas opcionales.

## Decisiones habilitadas

- Lectura del estado completo del sistema en una superficie con minutos.
- Conversaciones de cadencia y gobierno partiendo de los mismos números.

## Decisiones bloqueadas

- Prohibidas celdas de actualización manual.
- Prohibidas versiones divergentes del tablero por audiencia.
- Prohibido usar el tablero como sustituto de los foros de decisión.

## Reusable Pattern

Composición de instrumentos existentes + derivación total + lecturas por audiencia sobre números únicos: el tablero como lente, no como fuente.

## Anti-Patterns

- La presentación mensual armada a mano desde capturas.
- El semáforo editado la noche antes del comité.
- Cuarenta vistas para cuarenta gustos.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009/18, /20 (métricas y cadencia como consumidores primarios).
- **DGP que originará**: la materialización de vistas en el DGP de entrega.
- **ADR relacionados**: ADR de tablero derivado con superficie única.
- **Módulos que reutilizarán este patrón**: todos se leen en el mismo tablero.
