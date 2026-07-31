# 03_TRANSACTIONAL_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Datos transaccionales: lo que pasó.
> Documento de diseño. No implementa nada.

---

## 1. Definición

Un dato transaccional registra un **hecho de negocio**: alguien hizo algo, en un momento, en un contexto. Es el dominio de mayor volumen y la fuente de toda la analítica. Su forma canónica es el **evento de dominio** (ETS-003); los documentos de proceso (una OT, una OC) son agregados cuya historia completa es su secuencia de eventos.

## 2. Inventario

| Familia | Hechos | Eventos canónicos (ETS-003) |
|---|---|---|
| **Checklists e inspecciones** | Respuestas completas con evidencias, resultado y hallazgos | `ChecklistRealizado`, `HallazgoDetectado` |
| **OTs** | Ciclo completo: creación, asignaciones, diagnósticos, repuestos, horas, cierre | `OTCreada`…`OTCerrada` |
| **Combustible y energía** | Tanqueos y cargas (multi-combustible: galones y kWh, mismo hecho), con medidor del momento | `CombustibleRegistrado` |
| **Lecturas** | Horómetro, odómetro, medidores | `LecturaRegistrada` |
| **Horas hombre** | Horas por persona/OT/actividad, con aprobación | `HorasRegistradas` |
| **Movimientos de inventario** | Entradas, salidas, reservas, despachos, ajustes, conteos | `MovimientoRegistrado` |
| **Compras** | Necesidades, OC, aprobaciones, recepciones, facturas asociadas | `OCCreada`, `OCAprobada`, `RecepcionRegistrada` |
| **Asignaciones** | Activo↔contexto/responsable con vigencia; traslados; instalación de componentes | `ActivoAsignado`, `ActivoTrasladado` |
| **Solicitudes** | Reportes de falla y solicitudes de servicio con su ciclo | `SolicitudCreada`… |
| **Documentos y vencimientos** | Pólizas, certificados, permisos con vigencia | `DocumentoRegistrado`, `DocumentoVencido` |

## 3. Reglas del dominio transaccional

1. **Append-only absoluto.** Un hecho registrado no se edita ni se borra. Los errores se corrigen con **eventos compensatorios** (ajuste de inventario, anulación de tanqueo con motivo) que dejan ambos rastros visibles.
2. **El hecho es completo en sí mismo:** lleva su contexto organizacional del momento, su autoría, su tiempo doble (ocurrió/registrado), la versión de configuración usada y las referencias a maestros — se puede leer dentro de diez años sin reconstruir nada.
3. **Imputación en origen:** todo hecho con costo nace imputado (OT, activo, centro de costo vigente); los costos se consolidan solos (cadena del costo, ETS-004). No existe "por clasificar".
4. **Idempotencia por origen:** cada captura lleva una clave de origen (dispositivo+formulario+instante, o clave externa de integración); el mismo hecho enviado dos veces —doble toque, reintento de sincronización, reenvío de un ERP— se registra una sola vez (U-19).
5. **Evidencias adjuntas al hecho:** fotos, firmas y GPS pertenecen al hecho, con su clasificación de seguridad; suben en diferido pero el hecho ya es válido sin ellas si el formulario lo permite.
6. **Estados con historia:** los documentos de proceso (OT, OC, solicitud) tienen estado actual como proyección de su secuencia de transiciones — la pregunta "¿en qué estaba esta OT el martes?" siempre tiene respuesta.
7. **Volumen esperado y particionado conceptual por tiempo y tenant:** los hechos viejos se archivan a almacenamiento frío sin perder consultabilidad (→ `09_DATA_LIFECYCLE.md`), nunca se resumen destruyendo el detalle.
8. **Nacimiento offline:** un hecho puede nacer en el dispositivo sin señal con identidad provisional local; al sincronizar adquiere folio definitivo, conservando su tiempo de negocio original (→ `14_OFFLINE_SYNCHRONIZATION.md`).

## 4. Consumidores

Cada hecho alimenta, vía eventos: proyecciones (Hoja de Vida, Stock, estados), reglas (ETS-005/05), notificaciones, auditoría, indicadores y marts analíticos, y webhooks salientes. Ninguno de esos consumidores puede modificar el hecho: consumen y derivan.
