# 19 — Shared Permission Model

> **DeltaOps — ESI-006 · v1.0** · El modelo de permisos del estrato compartido: árboles propios, acceso derivado y la doble llave.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Los permisos de servicios usan la nomenclatura, catálogo y evaluación de ESI-005/16 (`SERVICIO.RECURSO.ACCION`, declarativos, N/N-1). Este documento fija los tres patrones de autorización del estrato, ya usados por las fichas:

## 2. Los tres patrones

| Patrón | Cuándo | Ejemplo |
|---|---|---|
| **Permiso propio** | La acción es del servicio mismo | `TAREAS.CREAR`, `EXPORTACIONES.SOLICITAR`, `TABLEROS.TENANT.ADMINISTRAR` |
| **Acceso derivado** | El dato del servicio es satélite de una entidad de negocio | Ver adjuntos/comentarios/cronología de una OT deriva del permiso de lectura de la OT, evaluado contra el módulo dueño (doc 04 §1) |
| **Doble llave** | El servicio actúa sobre datos del módulo en nombre del usuario | Exportar exige `EXPORTACIONES.SOLICITAR` **y** el permiso de la consulta subyacente (docs 09-11); importar exige el del comando destino (doc 10) |

## 3. Reglas

1. **La derivación es evaluación en línea, no copia**: el servicio pregunta a la evaluación de plataforma por el permiso de la entidad referenciada en el momento del acceso; sin réplicas de ACLs que envejecen.
2. **Los servicios jamás tienen acceso privilegiado a datos de negocio** (regla del doc 09 §2.1, elevada a estrato): toda lectura de datos de módulo ocurre con la identidad y permisos del usuario solicitante. Los consumidores internos de eventos procesan cargas mínimas y referencias, no abren datos de negocio.
3. **Categorías reforzadas**: donde la ficha lo prevé (adjuntos de categorías sensibles, KPIs restringidos), el refuerzo es un permiso adicional declarado — el patrón derivado + refuerzo, nunca lógica ad-hoc.
4. **Administración separada de uso**: todo servicio distingue permisos de uso (usuario final) y de administración (plantillas, metas, integraciones) — el patrón `ADMINISTRAR` de ESI-005/16 §2.2.
5. **Sin fugas de existencia**: la denegación derivada no revela qué era la entidad (búsqueda doc 08 §2.2, resolución física doc 12 §2.2); la batería de aislamiento del estrato lo prueba.

## Impacto sobre la implementación

La evaluación derivada en línea es la única pieza nueva de plataforma (extensión de ESI-003/12: evaluar un permiso sobre una referencia de entidad); los tres patrones son declarativos.

## Dependencias

ESI-003/12; ESI-005/15-16; fichas docs 03-16; ETS-009.

## Riesgos

- El costo de la evaluación derivada en vistas densas (cronologías largas); mitigación: evaluación por tipo+entidad (no por entrada) y presupuestos de latencia; jamás caches de autorización sin invalidación gobernada.

## Decisiones habilitadas

- Autorización coherente entre la entidad y sus satélites, sin duplicar reglas.
- Auditorías de acceso respondibles con tres patrones nombrables.

## Decisiones bloqueadas

- Prohibidos servicios con acceso privilegiado a datos de negocio.
- Prohibidas réplicas de permisos/ACLs dentro de servicios.
- Prohibida autorización ad-hoc fuera de los tres patrones.

## Reusable Pattern

Propio / derivado / doble llave: el vocabulario cerrado de autorización del estrato; cada ficha declara qué patrón usa cada contrato — todo servicio futuro elige entre los tres.

## Anti-Patterns

- El permiso global "ver adjuntos" que ignora la entidad.
- Servicios evaluando permisos con lógica propia en vez de la plataforma.
- Doble llave degradada a una sola "para simplificar el onboarding".

## Knowledge Graph

- **ETS que consume**: ETS-009 (aislamiento y clasificación).
- **ESI que consume**: ESI-003/12; ESI-005/15-16.
- **DGP que originará**: la extensión de evaluación derivada (DGP de plataforma); los árboles de permisos en cada DGP-servicio.
- **ADR relacionados**: ADR de acceso derivado (doc 04 §1); ADR de doble llave (doc 09).
- **Módulos que reutilizarán este patrón**: todos — sus permisos de entidad gobiernan automáticamente los satélites compartidos.
