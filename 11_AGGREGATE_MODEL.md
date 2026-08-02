# 11 — Modelo de Aggregates

> **DeltaOps — ESI-005 · v1.0** · El estándar de agregados en módulos de negocio: dónde viven las invariantes y cómo se trazan sus fronteras.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

El agregado sigue el patrón del Elemento de Referencia (ESI-004): frontera de consistencia transaccional, máquina de estados explícita, invariantes dentro, eventos emitidos por el propio agregado, concurrencia optimista por versión, repositorio propio con operaciones nombradas.

## 2. Reglas de diseño de agregados reales

1. **La frontera la fija la invariante, no el formulario**: entra al agregado lo que debe ser consistente **en la misma transacción**; lo demás son agregados aparte relacionados por identidad. La OT y su plan de mantenimiento son agregados distintos; la OT y sus tareas internas, uno solo si la invariante (no cerrar con tareas abiertas) lo exige.
2. **Agregados chicos por defecto**: la carga de la prueba está en agrandar. Un agregado que crece hasta cargar cientos de hijos por operación es un defecto de frontera, no un problema de rendimiento a cachear.
3. **Referencias entre agregados por identidad**, jamás por objeto: la consistencia entre agregados es eventual, por eventos (doc 08), incluso dentro del módulo (doc 06 §2.2).
4. **Máquina de estados obligatoria y explícita** para todo agregado con ciclo de vida (la mayoría en este negocio: OT, solicitud de compra, activo): estados y transiciones declarados y probados en tabla — legales e ilegales (ESI-004/19).
5. **Maestros vs transaccionales** (ETS-004): los maestros (activo, bodega, proveedor) son agregados con ciclo lento y referencias masivas; los transaccionales (OT, movimiento, carga de combustible) nacen y mueren rápido con fechaNegocio. Ambos son agregados plenos; cambia el perfil, no el patrón.
6. **Identidad**: claves de plataforma (ETS-010 §claves primarias) + código natural del negocio cuando el dominio lo tenga (número de OT), con unicidad por tenant demostrada como en el ejemplar.

## Impacto sobre la implementación

El mapa de agregados con sus máquinas de estado es **el** entregable de diseño de cada DGP-módulo; comandos, eventos y repositorios se derivan de él.

## Dependencias

ESI-004/05, /08 y /12-14; ETS-003/004/010; docs 06, 08 y 10.

## Riesgos

- Fronteras trazadas por intuición de tablas ("todo lo que se guarda junto") en lugar de invariantes; mitigación: el formulario de agregado exige enunciar las invariantes que justifican cada miembro de la frontera.

## Decisiones habilitadas

- Concurrencia y transacciones acotadas y predecibles por agregado.
- Derivación mecánica del resto de piezas desde el mapa de agregados.

## Decisiones bloqueadas

- Prohibidas referencias objeto-a-objeto entre agregados.
- Prohibidos agregados sin máquina de estados donde haya ciclo de vida.
- Prohibido "el agregado sesión de trabajo" que envuelve media base de datos.

## Reusable Pattern

El formulario de agregado: invariantes → frontera → estados/transiciones → comandos → eventos → operaciones de repositorio. Cada DGP lo rellena por agregado; es la columna vertebral del inventario del módulo.

## Anti-Patterns

- Dominio anémico (AP-01): datos públicos mutables + "servicios" que los manipulan.
- Agregados-documento que se cargan y guardan enteros por cualquier cambio.
- Estados implícitos deducidos de combinaciones de campos nulos.

## Knowledge Graph

- **ETS que consume**: ETS-003 (modelo de dominio), ETS-004 (maestros/transaccionales), ETS-006 (fechas), ETS-010 (identidad).
- **ESI que consume**: ESI-004/05, /08, /12-14.
- **DGP que originará**: la sección "mapa de agregados" — el entregable de diseño central de cada DGP-módulo.
- **ADR relacionados**: ADR de concurrencia optimista (ESI-003/20).
- **Módulos que reutilizarán este patrón**: todos; Activos aporta los maestros más referenciados y OT los transaccionales más complejos.
