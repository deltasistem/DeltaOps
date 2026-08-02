# 23 — Mobile First

> **DeltaOps — ESI-008 · v1.0** · Mobile first como disciplina de diseño: el campo diseña primero — porque donde la experiencia falla en la planta, el producto entero falla.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué significa aquí

Mobile first en DeltaOps no es una técnica de CSS: es el **orden de diseño obligatorio** derivado de ETS-011 — el valor del producto se captura en campo (la OT ejecutada, la lectura registrada, la recepción contada); si esa captura falla, los tableros de oficina agregan datos que no existen.

| Orden | Qué se diseña | Pregunta que responde |
|---|---|---|
| 1º | La tarea de campo (postura campo, doc 09) | ¿El técnico puede completar esto con una mano, con guantes, sin señal, en 90 segundos? |
| 2º | La operación de planta (postura planta) | ¿Funciona en el dispositivo compartido, a la distancia y luz reales? |
| 3º | El análisis de oficina (postura oficina) | ¿Qué se enriquece con espacio, teclado y densidad? |

## 2. Reglas

1. **Las pantallas de ejecución se diseñan en campo primero**: toda pantalla cuyo contrato incluya comandos de ejecución operativa (registrar, ejecutar, contar, medir) presenta primero su diseño de campo en el DGP; la versión de oficina es la enriquecida. Las pantallas puramente analíticas (tableros de gestión) pueden nacer en oficina — declarándolo.
2. **Presupuesto de interacción de campo**: cada tarea de campo declara su presupuesto (toques, tiempo estimado, campos obligatorios); el checklist lo verifica contra el diseño (doc 25) y el KPI de tiempo real de captura lo audita en producción (doc 19 §3).
3. **El pulgar y el guante son requisitos**: acciones primarias alcanzables con una mano, objetivos táctiles de token (doc 08), sin gestos de precisión ni dependencia de hover; la captura preferente por selección/escaneo/foto sobre teclear (los controles del doc 19).
4. **Offline es el punto de partida de campo** (doc 11): la tarea de campo se diseña asumiendo sin señal; la conexión es la mejora, no el supuesto — el orden inverso produce las apps que ETS-011 documenta como abandonadas.
5. **Nada de "versión lite"**: el campo no es un recorte del escritorio ni una app aparte con menos verdad; es el mismo producto en su postura más exigente (doc 09 §2.2) — mismos contratos, misma semántica, misma seguridad.

## 3. Declaración (los ocho rubros)

- **Commands**: los de ejecución operativa marcan sus pantallas como campo-primero.
- **Queries**: las de campo declaran su subconjunto precargable (doc 11 §2.5).
- **Capacidades/Permisos**: idénticos en toda postura (doc 09 §2.2) — el campo no rebaja verdades.
- **Servicios**: sincronización, adjuntos con captura de cámara (ESI-006/04).
- **Offline**: el rubro decisivo de las pantallas de campo; plena aptitud como objetivo.
- **KPIs**: tiempo real de captura vs. presupuesto, tasa de completado en campo, abandono por pantalla.
- **IA**: solo formas que aceleren la captura (sugerencia de clasificación, doc 22) y degraden limpiamente offline.

## Impacto sobre la implementación

El orden de diseño entra al proceso de DGP (la sección de experiencia presenta campo primero); los presupuestos de interacción se añaden al formulario del contrato (doc 27).

## Dependencias

Docs 05, 08-09, 11, 19, 22, 25; ETS-011; ESI-005/18; ESI-006/04.

## Riesgos

- La disciplina cediendo a la comodidad del equipo (que diseña en escritorio, para escritorio); mitigación: el orden es verificable en el DGP (qué se presentó primero), y el score separa la postura de campo (doc 24) — la degradación es visible.

## Decisiones habilitadas

- El producto que el técnico usa de verdad (la batalla de adopción de ETS-012).
- Datos operativos frescos porque capturarlos no castiga.

## Decisiones bloqueadas

- Prohibido diseñar pantallas de ejecución empezando por oficina.
- Prohibidas "versiones lite" o apps de campo recortadas.
- Prohibidos presupuestos de interacción sin declarar en tareas de campo.

## Reusable Pattern

Orden campo→planta→oficina + presupuesto de interacción + offline como punto de partida: la disciplina que alinea el diseño con donde se gana el negocio.

## Anti-Patterns

- La demo en pantalla grande que decide el diseño.
- Formularios de campo con la exhaustividad de oficina.
- Tratar el campo como "el móvil" genérico ignorando guantes, sol y prisa.

## Knowledge Graph

- **ETS que consume**: ETS-011 (la realidad de campo como fuente), ETS-012 (adopción).
- **ESI que consume**: ESI-005/18 (offline); ESI-006/04.
- **DGP que originará**: el orden de diseño y presupuestos en la plantilla de DGP.
- **ADR relacionados**: ADR de campo-primero como orden obligatorio.
- **Módulos que reutilizarán este patrón**: todos los de ejecución operativa; los analíticos lo declaran explícitamente.
