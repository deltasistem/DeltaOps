# 12_BUSINESS_CONSTRAINTS.md

> **DeltaOps — ETS-010 · v1.0** · Constraints de negocio en la base de datos: qué invariantes se refuerzan físicamente y cuáles pertenecen solo al dominio.
> Principio: el dominio valida TODO (ETS-008/03 precondiciones); la BD refuerza lo que puede sin duplicar el motor de reglas — la constraint es la última muralla, no la primera.
> Documento de diseño. Sin SQL.

---

## 1. Qué SÍ se refuerza en la BD

| Familia | Constraints |
|---|---|
| **Identidad y unicidad** | Folio único por tenant; placa/serial/código únicos por tenant donde el dominio lo declare; `(id_definicion, numero_version)` único; clave de idempotencia única en su ámbito; `(id_agregado, secuencia_agregado)` único en eventos |
| **Integridad estructural** | FKs de 06; NOT NULL en columnas universales (tenant, actor en hechos, tiempos); RLS por tenant en toda tabla de negocio (la constraint suprema) |
| **Sanidad de valores** | CHECKs simples e inmutables: cantidades no cero en movimientos, `vigente_hasta` > `vigente_desde`, montos no negativos donde el dominio jamás los admite, estados dentro del catálogo cerrado (13 §3), porcentaje 0-100 |
| **Append-only físico** | Privilegios: los roles de aplicación carecen de UPDATE/DELETE sobre tablas de hechos y eventos (la muralla estructural de ETS-009/04 §4); las pocas columnas mutables de hechos (estado de lectura apartada→resuelta) se gobiernan por columna, documentadas como excepción |
| **SoD mínima** | CHECK aprobador ≠ creador en `aprobacion` (la SoD completa la valida el dominio; la BD bloquea el caso flagrante) |
| **Tiempo** | `fecha_negocio` no futura más allá de tolerancia declarada (CHECK con margen para desfase de reloj de dispositivos) |

## 2. Qué NO se refuerza en la BD (solo dominio)

- **Reglas configurables por tenant** (umbrales, aprobaciones requeridas, campos obligatorios de formularios): viven en configuración versionada (ETS-005) — una constraint física no puede variar por tenant ni por versión.
- **Invariantes entre agregados** (saldo suficiente al despachar se valida contra el estado vigente en la transacción del comando; la constraint física no puede verlo con particiones y concurrencia sin serializar de más).
- **Transiciones de workflow** (dependen de la versión del workflow de cada OT).
- **Monotonía de lecturas** (es apartado a revisión, no rechazo — una constraint la rechazaría, ETS-009/03 §8).
- **Validación de referencias débiles** (04): dominio + reconciliación.

## 3. Régimen de las constraints

- Toda constraint tiene nombre por convención (07) y entrada en el diccionario (22) con su regla de negocio de origen.
- La violación de una constraint física en producción es **un defecto del dominio** (algo pasó que la primera muralla debió parar): alerta, no manejo silencioso; el error nunca llega crudo al usuario (se traduce por el catálogo ETS-008/07).
- Cambios de constraint siguen expandir→migrar→contraer (19): NOT VALID → validar → obligar, sin ventanas de bloqueo.

---

## Impacto sobre la implementación
El DDL nace con estas murallas; los permisos append-only por rol se configuran desde el primer despliegue; el mapa constraint→error de negocio se codifica en la capa de acceso a datos.

## ETS relacionados
ETS-009 (04 append-only, 16 invariantes por agregado) · ETS-008 (03 precondiciones, 07 errores) · ETS-005 (validaciones configurables) · ETS-010 (06, 07, 13, 19).

## Riesgos
- Duplicar reglas configurables en constraints físicas fosiliza la configurabilidad → frontera del §2 es estricta.
- Confiar solo en RLS sin pruebas → pruebas de fuga cross-tenant en CI (01).

## Decisiones habilitadas
DDL de constraints, permisos por rol, traducción constraint→error.

## Decisiones bloqueadas hasta el siguiente ETS
Lista exhaustiva de CHECKs por tabla (con el DDL) y las excepciones de columna mutable documentadas una a una.
