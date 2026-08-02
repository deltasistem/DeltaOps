# 26 — Engineering Knowledge Graph

> **DeltaOps — ESI-009 · v1.0** · El grafo de conocimiento consolidado del modelo de entrega: qué consume la serie, qué origina y cómo se navega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento cierra con su Knowledge Graph local; este consolida el de la serie (el patrón de cierre de ESI-006/27, ESI-007/24 y ESI-008/26) para navegación y análisis de impacto documental.

## 2. Lo que ESI-009 consume

| Fuente | Uso principal |
|---|---|
| ETS-001 | Jornadas críticas → E2E (08); roles en criterios (23) |
| ETS-005 | Capacidades como frontera de los toggles de plan (12) |
| ETS-012 | Cadencia de mercado (01, 10, 20), contrato de soporte (11, 16), promesas de servicio (14-15) |
| ENGINEERING_CHARTER | Principios rectores de la filosofía (01) |
| ESI-002 | Monorepo (02, 09), puerta 17 (07), seed 12 (08), proceso 27 (03, 07, 28) |
| ESI-003 | Contratos e intención (04, 23), expandir-migrar-contraer (10-11, 13-14), pipeline de comandos como patrón |
| ESI-004 | Auditoría 17 (02, 04), estrategia de pruebas 25 (08), revisión R 26 (06), checklist CA (22, 24) |
| ESI-005 | Fronteras de módulos 04 (06-07), permisos 16 (23), baterías de aislamiento 26 (08), scorecard 24 (19) |
| ESI-006 | Configuración por entorno 20 (10, 12), KPIs 16 (23), checklist CS 24 (22, 24), revisión RS 25 (06) |
| ESI-007 | Régimen dueño+caducidad 18 (07, 12, 17, 24), incidentes de seguridad 19 (15), score 20 (19), checklist SC 22 (24), revisión SR 23 (06), sin forks 27 (02, 13), acceso de emergencia (15) |
| ESI-008 | Contrato-precede 05 (01, 05, 21), lenguaje honesto 13 (15), score UX 24 (18-19), checklist EC/XR 25 (06-07, 24) |

## 3. Lo que ESI-009 origina

- **Conceptos**: el contrato de entrega de nueve rubros (01, 05), trunk-based con catálogo de ramas (02-03), commits como declaración derivable (04), preguntas del revisor DR-01…06 con severidades (06), catálogo de familias de puertas (07), pirámide como política económica y baterías intocables (08), tres contextos de pipeline con afectado-primero (09), promoción de artefacto único con confirmación por señal (10), versión derivada con N/N-1 (11), toggles con dueño y caducidad (12), desplegar≠exponer con gradualidad (13), escalera de reversión con ensayo (14), severidades S1-S4 con retrospectiva sin culpa (15), hotfix como atajo de espera (16), deuda declarada con presupuesto (17), métricas de sistema (18), score E1-E8 (19), ciclo como ritmo de decisión (20), DoR-01…08 (21), DoD-01…10 (22), criterios observables con caminos tristes (23), checklists QC/RC (24-25).
- **DGP**: el DGP de plataforma de entrega y el rubro de entrega en todo trabajo (doc 27).
- **ADR**: los citados por documento, consolidables en el corpus (ESI-002/27).

## 4. Reglas de navegación

1. **"Citar, no repetir"**: citas por código; este grafo resuelve rutas (régimen ESI-006/27 §4).
2. **Radio total**: el contrato de entrega (05), la definición de terminado (22) y el flujo de integración (02, 07) afectan a todo trabajo — cambiarlos exige recorrer citantes.
3. **El grafo se congela con la serie** en v1.0; series futuras lo extienden.

## Impacto sobre la implementación

Instrumento documental; sin software.

## Dependencias

Todos los documentos de la serie y las series citadas en §2.

## Riesgos

- Desactualización tras cambios; mitigación: actualizar el grafo es paso del proceso de cambio normativo (ESI-002/27), como en sus predecesores.

## Decisiones habilitadas

- Onboarding de equipos al modelo de entrega navegando por el grafo.
- Análisis de impacto de cambios de proceso con radio explícito.

## Decisiones bloqueadas

- Prohibido modificar normas citadas sin recorrer citantes.
- Prohibidas citas irresolubles.
- Prohibido duplicar norma en vez de citar.

## Reusable Pattern

El cierre-grafo por serie (consume/origina/navegación), quinta instancia del patrón: estándar consolidado de toda serie de esta casa.

## Anti-Patterns

- Grafos decorativos sin correspondencia con citas.
- Resumir normas dentro del grafo (el grafo apunta, no norma).
- Ignorar el radio total del contrato de entrega al cambiarlo.

## Knowledge Graph

- **ETS que consume**: ETS-001, ETS-005, ETS-012, según el mapa §2.
- **ESI que consume**: ESI-002…ESI-008 completos, según el mapa §2.
- **DGP que originará**: ninguno directo; indexa los del doc 27.
- **ADR relacionados**: los consolidados en el corpus por esta serie.
- **Módulos que reutilizarán este patrón**: todos los equipos navegan el modelo por aquí; series futuras replican el cierre.
