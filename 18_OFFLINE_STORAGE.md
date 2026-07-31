# 18_OFFLINE_STORAGE.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia física de sincronización offline: las estructuras PostgreSQL que sostienen el protocolo ETS-008/12.
> La persistencia local del dispositivo (SQLite/colas móviles) pertenece a la implementación móvil; aquí, el lado servidor.
> Documento de diseño. Sin SQL.

---

## 1. Piezas físicas en el esquema `movil`

| Tabla | Contenido |
|---|---|
| `bitacora_recibida` | El lote crudo recibido, conservado como hecho (particionada 09): dispositivo, rango de secuencias, recepción, huella del lote — evidencia de qué llegó exactamente (cero pérdida demostrable, U-16) |
| `resultado_comando` | El corazón de la idempotencia: por `clave_idempotencia` (dispositivo+secuencia), el resultado completo original (confirmado/rechazado/en revisión + respuesta) — reenviar responde esto sin reprocesar (ETS-008/12 §4) |
| `estado_dispositivo` | Cursor de bajada, última sync, versiones vigentes del dispositivo (protocolo/paquete/esquema), contadores de pendientes — la fuente de `GET /sync/estado` |
| (en `identidad`) `dispositivo` | Registro, credencial, revocación (ETS-008/12 §2) |
| (en `configuracion`) `paquete_movil_emitido` | Qué paquete resuelto recibió cada dispositivo y cuándo (ETS-009/05 §2) |

## 2. Reglas físicas

1. **`resultado_comando` es único por clave de idempotencia** (constraint física, 12 §1) y se escribe **en la misma transacción** que el comando aceptado: la respuesta original existe desde el mismo instante que el hecho — no hay ventana en la que un reintento duplique.
2. Los hechos confirmados de la bitácora se escriben en las tablas de su dominio como cualquier hecho (03), con su UUID nacido en el dispositivo (05 §1), `canal = movil`, tiempo doble real y `clave_idempotencia` — el offline no tiene tablas de hechos aparte: **la verdad es una sola**.
3. Los comandos en revisión persisten su estado en la bandeja del dominio correspondiente (el hecho existe apartado, ETS-009/03 §8 aplicado a revisiones humanas); `resultado_comando` guarda la remisión.
4. **La bajada no tiene tablas propias de datos**: el paquete de alcance se arma desde los read models existentes (`lectura_*`, `configuracion_resuelta`) filtrados por el alcance del usuario; solo el **cursor** y las **versiones** persisten (delta por cursor = qué cambió desde entonces, servido por los mismos proyectores que marcan versión de fila).
5. Read models que alimentan paquetes llevan **marca de versión de fila** (secuencia de cambio) para el delta incremental — decisión física: columna de secuencia global por tabla de lectura sincronizable, indexada.
6. Retención: `bitacora_recibida` sigue política de auditoría (evidencia); `resultado_comando` retiene mientras el dispositivo pueda reenviar (ventana generosa, luego temperatura fría).

---

## Impacto sobre la implementación
El procesador de bitácoras se implementa contra estas tablas con la transacción comando+resultado; los read models sincronizables nacen con columna de secuencia de cambio; el armado de paquetes es lectura pura.

## ETS relacionados
ETS-008 (12 contrato sync) · ETS-009 (12 identidad offline, 03 hechos) · ETS-007 (06 offline técnico) · ETS-006 (14 conflictos) · ETS-010 (05 claves, 12 constraints).

## Riesgos
- `resultado_comando` crece con cada captura móvil → particionado/temperatura con ventana de reenvío definida; la clave de idempotencia en el hecho mismo permite reconstruir en el extremo.
- Deltas por secuencia de fila exigen disciplina en proyectores (toda escritura marca secuencia) → parte del framework de proyección (10).

## Decisiones habilitadas
Implementación del procesador de bitácoras, armado de paquetes delta, panel de soporte por dispositivo.

## Decisiones bloqueadas hasta el siguiente ETS
Diseño de la persistencia local del dispositivo (implementación móvil) y ventanas de retención finas (con datos de uso real).
