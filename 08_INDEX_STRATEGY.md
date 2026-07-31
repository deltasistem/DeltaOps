# 08_INDEX_STRATEGY.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de índices: dónde, de qué tipo, y la disciplina de su ciclo de vida.
> Principio heredado (ETS-009/15): índices mínimos en la verdad, riqueza en los derivados.
> Documento de diseño. Sin SQL.

---

## 1. Índices obligatorios (por patrón)

| Patrón | Índices |
|---|---|
| Toda tabla | PK (implícito) |
| Toda tabla con RLS | `(id_tenant, …)` como primera columna de los índices de consulta — el tenant siempre filtra |
| Toda FK física | Índice sobre la columna FK (06 §3) |
| Hechos | `(id_tenant, fecha_negocio)` y `(id_agregado_principal, fecha_negocio)` por partición; único `(clave_idempotencia)` en su ámbito |
| Eventos | `(id_agregado, secuencia_agregado)` único; `(id_tenant, creado_en)` para rangos |
| Outbox | Parcial sobre no-despachados en orden de secuencia (la cola viva es pequeña aunque la tabla crezca) |
| Agregados | Únicos de negocio por tenant: `ux_(id_tenant, folio)`, `ux_(id_tenant, placa/codigo/serial)` donde el dominio lo exige (12) |
| Versionables | `ux_(id_definicion, numero_version)`; vigencias por `(id_definicion, vigente_desde)` |
| Read models | Los que su consulta pida — aquí vive la riqueza: compuestos por filtros frecuentes, parciales por estado (backlog = solo abiertas), cobertura para listas |

## 2. Tipos de índice por uso

- **B-tree**: el defecto universal (igualdad, rangos, orden).
- **GIN**: JSONB consultable (atributos dinámicos con rutas declaradas, 14 §4) y texto completo (`lectura_busqueda`, con diccionario español).
- **BRIN**: tablas de hechos gigantes sobre `creado_en` (correlación física por UUIDv7/append) — barato para escaneos de rango histórico en particiones tibias.
- **Parciales**: estados vivos (OTs abiertas, subidas pendientes, outbox no despachado, lecturas apartadas) — índices pequeños para las preguntas operativas.
- **Cobertura (INCLUDE)**: listas calientes de read models donde evitar el salto a la tabla paga.
- Expresión: admitidos con justificación (búsqueda por folio normalizado, por ejemplo).

## 3. Disciplina

1. **Todo índice nace con una consulta que lo justifica** (del catálogo ETS-008/04 o una operación interna medida) y se registra con su motivo en el diccionario (22). Índices especulativos: prohibidos.
2. En tablas de hechos, cada índice encarece cada captura para siempre: el listón de entrada es más alto (la pregunta analítica pertenece a un read model, no a un índice más sobre la verdad).
3. Revisión periódica de uso real (estadísticas del motor): índices no usados se retiran por migración normal (19); duplicados/solapados se consolidan.
4. Creación y retiro **siempre concurrentes** (sin bloquear escritura) — regla de migración (19).
5. Los índices de read models se pueden rehacer libremente (se reconstruyen con la proyección, ETS-009/08).

---

## Impacto sobre la implementación
El DDL inicial crea exactamente los obligatorios (§1); todo índice adicional entra con consulta justificante y registro; el monitoreo de uso de índices se configura desde el arranque.

## ETS relacionados
ETS-009 (15 rendimiento, 08 vistas) · ETS-008 (04 consultas, 18 §G presupuesto) · ETS-010 (06 FKs, 09 particiones, 14 JSONB, 20 rendimiento).

## Riesgos
- GIN sobre JSONB entero (sin rutas declaradas) crea índices enormes → solo rutas/expresiones declaradas en 14.
- Índices únicos sobre particionadas deben incluir la clave de partición → la unicidad de negocio real la garantiza el dominio + clave de idempotencia (05 §2), documentado para no fingir garantías.

## Decisiones habilitadas
Índices por tabla en el DDL, panel de uso de índices (20), lint (07).

## Decisiones bloqueadas hasta el siguiente ETS
Lista índice-por-índice definitiva (nace con el DDL obedeciendo estos patrones) y parámetros de mantenimiento del motor.
