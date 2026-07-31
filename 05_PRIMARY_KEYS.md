# 05_PRIMARY_KEYS.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de claves primarias.
> Materializa UUID First (ETS-009/12) en PostgreSQL. Documento de diseño. Sin SQL.

---

## 1. La regla única

**Toda tabla tiene una clave primaria UUID llamada `id`**, tipo `uuid` nativo, generada por quien crea el registro (servidor, dispositivo móvil, integración) sin coordinación.

- **Variante ordenable por tiempo (UUIDv7)** como generación estándar: preserva localidad de inserción en los índices B-tree (los registros nuevos caen al final, no dispersos) — crítico para tablas de hechos de alto volumen. La ordenabilidad es una propiedad física interna; **ningún contrato ni consulta de negocio depende del orden de los UUID** (ETS-009/12 §1).
- Los dispositivos móviles y clientes API generan el mismo formato: el UUID capturado offline **es** la clave primaria definitiva (la resolución jamás remapea, ETS-009/12 §4).

## 2. Casos particulares

| Caso | Clave |
|---|---|
| Tablas de hechos particionadas (09) | PK compuesta `(id, columna_de_particion)` — requisito de PostgreSQL para particionamiento declarativo; la unicidad global del UUID la garantiza la generación, y la clave de idempotencia añade la muralla de negocio |
| Tablas de versiones (`*_version`) | `id` propio (UUID) + unicidad de negocio `(id_definicion, numero_version)` |
| Tablas de vigencia/detalle puras | `id` propio igualmente — sin PKs compuestas "naturales": la uniformidad vale más que el ahorro |
| Read models (`lectura_*`) | `id` de la entidad que proyectan cuando es 1:1 (misma identidad); clave propia del grano cuando agregan (`(id_tenant, periodo, id_nodo, …)` como unicidad, con `id` UUID igual para uniformidad de herramientas) |
| `mensajeria.outbox_*` | `id` UUID + `secuencia` monotónica local para el despacho ordenado |

## 3. Identidad de negocio (folios)

- El folio legible (`OT-2026-00431`) es **columna aparte** (`folio`), única por tenant, generada por secuencia del servidor al confirmar (ETS-009/12 §2) — jamás es la PK ni participa en FKs.
- Formato configurable por tenant (ETS-005/13); la secuencia física es por tenant y tipo (aislada, sin fugas de información entre tenants por saltos).

## 4. Prohibiciones

- Enteros autoincrementales como PK de negocio: prohibidos (rompen offline, revelan volumen, acoplan a la BD central). Se admiten solo como `secuencia` interna técnica (outbox, orden de despacho) nunca expuesta.
- Claves naturales como PK (placa, serial, código): prohibidas — son atributos únicos por tenant (12), mutables por la vida real; la identidad no puede depender de ellas.
- Reutilización de UUID tras bajas: prohibida (ETS-009/11 §3).

---

## Impacto sobre la implementación
El DDL declara `id uuid` PK en toda tabla (compuesta con la clave de partición donde aplique); la generación UUIDv7 se hace en la aplicación/dispositivo, no por defecto de la BD (el creador es quien genera).

## ETS relacionados
ETS-009 (12 identidad) · ETS-008 (12 sync — identidades provisionales) · ETS-005 (13 folios configurables).

## Riesgos
- PK compuesta en particionadas complica FKs entrantes → por eso las referencias a hechos particionados son débiles por UUID (04 §1), verificadas por reconciliación.
- Generación UUID no-v7 en algún cliente degrada índices, no corrección → convención en SDKs (ETS-008/15) y verificación en revisión.

## Decisiones habilitadas
Claves foráneas (06), particionado con PK compuesta (09), índices de unicidad de negocio (08).

## Decisiones bloqueadas hasta el siguiente ETS
Elección de librería de generación UUIDv7 por plataforma y el DDL concreto.
