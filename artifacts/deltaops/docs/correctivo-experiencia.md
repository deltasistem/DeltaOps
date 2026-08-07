# Experiencia de Mantenimiento Correctivo (DeltaOps)

Este documento describe la experiencia de usuario del módulo **Correctivo** de
DeltaOps: qué puede hacer cada rol, cómo fluye el trabajo desde que se reporta
una falla hasta que se cierra la intervención, y cómo se comporta la aplicación
sin conexión. No contiene credenciales ni secretos: la sesión se resuelve por
cookie del ecosistema y la autorización la gobierna el backend.

## Alcance

El correctivo cubre el ciclo completo de una falla no planificada:

1. **Solicitud** de mantenimiento correctivo (reporte de la falla).
2. **Diagnóstico** anclado a una plantilla versionada.
3. **Generación** de la orden de trabajo correctiva.
4. **Intervención** con cuadrillas y repuestos (reservar / consumir / devolver).
5. **Historial de eventos** del activo, con detección de fallas reincidentes.

Todo se apoya en el contrato OpenAPI **congelado** del módulo. La aplicación no
inventa campos ni acciones: cada botón envía exactamente la transición que el
motor de Workflow admite, y el backend es la autoridad final.

## Navegación y accesos

- **Consola +** y **Centro de mantenimiento**: enlace directo a *Correctivo*.
- **Listado de solicitudes** (`/correctivo/solicitudes`): buscador, filtros por
  estado / origen / activo (los filtros se pueden fijar desde la URL, de modo
  que un enlace comparte la vista exacta), orden y paginación. Vista en tabla o
  en tarjetas.
- **Escaneo QR** (`/correctivo/escanear`): resuelve el código de un activo y
  ofrece crear una solicitud ya anclada a ese activo. El correctivo **no** tiene
  QR propio: se alcanza desde el QR del activo.
- **Ficha del activo → pestaña Correctivo**: historial de eventos, solicitudes
  correctivas del activo y registro manual de un evento.

## Flujo de la solicitud

La solicitud recorre estados gobernados por el Workflow. La interfaz solo ofrece
las transiciones válidas para el estado actual; cada acción es un botón que
envía su transición real:

| Estado          | Acción ofrecida                    |
| --------------- | ---------------------------------- |
| Borrador / Registrada | Enviar a triage              |
| En triage       | Iniciar diagnóstico                |
| En diagnóstico  | Enviar a validación                |
| En validación   | Aprobar · Rechazar (exige motivo)  |

- **Rechazar** es una acción destructiva y **exige un motivo** obligatorio; el
  resto de acciones se confirman sin motivo.
- Al **crear** una solicitud se acuña en el cliente un identificador estable
  para que reintentos y sincronizaciones sean idempotentes.
- La ficha organiza la información en pestañas: **General**, **Diagnóstico**,
  **Evidencias**, **Comentarios** e **Historial**. La pestaña activa se puede
  fijar por URL (`?tab=`).
- Las **evidencias** son referencias a adjuntos ya registrados (foto, video,
  documento, audio); la interfaz no sube binarios, solo enlaza su referencia.

## Diagnóstico anclado a plantilla + versión

El diagnóstico se captura con un **formulario dinámico** anclado a una plantilla
y a su **versión** concreta. Esto garantiza trazabilidad: se sabe exactamente
qué formulario y versión se usaron. La causa raíz y la clasificación (tipo /
modo de falla, causa, efecto, severidad, impacto) viajan como campos declarados
del comando; el resto de la captura se conserva íntegra dentro del bloque libre
de *respuestas* del contrato, sin perder información.

## Generación de la orden correctiva

Desde una solicitud aprobada se **genera la orden de trabajo correctiva**. La
operación es idempotente (un reintento con el mismo identificador no duplica la
orden). Al materializarse, la ficha ofrece un enlace directo a la orden en el
módulo de Órdenes y permite iniciar la intervención.

## Intervención, cuadrillas y repuestos

La intervención también es un Workflow por botón:

| Estado        | Acción ofrecida        |
| ------------- | ---------------------- |
| Preparación   | Asignar cuadrillas     |
| Asignación    | Iniciar ejecución      |
| Ejecución     | Enviar a verificación  |
| Verificación  | Cerrar intervención    |

- **Cuadrillas** (correctivo mayor): cada cuadrilla lleva responsables (con su
  rol) y recursos (equipos, vehículos, etc.).
- **Repuestos**: se pueden **reservar**, **consumir** (parcial permitido) y
  **devolver** líneas de inventario. Cuando un movimiento genera una solicitud
  de compra por faltante, la interfaz muestra un enlace profundo a esa solicitud
  en el módulo de **Abastecimiento**.

## Historial de eventos del activo y reincidencia

La pestaña **Correctivo** de la ficha del activo muestra el historial de eventos
(fallas reportadas / confirmadas, reparaciones, puestas en servicio) y marca las
**fallas reincidentes**. La reincidencia respeta el indicador del backend cuando
está disponible y, si no, se deriva localmente detectando el mismo modo de falla
repetido. Ante reincidencias, la interfaz sugiere evaluar un plan correctivo o
un análisis de causa raíz. Desde aquí también se registra un **evento manual**.

## Offline First

El correctivo funciona sin conexión. Las operaciones de escritura se intentan en
línea y, **solo** si fallan por un problema de **red**, se **encolan** localmente
para sincronizarse después. Los errores de negocio (por ejemplo, un conflicto de
versión) **no** se encolan: se muestran de inmediato.

- La cola es **propia del módulo y del tenant** (aislada de otros módulos), con
  el espacio de nombres `deltaops:correctivo:cola:<tenant>`.
- Cada operación encolada lleva un identificador de operación estable que
  permite un **replay idempotente**: si una operación ya se aplicó, la
  sincronización la reconoce sin duplicar efectos.
- La pantalla de **Sincronización** (`/correctivo/sincronizacion`) muestra las
  operaciones pendientes, permite procesarlas, reintentar o descartar, y refleja
  el recibo del servidor (aplicadas / idempotentes / conflictos / rechazadas).
- Un aviso global informa cuando hay trabajo pendiente por sincronizar.

## Principios de diseño

- **El contrato manda**: la interfaz nunca envía campos ni acciones fuera del
  contrato congelado.
- **El backend es la autoridad**: la presentación de acciones por estado es una
  ayuda; el motor rechaza cualquier transición inválida.
- **Trazabilidad**: identificadores de cliente para idempotencia, diagnósticos
  anclados a versión de plantilla y evidencias por referencia.
- **Sin bloqueos por conectividad**: el trabajo de campo continúa sin conexión y
  se concilia de forma segura al recuperarla.
