# Experiencia: Enterprise Analytics & KPI Platform (DeltaOps)

Esta guía describe la experiencia de usuario de la sección **Analytics**
(`modulo.analytics`) dentro del artefacto DeltaOps: catálogo de indicadores,
dashboards del sistema y personalizados, el renderizador declarativo de widgets,
los filtros globales reutilizables, la evaluación ad-hoc con snapshots y el
trabajo sin conexión. La sección es de **solo lectura** respecto de los datos
operativos: no crea ni transiciona entidades de otros módulos; sólo lee sus read
models y evalúa indicadores. La API (base `/api/deltaops/analytics`, sesión por
cookie) es la autoridad de permisos y de la forma de los datos; esta capa sólo
la consume. No contiene credenciales ni secretos.

## Mapa de navegación

- **Consola** y **Centro de mantenimiento** incluyen un acceso directo
  **Analytics** → `/analytics`.
- Rutas de la sección:
  - `/analytics` — inicio (dashboards del sistema, propios y catálogo).
  - `/analytics/indicadores` — catálogo de indicadores por categoría.
  - `/analytics/indicadores/:clave` — ficha del indicador (definición,
    evaluación ad-hoc e historial de snapshots).
  - `/analytics/dashboards/:id` — renderizador de un dashboard.
  - `/analytics/dashboards/nuevo` — editor para crear un dashboard.
  - `/analytics/dashboards/:id/editar` — editor de un dashboard propio.
  - `/analytics/sincronizacion` — estado offline (cola y caché por tenant).

## Roles y capacidades

Las capacidades de **presentación** deciden qué acciones se OFRECEN; el backend
rechaza cualquier intento no autorizado (nunca hay bypass):

- **admin** / **platform_admin**: leer, componer dashboards, exportar
  (snapshots) y administrar.
- **operador**: leer, componer dashboards y exportar.
- **lector**: solo lectura (sin crear/editar dashboards ni materializar
  snapshots).

## Inicio (`/analytics`)

Presenta los **8 dashboards del sistema** (ejecutivo, operativo, inventario,
activos, órdenes, correctivo, preventivo, compras), los **dashboards propios**
del usuario (creados o clonados) y un acceso al **catálogo de indicadores**. Si
un dashboard del sistema aún no está sembrado en el tenant, se indica de forma
honesta en lugar de ofrecer un enlace roto. Quienes pueden componer dashboards
ven el botón **Nuevo dashboard**.

## Catálogo de indicadores (`/analytics/indicadores`)

Lista los indicadores agrupados por **categoría**, con su clave, unidad, formato
y fuente declarativa. El filtro de categoría se refleja en la URL
(`?categoria=`) para reproducir el mismo estado desde un enlace. Cada indicador
enlaza a su ficha.

### Ficha del indicador (`/analytics/indicadores/:clave`)

- **Definición declarativa** legible: clave, categoría, fuente
  (módulo/dataset), tipo de cálculo, campo, agrupadores, unidad/formato,
  umbrales (bueno/alerta/crítico con el sentido «mayor es mejor» / «menor es
  mejor») y metas por periodo.
- **Evaluación ad-hoc**: evalúa el indicador con los filtros globales
  (persistidos en la URL). Muestra el valor formateado, el **semáforo**, las
  muestras, la fecha de evaluación y los grupos en una tabla. Estados honestos:
  cargando, error reintentable y vacío.
- **Snapshot**: los roles con exportación pueden **materializar un snapshot**
  del indicador con los filtros vigentes. La operación es idempotente por clave
  determinista en el backend y es **encolable sin conexión** (ver Offline). Sin
  conexión, el botón informa que el snapshot quedó en cola.
- **Historial de snapshots**: tabla con la fecha de evaluación, el valor y las
  muestras de cada snapshot materializado (los datos del resultado se leen en el
  nivel superior del snapshot: `valor`, `muestras`, `targetClave`,
  `evaluadoEn`).

## Renderizador declarativo de dashboards (`/analytics/dashboards/:id`)

El renderizador es **genérico**: pinta cualquier dashboard a partir de su
configuración declarativa (widgets ordenados por posición). Cada widget declara
`tipo`, `titulo`, `indicadorClave`, `filtros`, `presentacion` y, opcionalmente,
`ranking`. El motor evalúa el indicador de cada widget (POST evaluar) combinando
los **filtros globales del dashboard** con los **filtros propios del widget**.

### Tipos de widget (13)

`card`, `line`, `bar`, `area`, `pie`, `donut`, `gauge`, `table`, `heatmap`,
`timeline`, `calendar`, `ranking` (topN/bottomN) y `comparativo`. Los gráficos
se construyen con **SVG/CSS y los tokens del Design System** (sin librerías de
charts). Todos son accesibles: los gráficos exponen `role="img"` con
`aria-label`, incluyen una tabla oculta con los datos para lectores de pantalla
y sus etiquetas de eje son legibles. La retícula es **responsive** (columnas
fluidas `auto-fill/minmax`: 1 columna en móvil, varias en pantallas anchas).

### Estados honestos y semáforo

Cada widget muestra su estado real: **cargando** (indicador accesible),
**error** con botón de reintento, o **vacío** cuando la evaluación no arroja
muestras. Nunca se inventan datos. El **semáforo** (bueno/alerta/crítico) se
muestra como distintivo con etiqueta accesible, y las tarjetas dibujan una
**barra de umbrales visible** con la posición del valor y el sentido del umbral.

### Deep links salientes

Los widgets pueden declarar en su presentación un enlace saliente
(`presentacion.enlace`) hacia los módulos operativos, consumido ruta→filtro:
órdenes filtradas (`/ordenes?estado=…`), ficha de activo y su pestaña de
correctivo (`/activos/:id?tab=correctivo`), solicitudes de abastecimiento
(`/abastecimiento/solicitudes`) e ítems de inventario (`/inventario/:id`). Las
tablas y rankings usan estos enlaces para navegar desde una fila al detalle.

## Filtros globales reutilizables

El panel de filtros cubre las dimensiones canónicas: **activo, ubicación,
bodega, categoría, tipo, estado, prioridad, responsable, cuadrilla, fecha** y
**rango**. Las dimensiones con catálogo de tenant se presentan como selector; el
resto, como entrada libre (con degradación elegante si el catálogo no está
disponible). El estado se **persiste en la URL** (querystring en orden canónico)
para que un enlace reproduzca exactamente el mismo escenario (deep links).

Al construir el cuerpo de la evaluación, las dimensiones simples se traducen a
filtros de igualdad (`eq`); `fecha` a un límite inferior (`gte`) y `rango` a un
par `gte`/`lte`. Los filtros globales se **combinan** con los del widget.

## Dashboards personalizables

Los roles con capacidad de dashboard pueden **crear** un dashboard nuevo,
**editar** los propios (añadir, quitar y reordenar widgets, y configurar su
indicador, tipo y ranking), **clonar** un dashboard del sistema o propio y
**eliminar** los propios. El lector es de solo lectura y el editor se lo indica
si intenta acceder. Las escrituras usan bloqueo optimista por
`expectedVersion` (OCC): un conflicto se propaga en lugar de sobrescribir. El
identificador del dashboard creado se acuña como UUID en cliente para el alta
idempotente.

## Offline First

- **Caché por tenant** en el espacio de nombres
  `deltaops:analytics:cache:<tenant>`: la última respuesta de cada evaluación,
  dashboard y listado se guarda con su marca de tiempo. Sin conexión, la UI
  sirve **datos de caché** mostrando un aviso honesto («datos de caché» +
  fecha/hora). Si no hay caché, se muestra el estado de error o vacío
  correspondiente; nunca se inventan datos.
- **Cola de sincronización**: los snapshots son encolables. Si el envío directo
  falla por un fallo de red, la operación se persiste con su `opId` de cliente y
  se reintenta al recuperar conexión mediante `/sync` (replay idempotente). Los
  errores de negocio propagan y no se encolan.
- **Página de sincronización** (`/analytics/sincronizacion`): muestra el estado
  de conexión, las operaciones en cola (con su `opId` y comando), permite forzar
  la sincronización y listar/vaciar el caché local del tenant.

## Accesibilidad y responsividad

La sección reutiliza el Experience Foundation y el Design System: temas y tokens
`--do-*`, navegación con foco/ARIA y `aria-current`, regiones y grupos con
nombre accesible, avisos con `role="status"`/`role="note"` y contraste adecuado
en semáforos y mapas de calor. Las retículas de tarjetas y widgets son fluidas y
se adaptan del móvil al escritorio.

## Pruebas

La experiencia está cubierta por pruebas de: los 13 tipos de widget y sus
estados honestos, el semáforo visible, la caché offline con marca de tiempo, el
contrato de las mutaciones (crear/actualizar/clonar/eliminar dashboard y
materializar snapshot) frente a los esquemas del módulo, las capacidades por
rol, la serialización filtros↔URL, los deep links internos y salientes, la
accesibilidad (roles y nombres accesibles) y la responsividad (columnas
fluidas), además del contrato de rutas registradas en la aplicación.
