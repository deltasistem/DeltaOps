# Experiencia de Órdenes de Trabajo (DGP-009.3)

Guía funcional y técnica de la experiencia operativa del módulo de **Órdenes de
Trabajo** de DeltaOps. La experiencia se **compone sobre el corpus existente**:
no introduce arquitectura ni infraestructura nueva y **no modifica** el dominio
(009.1), la persistencia/CQRS/API (009.2), el Workflow Engine, el Dynamic Forms
Engine ni la Shared Platform. El patrón de referencia es la experiencia de
Activos (DGP-008.3).

> **Sin credenciales.** Este documento no contiene usuarios, contraseñas ni
> secretos. Las pruebas en vivo usan las credenciales de desarrollo del entorno,
> que **nunca** deben documentarse.

---

## 1. Mapa de la experiencia

| Pantalla | Ruta | Rol principal | Descripción |
|---|---|---|---|
| Centro de Operaciones | `/ordenes` | Todos | Bandejas del ciclo de vida + búsqueda, filtros y acciones inmediatas. |
| Ficha / Ejecución | `/ordenes/:id` | Técnico | Experiencia integrada de ejecución (una sola pantalla). |
| Centro del Supervisor | `/ordenes/supervisor` | Supervisor | Asignación, validación de cierre, carga por técnico, SLA. |
| Centro de Planificación | `/ordenes/planificacion` | Planificador | Calendario semanal + agenda con reprogramación *drag & drop*. |
| Nueva orden | `/ordenes/nueva` | Todos | Wizard de creación (Dynamic Forms). |
| Escanear | `/ordenes/escanear` | Técnico | QR de plataforma + navegación contextual. |
| Sincronización | `/ordenes/sincronizacion` | Todos | Cola offline: estado, reintentos, conflictos. |

Todas las pantallas se montan bajo `ShellOrdenes` (sesión + navegación + banner
offline) y usan **exclusivamente** el Design System (`@workspace/design-system`)
y los tokens `--do-*`.

---

## 2. Ciclo de vida y acciones (Workflow Engine)

La máquina de estados es propiedad del dominio; la UI sólo **presenta** las
transiciones disponibles y delega la decisión al motor (que rechaza cualquier
transición no aplicable). Los comandos son **neutros** (`abrir`, `planificar`,
`asignar`, `iniciar`, `pausar`, `reanudarEjecucion`, `enviarValidacion`,
`devolver`, `cerrar`, `cancelar`).

```
BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA → EN_EJECUCION ⇄ PAUSADA
                                                   │
                                                   ▼
                                             EN_VALIDACION → CERRADA (final)
   (cualquier estado no final) ─────────────────────────────→ CANCELADA (final)
```

- **«En espera»** se representa con el estado `PAUSADA` y/o la acción de bitácora
  `espera` (extensión de tenant), no como un estado base independiente.
- El **cierre** en `EN_VALIDACION` pasa por la aprobación en línea
  `validacionCierre` (`POST /:id/aprobar-cierre`); «Aprobar y cerrar» y «Devolver»
  invocan esa aprobación.

El mapa de transiciones de presentación vive en `src/lib/ordenes/constantes.ts`
(`TRANSICIONES`). No implementa lógica de negocio.

---

## 3. Centro de Operaciones (bandejas)

Diez bandejas: **Mis órdenes, Pendientes, Nuevas, En ejecución, En espera, En
validación, Próximas a vencer, Críticas, Canceladas, Cerradas**. Cada bandeja
filtra por estado en el servidor (`GET /ordenes?estado=…`) cuando aplica; las
bandejas *Mis órdenes*, *Críticas* y *Próximas a vencer* añaden un predicado en
cliente sobre el read model (`esCritica`, `proximaAVencer`).

- **Búsqueda** por código, título o responsable (cliente).
- **Estados visuales** con `Badge` de tono canónico (`TONO_ESTADO`).
- **Acciones inmediatas** de transición por tarjeta (sin abrir la ficha).

---

## 4. Ficha / Experiencia de Ejecución integrada (Centro del Técnico)

Una **sola pantalla** con pestañas (DS `Tabs`):

1. **Resumen** — datos generales, asignación y SLA.
2. **Ejecución** — bitácora operacional (8 acciones), registro de **horas**,
   **recursos**, **observaciones/comentarios** y el **checklist/formulario
   asociado**. Casi todas las escrituras degradan a la cola offline (excepción:
   las evidencias, ver §7).
   - **Recursos**: alineados con el comando `registrar-recurso`; se captura la
     **clase** del recurso (`herramienta`/`material`/`epp`/`vehiculo`/
     `equipo-auxiliar`) y una **referencia** (`referenciaId`), más
     descripción/cantidad/unidad opcionales. El registro queda reflejado en la
     **cronología** de la orden.
   - **Formularios y checklists**: se **listan** los realmente asociados
     (`GET /:id/formularios`, `GET /:id/checklists`) y se pueden **asociar**
     nuevos con los comandos `asociarFormulario`/`asociarChecklist`
     (`{expectedVersion, plantilla:{clave,version,etiqueta?}}`). El backend
     **verifica** la plantilla contra el runtime de Dynamic Forms
     (existencia/clase/versión N|N-1); el frontend no valida. Para **capturar**
     el resultado, la ficha **resuelve y renderiza la definición REALMENTE
     asociada** —la **clave + versión exacta** de la asociación—, obtenida del
     runtime de Dynamic Forms (`GET /:base/plantillas/:clave/:version`), no una
     plantilla fija. Al guardar, la captura es una **única operación** del
     módulo —el comando orquestador `modulo.ordenes.capturarRespuesta`
     (`POST /:id/{formulario|checklist}/respuesta`)— que compone en el servidor
     el **flujo real de Dynamic Forms** —`respuesta.guardarBorrador` (anclada a
     esa clave+versión) → `respuesta.enviar` (validación completa) → asociación a
     la OT con el `respuestaId` **re-leyendo su versión ACTUAL**—, dejando la
     respuesta **ANCLADA a la asociación/plantilla/versión concreta** (no un
     `diagnostico` genérico sin ancla). Al ser un comando único **idempotente por
     `opId`** y **recuperable**, la captura es **Offline First**: si falla la red
     se **encola** y se replaya vía `/sync` con el mismo `opId`, y los reintentos
     —incluso tras un conflicto posterior al envío— **convergen** al mismo
     resultado sin duplicar respuestas ni dejar respuestas huérfanas. No se envía
     `expectedVersion`: el anclaje re-lee la versión de la OT en el servidor.
3. **Documentación** — gestión documental **referencia-only** (ver §7).
4. **Cronología** — Timeline Operacional (ver §6).

Es la base del **Centro del Técnico**: aceptar/pausar/reanudar/finalizar se
resuelven con las transiciones del encabezado y con la bitácora; el registro de
recursos, horas, checklist y evidencias completa la ejecución.

---

## 5. Centro de Planificación

Calendario semanal (`GET /ordenes/agenda?desde&hasta`) con **reprogramación por
arrastrar y soltar**: al soltar una orden en otro día se llama a `planificar`
conservando la hora original. Se muestran **conflictos** (`enConflicto`),
ventanas y entradas **sin fecha**. Existe una alternativa accesible por teclado:
el botón **Reprogramar** abre un formulario dinámico con las fechas/ventanas.

---

## 6. Timeline Operacional (Shared Timeline)

La cronología se pinta **exclusivamente** con el componente compartido
`Timeline` del Design System. Fusiona el **historial de eventos**
(`GET /:id/historial`) y la **bitácora operacional** (`GET /:id/bitacora`) en una
línea temporal única, con tono por origen.

---

## 7. Gestión documental (Attachment Service — referencia-only)

El Attachment Service de plataforma es **referencia-only**: la URL firmada
devuelve **metadatos verificables** (HMAC + caducidad), **nunca** el binario
remoto. Por eso la UX es una **ficha de metadatos verificables** por evidencia
(categoría, nombre, mimeType, tamaño, `sha256`, verificación de firma).

**Flujo REAL en dos fases** (patrón Attachment Service, igual que Activos), que
ejecuta el endpoint de composición `POST /:id/documentacion` en el servidor:

1. `platform.attachment.register` recibe los **metadatos + hash** (calculados en
   el cliente con `SubtleCrypto`; el binario **no** se sube) y devuelve el
   **`attachmentId`**.
2. `agregarEvidencia` adjunta la evidencia a la OT anclada a `expectedVersion`,
   con la evidencia anidada `{attachmentId, nombreArchivo, mimeType, tamanoBytes,
   hashSha256, descripcion?}`. La **categoría** viaja como prefijo del nombre
   lógico (`[categoria] nombre`) y en `descripcion` (el `EvidenciaSchema` es
   `.strict()`).

Como el paso (1) requiere el Attachment Service **en línea** para acuñar el
`attachmentId`, el registro de evidencias es **online-only**: si falla la red,
la operación **no se encola** y se devuelve un error explícito (a diferencia del
resto de escrituras). La verificación posterior usa
`GET /:id/documentacion/:attachmentId/url` (URL firmada + metadatos).

**Autorización de la URL firmada (aislamiento por OT y tenant).** El endpoint
`GET /:id/documentacion/:attachmentId/url` **carga primero la OT** por `:id`
(aplicando la autorización de lectura de la OT y el filtro por tenant) y **sólo
firma la URL si el `attachmentId` está realmente referenciado en la
documentación de ESA OT**; en caso contrario responde `404`. Así se impide que
un usuario con permiso de lectura de adjuntos obtenga una URL firmada de un
adjunto de otra OT o de otro tenant a partir de un `attachmentId` ajeno.

- **Única** previsualización permitida: un archivo recién seleccionado en la
  sesión (aún no registrado), desde el `File` local. Nunca se previsualiza el
  binario remoto.

---

## 8. Offline First

Reutiliza el framework `src/lib/offline/` generalizado por **módulo**: la cola se
persiste por tenant con el espacio de nombres `deltaops:ordenes:cola:<tenant>`,
aislada de la de Activos. `mutarConOffline` intenta el envío directo y sólo
**encola** ante fallos de red; al recuperar conexión drena la cola contra
`POST /ordenes/sync`, cuyo `ResumenSync` es idéntico al de la cola (idempotencia
por `opId`, detección de conflictos y reintentables). La captura de
checklist/formulario (`capturarRespuesta`) es un ejemplo de operación de un
**único comando** idempotente y **recuperable**: aunque compone tres subpasos
(borrador/enviar/asociar), se encola y se replaya como una sola unidad que
converge sin duplicar ni orfanar respuestas. El panel
`/ordenes/sincronizacion` muestra el estado, permite reintentar, descartar
conflictos y purgar exitosas.

---

## 9. QR de plataforma y navegación contextual

El QR de plataforma codifica el **`codigo`** del activo. Al escanear (cámara con
`BarcodeDetector` o entrada manual) se resuelve con el **resolvedor del servidor**
de plataforma (`resolverCodigoActivo`), con degradación local secundaria. Tras
resolver, se ofrece **navegación contextual**: abrir el activo, listar sus
órdenes (abiertas + historial), crear una OT y consultar su historial.

---

## 10. Formularios dinámicos

Toda la captura se declara como `DefinicionFormulario` y la pinta el renderer
genérico `FormularioDinamico` (`src/lib/forms/plantillas-ordenes.ts`): wizard de
creación (5 pasos + revisión + confirmación), edición, filtros, bitácora, horas,
recursos (clase + referencia), evidencia (categoría + adjunto), asociación de
formulario/checklist, checklist de ejecución, planificación y asignación. La
validación por paso del wizard es **pura** (sin `setState`) para evitar bucles de
render. Autosave de borrador por tenant.

---

## 11. Accesibilidad y responsive

- Navegación con `aria-current`, tablas con `caption`, campos con `label`
  asociada (vía `Field`), regiones `role="status"`/`aria-live` para el banner
  offline y toasts.
- Rejillas responsive (`repeat(auto-fill/auto-fit, minmax(...))`) para tarjetas,
  calendario y KPIs; sin anchos fijos que rompan en móvil.

---

## 12. Endpoints consumidos (Contract-First)

Lectura: `/ordenes`, `/ordenes/:id`, `/ordenes/agenda`, `/ordenes/calendario`,
`/:id/historial`, `/:id/bitacora`, `/:id/documentacion`, `/:id/formularios`,
`/:id/checklists`, `/:id/asignaciones`, `/catalogos/:catalogo`,
`GET /:id/documentacion/:attachmentId/url`, `GET /plantillas/:clave/:version`.
Escritura: `POST /ordenes`, `PUT /:id`, `/:id/transicionar`,
`/:id/aprobar-cierre`, `/:id/asignar`, `/:id/ejecucion`, `/:id/formulario`,
`/:id/checklist`, `POST /:id/{formulario|checklist}/respuesta`,
`/:id/planificar`, `/:id/recursos`, `/:id/sla`,
`/:id/relaciones`, `/:id/bitacora`, `POST /ordenes/sync`.

**Composición/plataforma (Contract-First, sin drift de OpenAPI):** para el flujo
real de evidencias (register → agregarEvidencia) se añadió
`POST /:id/documentacion` y la verificación `GET /:id/documentacion/:attachmentId/url`
(operationIds `ordenes.registrarDocumentacion` y `ordenes.documentacionUrl`). Para
la captura de checklist/formulario se añadieron
`GET /plantillas/:clave/:version` (resolución de la definición asociada;
operationId `ordenes.plantillaDefinicion`) y
`POST /:id/{formulario|checklist}/respuesta`, que ejecuta el **comando único**
del módulo `modulo.ordenes.capturarRespuesta` (orquesta guardarBorrador → enviar
→ asociar con `respuestaId` re-leyendo la versión actual; idempotente por `opId`,
recuperable y replayable por `/sync`; operationId `ordenes.capturarRespuesta`;
esquema `CapturaRespuesta` = `{clave, version, etiqueta?, datos, opId}`, **sin**
`expectedVersion`). La verificación de la URL firmada
(`ordenes.documentacionUrl`) **autoriza contra la OT**: carga la OT por `:id` y
sólo firma si el `attachmentId` pertenece a esa OT (aislamiento por tenant). Se
corrigieron además los esquemas OpenAPI `AgregarEvidencia` (forma anidada real
`{id, expectedVersion, evidencia}`) y `AsociarPlantilla`
(`{id, expectedVersion, plantilla:{clave,version,…}, respuestaId?}`) para
reflejar los comandos reales del módulo.

---

## 13. Pruebas

Suites nuevas (0 *skipped*): `ordenes-dominio` (transiciones/predicados/alta),
`ordenes-offline` (aislamiento por módulo + mutaciones), `ordenes-forms`
(plantillas + validación por paso + render a11y), `ordenes-planificacion`
(calendario + *drag & drop*), `ordenes-contract` (contrato frontend↔API:
recurso, evidencia, asociación **y captura anclada** de formulario/checklist
validados contra el JSON OpenAPI congelado, online y encolados),
`ordenes-cronologia` (fusión historial+bitácora **ordenada** por `ocurridoAt`,
con intercalado asc/desc) y `ordenes-captura-plantilla` (render de la
definición **realmente asociada** por clave+versión y respuesta **anclada** a
esa clave+versión). En `api-server`, `ordenes-idor` cubre el **aislamiento** del
endpoint de URL firmada (rechazo de un `attachmentId` ajeno a la OT). Las 8
suites previas de DGP-008.3 permanecen verdes.
