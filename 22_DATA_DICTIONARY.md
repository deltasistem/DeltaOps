# 22_DATA_DICTIONARY.md

> **DeltaOps — ETS-010 · v1.0** · Diccionario Oficial de Datos: las definiciones normativas que todo DDL, código y documento debe usar.
> Cierra la serie ETS-010. Los nombres de negocio vienen del diccionario ETS-003/08; aquí, su forma física canónica.
> Documento de diseño. Sin SQL.

---

## 1. Columnas universales (definición canónica)

| Columna | Tipo (13) | Presente en | Definición |
|---|---|---|---|
| `id` | uuid | Toda tabla | Identidad técnica, UUIDv7, generada por el creador, eterna (05) |
| `id_tenant` | uuid | Toda tabla de negocio | Tenant dueño; NOT NULL; clave de RLS; primera columna de índices de consulta |
| `id_contexto` | uuid | Toda tabla de negocio | Nodo organizacional donde vive/ocurre; NOT NULL salvo datos de tenant entero (documentado por tabla) |
| `creado_en` | timestamptz | Toda tabla | Instante de registro, UTC, lo pone el servidor |
| `folio` | text | Entidades/hechos con cara humana | Identidad de negocio legible, única por tenant, asignada por el servidor al confirmar (05 §3) |
| `fecha_negocio` | timestamptz | Todo hecho | Cuándo ocurrió en el mundo real (puede preceder a `creado_en`) |
| `id_actor` | uuid | Todo hecho | Cuenta que ejecutó; con `id_actor_delegante` cuando hubo delegación |
| `canal` | text+CHECK | Todo hecho | `web · movil · api · iot · regla · integracion` |
| `asistido_ia` | boolean | Todo hecho donde aplique | Marca U-40; NOT NULL default false |
| `clave_idempotencia` | text | Todo hecho | Única en su ámbito declarado; la muralla contra duplicación |
| `id_hecho_compensado` | uuid | Hechos compensatorios | FK al hecho corregido del mismo esquema; con `motivo` obligatorio |
| `version` | integer | Estado vigente de agregados | Concurrencia optimista; incrementa por comando |
| `secuencia_agregado` | bigint | Eventos | Posición en la historia del agregado; única por agregado |
| `vigente_desde` / `vigente_hasta` | timestamptz | Relaciones temporales | Intervalo semiabierto; `hasta` NULL = vigente; lo escribe un hecho posterior |
| `estado` | text+CHECK | Agregados y máquinas | Catálogo cerrado por entidad, en español (`abierta`, `cerrada`, `dado_de_baja`…) |
| `numero_version` | integer | Tablas `*_version` | Consecutivo por definición; inmutable tras publicar |
| `huella` | text | Archivos, cadena de auditoría | Huella criptográfica del contenido, formato único de plataforma |

## 2. Dominios de valores canónicos

- **Monedas**: código ISO-4217 en `moneda`; monto siempre `numeric(19,4)` (13).
- **Unidades**: FK a `nucleo.unidad_medida`; cantidad jamás sin unidad.
- **Estados por entidad**: catálogo cerrado definido con el dominio (ETS-003), CHECK físico + traducción de presentación por idioma (la BD guarda el valor canónico en español técnico sin acentos, 07 §1).
- **Clasificación de datos**: `publico_interno · interno · restringido` (ETS-006/13), en metadatos de archivos y donde el dato lo exija.
- **Canales, categorías de archivo, tipos de dueño polimórfico**: catálogos cerrados de plataforma, versionados con este diccionario.

## 3. El diccionario vivo

- Este documento fija las definiciones universales; el **diccionario completo tabla-por-tabla y columna-por-columna se genera desde los metadatos de la BD** (comentarios de esquema obligatorios en el DDL: toda tabla y columna nace comentada con su definición de negocio) — el diccionario publicado nunca diverge de lo real porque se extrae de lo real.
- Publicación: junto a los marts para BI (ETS-008/13 §3), en el portal interno para desarrollo, versionado con cada migración (19).
- Toda migración que agregue o cambie objetos exige su comentario/definición en el mismo cambio (07 §5): sin definición no pasa revisión.

---

## Impacto sobre la implementación
El DDL nace con comentarios obligatorios; el generador del diccionario es tooling de serie; las columnas universales son plantilla de toda tabla nueva.

## ETS relacionados
ETS-003 (08 diccionario de negocio) · ETS-006 (07 gobernanza, 18 metadata) · ETS-009 (03 plantilla del hecho, 20 NP) · ETS-010 (todos: 05, 07, 13 especialmente).

## Riesgos
- Diccionario manual divergente → por eso se genera desde metadatos reales; lo manual es solo la capa normativa de este documento.
- Traducciones de estados hechas en la BD → prohibido: valor canónico único, presentación por idioma en la capa de presentación.

## Decisiones habilitadas
Plantillas de DDL, generador de diccionario, publicación a BI y desarrollo.

## Decisiones bloqueadas hasta el siguiente ETS
El diccionario exhaustivo por columna (nace con el DDL de implementación, gobernado por estas definiciones).

---

**Fin de la serie ETS-010.** La arquitectura física de base de datos queda definida: topología PostgreSQL con RLS y roles, 27 esquemas por dominio, catálogo completo de tablas, relaciones fuertes/débiles/congeladas, claves UUID-first, FKs con RESTRICT solo dentro de módulos, convenciones oficiales, índices por patrón, particionado por tiempo con temperaturas, proyecciones sobre vistas materializadas nativas, vistas de solo lectura acotadas, constraints como última muralla, mapa cerrado de tipos, JSONB gobernado, auditoría con cadena física, historización por eventos y snapshots, archivos como metadatos, sync offline con idempotencia física, migraciones sin corte, rendimiento por presupuesto y evolución preparada — coherente con ETS-001…009 y lista para gobernar el DDL de implementación.
