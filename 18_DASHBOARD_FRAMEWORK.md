# 18 — Dashboard Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de tableros: estado agregado y accionable — widgets por catálogo, KPIs solo del catálogo oficial y cero números inventados en pantalla.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

Un tablero (layout L3) compone **widgets** de un catálogo cerrado sobre una rejilla normada:

| Tipo de widget | Propósito | Fuente |
|---|---|---|
| **Indicador** | Un KPI con tendencia y umbral | Catálogo de KPIs (ESI-005/13, ESI-006/16) exclusivamente |
| **Lista accionable** | Los N pendientes/excepciones con acceso directo | Consultas declaradas (proyecciones) |
| **Gráfica** | Serie o distribución de un KPI | El mismo catálogo; la gráfica es presentación, no cálculo |
| **Acceso** | Atajo a pantalla o acción frecuente | Registro de navegación (doc 03) |
| **Resumen IA** | Síntesis narrativa marcada como IA | Doc 22; opcional siempre |

## 2. Reglas

1. **Ningún número nace en el tablero**: todo indicador cita su KPI del catálogo con su definición, dueño y frescura (ESI-006/16); el tablero que calcula por su cuenta crea la segunda verdad que el catálogo existe para impedir. La frescura se muestra ("al cierre de ayer") — el dato sin fecha es rumor.
2. **Accionable sobre contemplativo**: los tableros de entrada de workspaces (doc 04 §2.4) priorizan lo que exige acción (excepciones, vencidos, esperándome); la gráfica decorativa cede el sitio. Todo widget enlaza a su detalle (drill-down por enlace profundo).
3. **Composición gobernada**: los tableros estándar los define el DGP correspondiente (por workspace/rol); la personalización del usuario reordena y oculta widgets del catálogo permitido — jamás añade fuentes nuevas (disposición sí, alcance no, doc 04 §2.2).
4. **Los umbrales son del KPI, no del tablero**: los estados visuales (bien/atención/crítico, con forma además de color, doc 10 §2.1) provienen de umbrales declarados en el catálogo; dos tableros jamás pintan el mismo KPI con umbrales distintos.
5. **El tablero degrada por widget**: el fallo o vacío de una fuente afecta su widget (contención doc 13 §2.1, vacío honesto doc 14 §2.5); el tablero jamás cae completo por una fuente.

## 3. Declaración (los ocho rubros)

- **Commands**: solo personalización de disposición; las acciones de las listas accionables son de sus pantallas destino.
- **Queries**: los KPIs y proyecciones citados por widget, con su frescura declarada.
- **Capacidades**: cada widget hereda las de su módulo fuente; el tablero muestra los alcanzables.
- **Servicios**: KPIs (ESI-006/16), exportes del tablero si se declara (ESI-006/09).
- **Permisos**: por widget (el KPI restringido no aparece sin su permiso, ESI-005/13); el tablero es la suma de lo visible.
- **Offline**: tableros de oficina son online-first con último valor y frescura visible; el tablero de campo muestra lo sincronizado (doc 11).
- **KPIs**: interacción por widget (drill-down), widgets ocultados por usuarios (detector de ruido).
- **IA**: el widget de resumen, marcado y opcional (doc 22); jamás altera números.

## Impacto sobre la implementación

La rejilla, el catálogo de widgets y el contrato indicador→KPI entran al DGP de experiencia; los tableros estándar se declaran por DGP de módulo/workspace.

## Dependencias

Docs 03-05, 10-11, 13-14, 22; ESI-005/13; ESI-006/09, /16.

## Riesgos

- Tableros-vitrina para gerencia que nadie acciona; mitigación: la regla §2.2 y el KPI de interacción — el widget sin drill-down en meses es candidato a poda en la revisión.

## Decisiones habilitadas

- Una sola verdad numérica del catálogo en toda superficie.
- Tableros por rol montables por composición, sin diseño desde cero.

## Decisiones bloqueadas

- Prohibidos cálculos de indicadores en pantalla.
- Prohibidos umbrales locales por tablero.
- Prohibida personalización que añada fuentes fuera del catálogo permitido.

## Reusable Pattern

Widgets por catálogo + KPIs citados con frescura + degradación por widget: el tablero como composición gobernada — la anti-hoja-de-cálculo.

## Anti-Patterns

- El tablero que empieza simple y acumula cuarenta widgets.
- Gráficas de KPIs sin definición consultable ("¿qué cuenta esto exactamente?").
- El número grande sin tendencia ni umbral (¿es bueno o malo?).

## Knowledge Graph

- **ETS que consume**: ETS-001 (qué mira cada rol), ETS-012 (KPIs vendibles).
- **ESI que consume**: ESI-005/13; ESI-006/16 (catálogo único), /09.
- **DGP que originará**: rejilla y widgets en el DGP de experiencia; tableros estándar por DGP.
- **ADR relacionados**: ADR de KPIs-solo-catálogo en superficie.
- **Módulos que reutilizarán este patrón**: todos publican KPIs; ninguno construye tablero propio.
