# 07_DATABASE_CONVENTIONS.md

> **DeltaOps — ETS-010 · v1.0** · Convenciones oficiales de la base de datos: nombres, columnas universales, acceso y disciplina.
> Documento de diseño. Sin SQL.

---

## 1. Nombres

| Objeto | Convención | Ejemplo |
|---|---|---|
| Esquemas | español, minúsculas, snake_case, singular del dominio | `ordenes_trabajo` (excepción plural: es el nombre del dominio ETS-007) |
| Tablas | español, snake_case, **singular** | `orden_trabajo`, `tanqueo` |
| Columnas | español, snake_case; ids como `id_<referencia>` | `id_activo`, `fecha_negocio` |
| Eventos | `evento_<dominio>` | `evento_inventario` |
| Outbox | `outbox_<modulo>` | `outbox_compras` |
| Read models | nombre de la consulta que sirven | `hoja_vida_activo` |
| Índices | `ix_<tabla>_<columnas>`; únicos `ux_`; parciales sufijo del predicado | `ux_activo_tenant_placa` |
| FKs | `fk_<tabla>_<referencia>` | `fk_movimiento_item` |
| Checks | `ck_<tabla>_<regla>` | `ck_movimiento_cantidad_no_cero` |
| Vistas | `v_<nombre>`; materializadas `vm_<nombre>` | `vm_kpi_periodo_nodo` |
| Particiones | `<tabla>_<aaaamm>` | `tanqueo_202607` |

Prohibido: inglés mezclado (el lenguaje ubicuo ETS-003/08 manda), abreviaturas no catalogadas, prefijos húngaros, nombres de motor en objetos de negocio.

## 2. Columnas universales

**Toda tabla de la verdad:** `id` (uuid, 05), `id_tenant`, `id_contexto` (nodo organizacional; nullable solo donde el dato es de tenant entero, documentado en 22), `creado_en` (instante de registro, UTC).

**Todo hecho, además:** `fecha_negocio`, `id_actor`, `canal`, `asistido_ia`, `clave_idempotencia` (única por ámbito declarado), `id_hecho_compensado` (nullable), `folio` (donde humanos lo usan), columnas de versiones de configuración congeladas según el hecho.

**Todo agregado con estado vigente, además:** `version` (entera, concurrencia optimista), `actualizado_en`, `secuencia_ultimo_evento`, estado de ciclo de vida (`estado`).

**Todo versionable:** patrón definición/versión/vigencia (03 §0).

**Prohibidas:** `borrado` booleano genérico (las bajas son estados de dominio, ETS-009/11 §2), `actualizado_por` en hechos (los hechos no se actualizan), columnas "por si acaso".

## 3. Tiempo

Todo instante `timestamptz` en UTC (13); fechas civiles `date` solo cuando el dominio es de día completo; los nombres distinguen: `*_en` instantes, `fecha_*` conceptos de negocio, `vigente_desde/hasta` intervalos.

## 4. Acceso (disciplina de sesión)

- Toda conexión de aplicación fija **tenant de sesión** para RLS al iniciar la transacción; el pooler exige rearmarlo por transacción — responsabilidad de la capa de acceso a datos única (nadie abre conexiones por fuera).
- Transacciones cortas: una transacción = un comando (agregado + eventos + outbox); prohibido mantener transacciones abiertas durante I/O externo.
- Consultas de negocio solo por la capa del módulo dueño; los roles de BD (01 §3) lo refuerzan.
- SQL dinámico concatenado: prohibido (parámetros siempre).

## 5. Gobierno del cambio físico

Todo objeto nuevo o cambiado exige: entrada en el catálogo (03) y el diccionario (22), migración revisada (19), y cumplimiento del checklist de persistencia (ETS-009/20). Nada se crea "temporalmente" a mano en ningún entorno compartido.

---

## Impacto sobre la implementación
Estas convenciones son ley para todo DDL, capa de acceso a datos y revisión de código; las herramientas de lint de esquema deberán codificarlas.

## ETS relacionados
ETS-003 (08 diccionario de negocio) · ETS-009 (03 plantilla del hecho, 11, 20 NP) · ETS-010 (01 roles, 05-06 claves, 13 tipos, 22 diccionario).

## Riesgos
- Convención no automatizada se erosiona → lint de esquema en CI desde el primer DDL.
- Español técnico inconsistente (acentos/ñ) → regla: identificadores sin acentos ni ñ (`anio`, no `año`), catalogada aquí y verificada por lint.

## Decisiones habilitadas
Lint de esquema, plantillas de DDL por patrón (03 §0), generación del diccionario (22) desde metadatos.

## Decisiones bloqueadas hasta el siguiente ETS
Herramienta concreta de lint/migración y el DDL mismo.
