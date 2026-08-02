# 07 — Modelo de Queries

> **DeltaOps — ESI-005 · v1.0** · El estándar de consultas de módulos de negocio: plano de lectura puro, escalado a dominios reales.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Toda consulta es instancia de la consulta de referencia (ESI-004/06): plano de lectura sin dominio, cursor estable, filtros cerrados y tipados, RLS como segunda muralla, tope de página, permiso propio de lectura. Invariante en todos los módulos.

## 2. Lo que añade el estándar para dominios reales

1. **Inventario de consultas por pantalla y por integración**: las consultas nacen de necesidades reales (jornadas de usuario de ETS-001/002 y contratos de integración), no "por si acaso". Cada consulta declara a quién sirve; una consulta sin consumidor conocido no se construye.
2. **Detalle vs listado vs resumen**: tres formas canónicas — detalle por identificador, listado paginado con filtros cerrados, resumen desde proyección (doc 12). Formas nuevas requieren justificación en el DGP.
3. **Filtros compuestos del dominio** (estado + rango de fechaNegocio + referencia a maestro): siguen siendo cerrados y tipados; la "búsqueda libre" universal no existe en el plano transaccional — si el dominio exige búsqueda textual, es una decisión explícita con su pieza dedicada y su ADR.
4. **Consultas cruzadas entre módulos: prohibidas en el plano de lectura**. Una pantalla que combina datos de dos módulos los compone en el cliente/BFF con dos consultas, o consume una proyección alimentada por eventos de ambos (doc 12 §2.4). Jamás un lector con JOIN a tablas de otro módulo.
5. **Exportaciones**: listados grandes para exportar son trabajos (ESI-003/22) que producen archivo, no páginas de 100.000 elementos.

## Impacto sobre la implementación

Las consultas se generan con T02; el trabajo del DGP es el inventario §2.1 con sus filtros y presupuestos de latencia (ESI-004/27 Q-01).

## Dependencias

ESI-004/06 y /15; ESI-003/09 (RLS) y /22; ETS-008 (contratos); docs 12 y 19.

## Riesgos

- Proliferación de consultas casi idénticas por pereza de parametrizar; mitigación: la revisión contrasta el inventario; filtros opcionales cerrados antes que consultas gemelas.
- JOINs cruzados "temporales" que fosilizan el acoplamiento; mitigación: la puerta detecta referencias a tablas de otro módulo (frontera física de esquema, ETS-010).

## Decisiones habilitadas

- Contratos de lectura generados y estables para UI e integraciones.
- Presupuestos de latencia por consulta desde el DGP.

## Decisiones bloqueadas

- Prohibidos lectores que crucen tablas de otros módulos.
- Prohibida búsqueda libre no tipada en el plano transaccional.
- Prohibidas consultas sin consumidor declarado.

## Reusable Pattern

Las tres formas canónicas §2.2 y el inventario "consulta → consumidor → filtros → presupuesto" como formulario del DGP.

## Anti-Patterns

- Endpoints "god query" con veinte filtros opcionales sin tipar.
- Paginación por offset en datos vivos.
- Resolver reportes analíticos en el plano transaccional (eso es ETS-007/analítica).

## Knowledge Graph

- **ETS que consume**: ETS-001/002 (jornadas), ETS-008 (contratos), ETS-010 (fronteras de esquema).
- **ESI que consume**: ESI-004/06; ESI-003/09 y /22.
- **DGP que originará**: la sección "inventario de consultas" de cada DGP-módulo.
- **ADR relacionados**: ADR local de búsqueda textual si un módulo la necesita (§2.3).
- **Módulos que reutilizarán este patrón**: todos; Activos e Inventario concentran los listados más pesados.
