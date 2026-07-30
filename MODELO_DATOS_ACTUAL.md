# MODELO_DATOS_ACTUAL.md

> Modelo de datos actual de **SGMA** (PostgreSQL + Drizzle ORM).
> Fuente de verdad del esquema: `lib/db/src/schema/*.ts`.
> Documento de solo lectura. No se modificó el esquema ni se generaron migraciones.

## Resumen

- **Motor:** PostgreSQL.
- **9 tablas.**
- **Todas las PK:** `serial` (entero autoincremental).
- **Claves foráneas:** **ninguna** — las relaciones se expresan con columnas `*_id` enteras sin `REFERENCES` (integridad referencial diferida).
- **Restricciones no-PK:** solo `work_orders.numero` es `UNIQUE`.
- **Defaults / NOT NULL:** varios (ver por tabla).
- **Fechas:** `timestamp with time zone`.
- **Catálogos:** los tipos/estados/prioridades son `text` libre (no enums ni tablas de catálogo).

---

## Tabla: `locations` (Ubicaciones)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| nombre | text | NOT NULL |
| tipo | text | NOT NULL |
| direccion | text | — |
| ciudad | text | — |

## Tabla: `work_centers` (Centros de trabajo)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| nombre | text | NOT NULL |
| tipo | text | NOT NULL |
| descripcion | text | — |
| responsable | text | — |

## Tabla: `assets` (Activos / Equipos)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| codigo | text | NOT NULL |
| nombre | text | NOT NULL |
| tipo | text | NOT NULL |
| marca | text | — |
| modelo | text | — |
| serie | text | — |
| anio | integer | — |
| ubicacion_id | integer | FK lógica → `locations.id` (sin constraint) |
| centro_trabajo_id | integer | FK lógica → `work_centers.id` (sin constraint) |
| estado | text | NOT NULL, default `'operativo'` |
| responsable | text | — |
| horometro | double precision | — |
| kilometraje | double precision | — |
| horas_acumuladas | double precision | — |
| vida_util | integer | — |
| image_url | text | — |
| notas | text | — |

> **Nota crítica EAM:** `ubicacion_id` y `centro_trabajo_id` son relaciones **fijas embebidas** en la fila. No hay empresa, operación, proyecto ni centro de costo, ni historial de cambios de asignación. `codigo` **no** es `UNIQUE` actualmente.

## Tabla: `technicians` (Personal técnico)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| (campos de identidad y rol — texto libre) | text | ver esquema |

> Roles como texto libre; no es un sistema de usuarios/permisos.

## Tabla: `suppliers` (Proveedores)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| (nombre, contacto, calificación, etc.) | text / numérico | ver esquema |

## Tabla: `spare_parts` (Repuestos)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| codigo | text | NOT NULL |
| descripcion | text | NOT NULL |
| categoria | text | — |
| stock | integer | NOT NULL, default `0` |
| stock_minimo | integer | NOT NULL, default `0` |
| stock_maximo | integer | — |
| costo_unitario | double precision | — |
| ubicacion_id | integer | FK lógica → `locations.id` (sin constraint) |

> `codigo` **no** es `UNIQUE`. El saldo `stock` se actualiza junto con `stock_movements` en transacción.

## Tabla: `stock_movements` (Movimientos de inventario)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| repuesto_id | integer | NOT NULL, FK lógica → `spare_parts.id` (sin constraint) |
| tipo | text | NOT NULL (entrada/salida) |
| cantidad | integer | NOT NULL |
| motivo | text | — |
| fecha | timestamptz | NOT NULL, default `now()` |

> Tabla de auditoría de inventario. Movimiento + actualización de saldo son atómicos (una transacción).

## Tabla: `work_orders` (Órdenes de trabajo)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| numero | text | NOT NULL, **UNIQUE** |
| equipo_id | integer | NOT NULL, FK lógica → `assets.id` |
| tipo | text | NOT NULL |
| prioridad | text | NOT NULL, default `'media'` |
| estado | text | NOT NULL, default `'pendiente'` |
| tecnico_id | integer | FK lógica → `technicians.id` |
| centro_trabajo_id | integer | FK lógica → `work_centers.id` |
| descripcion | text | — |
| reporte_falla | text | — |
| diagnostico | text | — |
| causa_raiz | text | — |
| solucion | text | — |
| horas_estimadas | double precision | — |
| horas_reales | double precision | — |
| costo_mano_obra | double precision | — |
| costo_repuestos | double precision | — |
| fecha_creacion | timestamptz | NOT NULL, default `now()` |
| fecha_programada | timestamptz | — |
| fecha_cierre | timestamptz | — |

> `costoTotal` **no se almacena**: se calcula (`costo_mano_obra + costo_repuestos`). `numero` (`OT-NNNNN`) se genera en servidor con reintento respaldado por el `UNIQUE`.

## Tabla: `maintenance_plans` (Planes de mantenimiento preventivo)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | serial | PK |
| nombre | text | NOT NULL |
| equipo_id | integer | NOT NULL, FK lógica → `assets.id` |
| tipo_frecuencia | text | NOT NULL |
| intervalo | integer | NOT NULL |
| unidad | text | — |
| descripcion | text | — |
| proxima_fecha | timestamptz | — |
| proximo_horometro | double precision | — |
| activo | boolean | NOT NULL, default `true` |

---

## Relaciones (todas lógicas, sin FK en BD)

```text
locations 1───∞ assets            (assets.ubicacion_id)
locations 1───∞ spare_parts       (spare_parts.ubicacion_id)
work_centers 1───∞ assets         (assets.centro_trabajo_id)
work_centers 1───∞ work_orders    (work_orders.centro_trabajo_id)
assets 1───∞ work_orders          (work_orders.equipo_id)
assets 1───∞ maintenance_plans    (maintenance_plans.equipo_id)
technicians 1───∞ work_orders     (work_orders.tecnico_id)
spare_parts 1───∞ stock_movements (stock_movements.repuesto_id)
suppliers  (sin relación forzada con otras tablas)
```

## Llaves y restricciones — inventario completo

| Tabla | PK | UNIQUE | FK (BD) | NOT NULL destacados | Defaults |
|---|---|---|---|---|---|
| locations | id | — | — | nombre, tipo | — |
| work_centers | id | — | — | nombre, tipo | — |
| assets | id | — | — | codigo, nombre, tipo, estado | estado=`operativo` |
| technicians | id | — | — | (ver esquema) | — |
| suppliers | id | — | — | (ver esquema) | — |
| spare_parts | id | — | — | codigo, descripcion, stock, stock_minimo | stock=0, stock_minimo=0 |
| stock_movements | id | — | — | repuesto_id, tipo, cantidad, fecha | fecha=now() |
| work_orders | id | **numero** | — | numero, equipo_id, tipo, prioridad, estado, fecha_creacion | prioridad=`media`, estado=`pendiente`, fecha_creacion=now() |
| maintenance_plans | id | — | — | nombre, equipo_id, tipo_frecuencia, intervalo, activo | activo=true |

## Brechas del modelo frente al requerimiento EAM

1. **Sin dimensiones de tenant:** faltan `empresa`, `operacion`, `proyecto`, `centro_costo` (como tablas y como columnas de scoping en cada entidad).
2. **Sin historial de asignaciones:** el activo guarda ubicación/centro actuales en su fila; se requiere una tabla tipo `asset_assignments` con vigencia (`desde`, `hasta`, empresa/operación/centro/proyecto/ubicación) para reflejar el movimiento del activo en su vida útil.
3. **Sin integridad referencial:** ninguna FK; riesgo de huérfanos.
4. **Sin unicidad de negocio:** `assets.codigo` y `spare_parts.codigo` deberían ser únicos (probablemente por tenant).
5. **Catálogos como texto libre:** `estado`, `tipo`, `prioridad`, `tipo_frecuencia` deberían ser enums o tablas de catálogo.
6. **Sin usuarios/roles/permisos** en el modelo.
7. **Faltan entidades** para: checklist preoperacional, combustible, horas hombre, hoja de vida (documentos/fotos/componentes).
