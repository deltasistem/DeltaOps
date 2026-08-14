# DELTAOPS LITE — FASE 5 · AUDITORÍA DE DESCUBRIMIENTO «HALLAZGO → OT → EJECUCIÓN → CIERRE»

> **Naturaleza:** entregable del **PASO 1** de la directiva LITE-05 — **SOLO auditoría de descubrimiento**. NO se modificó código, base de datos, migraciones, contratos, RBAC/RLS ni workflows. NO se implementó nada. `git` sin tocar.
> **Continuidad:** parte de `DELTAOPS-LITE-04-DISCOVERY.md` (PASS, fase cerrada) y del puente prellenado que LITE-04 dejó preparado (`activos-preoperacional.tsx` → `/correctivo/solicitudes/nueva?activo=…&origen=preoperacional`).
> **Regla vinculante:** cerrar el bucle **por composición/reuso** sobre Correctivo + Órdenes + Activos + Dynamic Forms + Preoperacional (LITE-04). **Prohibido**: módulo de mantenimiento paralelo, segunda OT, segunda cola offline, nuevo sistema de estados, nuevo motor de workflow, cambios estructurales de RBAC/RLS, duplicación de datos. Si una capacidad falta → se documenta **GAP**; **no se inventa**.

---

## 0. Resumen ejecutivo

**El bucle HALLAZGO → SOLICITUD/OT → ASIGNACIÓN → EJECUCIÓN → REVISIÓN → CIERRE es realizable casi en su totalidad por composición.** El puente idempotente hallazgo→OT **YA EXISTE** en Correctivo y el motor de Órdenes cubre asignación/ejecución/validación/cierre completos. La deuda es de **experiencia (UX del hallazgo) + transporte de procedencia + una decisión de anclaje de la clave de idempotencia**, no de dominio.

- **Puente hallazgo→OT (REUTILIZABLE, núcleo del bucle):** `modulo.correctivo.generar-orden-correctiva` es un **orquestador idempotente** que compone `modulo.ordenes.crear` (tipo canónico `"correctiva"`) vía el puerto oficial `MaterializadorOrdenes`, y persiste el vínculo generación→OT **atómicamente** en `deltaops.cor_generacion_materializaciones` con guard anti-duplicado (`reservar`/`vincular`). Idempotente por `opId` y por `claveDedup`. Devuelve `ordenTrabajoId` navegable en `/ordenes/:id`.
- **Estados (REUTILIZABLE, cero nuevos):** Órdenes ya expone el catálogo canónico `BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA → EN_EJECUCION ⇄ PAUSADA → EN_VALIDACION → CERRADA` (`maquina-estados.ts`), gobernado por el Workflow Engine. Cubre asignación, ejecución, revisión y cierre **sin inventar estados**.
- **Ejecución/cierre (REUTILIZABLE):** Órdenes ya tiene `asignar`, `registrarEjecucion`, `transicionar`, `aprobarCierre`, sesiones de trabajo (`abrir/pausar/reanudar/cerrar` con valoración de mano de obra FAIL-SAFE), evidencias (`agregarEvidencia`), y captura de respuesta de formulario/checklist (`capturarRespuesta`) durante la ejecución.
- **GAP central L5-1 (DECISIÓN DE DIRECCIÓN — §13/§21):** la clave de deduplicación existente es `sol:${solicitudId}:orden-correctiva` (una **solicitud** → una OT). LITE-05 exige **un HALLAZGO → máximo una OT** con `hallazgoId = ejecuciónId + ítemId`. Hoy no hay clave anclada al hallazgo → dos «Generar mantenimiento» sobre el MISMO hallazgo crearían dos solicitudes distintas y por tanto dos OTs. Requiere anclar la idempotencia al `hallazgoId` (ver §Diseño; probable columna/constraint aditiva o convención de `opId` determinista) — **si exige nueva tabla o cambio de constraint estructural, es §21 STOP**.
- **GAP L5-2 (composición):** el `MaterializadorOrdenes` actual pasa a `modulo.ordenes.crear` **sólo** `titulo`, `tipo:"correctiva"`, `activoPrincipal`, `observaciones`. NO transporta `centroCosto`, `ubicacion`, `responsable`, prioridad ni la procedencia completa del hallazgo (§1 directiva). Órdenes SÍ acepta esos campos. Resoluble por composición (enriquecer la entrada de materialización desde `modulo.activos.detalle` + la solicitud), sin cambiar contratos.
- **GAP L5-3 (composición/UX):** no existe una superficie que reciba la **procedencia completa del hallazgo** (ítem, respuesta original, criticidad, evidencia del preoperacional, usuario, fecha, plantilla+versión, `origen=PREOPERACIONAL`). El puente LITE-04 sólo pasa `?activo=&origen=preoperacional`. Debe componerse el transporte (deep-link enriquecido y/o lectura server-side de la ejecución sellada por `respuestaId`).
- **GAP L5-4 (DECISIÓN DE DIRECCIÓN — §8/§21):** **estado del hallazgo** (pendiente / ya convertido / no requiere OT). No existe un almacén de estado de hallazgo. La directiva §8 prohíbe nuevos estados y §2 exige distinguir esos tres estados en la UI. Se propone **derivar** el estado (convertido = existe generación materializada para ese `hallazgoId`; no-requiere = sin necesidad de persistencia) para evitar un nuevo sistema de estados; persistir un «no requiere OT» sería un nuevo store → **presentar a Dirección**.
- **Centros de costos (REUTILIZABLE):** `modulo.activos.detalle` es la fuente de verdad y expone `centroCosto`, `ubicacionId`, `responsable`. La OT los respeta si se transportan (GAP L5-2). Si el activo no tiene centro → mostrar «Sin centro de costos configurado», no inventar (§6).
- **Multicentro (REUTILIZABLE):** no hay jerarquía universal ni coordinador obligatorio codificado. Órdenes usa identidad canónica (`idn_identities`) + capacidades (`validar-ordenes` = excepción §6) + el motor de aprobación existente. Una persona puede asignar/ejecutar/revisar/cerrar si sus capacidades lo permiten, con auditoría completa (§5/§16).
- **Offline (REUTILIZABLE):** una sola cola (`lib/offline/cola.ts` + `contexto.tsx`, aislada por `modulo`), replay por `/sync`; Correctivo y Órdenes exponen `/sync` con `ColaSyncSchema` y `sincronizar(ctx, ops)` idempotente. La generación de OT es replayable por ser idempotente por `opId`/`claveDedup`.

**GAPs LITE-05:** L5-1 anclaje de idempotencia al `hallazgoId` (DECISIÓN) · L5-2 transporte de centro/ubicación/responsable/procedencia en la materialización (composición) · L5-3 transporte de procedencia completa del hallazgo (composición/UX) · L5-4 estado del hallazgo pendiente/convertido/no-requiere (DECISIÓN §8).

---

## 1. Modelo actual — OT, Correctivo, Activos, Preoperacional (con evidencia archivo + símbolo)

### 1.1 Motor de Órdenes de Trabajo (REUTILIZABLE — es la OT del bucle)
- **HTTP:** `artifacts/api-server/src/routes/deltaops/ordenes-module.ts` (router fino HTTP→Kernel, sesión obligatoria, mapeo KRN→HTTP AUTH/403·NF/404·CFL/409·VAL/400·INF/500, `drain()`=outboxProcessor).
  - Consultas: `listar` (filtros `estado/tipo/responsable/activoPrincipalId/limit`), `detalle`, `agenda`, `calendario`, `consola`, `identidades-elegibles`, `asignaciones`, `responsables`, `relaciones`, `activos-relacionados`, `historial`, `bitacora`, `documentacion`, `formularios`, `checklists`, `sesiones`, `sesion.activa`, `plantillas/:clave/:version`.
  - Comandos: `crear`, `editar`, `transicionar`, `aprobarCierre`, `asignar`, `registrarEjecucion`, `asociarFormulario`, `asociarChecklist`, `capturarRespuesta` (orquestador borrador→enviar→asociar, idempotente por `opId`), `agregarEvidencia`, `sesion.abrir/pausar/reanudar/cerrar`.
- **Estados canónicos:** `lib/module-ordenes/src/domain/maquina-estados.ts` → `ESTADOS = [BORRADOR, ABIERTA, PLANIFICADA, ASIGNADA, EN_EJECUCION, PAUSADA, EN_VALIDACION, CERRADA, CANCELADA]`; motor NEUTRO + mapeo a estados de negocio; tenants pueden AÑADIR por configuración (`catálogo estados` + workflow publicado). **Cubre todo el bucle LITE-05 sin nuevos estados.**
- **`modulo.ordenes.crear` (schema, `module.ts` L875-902):** acepta `titulo, descripcion, tipo, categoria, prioridad, severidad, sla, empresa, proyecto, centroCosto, ubicacion, activoPrincipal, activosRelacionados, responsable, supervisor, solicitante, tiempoEstimado, costoEstimado, riesgoImpacto, fechaSolicitada, fechaProgramada, observaciones`. `id` cliente (offline) + `opId` idempotente. `authorization: { permissions: ["modulo.ordenes.write"] }`.
- **Identidad/capacidades (§5/§16):** las sesiones de trabajo y asignaciones usan la identidad CANÓNICA `idn_identities.identity_id`; FALLO CERRADO si falta (`identidadDeSesion`). Excepción §6 al abrir sesión sin asignación se decide por capacidad `validar-ordenes` (supervisor/admin), no por jerarquía. Rol de sesión = `rolCanonico` (no el legacy).

### 1.2 Correctivo — puente hallazgo→OT (REUTILIZABLE — es el orquestador del bucle)
- **HTTP:** `artifacts/api-server/src/routes/deltaops/correctivo-module.ts`. Comandos incl. `crear-solicitud`, `editar-solicitud`, `adjuntar-evidencia`, `comentar-solicitud`, `registrar-diagnostico`, `transicionar-solicitud`, **`generar-orden-correctiva`**, `crear-intervencion`, `asignar-cuadrillas`, `transicionar-intervencion`, reservas/consumo/devolución de repuestos, `registrar-evento-activo`. Offline `/sync` con `sincronizar(ctx, ops)`.
- **`crear-solicitud` (schema, `lib/module-correctivo/src/module.ts` L443-457):** `titulo, descripcion, origen (catálogo obligatorio), fuenteId (id externo — apto para el hallazgoId), objeto {activoId, componenteId?, ubicacionId?}, prioridad (catálogo), criticidad?, sintomas[], clasificacion?, evidencias[] {attachmentId, tipo, etiqueta?}`. `authorization: ["modulo.correctivo.write"]`. Valida catálogos `origenes-solicitud` y `prioridades`; valida existencia del activo vía `adapters.activos.existen`.
- **`generar-orden-correctiva` (`module.ts` L779-889):** input `{ solicitudId, opId }`, `authorization: ["modulo.correctivo.execute"]`. Flujo: recibo previo por `opId` → carga solicitud (debe estar aprobada) → `claveDedupOrden(solicitudId)` → si ya existe generación devuelve la existente (**idempotente**) → `dedup.reservar` (unique por clave; guard anti-doble) → inicia workflow `generacion` → `crearGeneracionOrden` → `materializador.crearOrden(...)` (compone `modulo.ordenes.crear`) → `materializarGeneracion` (vincula `ordenTrabajoId` atómicamente) → historial + auditoría + sellado de recibo. Devuelve `{ id, solicitudId, ordenTrabajoId, estado }`.
- **Dominio de la generación (`lib/module-correctivo/src/domain/orden-correctiva.ts`):** entidad `GeneracionOrdenCorrectiva { id, tenantId, solicitudId, activoId, claveDedup, ordenTrabajoId|null, estado(pendiente|materializada), workflow, ... }`. `claveDedupOrden(solicitudId) = "sol:${solicitudId}:orden-correctiva"` (token discriminante = **solicitudId**, no hallazgoId → **GAP L5-1**). `materializarGeneracion`: idempotente con el MISMO `ordenTrabajoId`, CONFLICTO con otro.
- **Puerto materializador (`domain/ports.ts` L200-231):** `EntradaMaterializacionOrden { opId(=claveDedup), generacionId, solicitudId, activoPrincipal, titulo, prioridad, tipo, diagnostico }`. Implementación `correctivo-runtime.ts` L90-109: pasa a `modulo.ordenes.crear` sólo `{ id(derivado de generación), opId, titulo, tipo:"correctiva", activoPrincipal, observaciones }` → **GAP L5-2** (no transporta centro/ubicación/responsable/prioridad/procedencia).
- **Dedup durable (`domain/ports.ts` L241-245; `infrastructure/repository.ts` L551-581):** tabla `deltaops.cor_generacion_materializaciones (tenant_id, clave_dedup, generacion_id, orden_trabajo_id, estado, datos)`; `reservar` INSERT unique por `(tenant, clave_dedup)`; `vincular` UPDATE con guard `orden_trabajo_id IS NULL`. **Este es el lugar natural del vínculo hallazgo→OT.**
- **Workflows (`infrastructure/workflow-adapter.ts`):** proceso `solicitud` (registro→triage→diagnostico→validacion→aprobada|rechazada), `intervencion` (preparacion→asignacion→ejecucion→verificacion→cerrada), `generacion` (pendiente→materializada). Todos gobernados por el motor neutro.
- **RBAC (`correctivo-runtime.ts` L356-392):** `principalCorrectivo(userId, rol)`: admin/platform_admin = write+govern+execute+admin; **operador** = write+govern+execute (sin admin); otro = read. **Nota:** el router de Correctivo usa `user.rol` LEGACY (colapsa a `operador`), a diferencia de Órdenes que usa `rolCanonico` — a validar en §19 (CONSULTA sin escritura, técnico/supervisor/planificador/admin).

### 1.3 Activos — fuente de verdad de centro de costos (REUTILIZABLE)
- `modulo.activos.detalle{id}` (`lib/module-activos/src/module.ts`) expone `centroCosto`, `ubicacionId`, `responsable`, `criticidad`, `codigoEmpresarial`, `nombre`, `tipo`. Es la autoridad backend del centro (§6). El `MaterializadorOrdenes`/orquestador puede leerlo para enriquecer la OT sin duplicar datos.

### 1.4 Preoperacional LITE-04 — origen del hallazgo (REUTILIZABLE)
- Ejecución SELLADA en `deltaops.platform_records` (servicio `modulo.preoperacional`, recordType `preoperacional-ejecucion`), inmutable, idempotente por `opId`. Campos: `activoId, plantillaClave, plantillaVersion, respuestaId, veredicto, incumplimientos[] {clave, etiqueta, critico, comentario, evidencias[]}, observaciones[], selladoPor (id canónico), selladoAt (tiempo servidor), contexto.activo {id, codigoEmpresarial, nombre, tipo, criticidad, centroCosto, ubicacionId, responsable, plantillaTitulo}`.
- **Cada incumplimiento = un hallazgo.** `hallazgoId = respuestaId(ejecución) + clave(ítem)` es determinista y disponible en la ejecución sellada. Toda la procedencia §1 (activo, centro, ubicación, responsable, ítem, respuesta original, criticidad, observación, evidencia, usuario, fecha/hora, origen=PREOPERACIONAL) es derivable de la ejecución sellada + `activos.detalle`.
- **Puente LITE-04 existente:** `activos-preoperacional.tsx` L304 → `Link /correctivo/solicitudes/nueva?activo=…&origen=preoperacional`; `lib/correctivo/deep-links.ts` L31-32 arma la URL con `{activo}`. La página destino `correctivo-solicitud-nueva.tsx` lee `?activo=` (ancla el objeto) y `?origen=` (catálogo). **NO transporta ítem/respuesta/criticidad/evidencia/usuario/plantilla/hallazgoId → GAP L5-3.**

### 1.5 Offline (REUTILIZABLE — cola única)
- `artifacts/deltaops/src/lib/offline/cola.ts` (`ColaSync`, `crearEnviadorHttp`) + `contexto.tsx` (`OfflineProvider`, aislada por `modulo`, reintento al reconectar). Backends `/deltaops/correctivo/sync` y `/deltaops/ordenes/sync` con `ColaSyncSchema` + `sincronizar(ctx, ops)` (una UoW por op, outbox drenado dentro). La conversión hallazgo→OT es despachable offline por ser idempotente por `opId`.

---

## 2. Clasificación por requisito (EXISTE / REUTILIZABLE / GAP / NO APLICA)

| # | Requisito (directiva LITE-05) | Clasificación | Evidencia / nota |
|---|---|---|---|
| R1 | Entidad OT | **REUTILIZABLE** | `modulo.ordenes` — NO crear segunda OT (§21). |
| R2 | Estados del ciclo (abierta→…→cerrada) | **REUTILIZABLE** | `maquina-estados.ts` (9 estados canónicos). Cero nuevos (§8). |
| R3 | Endpoints OT (crear/asignar/ejecutar/validar/cerrar) | **REUTILIZABLE** | `ordenes-module.ts` (`asignar`, `registrarEjecucion`, `transicionar`, `aprobarCierre`). |
| R4 | Puente hallazgo→OT idempotente | **REUTILIZABLE (con GAP L5-1)** | `generar-orden-correctiva` + `cor_generacion_materializaciones`. Idempotencia hoy por solicitud, no por hallazgo. |
| R5 | Generación SÓLO por acción explícita (§2) | **REUTILIZABLE** | Comando explícito; nunca automático. UI debe exponer «Generar mantenimiento». |
| R6 | Anti-duplicado UN hallazgo→UNA OT (§13) | **GAP L5-1 (DECISIÓN)** | Guard existe pero anclado a `solicitudId`; anclarlo a `hallazgoId`. |
| R7 | Procedencia en la OT (§1) | **GAP L5-2 + L5-3 (composición)** | Datos disponibles (ejecución sellada + `activos.detalle`); falta transportarlos. |
| R8 | Centro de costos desde activo (§6) | **REUTILIZABLE (via L5-2)** | `activos.detalle.centroCosto`; «Sin centro configurado» si falta. |
| R9 | Multicentro sin jerarquía/coordinador (§5/§16) | **REUTILIZABLE** | Identidad canónica + capacidades + motor de aprobación. |
| R10 | Asignación | **REUTILIZABLE** | `modulo.ordenes.asignar` + `identidades-elegibles`. |
| R11 | Ejecución + sesiones de trabajo | **REUTILIZABLE** | `registrarEjecucion`, sesiones `abrir/pausar/reanudar/cerrar`. |
| R12 | Revisión / validación / cierre | **REUTILIZABLE** | `transicionar` (EN_VALIDACION) + `aprobarCierre` (CERRADA). |
| R13 | Aprobaciones | **REUTILIZABLE** | Workflow Engine + capacidad `validar-ordenes`. No nuevo sistema (§21). |
| R14 | Evidencias (referenciar hallazgo + añadir en ejecución) (§9) | **REUTILIZABLE** | Attachment referencia-only; `evidencias` en solicitud + `agregarEvidencia` en OT. |
| R15 | Costos / mano de obra / repuestos (§10) | **REUTILIZABLE** | Valoración FAIL-SAFE al cerrar sesión; reservas/consumo/devolución en intervención. No nuevos cálculos; no tocar DGP-021.x. |
| R16 | Auditoría (quién/cuándo/qué/rol/estado ant.-nuevo) (§5) | **REUTILIZABLE** | `audit(...)` + historial + eventos en Correctivo y Órdenes. |
| R17 | Offline (cola única) (§11) | **REUTILIZABLE** | `ColaSync` + `/sync` idempotente. No segunda cola (§21). |
| R18 | Relación con Activos | **REUTILIZABLE** | `activoPrincipal` en OT + `activos-relacionados` + eventos-activo Correctivo. |
| R19 | Capacidades por rol (§12) | **REUTILIZABLE (revisar)** | `principalOrdenes`/`principalCorrectivo`. Verificar canónico vs legacy en Correctivo (§19). |
| R20 | Indicadores Home datos reales (§15) | **REUTILIZABLE** | `listar?estado=…` + `consola`. Sólo métricas accionables reales. |
| R21 | Estado del hallazgo (pendiente/convertido/no-requiere) (§2/§8) | **GAP L5-4 (DECISIÓN)** | Derivar de existencia de generación materializada; persistir «no requiere» sería nuevo store. |
| R22 | Backend autoridad (tenant/identidad/centro/rol/activo) (§12) | **REUTILIZABLE** | Contextos server-side, RLS por tenant, identidad canónica. |
| R23 | Nueva jerarquía / planning / IA / MTBF-MTTR / módulo nuevo | **NO APLICA** | Prohibido explícitamente (§18). No es un ERP. |
| R24 | Design System / mobile-first / light-dark (§14/§18) | **REUTILIZABLE** | DS existente; sin rehacer visual. |

---

## 3. GAPs que requieren DECISIÓN DE DIRECCIÓN (§17/§21) vs. resolubles por composición

### 3.1 Requieren decisión (§21 — posible STOP)
- **L5-1 · Anclaje de idempotencia al `hallazgoId`.** Opciones: (a) **`opId` determinista** derivado del `hallazgoId` en `crear-solicitud` + `generar-orden-correctiva` (aprovecha recibos por `opId` ya existentes, sin schema nuevo) — preferida y **por composición**; (b) columna/constraint aditiva sobre `cor_generacion_materializaciones` con clave `hallazgo:${ejecucionId}:${itemId}:orden-correctiva` (aditiva, no estructural) — a validar si califica como cambio estructural; (c) nueva tabla de vínculo hallazgo→solicitud → **STOP §21**. **Recomendación:** validar que (a)+(b-aditiva) evitan duplicados sin tabla nueva; si no, elevar a Dirección.
- **L5-4 · Estado del hallazgo.** ¿Se DERIVA (convertido ⇔ existe generación materializada para el `hallazgoId`; pendiente ⇔ no existe; «no requiere OT» ⇔ no se persiste, sólo UX transitoria) o se PERSISTE un marcador «no requiere OT»? Persistir un marcador = **nuevo sub-estado/almacén** → §8/§21, elevar a Dirección. **Recomendación:** derivar (sin nuevo estado); confirmar que «no requiere OT» no necesita persistencia.

### 3.2 Resolubles por composición (sin decisión)
- **L5-2 · Transporte de centro/ubicación/responsable/prioridad/procedencia en la materialización.** Enriquecer `EntradaMaterializacionOrden` y su implementación leyendo `modulo.activos.detalle` (centro/ubicación/responsable) + la solicitud (prioridad/síntomas/evidencias). No cambia el contrato público de Órdenes (los campos ya existen en `crear`). Si el activo no tiene centro → «Sin centro de costos configurado» (§6).
- **L5-3 · Transporte de la procedencia completa del hallazgo.** Enriquecer el deep-link LITE-04 y/o resolver server-side por `respuestaId + itemClave` desde la ejecución sellada (autoridad backend, §12) para poblar `origen=preoperacional`, `fuenteId=hallazgoId`, `objeto.activoId`, `sintomas` (etiqueta+comentario del ítem), `criticidad`, `evidencias` (referencia a la evidencia del preoperacional).

---

## 4. Propuesta de diseño mínima (composición)

### 4.1 Qué se compone (nada nuevo de dominio)
1. **Convertir hallazgo → solicitud correctiva:** `crear-solicitud` con `origen="preoperacional"` (catálogo `origenes-solicitud`), `fuenteId = hallazgoId (=respuestaId+itemClave)`, `objeto.activoId`, `sintomas` (etiqueta/comentario del ítem), `criticidad`, `evidencias` (referencia a la evidencia del preoperacional). `opId` determinista sobre `hallazgoId` (idempotente ante doble-click/refresh/offline).
2. **Aprobar y generar OT:** `transicionar-solicitud` → `generar-orden-correctiva { solicitudId, opId }`. El materializador (enriquecido, L5-2) compone `modulo.ordenes.crear` con `tipo:"correctiva"`, `activoPrincipal`, `centroCosto`, `ubicacion`, `responsable`, `prioridad`, `observaciones` con la procedencia §1.
3. **Asignar / ejecutar / revisar / cerrar:** exclusivamente con los comandos existentes de Órdenes (`asignar`, sesiones, `registrarEjecucion`, `agregarEvidencia`, `capturarRespuesta`, `transicionar`→EN_VALIDACION, `aprobarCierre`→CERRADA). Cero estados nuevos.

### 4.2 Dónde vive el vínculo hallazgo→OT
- **En Correctivo**, en `deltaops.cor_generacion_materializaciones` (guard atómico ya existente), con la clave de dedup **anclada al `hallazgoId`** (L5-1). El registro `generacion-correctiva` guarda `solicitudId → ordenTrabajoId` y es la autoridad del «ya convertido».
- La solicitud guarda `origen=preoperacional` + `fuenteId=hallazgoId` (trazabilidad hallazgo↔solicitud↔OT sin duplicar datos del preoperacional; la ejecución sellada sigue siendo la fuente de verdad).

### 4.3 Cómo se garantiza la unicidad (§13)
- **Preferido:** `opId` determinista = función pura de `hallazgoId` en `crear-solicitud` **y** en `generar-orden-correctiva` → los recibos por `opId` (`reciboPrevio`/`sellarRecibo`) hacen la operación idempotente end-to-end; el guard `dedup.reservar` (unique) es la segunda barrera; `materializarGeneracion` es la tercera (mismo `ordenTrabajoId` = no-op, otro = CONFLICTO). Robusto ante doble-click / refresh / mala conexión / retry / sync offline.
- **A confirmar en PASO 2:** que la clave `claveDedup` pueda anclarse al `hallazgoId` sin cambio estructural; si requiere tabla nueva → STOP §21 (L5-1).

### 4.4 Qué muestra la UI por estado de hallazgo (§2)
- **Pendiente** (no existe generación para el `hallazgoId`): botón **«Generar mantenimiento»** (acción explícita, nunca automática).
- **Ya convertido** (existe generación materializada): texto **«Mantenimiento ya generado»** + enlace a la OT (`/ordenes/:ordenTrabajoId`). Idempotente: reintentar reabre la misma OT.
- **No requiere OT:** estado transitorio de UX (sin persistencia nueva salvo decisión L5-4); el hallazgo permanece visible como pendiente hasta convertirse o descartarse en la vista.

### 4.5 Indicadores Home (§15, sólo datos reales)
- Hallazgos pendientes (preoperacional con incumplimientos sin generación), mantenimientos derivados de preoperacionales (`ordenes.listar?tipo=correctiva` cruzado con generaciones `origen=preoperacional`), órdenes pendientes de asignación (`listar?estado=ABIERTA|PLANIFICADA`), órdenes en ejecución (`listar?estado=EN_EJECUCION`). Sin métricas inventadas.

---

## 5. Verificaciones pendientes para PASO 2 (§19)
- Confirmar que el catálogo `origenes-solicitud` incluye (o admite) el valor `preoperacional` sin cambio estructural.
- Confirmar que `opId` determinista sobre `hallazgoId` es aceptado por `crear-solicitud`/`generar-orden-correctiva` y que evita duplicados (test double-click / refresh / offline-sync).
- Confirmar Correctivo usa el rol adecuado para RBAC (canónico vs legacy) para CONSULTA-sin-escritura y técnico/supervisor/planificador/admin.
- Confirmar que el enriquecimiento del materializador (centro/ubicación/responsable) NO cambia contratos públicos de Órdenes.
- Suite de tests §19: conversión, procedencia, idempotencia, double-click, aislamiento de tenant, RBAC, CONSULTA sin escritura, centros de costos, evidencia, cierre, refresh, offline. Sin PASS con mocks.

> **Fin del PASO 1.** No se implementa nada hasta aprobación. GAPs L5-1 y L5-4 requieren decisión de Dirección antes de tocar idempotencia/estado; L5-2 y L5-3 son composición pura.
