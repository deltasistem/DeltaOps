# 04_APPEND_ONLY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia append-only: qué aplica, qué no, y cómo funciona en la práctica.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. La regla

**Ningún hecho ni evento se actualiza ni se borra jamás.** La historia de DeltaOps solo crece. Es la garantía que sostiene la auditoría (06), el offline (nada capturado se pierde, U-16), el replay (07-08) y la confianza del cliente enterprise: lo que pasó, consta.

## 2. Qué es append-only (estricto)

| Dato | Por qué |
|---|---|
| Todos los hechos transaccionales (03) | Son el registro de la realidad operativa |
| Todos los eventos de dominio | Son la fuente de la verdad y la auditoría (06) |
| Versiones de configuración publicadas (05) | Un hecho referenció esa versión: debe existir para siempre tal cual |
| Versiones de documentos (05) | Las referencias históricas apuntan a su edición exacta |
| Bitácoras de sincronización procesadas | Evidencia de qué llegó de qué dispositivo y qué se decidió |
| Reportes emitidos / exportaciones entregadas | Lo entregado queda congelado (ETS-006) |
| Registros de acceso a datos Restringido | Auditoría de la auditoría |

## 3. Qué NO es append-only

| Dato | Régimen |
|---|---|
| Estado vigente de los agregados (02) | Se actualiza en cada comando — es derivado protegido, la historia es la verdad |
| Read models y vistas materializadas (07-08) | Se actualizan/reconstruyen libremente: son desechables |
| Borradores (configuración no publicada, formularios a medio llenar en el dispositivo) | Editables y descartables: aún no son hechos |
| Caches, sesiones, colas en tránsito | Efímeros por naturaleza |
| Datos personales bajo derecho de supresión | Excepción legal gobernada: seudonimización que preserva la integridad de la historia sin conservar el dato personal (ETS-006/13) |

La frontera exacta: **algo se vuelve inmutable en el instante en que el dominio lo acepta como hecho** (el comando se confirma, la versión se publica, el reporte se emite).

## 4. Cómo funciona

### Correcciones
Solo por compensación (`Corregir*`, ETS-008/03): el hecho corrector referencia al corregido con motivo obligatorio; ambos permanecen; los read models proyectan el neto y muestran la cadena a quien la pida (transparencia con claridad: la vista normal muestra el valor corregido con indicador; el detalle muestra la cadena completa).

### "Borrar"
No existe. Lo más parecido: baja lógica para maestros (11) y anulación por compensación para hechos (el hecho anulado consta como anulado, con quién y por qué).

### Protección estructural
- Los contratos ETS-008 no ofrecen operaciones de edición/borrado de hechos — la restricción empieza en la API.
- La capa de persistencia rechaza modificaciones sobre almacenes declarados append-only (privilegio del propio sistema restringido: ni siquiera operaciones administrativas los reescriben; ETS-007/12).
- La cadena de integridad de auditoría (06 §3) hace además **detectable** cualquier alteración que burlara las capas anteriores.

### Crecimiento
Append-only implica crecimiento perpetuo — se administra, no se poda: particionado por tiempo (14), archivado por temperatura sin pérdida (10), snapshots para no releer historias largas (09). **La respuesta al volumen nunca es borrar historia.**

## 5. Tiempo doble como consecuencia

Como nada se edita, la llegada tardía es normal (offline, correcciones): cada hecho lleva `fechaNegocio` y `fechaRegistro`, los read models se proyectan por fecha de negocio y los cortes reportados declaran contra qué fecha operan (ETS-006). El "cierre" de un periodo es un hecho más (CongelarPeriodo) que congela una foto emitida — los hechos tardíos posteriores existen y se reportan como diferencias del periodo siguiente, práctica contable estándar.
