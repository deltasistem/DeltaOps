# 07 — Layout Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de layouts: un catálogo cerrado de plantillas de pantalla — toda pantalla es una instancia, no una invención.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El catálogo de layouts

Toda pantalla declara su layout del catálogo cerrado. El catálogo inicial:

| Layout | Propósito | Marcos que usa |
|---|---|---|
| **L1 — Lista/Colección** | Buscar, filtrar y actuar sobre muchos | Tabla (doc 20), búsqueda (doc 21) |
| **L2 — Ficha/Detalle** | Un recurso con sus secciones, historial y acciones | Formularios de sección (doc 19), pestañas normadas |
| **L3 — Tablero** | Estado agregado y accionable de un dominio | Dashboard (doc 18) |
| **L4 — Flujo** | Completar un proceso con pasos | Asistente (doc 17) |
| **L5 — Documento** | Leer/emitir algo con forma de documento (informe, orden imprimible) | Exportes (ESI-006/09) |
| **L6 — Tarea de campo** | Ejecutar una tarea concreta con mínima fricción (postura de campo) | Formularios táctiles (docs 19, 23) |

## 2. Reglas

1. **Catálogo cerrado con evolución normada**: las pantallas eligen, no inventan; un layout nuevo entra por evolución del estándar (doc 28) cuando ≥3 pantallas reales lo justifican — la misma regla de generalización de ESI-006/03.
2. **Cada layout normaliza sus regiones**: título y contexto, acciones primarias (una principal como máximo) y secundarias, contenido, estados (carga/error/vacío por docs 12-14); la posición de cada cosa es del layout, no de la pantalla.
3. **Composición L1→L2**: el par lista→detalle es el ritmo básico del producto; la selección en L1 abre L2 preservando la posición y filtros de la lista al volver — este contrato de ida y vuelta es del marco, garantizado en todas partes.
4. **Los layouts declaran su comportamiento por postura** (doc 09): L1 en móvil colapsa columnas a tarjetas; L2 apila secciones; L6 existe primariamente en campo. La pantalla hereda la adaptación del layout — no la rediseña.
5. **Densidad por contexto, no por gusto**: oficina admite densidad alta (doc 20); planta y campo exigen objetivos táctiles grandes y jerarquía simple (doc 23); el layout aplica la densidad de la postura automáticamente.

## 3. Declaración (los ocho rubros)

- **Commands/Queries/Capacidades/Servicios/Permisos/KPIs/IA**: ninguno propio — el layout es estructura; los rubros los declara cada pantalla instancia (doc 05).
- **Offline**: cada layout define su esqueleto de degradación (qué regiones persisten offline); la aptitud concreta la declara la pantalla.

## Impacto sobre la implementación

El catálogo L1-L6 con sus regiones y adaptaciones es entregable central del DGP de experiencia; los DGP de módulo declaran layout por pantalla en el contrato.

## Dependencias

Docs 05, 09, 12-14, 17-21, 23, 28; ESI-006/03 (regla de generalización), /09.

## Riesgos

- El catálogo percibido como camisa de fuerza que multiplica "excepciones"; mitigación: la vía del doc 28 con evidencia de ≥3 casos y el score midiendo el porcentaje de pantallas en catálogo (doc 24) — la excepción es visible y cara.

## Decisiones habilitadas

- Pantallas nuevas diseñadas en horas (elegir layout + rellenar contrato).
- Coherencia estructural verificable mecánicamente (doc 25).

## Decisiones bloqueadas

- Prohibidas pantallas fuera del catálogo sin proceso de evolución.
- Prohibido más de una acción principal por pantalla.
- Prohibido que pantallas redefinan regiones de su layout.

## Reusable Pattern

Catálogo cerrado L1-L6 + regiones normadas + adaptación por postura heredada: el sistema de plantillas que convierte el diseño de pantallas en instanciación.

## Anti-Patterns

- La pantalla "híbrida" que es mitad lista, mitad tablero, mitad formulario.
- Copiar un layout y ajustarlo "solo un poco" (el fork de estructura).
- Acciones primarias múltiples compitiendo por atención.

## Knowledge Graph

- **ETS que consume**: ETS-011 (posturas y densidades reales).
- **ESI que consume**: ESI-006/03 (generalización), /09 (exportes).
- **DGP que originará**: el catálogo de layouts en el DGP de experiencia.
- **ADR relacionados**: ADR de catálogo cerrado de layouts.
- **Módulos que reutilizarán este patrón**: todos; cada pantalla declara su layout en el contrato.
