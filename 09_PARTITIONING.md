# 09_PARTITIONING.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de particiones PostgreSQL: qué tablas, cómo y su administración.
> Materializa ETS-009/14 en particionamiento declarativo. Documento de diseño. Sin SQL.

---

## 1. Qué se particiona

**Por rango de tiempo sobre `creado_en` (fecha de registro — los bloques jamás se reabren, ETS-009/14 §3):**

| Tabla | Grano |
|---|---|
| `evento_<dominio>` (todas) | Mensual |
| `lectura_medidor` | Mensual (más fino si IoT escala) |
| `tanqueo`, `carga_energia` | Mensual |
| `movimiento` (inventario) | Mensual |
| `disparo_regla`, `envio` (notificaciones), `intercambio`, `entrega_webhook` | Mensual |
| `acceso_sensible`, `cadena_evento` (auditoría) | Mensual |
| `bitacora_recibida` (móvil) | Mensual |
| Fotos de corte (`backlog_ot`, saldos históricos en `lectura_*`) | Por periodo del corte |

**No se particiona:** maestros y agregados (volumen moderado, acceso puntual), configuración y versiones, tablas pequeñas de control. Hechos de bajo volumen (aprobaciones, recepciones) arrancan sin particionar con el patrón listo para adoptarlo cuando el volumen lo pida (19).

**Por tenant:** no en el arranque (aislamiento lógico + RLS, 01); el sub-particionado o las tablas dedicadas por tenant grande quedan como palanca prevista (21) — posible porque `id_tenant` está en toda clave de consulta.

## 2. Cómo

- Particionamiento **declarativo por rango**; PK compuesta `(id, creado_en)` (05 §2).
- Particiones futuras creadas por anticipado por el trabajo de mantenimiento de plataforma (siempre existen N meses adelante; alarma si faltan) — jamás una inserción sin partición destino.
- Partición por defecto (default) como red de seguridad **vigilada**: contenido en ella = alerta (algo escribió fuera de rango).
- Índices por partición heredados de la madre (08); BRIN en las tibias.

## 3. Ciclo de vida de una partición (temperaturas, ETS-009/10)

```text
CALIENTE  partición actual + recientes: índices completos
TIBIA     tras N meses: compresión, índices reducidos (job de plataforma)
FRÍA      tras horizonte de política: exportada a objetos en formato
          columnar abierto + verificación de huella; en el motor queda
          su registro (rango, ubicación, huella) — luego DETACH y drop
          físico de la partición YA EXPORTADA Y VERIFICADA
```

- El único "drop" del sistema ocurre aquí y **no borra historia**: la mueve verificada al frío (NP-13); la operación es auditada y reversible por rehidratación (ETS-009/10 §3).
- Horizontes por familia y tenant según política de retención (configuración, dentro de mínimos de plataforma).

## 4. Consultas

- Toda consulta a tablas particionadas lleva predicado de tiempo (poda de particiones) — las consultas operativas lo tienen naturalmente (rangos recientes); las históricas van por read models/snapshots (ETS-009/15 §5).
- Las consultas por `fecha_negocio` usan índices `(id_tenant, fecha_negocio)` dentro de las particiones relevantes acotadas por `creado_en` (la llegada tardía tiene cota práctica: la política de sincronización define el desfase máximo esperable, y la consulta abre ese margen).

---

## Impacto sobre la implementación
Las tablas listadas nacen particionadas en su primer DDL (reparticionar después es caro); el job de creación anticipada y los jobs de temperatura son parte del arranque de plataforma, no un añadido posterior.

## ETS relacionados
ETS-009 (10 archivado, 14 particionado, 15 rendimiento) · ETS-010 (05 PK compuesta, 08 índices, 21 evolución).

## Riesgos
- Consultas sin predicado de tiempo escanean todas las particiones → lint de consultas + revisión de planes en las rutas calientes (20).
- El desfase offline extremo (dispositivo que sincroniza meses después) cae en la partición de hoy con `fecha_negocio` vieja → correcto por diseño; los read models por fecha de negocio lo absorben (ETS-009/08 §3).

## Decisiones habilitadas
Jobs de mantenimiento de particiones, política de temperaturas por familia, exportación a frío (21).

## Decisiones bloqueadas hasta el siguiente ETS
Granos definitivos por volumen real (mensual es el punto de partida; afinar exige datos de producción) y el formato columnar concreto del frío.
