# 01 — Experience Platform

> **DeltaOps — ESI-008 · v1.0** · La plataforma de experiencia: el estándar único para construir cualquier pantalla de DeltaOps — la experiencia como contrato, no como artesanía.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué es (y qué no es)

La Plataforma de Experiencia es el conjunto de contratos, marcos y estándares que gobiernan **toda** experiencia de usuario de DeltaOps — web de oficina, dispositivo de planta, móvil de campo. No es una librería de componentes ni un catálogo de pantallas: es la capa normativa que hace que cualquier pantalla, construida por cualquier equipo, se comporte como parte del mismo producto.

| Es | No es |
|---|---|
| Contratos declarativos (qué declara toda pantalla, doc 05) | Diseños de pantallas específicas |
| Marcos de composición (shell, navegación, layouts, tablas, formularios) | Componentes React ni código |
| Estándares transversales (tokens, accesibilidad, offline, carga, errores) | Una guía de estilo estética |
| Reglas verificables (checklist doc 25, score doc 24) | Recomendaciones opcionales |

## 2. Principios

1. **La experiencia consume lo congelado, no lo reinterpreta**: toda pantalla es una proyección de contratos existentes — comandos y consultas del Kernel (ESI-003), capacidades (ETS-005), permisos (ESI-005/16), servicios compartidos (ESI-006), seguridad (ESI-007). La pantalla que inventa semántica propia está rota por definición.
2. **Declarativa como todo lo demás**: cada pantalla declara los **ocho rubros** — Commands, Queries, Capacidades, Servicios, Permisos, Offline, KPIs, IA (el contrato del doc 05) — igual que los módulos declaran los suyos. Lo no declarado no existe para la pantalla.
3. **Una plataforma, tres posturas**: oficina (densidad y análisis), planta (dispositivo compartido, guantes, luz), campo (móvil, offline, una mano). Las posturas son variantes del mismo estándar (docs 09, 23), jamás productos distintos.
4. **La realidad de campo manda** (ETS-011/012): conectividad intermitente, usuarios no digitales, urgencia operativa. La experiencia se diseña desde el peor contexto hacia el mejor, no al revés (doc 23).
5. **Coherencia sobre creatividad**: la misma acción se ve, se nombra y se comporta igual en todas partes; la innovación de experiencia entra por evolución del estándar (doc 28), no por pantalla.
6. **La experiencia es medible**: accesibilidad, carga, errores y consistencia tienen criterios verificables (docs 24-25); "se siente bien" no es un argumento — "cumple EC-xx" sí.

## 3. Composición de la serie

| Bloque | Documentos |
|---|---|
| Estructura | 02 shell · 03 navegación · 04 workspaces · 05 contrato de pantalla · 06 cambio de contexto · 07 layouts |
| Fundamentos visuales | 08 tokens · 09 responsive · 10 accesibilidad |
| Estados y resiliencia | 11 offline · 12 carga · 13 errores · 14 vacíos |
| Marcos de interacción | 15 notificaciones · 16 diálogos · 17 asistentes · 18 tableros · 19 formularios · 20 tablas · 21 búsqueda · 22 IA |
| Postura y gobierno | 23 mobile-first · 24 score · 25 checklist · 26 grafo · 27 DGP · 28 evolución |

## Impacto sobre la implementación

Toda pieza de interfaz futura se diseña citando esta serie; los DGP de módulos añaden la sección de experiencia (doc 27) con sus pantallas declaradas por contrato.

## Dependencias

ETS-005, ETS-011, ETS-012; ESI-003 (contratos), ESI-005/16-18, ESI-006 (servicios), ESI-007 (seguridad); ENGINEERING_CHARTER.

## Riesgos

- El estándar percibido como freno creativo que los equipos rodean; mitigación: el proceso de evolución (doc 28) da salida legítima a las mejoras, y el checklist hace visible el costo de desviarse.

## Decisiones habilitadas

- Construcción de pantallas por cualquier equipo con resultado uniforme.
- Presupuestos de experiencia (carga, accesibilidad) exigibles por contrato.

## Decisiones bloqueadas

- Prohibidas pantallas sin los ocho rubros declarados.
- Prohibidas experiencias paralelas por módulo o por cliente.
- Prohibido que la interfaz reinterprete semántica de los contratos congelados.

## Reusable Pattern

Plataforma normativa + contrato por pantalla + posturas del mismo estándar: el equivalente de experiencia del patrón de módulos (ESI-004/01) — una vez, para todos.

## Anti-Patterns

- La "pantalla especial" que rompe el estándar por pedido de un cliente.
- Librerías de componentes por equipo divergiendo en silencio.
- Diseñar para la demo (oficina, red perfecta) e ignorar la planta.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidades), ETS-011 (realidad de campo), ETS-012 (mercado).
- **ESI que consume**: ESI-003; ESI-005/16-18; ESI-006; ESI-007.
- **DGP que originará**: el DGP de plataforma de experiencia (doc 27).
- **ADR relacionados**: ADR de experiencia-como-contrato (corpus ESI-002/27).
- **Módulos que reutilizarán este patrón**: todos; ninguna pantalla vive fuera de la plataforma.
