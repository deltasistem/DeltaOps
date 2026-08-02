# 03 — Notification Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de notificaciones: un solo lugar donde los hechos del sistema se convierten en avisos a personas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

El servicio convierte **hechos** en **avisos**: escucha eventos publicados de los módulos, aplica reglas de suscripción y preferencia, y entrega por canales (bandeja interna, correo, push móvil). Su modelo:

| Concepto | Definición |
|---|---|
| **Tipo de notificación** | Declarado por el módulo emisor (catálogo): evento origen, plantilla, destinatarios por regla (rol, asignado, seguidor), prioridad |
| **Regla de destinatarios** | Función declarativa sobre el evento y sus referencias (el asignado de la OT, los aprobadores del monto) resuelta consultando el plano de lectura del módulo |
| **Preferencia** | Del usuario por tipo y canal, dentro de lo que el tenant permita; las de prioridad crítica no son silenciables |
| **Aviso** | La instancia entregada: estado (pendiente, entregada, leída), canal, trazable al evento origen |

## 2. Reglas

1. **Solo por eventos**: los módulos no "envían notificaciones"; declaran tipos y publican sus eventos de dominio normales. El acoplamiento es unidireccional (doc 01 §2.2).
2. **Neutralidad**: el servicio no interpreta dominios; las plantillas usan datos del evento + enriquecimiento por consulta al emisor (patrón ESI-004/14).
3. **Entrega con la disciplina de bandejas** (ESI-003/21): reintentos, at-least-once absorbido por idempotencia de aviso; el fallo de un canal externo jamás afecta al módulo emisor.
4. **La bandeja interna es el canal garantizado**; correo y push son mejores-esfuerzos configurables por tenant.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `notificaciones_basicas` (bandeja interna), `notificaciones_externas` (correo/push) — habilitables por tenant.
- **Eventos**: "Aviso Entregado", "Aviso Leído" (v1) — para timeline y métricas de los emisores.
- **Contratos**: declaración de tipo de notificación; consulta de bandeja del usuario (cursor, ESI-004/06); marcado de leído.
- **Configuración**: canales habilitados por tenant, remitentes, ventanas de silencio, políticas de agregación (resumen diario).
- **KPIs**: tasa de entrega por canal, tiempo a lectura, volumen por tipo y tenant.
- **Permisos**: `NOTIFICACIONES.BANDEJA.CONSULTAR`, `NOTIFICACIONES.PREFERENCIAS.ADMINISTRAR`, `NOTIFICACIONES.TIPOS.ADMINISTRAR` (administración del tenant).
- **Consumidores**: todos los módulos como emisores declarativos; el cliente web/móvil como lector.

## Impacto sobre la implementación

Servicio con DGP propio sobre el patrón (ESI-004); los módulos solo entregan sus catálogos de tipos de notificación en sus DGP.

## Dependencias

ESI-003/21; ESI-004/14; ESI-005/08; docs 01-02, 17-20; ETS-005 (preferencias por tenant).

## Riesgos

- Fatiga de notificaciones que entrena a los usuarios a ignorarlas; mitigación: agregación configurable, preferencias reales y el KPI de tiempo-a-lectura como señal de gobierno por tipo.

## Decisiones habilitadas

- Avisos consistentes multi-canal sin código de envío en módulos.
- Auditoría de comunicación (qué se avisó, a quién, cuándo, leído o no).

## Decisiones bloqueadas

- Prohibido enviar correo/push directamente desde módulos.
- Prohibidas notificaciones no derivadas de eventos publicados.
- Prohibido silenciar tipos de prioridad crítica por preferencia.

## Reusable Pattern

El trío tipo-declarado / regla-de-destinatarios / preferencia es el patrón para todo aviso futuro; los módulos solo amplían el catálogo de tipos.

## Anti-Patterns

- Plantillas con lógica de dominio dentro del servicio.
- "Notificar a todos" como regla de destinatarios por pereza.
- Módulos consultando el estado de entrega para decidir negocio.

## Knowledge Graph

- **ETS que consume**: ETS-002 (necesidades de aviso), ETS-005 (preferencias), ETS-009 (aislamiento).
- **ESI que consume**: ESI-003/21; ESI-004/14; ESI-005/08.
- **DGP que originará**: DGP-Notificaciones; secciones "catálogo de tipos" en cada DGP-módulo.
- **ADR relacionados**: ADR de acoplamiento unidireccional (doc 01 §2.2).
- **Módulos que reutilizarán este patrón**: todos; OT (asignaciones, vencimientos) y Compras (aprobaciones) son los emisores más intensivos.
