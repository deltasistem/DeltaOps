# 17 — Modelo MultiTenant

> **DeltaOps — ESI-005 · v1.0** · Lo que un módulo de negocio debe (y sobre todo NO debe) hacer respecto al multitenancy.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La postura: el multitenancy es de la plataforma

Las dos murallas (contexto de tenant en toda operación + RLS en base de datos, ETS-009, ESI-003/09) son plataforma congelada. El ejemplar demostró que un módulo correcto **no contiene una sola línea de lógica de tenant**. Este documento fija esa ausencia como estándar.

## 2. Reglas para módulos de negocio

1. **Cero tenant en firmas de dominio y aplicación**: agregados, Policies, servicios y casos de uso no reciben ni conocen el tenant; el contexto viaja por la plataforma. Un parámetro `tenant` en una firma de módulo es defecto de diseño.
2. **Cero filtros manuales** (AP-04): repositorios y lectores sobre las bases de plataforma; la RLS filtra. La batería de aislamiento (ESI-004/12) corre contra todo repositorio y lector nuevos.
3. **Unicidades por tenant**: todo código natural (número de OT, código de activo) es único **dentro del tenant**; la unicidad global no existe en datos de negocio.
4. **Nada compartido entre tenants en módulos**: no hay "datos de referencia comunes" editables dentro de un módulo de negocio; los catálogos universales que el producto decida compartir son plataforma (ETS-004) con su propio gobierno, de solo lectura para tenants.
5. **Todo canal aísla**: no solo tablas — eventos y bandejas, proyecciones, auditoría, adjuntos, exportaciones, KPIs y trabajos operan dentro del tenant. Los trabajos de mantenimiento multi-tenant (reconstrucciones, verificaciones) son de plataforma y procesan tenant por tenant.
6. **La prueba E2E de aislamiento con los dos tenants del seed** (CA-05, ESI-004/25) es obligatoria por módulo e incluye sus canales propios (§5).

## 3. Lo único que el módulo decide

Qué datos afectan a las Policies y configuración por tenant (docs 09/14) y qué alcances de dato finos existen dentro del tenant (doc 16 §2.4). Es decir: el módulo modela variabilidad **dentro** del tenant; la separación **entre** tenants no es negociable ni personalizable.

## Impacto sobre la implementación

Ninguna pieza nueva: el estándar es la ausencia disciplinada, verificada por baterías existentes y la puerta.

## Dependencias

ETS-004/009; ESI-003/09; ESI-004/12 y /25; docs 09, 14 y 16.

## Riesgos

- La excepción comercial ("este cliente grande quiere ver sus dos filiales juntas"): presión para agujerear el aislamiento; mitigación: eso es un requisito de producto (jerarquías de tenant) que se decide en arquitectura/ETS-009, jamás un bypass en un módulo.

## Decisiones habilitadas

- Módulos portables entre tenants sin código condicional.
- Argumento de aislamiento demostrable ante auditorías de clientes.

## Decisiones bloqueadas

- Prohibido el tenant como parámetro o campo manejado por código de módulo.
- Prohibidos datos de negocio compartidos entre tenants dentro de módulos.
- Prohibido resolver requisitos multi-filial con bypasses locales.

## Reusable Pattern

La "ausencia disciplinada" §2 como checklist negativo de revisión; la prueba E2E de aislamiento extendida a los canales propios del módulo.

## Anti-Patterns

- WHERE tenant_id a mano "por si la RLS falla" (AP-04: oculta defectos reales).
- Cachés de proceso compartidas entre tenants con claves sin tenant.
- Exportaciones o adjuntos servidos por rutas que no pasan por las murallas.

## Knowledge Graph

- **ETS que consume**: ETS-009 (multitenancy), ETS-004 (catálogos universales).
- **ESI que consume**: ESI-003/09; ESI-004/12 y /25.
- **DGP que originará**: ninguno propio; instancia la prueba de aislamiento en cada DGP-módulo.
- **ADR relacionados**: ADR de dos murallas (ETS-009).
- **Módulos que reutilizarán este patrón**: todos, sin excepción ni matiz.
