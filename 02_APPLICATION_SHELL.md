# 02 — Application Shell

> **DeltaOps — ESI-008 · v1.0** · El shell de aplicación: el marco permanente donde viven todas las pantallas — una sola casa, muchas habitaciones.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Anatomía

El shell es la estructura persistente que envuelve toda pantalla. Sus regiones son fijas en función, adaptables en forma (doc 09):

| Región | Función | Contenido normado |
|---|---|---|
| **Barra de identidad** | Quién soy, dónde estoy | Tenant activo, workspace actual (doc 04), cuenta y sesión (fuerza visible si aplica, ESI-007/05), selector de contexto (doc 06) |
| **Navegación primaria** | A dónde puedo ir | Módulos y workspaces filtrados por capacidades y permisos (doc 03) |
| **Lienzo** | La pantalla activa | Una pantalla por contrato (doc 05); el shell jamás pinta contenido de negocio |
| **Zona de sistema** | Lo transversal | Bandeja de notificaciones (doc 15), búsqueda global (doc 21), estado de conexión/sincronización (doc 11), acceso a IA (doc 22), ayuda |

## 2. Reglas

1. **Un solo shell para todo el producto**: los módulos aportan pantallas al lienzo; ninguno trae marco propio. Las tres posturas (oficina/planta/campo) son variantes responsivas del mismo shell (doc 09), no shells distintos.
2. **El shell es el dueño del contexto**: tenant activo, workspace, sesión y estado de conexión viven en el shell y las pantallas los reciben — ninguna pantalla gestiona contexto por su cuenta (doc 06).
3. **Lo que no puedes usar no aparece**: la navegación y las acciones del shell se filtran por capacidades contratadas y permisos efectivos (las cuatro verdades, ESI-007/04); el shell muestra el producto de cada usuario, no el catálogo completo.
4. **Estado del sistema siempre visible, nunca invasivo**: conexión, sincronización pendiente (ESI-005/18) y notificaciones tienen indicadores permanentes discretos; la interrupción activa está reservada a lo crítico (doc 15).
5. **El shell degrada con dignidad**: sin conexión, el shell permanece funcional mostrando lo disponible offline (doc 11); el shell en blanco por fallo de una pantalla está prohibido — los fallos se contienen en el lienzo (doc 13).

## 3. Declaración (los ocho rubros)

- **Commands**: ninguno propio de negocio; solo operaciones de sesión y preferencias (cerrar sesión, cambiar contexto).
- **Queries**: identidad de sesión, capacidades/permisos efectivos, contadores de bandeja, estado de sincronización.
- **Capacidades**: el shell es transversal; refleja las contratadas.
- **Servicios**: notificaciones (ESI-006/06), búsqueda (ESI-006/08), configuración (ESI-006/20).
- **Permisos**: ninguno propio; filtra por los efectivos del usuario.
- **Offline**: funcional sin red — navegación a lo disponible, indicadores de estado, cola de sincronización visible.
- **KPIs**: tiempo hasta interactivo del shell, tasa de errores contenidos.
- **IA**: punto de acceso al asistente (doc 22); el shell no genera contenido de IA.

## Impacto sobre la implementación

El shell es la primera pieza del DGP de experiencia (doc 27); toda pantalla se diseña asumiendo sus regiones y su contrato de contexto.

## Dependencias

Docs 03-06, 09, 11, 13, 15, 21-22; ESI-005/18; ESI-006/06, /08, /20; ESI-007/04-05.

## Riesgos

- El shell acumulando funciones de negocio ("pon ese botón arriba, es importante"); mitigación: la regla §2.1 — el lienzo es de las pantallas; excepciones solo por evolución del estándar (doc 28).

## Decisiones habilitadas

- Módulos que llegan al producto sin diseñar marco propio.
- Contexto y estado del sistema coherentes en todas las pantallas.

## Decisiones bloqueadas

- Prohibidos shells o marcos por módulo.
- Prohibido contenido de negocio en regiones del shell.
- Prohibido que pantallas gestionen tenant/sesión por su cuenta.

## Reusable Pattern

Shell único con regiones de función fija + lienzo por contrato: el chasis de experiencia — análogo del Kernel para la interfaz.

## Anti-Patterns

- La barra que crece un icono por módulo hasta ser un menú de treinta.
- Duplicar indicadores de estado dentro de pantallas.
- El "modo especial" que oculta el shell y desorienta.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidades visibles), ETS-011 (posturas).
- **ESI que consume**: ESI-005/18; ESI-006/06, /08, /20; ESI-007/04-05.
- **DGP que originará**: el shell como primera entrega del DGP de experiencia.
- **ADR relacionados**: ADR de shell único (doc 26 §referencias).
- **Módulos que reutilizarán este patrón**: todos entregan pantallas al lienzo; ninguno trae marco.
