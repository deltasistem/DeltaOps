# 17 — Shared Capability Model

> **DeltaOps — ESI-006 · v1.0** · Cómo los servicios compartidos publican y gobiernan sus capacidades por tenant.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Las capacidades de servicios compartidos usan el mismo catálogo, evaluación y seed que las de módulos (ETS-005, ESI-003/12, ESI-005/05). Un servicio no introduce mecanismos nuevos; introduce entradas nuevas al catálogo único.

## 2. Reglas específicas del estrato

1. **Granularidad ya fijada por ficha**: cada ficha (docs 03-16) declara sus capacidades; la mayoría siguen el patrón núcleo + opcional separable (`notificaciones_basicas`/`notificaciones_externas`, `tableros`/`personalizacion_de_tableros`). Nuevas particiones siguen la regla de ESI-005/05 §2.2 (la carga de la prueba está en separar).
2. **Dependencias transversales declaradas**: cuando una función de un módulo requiere un servicio (evidencias de OT requieren `adjuntos_basicos`), la dependencia de capacidad se declara (ESI-005/05 §2.3) y la habilitación la valida — el tenant no puede encender la mitad incoherente.
3. **Degradación por deshabilitación es diseño de producto**: cada ficha define qué pasa con la funcionalidad de módulos cuando su servicio está deshabilitado para el tenant (los widgets desaparecen, doc 15 §1; las evidencias obligatorias vuelven la dependencia dura y validada). Nada "funciona raro".
4. **Los planes comerciales componen ambos estratos**: un plan es un conjunto de capacidades de módulos **y** de servicios; el seed de dos tenants (ESI-002/12) mantiene asimetría también en servicios (tenant A con exportaciones, B sin) para probar ambas ramas de cada dependencia.
5. **Capacidades administrativas**: varias fichas publican capacidades de administración (plantillas, metas, integraciones); son capacidades normales, típicamente ligadas a roles administradores del tenant.

## Impacto sobre la implementación

Cero piezas nuevas: entradas al catálogo ETS-005 y validación de dependencias transversales en la habilitación (extensión declarativa ya prevista por ESI-005/05).

## Dependencias

ETS-005; ESI-003/12; ESI-005/05; ESI-002/12; fichas docs 03-16.

## Riesgos

- Matrices de habilitación incoherentes (módulo encendido, servicio requerido apagado); mitigación: la validación de dependencias §2.2 es bloqueante en la habilitación, no una advertencia.

## Decisiones habilitadas

- Planes comerciales que empaquetan servicios y módulos coherentemente.
- Pruebas de ambas ramas (con/sin servicio) sistemáticas vía seed asimétrico.

## Decisiones bloqueadas

- Prohibidos mecanismos de habilitación propios de servicios.
- Prohibidas dependencias módulo→servicio no declaradas.
- Prohibido habilitar combinaciones que violen dependencias declaradas.

## Reusable Pattern

Núcleo + opcional separable, dependencias transversales validadas y degradación definida por ficha: el molde de capacidad para todo servicio futuro del catálogo.

## Anti-Patterns

- Servicios "siempre encendidos" sin capacidad (invisibles al modelo comercial).
- Dependencias resueltas con chequeos en caliente en vez de validación de habilitación.
- Seed simétrico que nunca prueba la rama deshabilitada.

## Knowledge Graph

- **ETS que consume**: ETS-005 (catálogo de capacidades).
- **ESI que consume**: ESI-003/12; ESI-005/05; ESI-002/12.
- **DGP que originará**: las secciones de capacidades de cada DGP-servicio; la validación de dependencias en el DGP de habilitación (plataforma).
- **ADR relacionados**: ADR de capacidades como único flag (ESI-005/05 §3).
- **Módulos que reutilizarán este patrón**: todos declaran sus dependencias hacia servicios en sus DGP.
