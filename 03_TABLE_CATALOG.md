# 03_TABLE_CATALOG.md

> **DeltaOps — ETS-010 · v1.0** · Catálogo de tablas por esquema: el inventario físico completo (nombres y propósito, sin DDL).
> Patrones de ETS-009: agregado = tabla de estado vigente + eventos; hecho transaccional = tabla append-only; versionable = definición + versiones.
> Documento de diseño. Sin SQL.

---

## 0. Patrones de tablas (se repiten por dominio)

| Patrón | Tablas que genera | Ejemplo |
|---|---|---|
| **Agregado** (ETS-009/02) | `<entidad>` (estado vigente) + participación en `evento` del esquema | `activo` |
| **Hecho** (ETS-009/03) | `<hecho>` append-only particionada por tiempo | `tanqueo` |
| **Versionable** (ETS-009/05) | `<def>_definicion` + `<def>_version` (inmutable) + `<def>_vigencia` | `formulario_*` |
| **Outbox** | `mensajeria.outbox_<modulo>` + `mensajeria.cursor_consumidor` | — |
| **Eventos** | `evento_<dominio>` append-only particionada, con cadena de huellas | `evento_ordenes_trabajo` |

Columnas universales de todo registro: `id` (UUID), `id_tenant`, `id_contexto`, tiempos según patrón (13), y en hechos: actor, canal, marca IA, tiempo doble, versiones de configuración, clave de idempotencia, referencia a compensado (22).

## 1. Catálogo por esquema (tablas principales)

### `nucleo`
`catalogo_canonico`, `catalogo_canonico_valor`, `unidad_medida`, `kpi_canonico`.

### `identidad`
`cuenta`, `credencial`, `factor_autenticacion`, `sesion_refresco` (rotación única), `cuenta_servicio`, `api_key` (huella, no secreto), `dispositivo` (registro móvil), `credencial_iot`.

### `organizacion`
`tenant`, `nodo_organizacional` (+ `nodo_vigencia`), `membresia` (con vigencias), `rol`, `rol_permiso`, `delegacion`, `licencia_asignada`.

### `configuracion`
`configuracion_definicion`, `configuracion_version`, `configuracion_vigencia`, `formulario_definicion/_version/_vigencia`, `catalogo_tenant/_version`, `plantilla_activo/_version`, `parametro/_version`, `publicacion` (hecho), `paquete_movil_emitido` (hecho).

### `auditoria`
`cadena_evento` (huella por evento y eslabón anterior), `sello_periodo`, `acceso_sensible` (hecho), `verificacion_cadena` (resultados).

### `activos`
`activo` (estado vigente + atributos dinámicos JSONB), `componente`, `activo_componente` (hechos de ensamble), `asignacion` (hecho con vigencia), `medidor`, `lectura_medidor` (hecho, particionada, con estado normal/apartada), `reinicio_medidor` (hecho), `evento_activos`.

### `mantenimiento`
`plan_preventivo/_version`, `rutina/_version`, `programacion`, `cumplimiento_plan` (hecho), `evento_mantenimiento`.

### `ordenes_trabajo`
`solicitud`, `orden_trabajo` (estado vigente + versión de workflow), `ot_transicion` (hecho), `registro_trabajo` (hecho HH), `checklist_diligenciado` (hecho, respuestas JSONB por versión de formulario), `hallazgo`, `ot_firma` (hecho), `evento_ordenes_trabajo`.

### `inventario`
`item`, `bodega`, `saldo` (estado vigente por ítem-bodega), `movimiento` (hecho, particionada), `conteo` (hecho) + `conteo_detalle`, `reconciliacion_saldo` (resultados), `evento_inventario`.

### `combustible_energia`
`tanqueo` (hecho, particionada), `carga_energia` (hecho, particionada), `tanque`, `rendimiento_referencia`, `evento_combustible_energia`.

### `compras`
`proveedor`, `solicitud_compra`, `aprobacion` (hecho, SoD), `orden_compra`, `recepcion` (hecho), `factura_registrada` (hecho), `evento_compras`.

### `bodega`
`despacho` (hecho), `devolucion` (hecho), `ubicacion_fisica`, `evento_bodega`.

### `flujo_trabajo`
`workflow_definicion/_version/_vigencia`, `workflow_instancia` (estado vigente por OT u objeto gobernado).

### `reglas`
`regla_definicion/_version/_vigencia`, `disparo_regla` (hecho, particionada, incluye simulados marcados).

### `notificaciones`
`plantilla_notificacion/_version`, `envio` (hecho, particionada), `acuse` (hecho), `preferencia_usuario`.

### `archivos`
`archivo` (metadato: dueño lógico, huella, estado, clasificación), `documento` + `documento_version`, `subida_pendiente` (planes de partes), `acceso_archivo` (hecho para Restringido).

### `busqueda` / `lectura_busqueda`
`cursor_indexacion`; índice: `entrada_indice` por tenant con vector textual.

### `reportes`
`reporte_definicion/_version`, `emision` (hecho congelado; binario en objetos).

### `analitica`
`mart_definicion/_version`, `cursor_mart`, `diccionario_publicado`.

### `ia`
`conversacion`, `mensaje` (con fuentes citadas), `sugerencia` (hecho con trazabilidad completa), `retroalimentacion` (hecho), `calibracion_capacidad/_version`.

### `movil`
`bitacora_recibida` (hecho: lote crudo conservado), `resultado_comando` (por clave de idempotencia), `estado_dispositivo` (cursor, versiones, pendientes).

### `integracion`
`conexion`, `mapeo/_version`, `intercambio` (traza, particionada), `bandeja_error`, `suscripcion_webhook`, `entrega_webhook` (hecho, particionada).

### `mensajeria`
`outbox_<modulo>` (una por módulo dueño), `cursor_consumidor`, `evento_apartado` (bandeja de eventos inprocesables).

### `plataforma`
`migracion_aplicada`, `trabajo_programado`, `ejecucion_trabajo`, `resultado_reconciliacion`, `restauracion_prueba`.

### `lectura_*` (derivados, regenerables)
Por módulo según ETS-009/07-08: `hoja_vida_activo`, `ficha_activo`, `expediente_ot`, `backlog_ot` (fotos), `kpi_periodo_nodo`, `costo_periodo_activo`, `consumo_periodo_activo`, `rotacion_item`, `descendencia_organizacional`, `cumplimiento_preventivo`, `resumen_sync_dispositivo`, `configuracion_resuelta`, `linea_tiempo_entidad` (en `audit_consulta`), tablas dimensionales en `marts`.

---

## Impacto sobre la implementación
Este es el inventario contra el que se escribirá el DDL: ninguna tabla se crea fuera de este catálogo sin actualizarlo primero (misma regla que el catálogo de endpoints ETS-008/05).

## ETS relacionados
ETS-003 (agregados y eventos) · ETS-005 (configuración) · ETS-006 (familias de datos) · ETS-009 (02-08 patrones de persistencia) · ETS-008 (03/04 comandos y consultas que estas tablas sirven).

## Riesgos
- El catálogo es grande: el DDL debe generarse por módulo y por fases (el orden lo dará el plan de implementación), no en un big bang.
- Divergencia catálogo↔BD real → la revisión de migraciones (19) exige actualizar este catálogo y el diccionario (22) en el mismo cambio.

## Decisiones habilitadas
Relaciones (04), claves (05-06), índices por tabla (08), particiones por tabla (09), diccionario de datos (22).

## Decisiones bloqueadas hasta el siguiente ETS
Columnas exhaustivas por tabla (el diccionario 22 fija las universales y las claves; el detalle completo por columna se fija con el DDL de implementación), y cualquier creación real.
