# 17 — Auditoría en el Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · El rastro de auditoría de negocio: quién hizo qué, cuándo y sobre qué — persistido con garantías.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué se audita en el ejemplar

La auditoría de negocio (ETS-006) es un registro de dominio persistido, distinto del log operativo (ESI-003/16 regla 3). El módulo de referencia audita:

| Hecho auditado | Contenido del registro |
|---|---|
| Activación de un elemento | Actor, tenant, identificador, estado anterior → nuevo, fechaNegocio y fechaRegistro, correlación |
| Denegación por Policy | Actor, tenant, identificador, regla y valores (límite/actuales) |

**Criterio demostrado**: se auditan los cambios de estado de negocio y las denegaciones de reglas de negocio relevantes; no se auditan lecturas del ejemplar (los módulos reales con requisitos regulatorios de lectura lo declararán en su ETS de dominio).

## 2. Mecánica

1. El registro de auditoría se escribe **en la misma transacción** que el cambio (doc 13): un cambio sin su auditoría no puede existir, ni al revés.
2. La escritura la hace la plataforma a partir de la **declaración de auditoría** de la pieza (misma filosofía declarativa que capacidad y permisos): el caso de uso no escribe auditoría a mano; declara qué hechos se auditan y con qué campos.
3. El registro es **inmutable y de solo inserción** (ETS-010): sin actualización ni borrado; la retención la gobierna la política de datos (ETS-009).
4. Consulta de auditoría: por el plano de lectura con permiso propio (`REFERENCIA.AUDITORIA.CONSULTAR` en el ejemplar), paginada por cursor, bajo RLS.

## 3. Qué demuestra

1. **La frontera log ↔ auditoría** con casos concretos: la denegación por Policy aparece en ambos — como INFO operativo (doc 16) y como registro de auditoría — con propósitos y garantías distintos.
2. **Atomicidad de auditoría**: la prueba fuerza el fallo tras el cambio y verifica que ni cambio ni auditoría persisten.
3. **Correlación**: desde el registro de auditoría se llega a la traza técnica (ESI-003/17) por la correlación compartida — el auditor y el operador ven la misma historia desde ángulos distintos.

## Impacto sobre la implementación

La declaración de auditoría entra al contrato de declaración de piezas (ESI-003/06 se instancia aquí); la plataforma implementa el escritor declarativo dentro de la UoW.

## Dependencias

ETS-006 (modelo de auditoría), ETS-009/010 (retención, inmutabilidad); docs 09, 13, 16 y 20; ESI-003/12 (permiso de consulta).

## Riesgos

- Auditar de más "por si acaso" hasta volver el rastro inutilizable y caro; mitigación: el criterio §1 (cambios de estado + denegaciones relevantes) y revisión del catálogo de hechos auditados en el DGP.

## Decisiones habilitadas

- Escritor de auditoría declarativo como pieza de plataforma.
- Consulta de auditoría estándar por módulo con permiso propio.

## Decisiones bloqueadas

- Prohibido cumplir auditoría con logs operativos.
- Prohibida auditoría fuera de la transacción del cambio.
- Prohibido actualizar o borrar registros de auditoría.

## Reusable Pattern

Los DGP futuros copian: el criterio de qué auditar §1, la mecánica declarativa §2, y las tres demostraciones §3 como pruebas obligatorias donde haya auditoría.

## Anti-Patterns

- Tablas de auditoría rellenadas por triggers invisibles al diseño.
- Auditoría "best effort" fuera de la transacción que pierde registros.
- Un único permiso global de auditoría que expone los rastros de todos los módulos.
