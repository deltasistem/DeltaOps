# 10 — Capability Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de capacidades: el catálogo vivo de las capacidades ETS-005 como eje comercial-técnico único — qué existe, quién la aporta, quién la consume.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

La capacidad (ETS-005) es la unidad que une lo comercial (planes, licenciamiento) con lo técnico (módulos que la implementan, pantallas que la exponen, toggles que jamás la sustituyen — ESI-009/12 §2). Este registro consolida el catálogo vivo: la respuesta única a "¿qué puede hacer el producto y quién lo tiene?".

## 2. Contenido por entrada

Cada capacidad registrada declara, por referencia:

1. **Identidad**: código estable y nombre de negocio (el lenguaje de ETS-005).
2. **Quién la implementa**: módulo(s) responsable(s) (ESI-005/03) y servicios compartidos involucrados (ESI-006/02).
3. **Cómo se registra técnicamente**: por el mecanismo congelado de registro de capacidades (ESI-004/04, ESI-005).
4. **Dónde se expone**: pantallas cuyo contrato la declara en su rubro Capacidades (ESI-008/05); la visibilidad de navegación que gobierna (ESI-008/03).
5. **Cómo se comercializa**: su relación con planes y configuración de negocio (ESI-006/20); jamás con toggles de entrega.
6. **Estado**: diseñada / en construcción / disponible / deprecada con ventana — el ciclo del artefacto (doc 03).

## 3. Reglas del registro

1. **Una sola lista**: comercial y técnica leen el mismo catálogo; la divergencia entre "lo que ventas vende" y "lo que el sistema registra" es defecto de primera prioridad — la capacidad es el contrato entre ambos mundos.
2. **La capacidad nueva nace en ETS/decisión de producto** y entra al registro antes de construirse (la declaración precede); el módulo no inventa capacidades por su cuenta.
3. **El registro alimenta las cuatro verdades** (ESI-007/04): lo que el tenant contrató es una de ellas; este catálogo es su fuente de verdad nominal.
4. **La trazabilidad capacidad→módulo→pantalla→plan se recorre en ambos sentidos** (doc 14): de la promesa comercial al código que la cumple, y del código a la promesa que justifica su existencia.

## Impacto sobre la implementación

El registro consolida lo ya normado: el mecanismo técnico de registro existe (ESI-004/04), la configuración comercial existe (ESI-006/20); la vista unificada se materializa con el tablero (doc 25).

## Dependencias

ETS-005; ESI-004/04; ESI-005/03; ESI-006/02, /20; ESI-007/04; ESI-008/03, /05; ESI-009/12; docs 03, 14, 25.

## Riesgos

- El catálogo comercial evolucionando sin sincronía con el técnico; mitigación: una sola lista (§3.1) con entrada única por decisión de producto — no hay dos libros que sincronizar porque no hay dos libros.

## Decisiones habilitadas

- Lanzamientos comerciales anclados a capacidades con estado real.
- Análisis de cobertura: qué capacidades prometidas carecen de implementación completa.

## Decisiones bloqueadas

- Prohibidas capacidades técnicas sin origen en producto.
- Prohibido comercializar capacidades fuera del registro.
- Prohibido controlar capacidades con toggles de entrega.

## Reusable Pattern

Un catálogo único comercial-técnico con estado y trazabilidad bidireccional: la capacidad como contrato entre la promesa y el código.

## Anti-Patterns

- La hoja de cálculo de ventas con capacidades que el sistema no conoce.
- El módulo que expone funcionalidad sin capacidad declarada.
- Deprecar una capacidad sin ventana ni comunicación.

## Knowledge Graph

- **ETS que consume**: ETS-005 (el modelo de capacidades); ETS-012 (su comercialización).
- **ESI que consume**: ESI-004/04; ESI-005/03; ESI-006/20; ESI-007/04; ESI-008/03, /05.
- **DGP que originará**: ninguno; consolida mecanismos ya normados.
- **ADR relacionados**: ADR de catálogo único de capacidades.
- **Módulos que reutilizarán este patrón**: todos registran las capacidades que implementan; ninguno inventa.
