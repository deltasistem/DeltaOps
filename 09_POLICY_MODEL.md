# 09 — Modelo de Policies

> **DeltaOps — ESI-005 · v1.0** · El estándar de Policies en módulos de negocio: reglas parametrizables por tenant, puras y con fallo cerrado.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Toda Policy sigue ESI-004/09: función pura y determinista sobre hechos ya cargados, parametrizada por tenant vía configuración (doc 14), cuarta familia de denegación distinguible, fallo cerrado ante parámetro ausente, batería de valores límite. Invariante.

## 2. Lo que añade el estándar para dominios reales

1. **Inventario de Policies por dominio**: los DGP derivan sus Policies de las reglas variables entre clientes de ETS-002/005 (p. ej. OT: exigir aprobación por monto; Inventario: stock mínimo por bodega; Combustible: tolerancia de merma; Compras: topes de autorización por rol). La pregunta de diseño es siempre: ¿esta regla varía por tenant? Sí → Policy; no → invariante del agregado (taxonomía ESI-004/11 §2.3).
2. **Policies con parámetros estructurados**: los dominios reales exigen parámetros más ricos que un número (matrices monto×rol, umbrales por categoría de activo). El parámetro sigue siendo configuración tipada del tenant (doc 14), con esquema declarado y validado; jamás JSON libre interpretado en caliente.
3. **Composición**: un comando puede consultar varias Policies; cada una responde por separado y la denegación cita la Policy concreta. Prohibido el "motor de reglas" genérico que evalúa expresiones arbitrarias del tenant — la variabilidad legal es paramétrica, no programática (frontera de ETS-005).
4. **Toda Policy tiene dueño de negocio**: el DGP registra quién define el valor por defecto y quién puede cambiarlo por tenant (doc 14 §gobierno).

## Impacto sobre la implementación

Las Policies se generan con su plantilla y su batería de límites; el trabajo del DGP es el inventario §2.1 con esquemas de parámetros y valores por defecto sembrados para los dos tenants.

## Dependencias

ESI-004/09 y /11; ETS-005 (variabilidad); docs 14 y 16; ESI-002/12 (seed).

## Riesgos

- La pendiente hacia el motor de reglas: cada petición de cliente "especial" empuja de parámetro a expresión; mitigación: la frontera §2.3 es regla bloqueada; lo que no cabe paramétricamente es cambio de producto, no configuración.

## Decisiones habilitadas

- Variabilidad por cliente sin ramas ni código por tenant.
- Denegaciones de negocio explicables citando Policy y valores.

## Decisiones bloqueadas

- Prohibidos motores de reglas de expresiones arbitrarias por tenant.
- Prohibidas Policies con acceso a infraestructura o efectos.
- Prohibidos parámetros sin esquema tipado y validado.

## Reusable Pattern

La pregunta de clasificación §2.1 (¿varía por tenant?) como criterio del formulario de reglas del DGP; el formulario de Policy de ESI-004/09 ampliado con esquema de parámetros y dueño.

## Anti-Patterns

- Policies que consultan la base de datos (impureza).
- Parámetros "stringly-typed" interpretados por convención.
- Valores por defecto sin dueño ("los puso el dev").

## Knowledge Graph

- **ETS que consume**: ETS-005 (parametrización por tenant), ETS-002 (reglas de negocio).
- **ESI que consume**: ESI-004/09 y /11; ESI-002/12.
- **DGP que originará**: la sección "inventario de Policies" de cada DGP-módulo.
- **ADR relacionados**: ADR de frontera paramétrica-no-programática (ETS-005).
- **Módulos que reutilizarán este patrón**: todos; Compras (topes de autorización) y SST (reglas de cumplimiento) son los de mayor densidad de Policies.
