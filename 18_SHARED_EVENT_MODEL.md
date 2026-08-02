# 18 — Shared Event Model

> **DeltaOps — ESI-006 · v1.0** · El modelo de eventos del estrato compartido: cómo los servicios consumen de todos y publican para todos sin conocer a nadie.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Los servicios usan el mismo modelo de eventos que los módulos (ESI-004/14, ESI-005/08): outbox, sobres, versiones, bandejas, consumo idempotente, distinción interno/publicado. Lo que cambia es la **forma de suscripción**.

## 2. Reglas específicas del estrato

1. **Suscripción por declaración inversa**: un módulo no puede conocer módulos; un servicio tampoco. La inversión: **el emisor declara, el servicio descubre**. El módulo marca en su declaración qué eventos son "cronologizables", "notificables", "indexables" (docs 03, 06, 08); el servicio consume por esas marcas, no por listas de módulos. Alta de módulo nuevo = cero cambios en servicios.
2. **Contratos de marca cerrados**: cada marca define qué metadatos exige del evento (la plantilla de resumen para cronología, la regla de destinatarios para notificaciones); la puerta valida que el evento marcado cumpla el contrato de la marca.
3. **Eventos de servicios son publicados de pleno derecho**: "Adjunto Registrado", "Exportación Lista" siguen N/N-1 (ESI-005/08 §2.1) — los consumen módulos (reglas de evidencia), otros servicios (cronología) y clientes.
4. **Referencias de entidad en cargas**: los eventos de servicios portan la referencia (módulo+tipo+id, doc 04 §1) — nunca datos de negocio desnormalizados del dominio ajeno (carga mínima, ESI-004/14).
5. **Sin ciclos de consumo**: el grafo servicios↔módulos se deriva de las declaraciones (ESI-005/04 §2.3); ciclos evento-reactivos entre servicios (notificación que genera tarea que notifica…) están prohibidos por diseño de marcas.

## Impacto sobre la implementación

El mecanismo de marcas entra al contrato de declaración de eventos (extensión declarativa de ESI-003/06); los servicios se construyen contra marcas, los módulos solo marcan.

## Dependencias

ESI-004/14; ESI-005/04 y /08; ESI-003/06 y /21; fichas docs 03-16.

## Riesgos

- Proliferación de marcas ad-hoc (cada servicio inventando la suya); mitigación: las marcas son catálogo de plataforma con proceso de alta (mismo gobierno que el catálogo de servicios, doc 02 §2.1).

## Decisiones habilitadas

- Módulos nuevos integrados a todos los servicios solo declarando marcas.
- Grafo completo de flujo de eventos derivable y auditable.

## Decisiones bloqueadas

- Prohibidas listas de módulos dentro de servicios.
- Prohibidos eventos marcados que no cumplan el contrato de su marca.
- Prohibidos ciclos evento-reactivos entre servicios.

## Reusable Pattern

La suscripción por marca declarada (emisor marca, servicio descubre) es el patrón de integración del estrato: todo servicio futuro que consuma de módulos define su marca y su contrato.

## Anti-Patterns

- Servicios suscritos "a todo" filtrando por convención de nombres.
- Marcas con semántica de dominio (la marca dice cómo consumir, no qué significa).
- Eventos de servicio con cargas que copian la entidad de negocio referenciada.

## Knowledge Graph

- **ETS que consume**: ETS-008 (catálogo de eventos y contratos).
- **ESI que consume**: ESI-003/06 y /21; ESI-004/14; ESI-005/04 y /08.
- **DGP que originará**: el catálogo de marcas (DGP de plataforma); las secciones de marcado en cada DGP-módulo.
- **ADR relacionados**: ADR de declaración inversa (§2.1).
- **Módulos que reutilizarán este patrón**: todos; marcar eventos es su única integración con el estrato por el lado emisor.
