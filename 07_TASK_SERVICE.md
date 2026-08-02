# 07 — Task Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de tareas: pendientes personales transversales — la bandeja "qué me toca" unificada — sin suplantar los flujos de los módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y frontera (la decisión central)

El usuario necesita una vista única de "lo que me toca": aprobar esta compra, atender esta OT, completar esta investigación. Esa carga viene de los flujos de los módulos. La frontera:

| Es del Task Service | Es del módulo |
|---|---|
| La **bandeja unificada** del usuario: agregación de pendientes de todos los módulos | El flujo que genera el pendiente y el comando que lo resuelve |
| Tareas **ad-hoc** ligeras: "revisar esto", creadas por personas, con referencia opcional a entidad | Las asignaciones estructurales (el asignado de la OT vive en la OT) |
| Estado del pendiente en la bandeja (pendiente, atendido) | El estado de negocio real (la aprobación misma) |

**El pendiente de módulo es una proyección**: nace de un evento del módulo ("Solicitud Enviada a Aprobación" → pendiente para aprobadores), y se cierra por otro evento ("Solicitud Aprobada"). El servicio nunca ejecuta el comando de negocio: enlaza a él.

## 2. Reglas

1. **Pendientes de módulo solo por eventos** con reglas declaradas (evento generador, regla de destinatarios — reutiliza el patrón del doc 03 —, evento de cierre, enlace de acción).
2. **Cierre automático primero**: un pendiente de módulo se cierra por el evento de cierre, no manualmente — la bandeja nunca miente sobre trabajo ya hecho.
3. **Las tareas ad-hoc no portan estado de negocio** (frontera análoga a comentarios, doc 05 §2.4): son coordinación humana con título, asignado, vencimiento y referencia opcional.
4. **Vencimientos notifican** vía tipos estándar del doc 03; el servicio no implementa canal propio.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `bandeja_de_pendientes` (agregación por eventos), `tareas_ad_hoc` — separables por tenant.
- **Eventos**: "Tarea Creada", "Tarea Completada", "Pendiente Vencido" (v1).
- **Contratos**: consulta de bandeja unificada (cursor, filtros por módulo/vencimiento); crear/completar tarea ad-hoc; declaración de reglas de pendiente por módulo.
- **Configuración**: recordatorios de vencimiento, visibilidad de bandejas de equipo, por tenant.
- **KPIs**: pendientes abiertos por módulo/antigüedad, tiempo a atención, tareas vencidas por tenant.
- **Permisos**: `TAREAS.BANDEJA.CONSULTAR`, `TAREAS.CREAR`, `TAREAS.EQUIPO.CONSULTAR` (supervisores).
- **Consumidores**: OT, Compras y SST como declarantes de pendientes; todos los usuarios como lectores de bandeja.

## Impacto sobre la implementación

DGP propio; los DGP-módulo declaran sus reglas de pendiente (generador/destinatarios/cierre/enlace) — cuatro campos, sin código de bandeja.

## Dependencias

Docs 03 y 05-06; ESI-005/08 y /12; ETS-002 (flujos con aprobaciones/asignaciones).

## Riesgos

- La bandeja divergiendo del estado real de los módulos (pendientes fantasma); mitigación: cierre por evento §2.2, reconstruibilidad de la proyección y verificación de divergencia (ESI-004/15).

## Decisiones habilitadas

- "Mi trabajo" unificado sin que cada módulo construya bandejas.
- Métricas de carga y cuellos de botella transversales por tenant.

## Decisiones bloqueadas

- Prohibido ejecutar comandos de negocio desde el servicio de tareas.
- Prohibidos pendientes de módulo creados o cerrados a mano.
- Prohibido duplicar la asignación estructural de los módulos.

## Reusable Pattern

La proyección de pendientes por par de eventos (generador/cierre) + enlace de acción: patrón para toda agregación de "trabajo por hacer" futura.

## Anti-Patterns

- El Task Service como motor de workflow (los flujos viven en los módulos).
- Tareas ad-hoc usadas para aprobar u ordenar trabajo formal.
- Bandejas por módulo compitiendo con la unificada.

## Knowledge Graph

- **ETS que consume**: ETS-002 (flujos y aprobaciones), ETS-012 (productividad de campo).
- **ESI que consume**: ESI-004/15; ESI-005/08 y /12; docs 03, 05-06.
- **DGP que originará**: DGP-Tareas; secciones "reglas de pendiente" en DGP de OT, Compras y SST.
- **ADR relacionados**: ADR de frontera bandeja/flujo (§1).
- **Módulos que reutilizarán este patrón**: OT, Compras, SST en v1; cualquier módulo con aprobaciones o asignaciones después.
