# 13 — Modelo de Indicadores (KPI)

> **DeltaOps — ESI-005 · v1.0** · El estándar de indicadores de negocio por módulo: definidos como contrato, calculados con disciplina, servidos por la ruta correcta.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Concepto

Un indicador (KPI) es una medida de negocio con definición oficial que el módulo publica: disponibilidad de flota, MTTR/MTBF, cumplimiento del plan de mantenimiento, rotación de inventario, rendimiento de combustible, frecuencia/severidad en SST. **Un KPI no es una métrica técnica** (ESI-004/18): mide el negocio del tenant, no la salud del sistema.

## 2. Reglas

1. **Definición como contrato**: cada KPI se declara con nombre de negocio, fórmula en prosa precisa, unidades, dimensiones (por activo, por bodega, por período), fuente de datos y dueño de negocio. La definición se cataloga y versiona; dos pantallas jamás calculan el mismo KPI con fórmulas distintas.
2. **Tres rutas de servicio, por frescura**:
   - **Operativo inmediato** (contadores del día, backlog actual): proyección del módulo (doc 12).
   - **Histórico y comparativo** (tendencias, períodos): ruta analítica de ETS-007; el módulo aporta sus eventos/datos a esa ruta, no la reimplementa.
   - **Instantáneo puntual** (un cálculo bajo demanda sobre un agregado): consulta del plano de lectura.
   El DGP asigna ruta a cada KPI; un KPI histórico servido desde proyecciones transaccionales es defecto de diseño.
3. **fechaNegocio manda**: todo KPI se calcula sobre fechaNegocio (ETS-006), y las llegadas tardías se tratan según su ruta (la analítica reprocesa; la proyección converge por eventos).
4. **KPIs multi-módulo** (costo de mantenimiento por activo cruza OT+Inventario+Compras): viven en la ruta analítica sobre eventos publicados; ningún módulo calcula KPIs con datos internos de otro.
5. **Publicación**: los KPIs del módulo entran en su declaración (doc 04) y su expediente; el tablero los consume por contrato, no por SQL directo.

## Impacto sobre la implementación

Cada DGP entrega el catálogo de KPIs con definición, ruta y dueño; la plataforma analítica (ETS-007) recibe la lista de eventos/datos que cada módulo aporta.

## Dependencias

ETS-006/007; ESI-004/15 y /18; docs 08 y 12; ETS-002 (indicadores del negocio).

## Riesgos

- KPIs "de opinión": cada gerente con su fórmula; mitigación: definición catalogada con dueño único §2.1; discrepancias se resuelven cambiando el catálogo, no las pantallas.
- Recalcular KPIs históricos en caliente contra tablas transaccionales; mitigación: la asignación de ruta §2.2 es revisable y bloqueante.

## Decisiones habilitadas

- Tableros consistentes entre pantallas, exportes y reportes.
- Comparabilidad de KPIs entre tenants (misma fórmula, datos propios).

## Decisiones bloqueadas

- Prohibidos KPIs sin definición catalogada y dueño.
- Prohibido calcular KPIs con datos internos de otro módulo.
- Prohibida la ruta transaccional para históricos y comparativos.

## Reusable Pattern

El formulario de KPI (nombre, fórmula, unidades, dimensiones, ruta, dueño) y la asignación por frescura §2.2; todo DGP-módulo incluye su catálogo de KPIs como sección fija.

## Anti-Patterns

- KPIs calculados en el frontend a partir de listados.
- La misma sigla (MTTR) con tres fórmulas en tres pantallas.
- Indicadores técnicos disfrazados de KPIs de negocio en tableros de cliente.

## Knowledge Graph

- **ETS que consume**: ETS-002 (indicadores del dominio), ETS-006 (fechas), ETS-007 (ruta analítica).
- **ESI que consume**: ESI-004/15 y /18.
- **DGP que originará**: la sección "catálogo de KPIs" de cada DGP-módulo; alimenta además el DGP de la plataforma analítica.
- **ADR relacionados**: ADR de separación transaccional/analítica (ETS-007).
- **Módulos que reutilizarán este patrón**: todos; OT (MTTR/MTBF, cumplimiento) y SST (frecuencia/severidad) son los de mayor visibilidad gerencial.
