# 04 — Workspace Model

> **DeltaOps — ESI-008 · v1.0** · El modelo de workspaces: el producto se presenta por espacios de trabajo orientados a rol, no por el organigrama de módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Concepto

Un **workspace** es el espacio de trabajo donde un tipo de usuario vive su jornada: reúne las pantallas, tableros y accesos que su rol necesita, aunque provengan de módulos distintos. El módulo es la unidad de construcción (ESI-004); el workspace es la unidad de **presentación**.

| Workspace (conceptual) | Usuario típico (ETS-001) | Reúne de |
|---|---|---|
| Operación de mantenimiento | Planificador, supervisor | OT, activos, inventario |
| Ejecución en campo | Técnico, operador | OT (sus tareas), activos (consulta), combustible |
| Almacén | Almacenista | Inventario, compras (recepciones) |
| Gestión | Jefatura, gerencia | Tableros y KPIs transversales |
| Administración | Administrador del tenant | Cuentas, roles, configuración |

(La tabla ilustra el concepto con los dominios de ETS-002/003; el catálogo real de workspaces es decisión de producto registrada, no de esta serie.)

## 2. Reglas

1. **El workspace compone, no posee**: las pantallas pertenecen a los módulos (con sus contratos); el workspace las referencia por el registro de navegación (doc 03 §2.1). Una pantalla puede aparecer en más de un workspace sin duplicarse.
2. **Asignación por rol con ajuste personal**: las plantillas de rol (ESI-007/07) determinan los workspaces visibles por defecto; el usuario ordena y marca favoritos dentro de lo permitido — personalización de disposición, jamás de alcance.
3. **Un workspace activo a la vez**: el usuario está *en* un workspace (visible en el shell, doc 02); cambiar es explícito y barato. Las notificaciones y la búsqueda cruzan workspaces (son transversales); el árbol de navegación no.
4. **Cada workspace abre en su inicio útil**: la pantalla de entrada de un workspace es un tablero de su dominio (doc 18) con lo accionable primero — trabajo pendiente, excepciones, accesos rápidos; nunca una lista vacía ni un menú.
5. **Los workspaces son pocos y estables**: se crean por decisión de producto registrada, no por módulo nuevo (el módulo nuevo entra a workspaces existentes); la proliferación de workspaces es el laberinto con otro nombre.

## 3. Declaración (los ocho rubros)

- **Commands**: preferencias de disposición (orden, favoritos) por cuenta.
- **Queries**: composición efectiva del workspace (registro filtrado), tablero de entrada.
- **Capacidades**: un workspace sin ninguna capacidad contratada de su composición no aparece.
- **Servicios**: configuración (preferencias, ESI-006/20), KPIs para tableros de entrada (ESI-006/16).
- **Permisos**: hereda la visibilidad por pantalla (doc 03 §2.2); sin permisos propios.
- **Offline**: el workspace de campo declara su subconjunto offline (doc 11); los demás degradan por pantalla.
- **KPIs**: tiempo a primera acción desde la entrada, cambios de workspace por sesión (dispersión).
- **IA**: el tablero de entrada puede incluir el resumen de jornada del asistente (doc 22), marcado como IA.

## Impacto sobre la implementación

El catálogo inicial de workspaces es una decisión de producto del DGP de experiencia; los DGP de módulos declaran a qué workspaces aportan sus pantallas.

## Dependencias

Docs 02-03, 11, 18, 22; ETS-001; ESI-007/07; ESI-006/16, /20.

## Riesgos

- Workspaces calcando el organigrama de módulos (uno por módulo), perdiendo el sentido; mitigación: la regla §2.5 y la revisión de experiencia (doc 25) exigen justificar cada workspace por jornada real de un rol de ETS-001.

## Decisiones habilitadas

- El técnico de campo ve su día, no seis módulos.
- Módulos nuevos que llegan sin reorganizar el producto.

## Decisiones bloqueadas

- Prohibido un workspace por módulo como regla de creación.
- Prohibida personalización que altere alcance (solo disposición).
- Prohibidas pantallas duplicadas (referencia, no copia).

## Reusable Pattern

Composición por referencia + asignación por plantilla de rol + entrada accionable: el workspace como vista de jornada — el patrón que separa construcción (módulos) de presentación (espacios).

## Anti-Patterns

- El workspace "Todo" que anula el modelo.
- Tableros de entrada decorativos sin nada accionable.
- Workspaces por cliente (la personalización prohibida por ESI-007/27 aplicada a UX).

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles y jornadas), ETS-002/003 (dominios).
- **ESI que consume**: ESI-007/07 (plantillas de rol); ESI-006/16, /20.
- **DGP que originará**: catálogo de workspaces en el DGP de experiencia; aportes por DGP de módulo.
- **ADR relacionados**: ADR de workspace como unidad de presentación.
- **Módulos que reutilizarán este patrón**: todos aportan pantallas a workspaces; ninguno define los suyos propios.
