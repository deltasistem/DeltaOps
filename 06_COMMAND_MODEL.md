# 06 — Modelo de Commands

> **DeltaOps — ESI-005 · v1.0** · El estándar de comandos de módulos de negocio: el patrón del ejemplar aplicado a dominios reales.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Todo comando de negocio es una instancia del comando de referencia (ESI-004/05): formulario de definición, pipeline completo (ESI-004/07), `clave_idempotencia`, concurrencia optimista, denegaciones distinguibles, patrón cargar-preguntar-ordenar-registrar (ESI-004/10). Nada de eso se rediseña por módulo.

## 2. Lo que añade el estándar para dominios reales

1. **Inventario de comandos por agregado**: cada DGP entrega la tabla de comandos derivada de los casos de uso de ETS-002 (p. ej. OT: crear, planificar, asignar, iniciar, pausar, cerrar, cancelar). Cada comando corresponde a una transición o decisión del agregado — un comando "actualizar" genérico es señal de modelo anémico (AP-01).
2. **Comandos con efectos multi-agregado del mismo módulo**: un comando modifica **un** agregado; si el negocio exige reaccionar en otro (cerrar OT descuenta inventario reservado), la reacción viaja por evento y consumidor, incluso dentro del módulo, salvo invariante transaccional real documentada como decisión local (ADR de módulo, ESI-004/20).
3. **Comandos masivos**: las operaciones por lote son un comando por elemento orquestado por un trabajo (ESI-003/22), nunca un "mega-comando" transaccional sobre N agregados; el resultado es por elemento, con errores parciales explícitos.
4. **fechaNegocio en todo comando** que registre hechos con efecto retroactivo posible (combustible, movimientos de inventario): la pareja fechaNegocio/fechaRegistro (ETS-006) es obligatoria donde el mundo real llega tarde al sistema.
5. **Nombres del lenguaje del dominio** (ETS-003): el comando se llama como habla el negocio ("Cerrar Orden de Trabajo"), no como opera la base de datos.

## Impacto sobre la implementación

Los comandos se generan con T01 y heredan las baterías patrón (idempotencia, concurrencia, denegaciones) sin reescritura; el trabajo real del DGP es el inventario §2.1 y las invariantes de dominio.

## Dependencias

ESI-004/05, /07, /10 y /13; ETS-002/003/006; ESI-003/20 y /22; doc 11 (agregados).

## Riesgos

- Inventarios de comandos calcados de formularios de UI en lugar de transiciones de dominio; mitigación: la revisión (doc 26) contrasta comandos contra la máquina de estados del agregado.

## Decisiones habilitadas

- Estimación por DGP contable: n comandos × patrón conocido.
- Operaciones masivas uniformes en todos los módulos.

## Decisiones bloqueadas

- Prohibidos comandos multi-agregado transaccionales sin ADR local.
- Prohibidos comandos "actualizar entidad" genéricos.
- Prohibidos comandos sin `clave_idempotencia` o sin sus pruebas patrón.

## Reusable Pattern

El formulario de comando (ESI-004/05 §1) más las cinco reglas §2; el inventario de comandos por agregado es la sección correspondiente de todo DGP.

## Anti-Patterns

- CRUD disfrazado de dominio (crear/leer/actualizar/borrar como únicos comandos).
- Lotes transaccionales gigantes que bloquean tablas.
- Comandos que devuelven el estado completo del mundo "por conveniencia" del cliente.

## Knowledge Graph

- **ETS que consume**: ETS-002 (casos de uso), ETS-003 (lenguaje), ETS-006 (fechas).
- **ESI que consume**: ESI-004/05, /07, /10, /13; ESI-003/20 y /22.
- **DGP que originará**: la sección "inventario de comandos" de cada DGP-módulo.
- **ADR relacionados**: ADR locales de invariantes multi-agregado cuando existan (§2.2).
- **Módulos que reutilizarán este patrón**: todos; Inventario y Combustible son los usuarios intensivos de fechaNegocio y comandos masivos.
