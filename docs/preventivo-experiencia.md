# Experiencia: Mantenimiento Preventivo (DeltaOps)

Esta guía describe la experiencia de usuario del módulo **Preventivo**
(`modulo.preventivo`) dentro del artefacto DeltaOps: programas de mantenimiento
preventivo, sus actividades, el calendario/Gantt, las acciones de programación,
la integración con el QR del activo y el trabajo sin conexión. La API está
CONGELADA (contrato OpenAPI de `@workspace/module-preventivo`, base
`/api/deltaops/preventivo`, sesión por cookie); esta capa sólo consume ese
contrato. No contiene credenciales ni secretos.

## Mapa de navegación

- **Consola** y **Centro de mantenimiento** incluyen un acceso directo
  **Preventivo** → `/preventivo/programas`.
- Rutas del módulo:
  - `/preventivo/programas` — listado de programas (filtros + búsqueda).
  - `/preventivo/programas/nuevo` — asistente de alta.
  - `/preventivo/programas/:id` — ficha del programa (pestañas).
  - `/preventivo/programas/:id/actividad` — editor de actividad.
  - `/preventivo/calendario` — calendario y Gantt.
  - `/preventivo/escanear` — escaneo QR del activo → su preventivo.
  - `/preventivo/sincronizacion` — cola offline.

## Programas

### Listado
Filtros por **estado** (Borrador, En revisión, Publicado, Suspendido,
Archivado) y **tipo** (catálogo de tenant), búsqueda por texto, vista de tabla o
tarjetas y paginación. Los filtros se reflejan en la URL
(`?estado=&tipo=`), de modo que un enlace reproduce el mismo estado.

### Alta (asistente)
Asistente por pasos: **Generales** (nombre y tipo obligatorios; código,
descripción y clasificación opcionales), **Jerarquía** (programa padre
opcional), **Planes** (referencias `planId` + `version`, tomadas de Planes
reales), **Alcance** (activos reales del inventario de activos) y **Vigencia**
(desde obligatorio, hasta opcional). El identificador del programa se acuña en
cliente para permitir el reintento idempotente. Si se llega con `?activo=` o
`?padreId=`, el asistente ancla ese activo o ese padre.

### Ficha
Pestañas: **General**, **Actividades**, **Programación**, **Generaciones**,
**Versiones** e **Historial**. La jerarquía padre↔hijos es navegable y hay
enlaces cruzados a la orden de trabajo, al activo y al plan relacionados.

#### Flujo de estados (workflow)
Cada transición se realiza con su botón explícito y queda anclada a
`expectedVersion` (bloqueo optimista). Las transiciones disponibles dependen del
estado:

| Estado       | Acciones disponibles           |
|--------------|--------------------------------|
| Borrador     | Enviar a revisión · Archivar   |
| En revisión  | Publicar · Archivar            |
| Publicado    | Suspender · Archivar           |
| Suspendido   | Reanudar · Archivar            |

Las acciones peligrosas (p. ej. archivar) piden confirmación. El contrato de
transición no admite un campo de motivo: no se envía.

## Actividades

El editor de actividad captura: orden (≥ 0), **checklist** (plantilla +
versión), **tiempo estimado** (valor + unidad) y **moneda** (obligatorios);
descripción, **dependencias**, y recursos opcionales: **personal**,
**herramientas** y **repuestos**. Los repuestos y herramientas se eligen del
inventario y del abastecimiento reales; si ninguna de las dos fuentes carga, se
muestra un aviso y se permite indicar los identificadores manualmente
(degradación). Antes de guardar, se validan las dependencias (auto-referencia,
referencias inexistentes y ciclos) para evitar cadenas imposibles.

## Calendario y Gantt

Vistas **Anual** (agrupada por mes), **Mensual**, **Semanal** y **Diaria**
(agrupadas por día), más una vista **Gantt**. Filtros por programa, activo y
estado, reflejados en la URL (`?vista=&programa=&activo=`). La densidad por
período se muestra con una barra de progreso. El Gantt ordena las actividades
por sus **dependencias** (orden topológico): cada actividad empieza tras la
última de sus dependencias y su duración se normaliza a carriles de 8 horas;
ante ciclos o dependencias ausentes degrada de forma estable al orden declarado.
Se construye con componentes propios del Design System (sin librerías pesadas de
gráficos).

## Acciones de programación

Desde la ficha o el calendario:

- **Generar** una orden de trabajo desde una actividad para un activo y fecha
  objetivo. La respuesta indica si quedó **materializada** o **pendiente**, si
  fue **idempotente** y el identificador de la orden (con enlace directo).
- **Reprogramar** una ocurrencia (fecha original → nueva, con motivo).
- **Suspender** por ámbito **programa**, **actividad** o **activo** (con motivo
  y fecha desde).
- **Excluir** un rango de fechas (con motivo; opcionalmente para ciertos
  activos).

Los motivos usan catálogos de tenant cuando existen y admiten texto libre como
reserva.

## QR e integración con el activo

El preventivo **no** define un QR propio: se ancla al QR de la plataforma del
**activo** (`platform.qr`). En la **ficha del activo** aparece la pestaña
**Preventivo**, que lista los programas cuyo alcance declarativo incluye ese
activo, con enlaces a la ficha del programa y a su calendario filtrado, y un
acceso para crear un programa ya anclado al activo. La página **Escanear**
resuelve el código con el resolvedor del servidor (fuente primaria) y, sólo como
degradación, interpretación local; el destino es la pestaña **Preventivo** del
activo escaneado.

## Offline First

Todas las mutaciones pasan por una cola local aislada por módulo y por tenant
con el namespace `deltaops:preventivo:cola:<tenant>`. Cada operación acuña
identificadores de cliente (`id` y `opId`, UUID) para que el reenvío sea
**idempotente**. La degradación a la cola ocurre **sólo** ante errores de red;
los errores de negocio (por ejemplo, conflicto de versión 409) se propagan sin
encolar. La página **Sincronización** muestra las operaciones pendientes, el
estado de conexión y los conflictos, y permite procesar la cola contra `/sync`,
que devuelve un recibo por operación (aplicada / idempotente / conflicto).

## Notas de contrato

- Los cuerpos de comando validan exactamente contra el OpenAPI congelado
  (`additionalProperties: false`): los campos vacíos u opcionales no se envían.
- Los objetos `sla`, `recursos` y `datos`, así como las respuestas de lectura,
  son opacos en el contrato; el frontend usa tipos tolerantes y los pasa sin
  transformar.
