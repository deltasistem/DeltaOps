# 24 — Security Knowledge Graph

> **DeltaOps — ESI-007 · v1.0** · El grafo de conocimiento consolidado del programa de seguridad: qué consume la serie, qué origina y cómo se navega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento cierra con su Knowledge Graph local; este consolida el de la serie (el patrón de cierre de ESI-006/27) para navegación y análisis de impacto documental.

## 2. Lo que ESI-007 consume

| Fuente | Uso principal |
|---|---|
| ETS-001 | Roles reales del negocio → RBAC y plantillas (07), delegación (06), sedes para alcance (08) |
| ETS-005 | Capacidades → verdad 1 de autorización (04), capacidades empresariales (14, 18, 20) |
| ETS-008 | Catálogos de contratos → exposición por catálogo (09) |
| ETS-009 | Gobierno de datos → clasificación (16), retención (13, 15), imputabilidad (02, 06) |
| ETS-010/011/012 | Calidad exigible (22-23), fronteras y credenciales (09-12), realidad de campo y mercado (03, 05, 27) |
| ENGINEERING_CHARTER | Principios heredados; seguridad declarativa como extensión natural |
| ESI-002 | Puerta (17→ detección de secretos, SC), proceso de decisiones (27→ riesgo, ABAC, reclasificación), seed (12→ ambientes, baterías) |
| ESI-003 | Kernel: pipeline y contexto (10-12→ 03-05), RLS dos murallas (09→ 04, 17), trabajos (22→ 10) |
| ESI-004 | Auditoría de negocio (17→13), revisión (26→23), checklist (25→22) |
| ESI-005 | Permisos (16→04, 07), clasificación de módulos (15→16), offline (18→03, 05), scorecard (24→20), madurez (23→21) |
| ESI-006 | Patrones de autorización del estrato (19→04, 07), chasis de integraciones (14→10-11), configuración por niveles (20→ políticas), registro (21→18), revisión RS (25→23) |

## 3. Lo que ESI-007 origina

- **Conceptos**: seis rubros de declaración (01), identidad/cuenta separadas (02), fuerza de sesión y step-up (03, 05), cuatro verdades (04), rastro doble (06), RBAC aditivo con incompatibilidades (07), preparación ABAC (08), exposición por catálogo (09), dueño humano de cuentas de servicio (10), referencia-no-valor de secretos (11), solapamiento N/N-1 de credenciales (12), registro dual negocio/seguridad (13), cumplimiento-por-mapeo (14), supresión-por-desvinculación (15), escala O/I/P/S (16), ZT como composición (17), registro de gobierno con dientes (18), escala R1-R4 con efectos (19), score con consecuencias (20), madurez como regulador de negocio (21), SC/simulacros (22), SR con bloqueo escalonado (23).
- **DGP**: identidad, plataforma de seguridad, gobierno (doc 25).
- **ADR**: catálogo completo en doc 26.

## 4. Reglas de navegación

1. **"Citar, no repetir"**: citas por código; este grafo resuelve rutas (régimen ESI-006/27 §4).
2. **Impacto documental**: cambiar norma citada exige recorrer citantes; los rubros y escalas de esta serie tienen radio total (todo componente los declara) — el análisis previo es obligatorio.
3. **El grafo se congela con la serie** en v1.0; series futuras lo extienden.

## Impacto sobre la implementación

Instrumento documental; sin software.

## Dependencias

Todos los documentos de la serie y las series citadas en §2.

## Riesgos

- Desactualización tras cambios; mitigación: actualizar el grafo es paso del proceso de cambio normativo (ESI-002/27), como en ESI-006/27.

## Decisiones habilitadas

- Onboarding y auditoría navegando el programa por el grafo.
- Análisis de impacto de cambios normativos de seguridad con radio explícito.

## Decisiones bloqueadas

- Prohibido modificar normas citadas sin recorrer citantes.
- Prohibidas citas irresolubles.
- Prohibido duplicar norma en vez de citar.

## Reusable Pattern

El cierre-grafo por serie (consume/origina/ADR + navegación), tercera instancia del patrón (ESI-005/27 índice de portafolio, ESI-006/27, este): estándar para toda serie futura.

## Anti-Patterns

- Grafos decorativos sin correspondencia con citas.
- Resumir normas dentro del grafo (el grafo apunta, no norma).
- Ignorar el radio total de rubros y escalas al cambiarlas.

## Knowledge Graph

- **ETS que consume**: los doce, según el mapa §2.
- **ESI que consume**: ESI-002…ESI-006 completos, según el mapa §2.
- **DGP que originará**: ninguno directo; indexa los del doc 25.
- **ADR relacionados**: el catálogo del doc 26.
- **Módulos que reutilizarán este patrón**: todos los equipos navegan el programa por aquí; series futuras replican el cierre.
