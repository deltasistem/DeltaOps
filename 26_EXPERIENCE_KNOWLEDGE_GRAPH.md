# 26 — Experience Knowledge Graph

> **DeltaOps — ESI-008 · v1.0** · El grafo de conocimiento consolidado de la plataforma de experiencia: qué consume la serie, qué origina y cómo se navega.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento cierra con su Knowledge Graph local; este consolida el de la serie (el patrón de cierre de ESI-006/27 y ESI-007/24) para navegación y análisis de impacto documental.

## 2. Lo que ESI-008 consume

| Fuente | Uso principal |
|---|---|
| ETS-001 | Roles y jornadas → workspaces (04), tableros por rol (18), revisor XR-01 (25) |
| ETS-005 | Capacidades → rubro del contrato (05), visibilidad (02-03), IA contratable (22) |
| ETS-011 | Realidad de campo → posturas (09), offline (11), mobile-first (23), accesibilidad real (10) |
| ETS-012 | Adopción y mercado → vacíos de primera vez (14), score de adopción (24) |
| ESI-002 | Puerta (17→ EC mecánicos, tokens, contraste), seed asimétrico (12→ vacíos de primera vez), proceso (27→ evolución) |
| ESI-003 | Pipeline y contratos → comandos/errores (05, 13), atomicidad de asistentes (17), `fechaNegocio` (19), trabajos (12) |
| ESI-004 | Auditoría (17→ notificaciones vs. historial, 15), revisión R (26→ XR) |
| ESI-005 | Permisos (16→ 05), proyecciones (12→ 20), KPIs (13→ 18), offline (18→ 11), registro (04→ 03), scorecard (24→ 24) |
| ESI-006 | Servicios: notificaciones (06→15), búsqueda (08→21), exportes (09→12, 20), IA (13→22), KPIs (16→18, 24), configuración (20→ preferencias) |
| ESI-007 | Verdades y no-fuga (04→ 03, 05, 13, 21, 25), sesiones (05→ 02, 06), delegación (06→ 06), step-up (03→ 16), clasificación (16→ 20), score/madurez (20-21→ 24), sin forks por cliente (27→ 08) |

## 3. Lo que ESI-008 origina

- **Conceptos**: shell único con lienzo (02), árbol de navegación por registro (03), workspace como unidad de presentación (04), **contrato de pantalla de ocho rubros** (05), fronteras duras/blandas de contexto (06), catálogo de layouts L1-L6 (07), tokens en tres capas (08), posturas campo/planta/oficina (09), accesibilidad estructural (10), honestidad offline (11), tres regímenes de carga (12), taxonomía de error de superficie (13), vacíos por causa (14), severidades con contrato de interrupción (15), escalera de diálogos (16), asistente como transacción de experiencia (17), widgets por catálogo (18), formulario anticipar-sin-decidir (19), tabla por declaración (20), búsqueda como proyección de permisos (21), IA propone-dispone-decide (22), campo-primero como orden (23), score por postura (24), EC/XR (25).
- **DGP**: el DGP de plataforma de experiencia y las secciones de experiencia de todo DGP (doc 27).
- **ADR**: los citados por documento, consolidables en el corpus (ESI-002/27).

## 4. Reglas de navegación

1. **"Citar, no repetir"**: citas por código; este grafo resuelve rutas (régimen ESI-006/27 §4).
2. **Impacto documental**: el contrato de pantalla (05), los tokens (08) y el catálogo de layouts (07) tienen radio total sobre la superficie — cambiarlos exige recorrer citantes.
3. **El grafo se congela con la serie** en v1.0; series futuras lo extienden.

## Impacto sobre la implementación

Instrumento documental; sin software.

## Dependencias

Todos los documentos de la serie y las series citadas en §2.

## Riesgos

- Desactualización tras cambios; mitigación: actualizar el grafo es paso del proceso de cambio normativo (ESI-002/27), como en sus predecesores.

## Decisiones habilitadas

- Onboarding de equipos de superficie navegando el estándar por el grafo.
- Análisis de impacto de cambios de estándar con radio explícito.

## Decisiones bloqueadas

- Prohibido modificar normas citadas sin recorrer citantes.
- Prohibidas citas irresolubles.
- Prohibido duplicar norma en vez de citar.

## Reusable Pattern

El cierre-grafo por serie (consume/origina/navegación), cuarta instancia del patrón: estándar consolidado de toda serie de esta casa.

## Anti-Patterns

- Grafos decorativos sin correspondencia con citas.
- Resumir normas dentro del grafo (el grafo apunta, no norma).
- Ignorar el radio total del contrato de pantalla al cambiarlo.

## Knowledge Graph

- **ETS que consume**: ETS-001, ETS-005, ETS-011, ETS-012, según el mapa §2.
- **ESI que consume**: ESI-002…ESI-007 completos, según el mapa §2.
- **DGP que originará**: ninguno directo; indexa los del doc 27.
- **ADR relacionados**: los consolidados en el corpus por esta serie.
- **Módulos que reutilizarán este patrón**: todos los equipos navegan el estándar por aquí; series futuras replican el cierre.
