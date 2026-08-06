# Planes de Mantenimiento — Experiencia (DGP-012)

Motor preventivo empresarial de DeltaOps. Esta guía describe la **experiencia
completa** de la sección de Planes: qué hace cada pantalla, cómo se conecta con
el resto del ecosistema (Activos, Órdenes, QR, Consola, Centro), cómo funciona
el modo sin conexión y qué garantiza cada acción de negocio.

> El backend es la autoridad. El frontend nunca hace bypass del Workflow ni
> duplica lógica de dominio: sólo **compone** el contrato congelado montado en
> `/api/deltaops/planes` (sesión obligatoria por cookie). La fuente de verdad de
> los payloads es el OpenAPI congelado `lib/module-planes/openapi/planes.openapi.json`.

---

## 1. Mapa de la sección

| Ruta | Pantalla | Propósito |
|------|----------|-----------|
| `/planes` | Listado | Buscar, filtrar, ordenar y paginar todos los planes. |
| `/planes/nuevo` | Wizard de creación | Alta declarativa multi-paso (Dynamic Forms). |
| `/planes/calendario` | Calendario operacional | Próximas ocurrencias y gestión de calendarios. |
| `/planes/sincronizacion` | Sincronización | Cola offline, recibos, conflictos y reintentos. |
| `/planes/:id` | Ficha 360° | Detalle completo, Workflow, versiones y generaciones. |

La navegación superior (Shell) resalta la sección activa y muestra el **banner
offline** cuando hay operaciones en cola o falta conexión.

---

## 2. Listado de planes (`/planes`)

- **Vistas**: tabla (con ordenamiento por nombre/tipo/estado) y tarjetas.
- **Búsqueda**: por nombre, tipo o estrategia (cliente).
- **Filtros** (Dynamic Forms): estado, tipo de plan y estrategia.
  - `estado` y `tipoPlan` se filtran en el **servidor** (parámetros del contrato).
  - `estrategia` se filtra en el **cliente** (el listado del contrato no la expone).
- **Ruta → filtro**: la pantalla **consume** el contexto de la URL. Al abrir
  `/planes?estado=VIGENTE&tipoPlan=preventivo`, esos filtros quedan aplicados de
  entrada. Así, cualquier enlace profundo (desde Consola, Centro o la ficha del
  activo) llega con el estado ya preparado.
- **Estados**: cargando, vacío, error y sin conexión se muestran de forma
  explícita (nunca una pantalla en blanco).

---

## 3. Wizard de creación (`/planes/nuevo`)

Construido **exclusivamente** con el Dynamic Forms Engine; no hay formularios a
mano. Pasos:

1. **Datos generales** — nombre, descripción, tipo, estrategia y prioridad
   (los tres últimos se alimentan de catálogos del tenant si existen).
2. **Alcance de activos** — declarativo: un plan cubre uno o muchos activos por
   id, categoría, familia, subfamilia, empresa, proyecto, ubicación o clase.
3. **Frecuencias** — tabla de reglas + modo de combinación:
   - Regla única, o combinada **«lo que ocurra primero»** (p. ej. cada 30 días
     **o** 250 horas), o combinada **«cuando se cumplan todas»**.
   - Tipos: días/semanas/meses/años, horas de operación, horómetro, odómetro,
     ciclos, producción, contador y **por eventos**.
   - Tolerancias antes/después.
4. **Rutina y actividades** — tabla de actividades con duración, disciplina y
   **referencias** (por id) a herramientas, EPP, materiales, repuestos,
   checklists, documentación y riesgos, reutilizando los módulos existentes.
5. **Programación y calendario** — vigencia (desde/hasta) y calendario opcional.

Al finalizar, se crea el plan en estado **Borrador**. La publicación (que lo
vuelve **Vigente**) es una decisión explícita posterior, gobernada por Workflow.

El wizard puede llegar **anclado a un activo** (`/planes/nuevo?activo=<id>`)
desde la ficha del activo; en ese caso el alcance se prellena con ese activo.

---

## 4. Ficha 360° del plan (`/planes/:id`)

Encabezado con nombre, tipo/estrategia/prioridad y **badge de estado**. Debajo,
las **acciones de Workflow** y las pestañas:

- **General** — resumen, alcance consolidado y versión.
- **Frecuencias** — reglas declaradas, modo y tolerancias.
- **Rutina** — actividades ordenadas con recursos referenciados y riesgos.
- **Programación** — vigencia, calendario y próxima ocurrencia proyectada.
- **Generaciones** — órdenes generadas por el plan, cada una con **deep link a
  su Orden de Trabajo** (`/ordenes/:id`, destino que ya consume su `:id`).
- **Versiones** — versión activa e históricas; publicar y **rollback**.
- **Historial** — bitácora de cambios (fecha, tipo, actor, motivo).
- **Timeline** — cronología de eventos del plan (solo lectura).

### Acciones de Workflow (1:1 con las transiciones reales)

Cada botón envía **su** transición al endpoint correcto — nunca se colapsan
varias acciones en un único comando, y sólo se muestran botones con soporte real
en el contrato:

| Botón | Endpoint | Motivo | Fecha «hasta» |
|-------|----------|:------:|:-------------:|
| Publicar (Vigente) | `POST /:id/publicar` | — | — |
| Suspender | `POST /:id/transicion` (`suspender`) | **obligatorio** | — |
| Reanudar | `POST /:id/transicion` (`reanudar`) | **obligatorio** | — |
| Posponer | `POST /:id/transicion` (`posponer`) | **obligatorio** | **sí** |
| Extender | `POST /:id/transicion` (`extender`) | **obligatorio** | **sí** |
| Reprogramar | `POST /:id/transicion` (`reprogramar`) | **obligatorio** | **sí** |
| Cancelar | `POST /:id/transicion` (`cancelar`) | **obligatorio** | — |
| Archivar | `POST /:id/archivar` | — | — |
| Rollback a v*N* | `POST /:id/rollback` | — | — |

- Las acciones ofrecidas dependen del **estado**: en *Vigente* se ofrecen
  suspender/posponer/extender/reprogramar/cancelar; en *Suspendido*,
  reanudar/cancelar. Todas van **ancladas a `expectedVersion`** (bloqueo optimista).
- El **motivo es obligatorio** en toda transición y queda en la bitácora. El
  diálogo no emite ningún efecto hasta que el motivo (y el «hasta» donde aplica)
  estén completos.

---

## 5. Generación preventiva idempotente

Desde la pestaña **Generaciones**:

- **Evaluar generación** (sin efectos): dice si el plan **debe generar ahora**,
  con la ocurrencia, la clave de deduplicación y la próxima fecha proyectada. El
  resultado se muestra siempre de forma visible.
- **Generar órdenes preventivas**: orquestación **idempotente** — *nunca
  duplica*. La UI acuña un **`opId` (UUID)** de cliente que actúa como clave de
  deduplicación estable, se envía en el input (comando oficial de `/sync`, por lo
  que **se encola offline** por el protocolo estándar). La respuesta distingue
  **creadas** vs **idempotentes** (OT ya existente) vs **errores** por clave, con
  el total de generaciones **evaluadas**; cada orden materializada enlaza a su
  OT. Reejecutar la generación reporta las OT ya existentes como idempotentes.
- Cada **generación** tiene estado **`pendiente`** (aún sin OT) o
  **`materializada`**; la pestaña Generaciones muestra el estado y enlaza la OT
  (`ordenTrabajoId`) sólo cuando está materializada.

---

## 6. Calendario operacional (`/planes/calendario`)

- Muestra las **próximas ocurrencias** de los planes vigentes agrupadas por mes,
  con enlace directo al plan.
- Permite crear **calendarios** (por empresa/proyecto/activo) con festivos,
  ventanas de mantenimiento, paradas y exclusiones (Dynamic Forms). Un plan que
  referencie un calendario respeta esas ventanas en su programación.

---

## 7. Integración con el ecosistema

- **Ficha del activo → pestaña «Planes»**: lista los planes cuyo alcance incluye
  ese activo, con estado, frecuencia y próxima ocurrencia, y permite crear un
  plan ya anclado al activo.
- **Flujo QR del activo**: Planes **no** tiene QR propio. El QR del activo lleva
  a su ficha, y desde allí la pestaña «Planes» da acceso al motor preventivo.
- **Consola** (`/`) y **Centro Global de Mantenimiento** (`/centro`): ambos
  incluyen acceso directo a Planes.
- **Órdenes**: las órdenes generadas por un plan enlazan a la ficha de Órdenes.

---

## 8. Offline First

- **Cola por módulo y tenant**, aislada del resto:
  `deltaops:planes:cola:<tenant>` (no colisiona con inventario/órdenes/activos).
- Cada operación lleva un **`opId` (UUID)** de idempotencia; las altas acuñan
  además su **`id`** en el cliente para que el *replay* sea idempotente.
- **Degradación sólo ante fallos de red**: si no hay conexión, la operación se
  **encola** y se sincroniza al recuperar la red. Los **errores de negocio**
  (p. ej. conflicto de versión) **propagan** y no se encolan.
- La pantalla de **Sincronización** muestra la cola, el estado de cada operación
  (pendiente/enviando/aplicada/idempotente/conflicto/reintentable/rechazada),
  permite **reintentar**, **descartar** y **purgar** las exitosas, y sincronizar
  bajo demanda. El envío por `POST /sync` devuelve un **recibo** por operación.

---

## 9. Accesibilidad y diseño

- Compone únicamente el Design System y los tokens `--do-*`; sin marcos ni
  layouts nuevos.
- Navegación con `aria-current`, tablas con `caption` y encabezados con
  `aria-sort`, formularios con etiquetas asociadas y estados `aria-live` para el
  banner offline.

---

## 10. Calidad

- **Pruebas de contrato**: validan que cada comando (online y **encolado**)
  cumple el OpenAPI congelado (enum, `required`, `additionalProperties:false`,
  rangos, `nullable`), incluida la cobertura de todas las acciones de transición
  y todos los orígenes de evaluación.
- **Pruebas UI→request**: cada botón de Workflow emite su acción real al endpoint
  correcto, con `expectedVersion`, `motivo` y `hasta` donde aplica.
- **Deep links**: se verifica que el destino **consume** el filtro de la ruta.
- **Offline**: aislamiento de la cola, acuñado de id/opId, degradación por red y
  recibos de `/sync`.
