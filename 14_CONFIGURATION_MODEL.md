# 14 — Modelo de Configuración

> **DeltaOps — ESI-005 · v1.0** · El estándar de configuración por tenant de los módulos de negocio: tipada, gobernada y con defaults explícitos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los tres planos de configuración (y cuál es de este documento)

| Plano | Qué es | Quién lo norma |
|---|---|---|
| Configuración de despliegue | Variables de entorno, secretos | ESI-003 (plataforma) — fuera de este documento |
| Habilitación funcional | Capacidades por tenant | Doc 05 |
| **Configuración de negocio por tenant** | Parámetros que ajustan el comportamiento del dominio | **Este documento** |

## 2. Reglas

1. **Todo parámetro se declara**: clave estable, tipo/esquema, valor por defecto, rango válido, dueño de negocio, y qué piezas lo consumen (típicamente Policies, doc 09). La declaración vive en el módulo (doc 04) y el motor de configuración de la plataforma (ETS-005) la sirve.
2. **Defaults completos**: el sistema funciona correcto para un tenant sin configurar nada — los defaults son los valores recomendados del producto. La excepción son los parámetros marcados obligatorios, cuya ausencia produce fallo cerrado y distinguible (nunca un default inventado en caliente, AP-13).
3. **Cambios de configuración son hechos de negocio**: auditados (quién, cuándo, valor anterior → nuevo, ESI-004/17), con efecto en lecturas posteriores; jamás retroactivos sobre decisiones ya tomadas — la OT aprobada con el tope viejo no se reevalúa.
4. **Validación al escribir, no al usar**: el valor se valida contra su esquema y rango al configurarse; las Policies consumen valores ya garantizados.
5. **Sin configuración programática**: la frontera de ETS-005 (doc 09 §2.3) aplica — parámetros, no expresiones ni scripts por tenant.
6. **El seed configura los dos tenants con valores distintos** donde el parámetro afecte ramas de comportamiento (la asimetría de ESI-004/04, extendida a configuración).

## Impacto sobre la implementación

El DGP entrega el catálogo de parámetros del módulo (formulario §2.1); el motor de ETS-005 los sirve; la UI de administración se deriva de las declaraciones, no se programa por parámetro.

## Dependencias

ETS-005; ESI-004/09 y /17; docs 05, 09 y 04; ESI-002/12.

## Riesgos

- Explosión de parámetros "por si acaso" que nadie configura y todos temen tocar; mitigación: cada parámetro exige dueño y consumidor real; los huérfanos se retiran (doc 28).

## Decisiones habilitadas

- UI de administración de configuración generada desde declaraciones.
- Comportamiento por tenant explicable y auditado.

## Decisiones bloqueadas

- Prohibidos parámetros no declarados o sin default/obligatoriedad explícita.
- Prohibida reevaluación retroactiva por cambios de configuración.
- Prohibidos scripts o expresiones por tenant.

## Reusable Pattern

El formulario de parámetro §2.1 y la regla de defaults completos §2.2; todo DGP incluye su catálogo de parámetros junto al inventario de Policies (nacen emparejados).

## Anti-Patterns

- Tablas de configuración clave-valor sin esquema.
- Parámetros leídos directo de la base por el dominio (saltándose el motor).
- "Configurar" comportamiento con datos maestros mal usados como flags.

## Knowledge Graph

- **ETS que consume**: ETS-005 (motor y frontera de configuración).
- **ESI que consume**: ESI-004/09 y /17; ESI-002/12.
- **DGP que originará**: la sección "catálogo de parámetros" de cada DGP-módulo.
- **ADR relacionados**: ADR de variabilidad paramétrica (ETS-005); ADR de no-retroactividad (§2.3).
- **Módulos que reutilizarán este patrón**: todos; Compras (topes, flujos de aprobación) e Inventario (mínimos por bodega) concentran los catálogos más grandes.
