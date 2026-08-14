# DELTAOPS LITE — FASE 4 · AUDITORÍA DE DESCUBRIMIENTO «PREOPERACIONAL Y CHECKLIST OPERACIONAL»

> **Naturaleza:** entregable del **PASO 1 (§1 de la directiva LITE-04)** — **SOLO auditoría de descubrimiento**. No se modificó código, base de datos, migraciones, contratos, RBAC/RLS ni workflows. No se implementó nada. `git` sin tocar.
> **Continuidad:** parte de `DELTAOPS-LITE-01-DISCOVERY.md` (PASS) y `DELTAOPS-LITE-02-DISEÑO-FUNCIONAL-UX.md` (diseño), y responde las 8 preguntas del §1 de la directiva con **evidencia de archivo + símbolo**.
> **Regla vinculante:** **componer** sobre capacidades existentes; **prohibido** crear un módulo paralelo, duplicar activos/órdenes/equipos, o reinventar el constructor de formularios. Si una capacidad falta → se documenta como **GAP**; **no se inventa** (en especial reglas de criticidad/seguridad — §9).
> **Directiva fuente:** `attached_assets/Pasted-DIRECTIVA-OFICIAL-DELTAOPS-LITE-04-IMPLEMENTACI-N-DEL-P_1786674460692.txt`.

---

## 0. Resumen ejecutivo

**El proceso preoperacional NO existe como capacidad de primera clase, pero TODAS las piezas para componerlo existen y son reutilizables.** La deuda es de **composición/experiencia + una superficie de anclaje a ACTIVO** (hoy el motor de formularios sólo se expone por HTTP anclado a **ORDEN DE TRABAJO**), no de dominio.

- **Motor de checklists:** existe y es sólido (`@workspace/dynamic-forms`): plantillas versionadas N/N‑1, respuestas BORRADOR→ENVIADA, idempotencia por `opId`, evidencia sellada referencia‑only, identidad y tiempo de servidor, eventos de auditoría. El contrato de respuesta de ítem (`estado: boolean | "na"` + `comentario` + `evidencias` + `firma`) **mapea limpiamente** a CUMPLE / NO CUMPLE / NO APLICA / OBSERVACIÓN sin romper el contrato (§6 directiva).
- **Puente hallazgo→OT:** existe como análogo directo en Correctivo (`crearSolicitud` con `origen`+`objeto.activoId`+`evidencias` → `transicionarSolicitud` → `generarOrden` = `modulo.correctivo.generar-orden-correctiva`, idempotente por `opId`, devuelve `ordenTrabajoId`, navegable en `/ordenes/:id`).
- **Superficie de anclaje faltante (GAP central L4‑1):** el motor de formularios **no se expone por HTTP anclado a ACTIVO**. Hoy se consume: (a) embebido en **Órdenes** (`/ordenes/plantillas/:clave/:version`, `/ordenes/:id/:clase/respuesta` con el orquestador `capturarRespuesta`) y (b) embebido en **Correctivo** (diagnóstico). No hay `/preoperacional/*` ni `/activos/:id/checklist`.
- **Veredicto de instancia faltante (GAP L4‑2):** el motor da severidad por‑campo (`HallazgoCampo.severidad ∈ error|advertencia|bloqueo`, `hayBloqueos`) y puntaje; **no** produce un veredicto de equipo APTO / APTO CON OBSERVACIONES / NO APTO. Debe componerse.
- **Fuente de verdad de criticidad faltante (GAP L4‑3 — DETENERSE‑Y‑PREGUNTAR):** no existe en el modelo un marcador de «ítem crítico» ni un catálogo/regla que determine la criticidad de seguridad. Sin ese origen, el veredicto NO APTO **no puede derivarse** sin inventar una regla de seguridad → **se detiene esa parte y se documenta** (§9 directiva; consistente con G-C/DP‑2 de LITE‑02).
- **Persistencia:** una ejecución preoperacional es representable **sin nueva tabla** como `respuesta-formulario` + convención de anclaje (activo/centro/origen). Sólo se propondría persistencia aditiva si el anclaje a activo y el veredicto de instancia no pudieran expresarse por composición (§22).

**GAPs LITE‑04:** L4‑1 superficie de anclaje a activo · L4‑2 veredicto de instancia · L4‑3 fuente de criticidad (DETENERSE) · L4‑4 control CUMPLE/NO CUMPLE/NA (segmented) · L4‑5 puente automático preoperacional→solicitud correctiva prellenada · L4‑6 resolución de plantilla por tipo/categoría de equipo · L4‑7 procedencia en la OT.

---

## 1. Respuestas a las 8 preguntas del descubrimiento (§1)

### P1 · ¿Existe hoy un flujo preoperacional de equipos? ¿Dónde y cómo?
**No existe como flujo de primera clase.** No hay ruta `/preoperacional`, ni tipo de plantilla «preoperacional», ni registro de instancia de equipo APTO/NO APTO.
- Confirmación en diseño previo: LITE‑02 §2 marca el grupo **PREOPERACIONAL** como «entrada nueva — GAP G‑B» sin ruta; §3 lo marca `[GAP G‑B]`.
- Lo más cercano existente es la **ejecución de checklist dentro de una ORDEN DE TRABAJO** (`tab-ejecucion.tsx`, endpoints `/ordenes/:id/checklists`, `/ordenes/:id/:clase/respuesta`), pero está **anclado a OT, no a la operación preoperacional de un activo**.

### P2 · ¿Qué motor de formularios/checklists existe y es reutilizable?
**Sí, reutilizable en su totalidad:** `@workspace/dynamic-forms` (servicio `modulo.formularios`, marco neutro sin negocio).
- **Plantillas** (`lib/dynamic-forms/src/plantillas.ts`): versionado inmutable N/N‑1; estados BORRADOR/PUBLICADA/ACTIVA/INACTIVA/INDICE; ids deterministas `<clave>:v<version>` + índice `idx:<clave>` (una sola activa); comandos `.plantilla.crear|publicar|activar|importar`; consultas `.plantilla.obtener|obtenerActiva|listar|exportar|compatibilidad`; contenido `{definicion, contrato?, layout?}`.
- **Definición** (`definicion.ts`): `DefinicionFormulario` recursiva; hojas `select`, `checklist`, `adjunto`, `firma`, `imagen`, etc.; `obligatorio` por campo; deriva esquema Zod; helpers `recorrerNodos`/`camposHoja`/`campoPorClave`.
- **Checklist de dominio** (`checklist.ts`): `ItemChecklist { clave, etiqueta, obligatorio?, evidenciasRequeridas?, firmaRequerida?, puntaje? }`; `DefinicionChecklist { version, items, puntajeMaximo? }`; `RespuestaItem.estado = boolean | "na"`; `comentario`; `evidencias`; `firma`; funciones `calcularPuntaje` (excluye `"na"`) e `itemsPendientes`.
- **Respuestas** (`respuestas.ts`): entidad `respuesta-formulario`; comandos `.respuesta.guardarBorrador` (valida sólo bloqueos) y `.respuesta.enviar` (validación completa); estados **BORRADOR→ENVIADA**; **idempotencia por `opId`** (`_opIds`, últimos 50, `idempotente:true`); **fijado de versión** (registra `plantillaClave`+`plantillaVersion`); identidad `ctx.principal.id` y tiempo `new Date()` de servidor.
- **Motor descriptor** (`modulo.ts`): `crearMotorFormularios()` → servicio de plataforma; `dependsOn: platform.config/attachment/comment/search`; recordTypes `plantilla-formulario`, `respuesta-formulario`.
- **Frontend** (`artifacts/deltaops/src/lib/forms/`): `FormularioDinamico.tsx` (render recursivo de `DefinicionFormulario`, acepta prop `hallazgos`, separa bloqueantes de advertencias), `CampoRenderer.tsx` (hojas), `motor.ts` (`HallazgoCampo`, `hayBloqueos`, `hallazgosDe`), `tipos.ts` (`HallazgoCampo{campo,mensaje,severidad}`, `PlantillaActivo`).
> **Regla cumplida:** se reutiliza Dynamic Forms; **no** se construye un nuevo constructor de formularios (§directiva).

### P3 · ¿Cómo se exponen esas capacidades al frontend (superficie HTTP)?
**Aquí está el hallazgo estructural (GAP L4‑1):** el motor `modulo.formularios` **no tiene ruta HTTP propia** en el API server. Se consume **embebido** en dos módulos, siempre anclado a su agregado:
- **Órdenes** (`artifacts/api-server/src/routes/deltaops/ordenes-module.ts`):
  - `GET /ordenes/plantillas/:clave/:version` → proxy fino a `modulo.formularios.plantilla.obtener`.
  - `GET /ordenes/:id/checklists`, `GET /ordenes/:id/formularios`.
  - `POST /ordenes/:id/:clase/respuesta` (`clase ∈ formulario|checklist`) → **orquestador único** `modulo.ordenes.capturarRespuesta`, que compone en servidor `respuesta.guardarBorrador → respuesta.enviar → asociación a la OT`, **idempotente por `opId`** y **recuperable** (reintento converge sin respuestas huérfanas ni duplicadas); mismo comando replayable por `/sync` (Offline First).
- **Correctivo** (`correctivo-runtime.ts`): usa `modulo.formularios.plantilla.obtener` para el diagnóstico anclado a plantilla+versión (permisos `modulo.formularios.plantilla.read/write/publicar/admin`).
- **Consecuencia:** para el preoperacional (anclado a **ACTIVO**, no a OT) **falta la superficie HTTP de anclaje** — leer la plantilla activa por equipo y capturar la respuesta con procedencia de activo. Es una **composición de servidor** análoga a `capturarRespuesta`, no un motor nuevo.

### P4 · ¿Cómo se determina APTO / APTO CON OBSERVACIONES / NO APTO? (fuente de verdad de criticidad — §9)
**No existe hoy un veredicto de instancia ni una fuente de verdad de criticidad.**
- El motor produce **severidad por‑campo** en el frontend: `HallazgoCampo.severidad ∈ "error"|"advertencia"|"bloqueo"` (`lib/forms/tipos.ts`) y `hayBloqueos()` (severidad `error|bloqueo`) (`lib/forms/motor.ts`). Esta severidad vive en el **motor de validación del frontend**, **no** en la definición de ítem del checklist de dominio (`checklist.ts`, cuyo `estado` es conforme/no‑conforme/`na` **sin** severidad ni marca de criticidad). *(Consistente con LITE‑02 §9 R‑1 y G‑C.)*
- **No hay** metadato «ítem crítico», ni catálogo de criticidad, ni regla de negocio configurable que diga «este ítem incumplido ⇒ NO APTO».
> **DETENERSE‑Y‑PREGUNTAR (GAP L4‑3 / DP‑2):** la semántica de «APTO CON OBSERVACIONES» y **qué ítems son críticos** es **regla de negocio/seguridad**; **no derivable del código**. Sin origen autoritativo (config/plantilla/catálogo/regla), el veredicto NO APTO **no se implementa** — se diseña la UI de los 3 estados y se detiene la regla (§9 directiva; §6 «no inventar reglas de seguridad»).

### P5 · ¿La plantilla/checklist tiene atributos por tipo/categoría de equipo, vigencia, severidad por ítem?
**Parcial → GAP L4‑6.**
- La plantilla porta `{definicion, contrato?, layout?}` y versionado, pero **no** campos explícitos de «tipo/categoría de equipo aplicable», «vigencia» ni «severidad por ítem» (`plantillas.ts`, `checklist.ts`).
- La **resolución por equipo** hoy es implícita: en Órdenes cada actividad referencia su `checklist { plantillaId, version }` (seed `chk-inspeccion-general`, `chk-cambio-aceite`, `chk-engrase`, `chk-prueba-funcional`, `chk-ajuste`; `seed-delta-demo.ts`). No hay un mapa «tipo de activo → plantilla preoperacional».
- LITE‑02 §8 P3 asume que el checklist se resuelve por tipo/categoría del equipo vía `resolutor.ts`; ese mapeo **no existe** aún como dato → composición pendiente.

### P6 · ¿Cómo se anclan evidencia, observación, firma y procedencia?
**Reutilizable en su totalidad.**
- **Evidencia** (`lib/dynamic-forms/src/evidencias.ts`): tipos adjunto/comentario/firma/fotografía/geolocalización; **referencia‑only** (`attachmentId` de `platform.attachment`, comentario de `platform.comment`); cada evidencia **sellada** `{usuarioId (ctx), timestamp ISO, dispositivo?}` — nunca del cliente; `opId` por evidencia. Captura frontend en `tab-ejecucion.tsx` (foto/firma/geo).
- **Observación** = `RespuestaItem.comentario` (checklist) / campo texto (formulario).
- **Firma** = `RespuestaItem.firma` / hoja `firma`; obligatoriedad por `firmaRequerida`.
- **Procedencia:** el contrato de solicitud correctiva ya la modela — `EntradaSolicitud { titulo, origen: string, objeto: {activoId, componenteId?, ubicacionId?}, evidencias? }` (`lib/correctivo/alta.ts`). Las relaciones de OT soportan categorías `checklist`/`evidencia`/`activo` (LITE‑02 §11, `CATEGORIAS_RELACION`). Falta **poblar** ese origen desde el preoperacional (GAP L4‑7).

### P7 · ¿Existe el puente hallazgo→orden de trabajo y es idempotente/recuperable?
**Sí — análogo directo, reutilizable** (`lib/correctivo/mutaciones.ts`):
- `crearSolicitud(cola, {titulo, origen, objeto.activoId, descripcion?, prioridad?, evidencias?}, {id?,opId?})` → `POST /correctivo/solicitudes` (comando `modulo.correctivo.crear-solicitud`), **id+opId acuñados en cliente**.
- `transicionarSolicitud(cola,id,accion,{motivo?})` → `POST /correctivo/solicitudes/:id/transicion` (Workflow real, sin bypass).
- `generarOrden(cola,solicitudId,{titulo?,prioridad?})` → `POST /correctivo/generar` (comando `modulo.correctivo.generar-orden-correctiva`), **idempotente por `opId`**, devuelve `ordenTrabajoId`, OT navegable `/ordenes/:id` (`urlOrdenTrabajo`).
- Toda mutación pasa por `mutarConOffline` (POST directo → si falla red, encola el **mismo comando** con `opId` para replay idempotente por `/sync`; los 409 no se encolan).
> **LITE‑05 preparado, NO auto‑ejecutado ahora:** el flujo HALLAZGO→OT existe; la directiva LITE‑04 pide dejar el hallazgo **con procedencia** y **preparado** para LITE‑05, **sin** auto‑generar la OT en esta fase. El **prellenado automático** de la solicitud desde el preoperacional es GAP L4‑5 (composición, no motor nuevo).

### P8 · ¿Identidad de servidor, tiempo de servidor, estados e idempotencia/offline?
**Todo presente y reutilizable (§11–§14).**
- **Identidad de servidor:** `respuesta-formulario` sella `ctx.principal.id`; evidencia sella `usuarioId` del contexto; Órdenes deriva `identityId` del contexto autenticado (nunca del cuerpo). **El frontend nunca envía tenantId/identityId.**
- **Tiempo de servidor:** respuestas/evidencias sellan `new Date()`/ISO del servidor; sesiones aceptan `ocurridoAt` sólo como *device‑time* auxiliar.
- **Estados:** Dynamic Forms **BORRADOR→ENVIADA** (mapea NO INICIADO/EN PROGRESO/COMPLETADO a nivel de experiencia: sin borrador = NO INICIADO, borrador = EN PROGRESO, enviada = COMPLETADO).
- **Idempotencia:** `opId` en respuestas (`_opIds`), evidencias, y comandos correctivo/órdenes; `nuevoOpId()` en cliente; el orquestador `capturarRespuesta` es idempotente y recuperable.
- **Offline (§12):** **una sola** cola segura ya existe — `lib/offline/cola.ts` (`ColaSync`, `nuevoOpId`, `crearEnviadorHttp`, `POST .../sync`) + `lib/offline/contexto.ts` (`mutarConOffline`). **No** se crea una segunda cola: el preoperacional reutiliza `mutarConOffline` con el comando orquestador de captura. El borrador de Dynamic Forms cubre la persistencia parcial online.

---

## 2. Puntos de acceso (entradas) para «Iniciar preoperacional»

Todos ya existen como superficies; sólo falta la entrada compositiva:
- **QR del activo:** `GET /activos/qr/resolver`, `POST /activos/:id/qr` (`activos-module.ts`; permisos `platform.qr.read/write` en `activos-runtime.ts`); ruta frontend `/activos/escanear`. El backend valida activo+tenant.
- **Listado / ficha de activo:** `/activos`, `/activos/:id` (ficha 360°).
- **Home por perfil:** `inicio-empresa.tsx` (acción primaria «Iniciar preoperacional» — LITE‑02 §12; fuente de «preoperacionales pendientes» condicionada a L4‑1).
- **Navegación:** grupo PREOPERACIONAL modulado por capacidad *ejecutar* (LITE‑02 §2), no añadido al nav hasta existir la ruta.

---

## 3. Propuesta de implementación mínima (composición — SIN módulo paralelo)

> Regla §22: preferir reutilización; sólo aditivo y justificado si el modelo actual no puede representar la ejecución.

**Mapeo del flujo objetivo sobre lo existente:**

| Etapa | Compone (reutiliza) | Delta a construir | Clasificación |
|---|---|---|---|
| EQUIPO | `/activos`, `/activos/:id`, QR `/activos/escanear` | entrada de selección de equipo (presentación) | reutilización + composición |
| PREOPERACIONAL (entrada) | identidad de sesión, activo (centro/ubicación/responsable) | superficie guiada que fija procedencia | **GAP L4‑1** |
| PLANTILLA | `modulo.formularios.plantilla.obtenerActiva`, `resolutor.ts` | mapa tipo/categoría de equipo → plantilla preoperacional | **GAP L4‑6** |
| CHECKLIST | `FormularioDinamico`, `DefinicionChecklist`, evidencia sellada | control segmented CUMPLE/NO CUMPLE/NA sobre DS | **GAP L4‑4** |
| RESPUESTAS | `respuesta.guardarBorrador`→`enviar`, `opId`, versión fijada | orquestador de captura anclado a activo (análogo a `capturarRespuesta`) | **GAP L4‑1** |
| EVIDENCIA/OBSERVACIÓN | `evidencias.ts` (referencia‑only, sellada), `comentario`/`firma` | — | reutilización directa |
| RESULTADO (APTO/OBS/NO APTO) | `hayBloqueos`, `HallazgoCampo`, `calcularPuntaje`, `Badge` (exito/error/advertencia) | agregación a veredicto de instancia | **GAP L4‑2** (regla ⇒ **L4‑3 DETENERSE**) |
| HALLAZGO (procedencia) | `crearSolicitud`(`origen`,`objeto.activoId`,`evidencias`), relaciones OT `checklist/evidencia/activo` | prellenado de procedencia desde preoperacional | **GAP L4‑5 / L4‑7** |
| → OT (LITE‑05) | `transicionarSolicitud`, `generarOrden` (idempotente), `/ordenes/:id` | **NO auto‑generar ahora**; sólo dejar preparado | preparación |

**Persistencia (§22):** representar la ejecución preoperacional como `respuesta-formulario` (plantilla checklist + versión fijada) **+ convención de anclaje** (activoId, centroCosto, origen=PREOPERACIONAL) transportada en la respuesta/relación. **No** se propone nueva tabla salvo que Dirección exija un agregado «preoperacional» de primera clase con veredicto persistido (entonces: aditivo, mínimo, justificado, ciclo DGP formal — LITE‑02 F5).

**Superficie HTTP propuesta (composición, no motor nuevo):** un orquestador de servidor que (a) resuelva la plantilla preoperacional activa por equipo (proxy a `plantilla.obtenerActiva`) y (b) capture la respuesta anclada a activo componiendo `guardarBorrador→enviar` idempotente por `opId` (patrón idéntico a `modulo.ordenes.capturarRespuesta`), replayable por la cola offline existente.

**Cumplimiento de invariantes:** identidad/tiempo de servidor (ya sellados); idempotencia `opId`; una sola cola offline; sin cambios RBAC/RLS (autoridad backend, 403); tokens `--do-*` y estados color+icono+etiqueta; tipos de respuesta CUMPLE/NO CUMPLE/OBSERVACIÓN/NO APLICA sobre el contrato existente `estado boolean|"na"` + `comentario`.

---

## 4. GAPs y decisiones que requieren Dirección

| ID | GAP / Decisión | Clasificación | Bloquea |
|---|---|---|---|
| **L4‑1** | Superficie de anclaje **a ACTIVO** (leer plantilla activa por equipo + capturar respuesta con procedencia), hoy sólo anclada a OT/Correctivo | GAP (composición de servidor) | implementación de captura preoperacional |
| **L4‑2** | **Veredicto de instancia** APTO/APTO‑CON‑OBS/NO APTO (agregación sobre `hayBloqueos`/puntaje) | GAP (composición) | resultado del preoperacional |
| **L4‑3** | **Fuente de verdad de criticidad** (marca «ítem crítico» / catálogo / regla) — **DETENERSE‑Y‑PREGUNTAR** | GAP de negocio; **no inventar** | regla NO APTO y «APTO CON OBSERVACIONES» |
| **L4‑4** | Control **segmented CUMPLE/NO CUMPLE/NA** mobile‑first sobre DS (hoy `checklist` es `RadioGroup` genérico) | rediseño de componente | UX de checklist |
| **L4‑5** | **Prellenado automático** de solicitud correctiva desde preoperacional | composición (no motor) | puente hallazgo→solicitud |
| **L4‑6** | **Resolución de plantilla por tipo/categoría de equipo** (mapa inexistente) + atributos de plantilla (vigencia/aplicabilidad) | GAP menor (dato/plantilla) | selección de checklist |
| **L4‑7** | **Procedencia en la OT** (Origen: PREOPERACIONAL/Checklist/Ítem/Hallazgo/Activo/Usuario/Fecha) poblada desde la ejecución | composición | trazabilidad LITE‑05 |

**Decisiones pendientes de negocio (heredadas y aplicables):**
- **DP‑2 (DETENERSE):** semántica de «APTO CON OBSERVACIONES» y definición de ítems críticos (⇒ L4‑3).
- **DP‑1:** unificación severidades checklist (Leve/Media/Crítica) ↔ motor (advertencia/error/bloqueo).
- **DP‑8/DP‑9:** obligatoriedad/frecuencia del preoperacional y quién puede registrarlo (rol/capacidad *ejecutar*; el rol OPERADOR **no** se crea — G‑E/DP‑3).

---

## 5. Revisión independiente

- ✔ **No se inventó funcionalidad existente:** cada capacidad (plantillas/respuestas/evidencia/idempotencia/offline/correctivo→OT/QR) está anclada a archivo + símbolo real.
- ✔ **Composición, no módulo paralelo:** el preoperacional se compone sobre Dynamic Forms + Activos + Correctivo + cola offline única; el único delta de servidor es un orquestador de anclaje a activo análogo a `capturarRespuesta`.
- ✔ **No se inventó regla de seguridad:** la criticidad (L4‑3/DP‑2) se marca **DETENERSE‑Y‑PREGUNTAR**; el veredicto NO APTO queda pendiente de origen autoritativo.
- ✔ **Invariantes respetadas:** identidad/tiempo de servidor, idempotencia `opId`, una sola cola offline, sin cambios RBAC/RLS, tokens `--do-*`, estados no dependientes sólo del color.
- ✔ **LITE‑05 preparado, no ejecutado:** hallazgo con procedencia listo; sin auto‑generación de OT en esta fase.
- ✔ **Cero cambios de código; `git` sin tocar; cero credenciales.**

> **Fin del PASO 1.** No implementar. Esperar aprobación de Dirección sobre los GAPs L4‑1…L4‑7 y, en particular, **L4‑3/DP‑2 (criticidad)** marcado DETENERSE‑Y‑PREGUNTAR.
