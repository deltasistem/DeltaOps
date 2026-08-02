# 16 — Modelo de Permisos

> **DeltaOps — ESI-005 · v1.0** · El estándar del árbol de permisos de un módulo de negocio: granularidad, alcances y disciplina de catálogo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Los permisos siguen ESI-003/12 y el ejemplar: nomenclatura `MODULO.RECURSO.ACCION`, declarados por pieza, evaluados por la plataforma tras la capacidad, denegación distinguible, catalogados antes de referenciarse.

## 2. Reglas de diseño del árbol

1. **Un permiso por acción de negocio significativa**, no por endpoint: aprobar una solicitud de compra es un permiso distinto de crearla (lo pide el negocio: segregación de funciones); paginar la misma lista con otro filtro no es un permiso nuevo.
2. **Granularidad estándar por recurso**: `LISTAR`/`CONSULTAR`, `CREAR`, acciones de transición con nombre propio (`APROBAR`, `CERRAR`, `CANCELAR`), y `ADMINISTRAR` para configuración del recurso. Las lecturas se separan de las escrituras siempre.
3. **Segregación de funciones donde el dominio la exige** (Compras: quien aprueba no es quien crea; SST: quien investiga no es quien reporta): se modela con permisos distintos y, cuando la regla es "ni la misma persona con ambos permisos", con una Policy de dominio (doc 09) — el permiso dice quién puede, la Policy dice si en este caso puede.
4. **Alcances de dato** (§15/2.5): cuando el permiso aplica restringido a un subconjunto (su bodega, su área), el alcance se declara junto al permiso y lo aplica la plataforma/RLS extendida — jamás filtros manuales en lectores.
5. **Los roles no los define el módulo**: el módulo publica permisos; los roles (agrupaciones) son configuración del tenant (ETS-005). El seed trae roles de ejemplo realistas para los dos tenants.
6. **Los permisos son contrato**: retirar o renombrar un permiso publicado sigue N/N-1 (ESI-002/21); los tenants tienen roles armados sobre ellos.

## Impacto sobre la implementación

Cada DGP entrega el árbol de permisos completo derivado de su inventario de comandos/consultas, con alcances y necesidades de segregación anotadas; la evaluación ya existe en plataforma.

## Dependencias

ESI-003/12; ESI-004/04-06; docs 05-07, 09 y 15; ETS-005 (roles), ETS-002 (segregaciones del negocio).

## Riesgos

- Árboles de permisos calcados de endpoints (cientos de permisos ininteligibles) o al revés, un solo `ADMINISTRAR` para todo; mitigación: la granularidad estándar §2.2 y la revisión contra el inventario de comandos.

## Decisiones habilitadas

- Roles por tenant armados sobre permisos estables y comprensibles.
- Segregación de funciones demostrable en auditorías de cliente.

## Decisiones bloqueadas

- Prohibido codificar roles dentro de módulos.
- Prohibidos chequeos de permiso manuales (AP-07).
- Prohibido retirar permisos publicados sin ciclo N/N-1.

## Reusable Pattern

La granularidad estándar §2.2 y el patrón permiso+Policy para segregación §2.3; el árbol de permisos es sección fija de todo DGP, derivada mecánicamente del inventario de piezas.

## Anti-Patterns

- Permiso único "acceso al módulo" sin granularidad.
- Permisos con lógica temporal o condicional embebida en el nombre.
- Alcances de dato implementados como WHERE a mano en lectores.

## Knowledge Graph

- **ETS que consume**: ETS-002 (segregaciones), ETS-005 (roles por tenant), ETS-009 (alcances/RLS).
- **ESI que consume**: ESI-003/12; ESI-004/04-06; ESI-002/21.
- **DGP que originará**: la sección "árbol de permisos" de cada DGP-módulo.
- **ADR relacionados**: ADR de evaluación declarativa (ESI-003/12); ADR de alcances de dato (doc 15 §2.5).
- **Módulos que reutilizarán este patrón**: todos; Compras es el caso más rico en segregación de funciones.
