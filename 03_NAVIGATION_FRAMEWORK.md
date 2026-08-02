# 03 — Navigation Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de navegación: cómo se llega a cualquier lugar del producto — jerarquía declarada, rutas estables, cero laberintos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La navegación es un **árbol declarado** de tres niveles máximo, más atajos transversales:

| Nivel | Concepto | Ejemplo conceptual |
|---|---|---|
| 1 | **Workspace** (doc 04) | El espacio de trabajo por rol/dominio |
| 2 | **Área** | Agrupación funcional dentro del workspace |
| 3 | **Pantalla** | La unidad con contrato (doc 05) |
| — | **Atajos** | Búsqueda global (doc 21), enlaces profundos, recientes/favoritos, notificaciones que llevan al lugar (doc 15) |

## 2. Reglas

1. **Registro de navegación declarativo**: cada pantalla declara su lugar en el árbol (workspace, área, orden) y sus condiciones de visibilidad (capacidad + permiso); el árbol se compone por registro, no se edita a mano en un menú central — el mismo patrón de composición del registro de módulos (ESI-005/04).
2. **Visibilidad por las cuatro verdades**: lo que el usuario no puede usar no aparece (capacidad no contratada, permiso ausente); la navegación es el primer filtro de la experiencia y jamás muestra puertas cerradas con candado como decoración — con una excepción: lo contratable puede anunciarse explícitamente como tal donde producto lo decida (upsell declarado, no puerta rota).
3. **Toda pantalla tiene dirección estable**: cada pantalla y cada entidad visible tienen ruta canónica compartible; el enlace profundo respeta contexto y permisos al resolverse (aterrizar exige las mismas verdades que navegar, y la denegación sigue el contrato de no-fuga ESI-007/04).
4. **La profundidad es tres, el rescate es uno**: máximo tres niveles de árbol; desde cualquier profundidad, un gesto vuelve al workspace. Las migas de pan reflejan el árbol real, no el historial de clics.
5. **Los flujos no rompen el árbol**: asistentes (doc 17) y diálogos (doc 16) son paréntesis sobre la pantalla actual, no destinos del árbol; al cerrar, se vuelve exactamente a donde se estaba, con el estado local preservado.

## 3. Declaración (los ocho rubros)

- **Commands**: ninguno; navegar no muta negocio.
- **Queries**: el árbol efectivo (registro filtrado por capacidades/permisos), recientes y favoritos por cuenta.
- **Capacidades**: primer criterio de visibilidad de ramas.
- **Servicios**: búsqueda (ESI-006/08) como atajo; configuración para favoritos/recientes.
- **Permisos**: segundo criterio de visibilidad; sin permisos propios.
- **Offline**: el árbol se muestra completo con lo no disponible offline marcado (doc 11 §2.2); navegar a lo no disponible explica, no falla.
- **KPIs**: profundidad media de navegación hasta tarea, uso de atajos vs. árbol.
- **IA**: la navegación por lenguaje natural ("llévame a…") es del asistente (doc 22), que resuelve contra el árbol efectivo.

## Impacto sobre la implementación

El registro de navegación entra al DGP de experiencia; cada DGP de módulo declara las entradas de sus pantallas en el formulario del doc 27.

## Dependencias

Docs 02, 04-05, 11, 15-17, 21-22; ESI-005/04; ESI-007/04.

## Riesgos

- El árbol degenerando en pantano por acumulación (cada módulo empuja sus ramas); mitigación: los workspaces acotan por rol (doc 04) y el score mide profundidad y dispersión (doc 24) — el árbol se poda con evidencia.

## Decisiones habilitadas

- Enlaces profundos compartibles en notificaciones, informes y chat.
- Navegación coherente que el usuario aprende una vez.

## Decisiones bloqueadas

- Prohibido superar tres niveles de árbol.
- Prohibidas pantallas sin ruta canónica estable.
- Prohibidos menús editados a mano fuera del registro.

## Reusable Pattern

Árbol declarado por registro + visibilidad por verdades + rutas canónicas: la navegación como composición — cada módulo se registra, nadie edita el mapa global.

## Anti-Patterns

- El menú "Otros" donde muere lo inclasificable.
- Rutas que cambian entre versiones rompiendo enlaces guardados.
- Navegación distinta por postura (el móvil con su propio mapa mental).

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles que ordenan workspaces), ETS-005 (capacidades).
- **ESI que consume**: ESI-005/04 (patrón de registro); ESI-007/04 (verdades y no-fuga).
- **DGP que originará**: registro de navegación en el DGP de experiencia; entradas por DGP de módulo.
- **ADR relacionados**: ADR de árbol de tres niveles con registro declarativo.
- **Módulos que reutilizarán este patrón**: todos declaran sus entradas; ninguno edita el árbol global.
