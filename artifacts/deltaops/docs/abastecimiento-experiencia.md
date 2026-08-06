# Abastecimiento y Cadena de Suministro — Experiencia (DGP-013)

Módulo empresarial de compras y abastecimiento de DeltaOps. Esta guía describe la
**experiencia completa** de la sección: qué hace cada pantalla, cómo se conecta
con el resto del ecosistema (Inventario, Órdenes, Planes, Consola, Centro), cómo
funciona el modo sin conexión y qué garantiza cada acción de negocio.

> El backend es la autoridad. El frontend nunca hace bypass del Workflow ni
> duplica lógica de dominio: sólo **compone** el contrato congelado montado en
> `/api/deltaops/abastecimiento` (sesión obligatoria por cookie). La fuente de
> verdad de los payloads es el OpenAPI congelado
> `lib/module-abastecimiento/openapi/abastecimiento.openapi.json`.

---

## 1. Mapa de la sección

| Ruta | Pantalla | Propósito |
|------|----------|-----------|
| `/abastecimiento/articulos` | Listado de artículos | Catálogo de compras: buscar, filtrar, ordenar y paginar. |
| `/abastecimiento/articulos/nuevo` | Wizard de alta | Alta declarativa multi-paso (Dynamic Forms). |
| `/abastecimiento/articulos/:id` | Ficha de artículo | Detalle, costos, vínculo con inventario, historial y timeline. |
| `/abastecimiento/proveedores` | Listado de proveedores | Directorio de proveedores. |
| `/abastecimiento/proveedores/nuevo` | Wizard de alta | Datos comerciales, contactos, certificaciones y SLA. |
| `/abastecimiento/proveedores/:id` | Ficha de proveedor | Comercial, contactos, certificaciones, SLA y calificación. |
| `/abastecimiento/solicitudes` | Listado de solicitudes | Solicitudes de compra por estado/prioridad. |
| `/abastecimiento/solicitudes/nueva` | Wizard de alta | Cabecera, origen y líneas. |
| `/abastecimiento/solicitudes/:id` | Ficha de solicitud | Workflow, líneas y **comparador de cotizaciones**. |
| `/abastecimiento/ordenes-compra` | Listado de OC | Órdenes de compra por estado. |
| `/abastecimiento/ordenes-compra/nueva` | Wizard de alta | Cabecera y líneas (puede hidratarse desde una cotización). |
| `/abastecimiento/ordenes-compra/:id` | Ficha de OC | Workflow, avance de recepción y **materialización a inventario**. |
| `/abastecimiento/sincronizacion` | Sincronización | Cola offline, recibos, conflictos y reintentos. |

La navegación superior (Shell) resalta la sección activa y muestra el **banner
offline** cuando hay operaciones en cola o falta conexión.

---

## 2. Catálogo de artículos

- **Listado** (`/abastecimiento/articulos`): vistas de tabla y tarjetas,
  búsqueda por nombre, filtros por tipo y familia, ordenamiento y paginación.
  Los filtros de tipo/familia viajan al servidor cuando el contrato los expone;
  la búsqueda fina es del cliente.
- **Alta** (`/abastecimiento/articulos/nuevo`): wizard con pasos *generales*,
  *costos* e *integración*. Puede anclarse a un item de inventario abriendo la
  ruta con `?inventarioItemId=<id>`; el campo llega pre-cargado.
- **Ficha** (`/abastecimiento/articulos/:id`): pestañas
  - **General**: datos maestros con edición anclada a versión.
  - **Costos**: costo promedio/último/estándar e historial de costeo.
  - **Abastecimiento**: artículos relacionados y accesos rápidos.
  - **Historial** y **Timeline**: trazabilidad de eventos.
  - **Comentarios / Adjuntos**: capacidades de plataforma. Si el entorno no las
    tiene montadas para el módulo, la pestaña **degrada con un aviso claro** —
    nunca se inventan datos.

---

## 3. Proveedores

- **Listado** (`/abastecimiento/proveedores`): directorio con búsqueda y filtro
  por tipo.
- **Alta** (`/abastecimiento/proveedores/nuevo`): wizard con datos comerciales,
  contactos, certificaciones y acuerdo de nivel de servicio (SLA).
- **Ficha** (`/abastecimiento/proveedores/:id`): pestañas *Comercial* (con
  edición), *Contactos*, *Certificaciones*, *SLA*, *Calificación* e *Historial*.
- **Calificar**: el botón **Calificar** abre un formulario de cuatro criterios
  (calidad, tiempo, precio, servicio, de 0 a 5) más una nota. La calificación se
  envía **anclada a la versión** del proveedor (concurrencia optimista) mediante
  el comando `calificar-proveedor`. La ficha muestra el promedio y el detalle.

---

## 4. Solicitudes de compra

### 4.1 Alta

Wizard con *generales*, *origen* y *líneas*. El **origen** puede anclarse por URL
(`?origen=&refId=&refTipo=&etiqueta=`): así, cuando la solicitud nace de un
quiebre de stock en Inventario, de una orden de trabajo o de un plan, la
referencia queda registrada y navegable.

### 4.2 Workflow (acciones gobernadas)

La ficha ofrece **sólo** las transiciones válidas según el estado:

| Estado | Acciones ofrecidas |
|--------|--------------------|
| BORRADOR | Enviar |
| ENVIADA | Aprobar · Rechazar |
| APROBADA | Cerrar |

- Cada botón emite **su** transición real al endpoint gobernado
  `POST /solicitudes/:id/transicion` — nunca se colapsan varias acciones en un
  único comando.
- **Sólo `Rechazar`** exige y envía `motivoRechazo`. El botón de confirmación no
  dispara ningún efecto sin motivo. El resto de transiciones no llevan motivo.
- Todas viajan con `expectedVersion` (concurrencia optimista).

### 4.3 Comparador de cotizaciones

En la pestaña **Cotizaciones**, la solicitud muestra un **comparador
multi-proveedor**:

- Calcula el **total** y el **plazo de entrega máximo** de cada cotización.
- Normaliza cada criterio y aplica **pesos ajustables** (precio, plazo,
  calificación; por defecto 0.5 / 0.3 / 0.2) para producir un **ranking**
  (la #1 se resalta como recomendada).
- Marca la **mejor en precio** y la **mejor en plazo**.
- El comparador **no decide**: sólo ordena y resalta para apoyar la decisión.
  La selección es **explícita** y la ejecuta el motor mediante el comando
  `seleccionar-cotizacion` (`POST /solicitudes/:id/seleccionar-cotizacion`), que
  registra la cotización elegida y los pesos usados. Desde la fila seleccionada
  se puede saltar a crear la Orden de Compra con el contexto ya cargado.

---

## 5. Órdenes de compra

### 5.1 Alta y creación desde cotización

Wizard con *cabecera* y *líneas*. Al abrir la ruta con
`?solicitudId=&cotizacionId=`, la pantalla **hidrata** la cabecera y las líneas a
partir de la cotización seleccionada (si la consulta falla, degrada mostrando el
aviso y permite el alta manual).

### 5.2 Workflow

| Estado | Acciones ofrecidas |
|--------|--------------------|
| BORRADOR | Aprobar · Cancelar |
| APROBADA | Enviar al proveedor · Cancelar |
| ENVIADA | Cancelar |

Cada botón emite su transición real (`POST /ordenes-compra/:id/transicion`) con
`expectedVersion`. Las transiciones de OC **no llevan motivo alguno**. Las
acciones destructivas (Cancelar) piden confirmación explícita.

### 5.3 Recepciones y avance

En la pestaña **Líneas**, cada renglón muestra el **avance de recepción**
(recibido vs pedido) con una barra de progreso, distinguiendo recepción
**parcial** de **total**.

La pestaña **Recepciones** permite **registrar una recepción** por líneas
(cantidad recibida, novedades, lote/serie, bodega) contra la OC. El formulario
descarta automáticamente las líneas con cantidad cero.

### 5.4 Materialización a inventario (idempotente)

Cada recepción registrada puede **materializarse a inventario** con el comando
`materializar-recepcion` (`POST /recepciones/:id/materializar`):

- El resultado distingue los movimientos **creados** de los **idempotentes**
  (repetición segura de la misma operación), y se muestra un resumen
  («N creado(s), M idempotente(s)»).
- Cada movimiento ofrece un **deep link** a los movimientos del item en
  Inventario (`/inventario/movimientos?itemId=<id>`), cuyo destino ya consume el
  parámetro.
- La operación es **idempotente por `opId`** (UUID de cliente): reintentarla —por
  ejemplo tras recuperar la conexión— no duplica entradas de stock.

---

## 6. Integración con el ecosistema

- **Consola** y **Centro de Mantenimiento** incluyen accesos directos a la
  sección (`data-testid="link-abastecimiento"` en Consola).
- **Ficha de item de Inventario**: una pestaña **Abastecimiento** lista los
  artículos de catálogo vinculados al item y ofrece deep links para **crear una
  solicitud de compra** anclada al origen «inventario» (con la referencia al
  item), vincular un nuevo artículo o abrir el catálogo y las órdenes.
- **Origen de solicitud**: desde la ficha de una solicitud, el enlace de origen
  navega al item de inventario, a la orden de trabajo o al plan según su tipo.
- El contrato de Abastecimiento **no** expone un cruce inverso solicitudes/OC ↔
  item; la integración usa **deep links** simples en lugar de fabricar datos.

---

## 7. Modo sin conexión (Offline First)

- Las mutaciones usan una **cola por módulo y tenant** con el namespace
  `deltaops:abastecimiento:cola:<tenant>`, aislada de las demás secciones.
- Cada operación acuña un `id` de cabecera y un `opId` (UUID) de cliente que
  actúa como **clave de deduplicación estable** para el replay idempotente. El
  `opId` es propiedad declarada de todos los comandos del contrato, por lo que el
  cuerpo encolado **valida directamente** contra el OpenAPI.
- La degradación a cola ocurre **sólo ante errores de red**. Los errores de
  negocio (por ejemplo, un conflicto de versión 409) **propagan** y no se
  encolan.
- La página de **Sincronización** muestra los indicadores de la cola, la tabla de
  operaciones pendientes y las acciones de reintentar, descartar y purgar. El
  envío por lote a `/sync` devuelve **recibos** que marcan cada operación como
  aplicada, idempotente, conflicto, reintentable o rechazada.

---

## 8. Garantías de contrato

- Todos los cuerpos que construye el frontend cumplen los esquemas del OpenAPI
  congelado, tanto **online** como **encolados** (`additionalProperties:false`,
  enums, requeridos, rangos y nulabilidad respetados).
- Las acciones de Workflow envían su **acción real** por botón, con
  `expectedVersion`; `motivoRechazo` sólo en el rechazo de solicitudes.
- La materialización a inventario es **idempotente** y expone la trazabilidad de
  los movimientos generados.
- Las capacidades de plataforma no montadas (comentarios/adjuntos) **degradan con
  aviso**; nunca se muestran datos ficticios.
