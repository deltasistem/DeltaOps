# 28 — Evolución de Módulos

> **DeltaOps — ESI-005 · v1.0** · Cómo evolucionan los módulos de negocio en producción: funcionalidad, contratos, datos y retiro, sin romper a nadie.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los cuatro ejes de evolución

| Eje | Qué cambia | Disciplina |
|---|---|---|
| **Funcional** | Nuevos comandos, agregados, capacidades | Golden Path (ESI-004/22) por cada incremento; capacidades para entrega invisible (doc 05 §3); el checklist (doc 25) se re-verifica en lo tocado |
| **Contratos** | API, eventos publicados, permisos, parámetros | N/N-1 siempre (ESI-002/21): expandir → migrar consumidores → contraer; los consumidores de eventos de otros módulos son parte del análisis de impacto (grafo del doc 04) |
| **Datos** | Esquema, semántica de campos, volúmenes | Expandir-migrar-contraer (ETS-010); migraciones de datos masivas como trabajos con corte y verificación; jamás "scripts de una noche" |
| **Patrón** | El estándar mismo cambia (ESI-004/28) | El módulo adopta según la clase del cambio (inmediata/próxima intervención/opcional); su deuda de adopción es visible en el scorecard (doc 24) |

## 2. Reglas

1. **La evolución usa las mismas puertas que la construcción**: no existe un "modo mantenimiento" con estándares relajados; el PR número 500 de un módulo pasa lo mismo que el número 1.
2. **Cambios de semántica de negocio** (una fórmula de KPI, el significado de un estado): se versionan como contrato — el KPI v2 convive con v1 el ciclo N/N-1, con fecha de corte comunicada; el histórico no se reescribe (los hechos auditados y eventos pasados conservan la semántica de su época).
3. **Deprecar es de primera clase**: piezas (comandos, consultas, parámetros, capacidades) se marcan deprecadas en la declaración, con sustituto y plazo; la telemetría de uso (doc 24) confirma cuándo el retiro es seguro.
4. **Reorganizar fronteras de módulos** (partir un contexto, fusionar) es cambio de arquitectura (ETS-003 + ESI-002/27), ejecutado como DGP propio con plan de datos y eventos; nunca una refactorización oportunista.
5. **El retiro sigue el ciclo del doc 03 §2.4**: capacidades cerradas → datos migrados/archivados → contracción → eliminación; los eventos históricos publicados permanecen consumibles bajo retención.

## 3. Señales de evolución sana

Deuda de adopción decreciente, deprecaciones que llegan a retirarse (no eternas), scorecard estable tras cada release, y cero hotfixes fuera del camino (un hotfix es un PR corto por el mismo camino, no un canal paralelo).

## Impacto sobre la implementación

Añade a la declaración el marcado de deprecación y al scorecard la deuda de adopción; la mecánica N/N-1 y expandir-migrar-contraer ya existen.

## Dependencias

ETS-003/009/010; ESI-002/21 y /27; ESI-004/22 y /28; docs 03-05, 08, 13, 24-25.

## Riesgos

- La presión comercial acelerando retiros o saltándose el N/N-1 "porque nadie lo usa"; mitigación: la telemetría de uso decide, no la intuición; el corte sin evidencia está bloqueado.
- Módulos viejos divergiendo del estándar por adopciones eternamente pendientes; mitigación: la deuda de adopción en rojo sostenido dispara plan (doc 24 §3.3).

## Decisiones habilitadas

- Evolución continua sin ventanas de mantenimiento ni versiones mayores traumáticas.
- Retiros de funcionalidad basados en uso real.

## Decisiones bloqueadas

- Prohibidos estándares relajados para "mantenimiento".
- Prohibido reescribir semántica histórica de eventos, auditoría o KPIs.
- Prohibidas reorganizaciones de fronteras sin decisión de arquitectura y DGP propio.

## Reusable Pattern

Los cuatro ejes §1 como estructura del capítulo "evolución" del expediente de cada módulo; el marcado de deprecación con sustituto+plazo+telemetría como mecánica única de retiro de piezas.

## Anti-Patterns

- El "gran rediseño v2" que congela la evolución un año.
- Deprecaciones sin plazo que viven para siempre.
- Hotfixes por canal paralelo que esquivan la puerta.

## Knowledge Graph

- **ETS que consume**: ETS-003 (fronteras), ETS-009 (retención), ETS-010 (esquema).
- **ESI que consume**: ESI-002/21 y /27; ESI-004/22 y /28.
- **DGP que originará**: los DGP de evolución (incrementos post-M1), de reorganización de fronteras y de retirada, cuando ocurran.
- **ADR relacionados**: ADR de N/N-1 (ESI-002/21); ADR de clases de adopción (ESI-004/28).
- **Módulos que reutilizarán este patrón**: todos, durante toda su vida productiva.

---

**Fin de la serie ESI-005.**
