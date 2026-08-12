# DGP-020 · DESCUBRIMIENTO — Duración real de OT y fundación de mano de obra

> **Estado:** DISCOVERY. **Cero** código, migraciones, tablas, contratos, OpenAPI,
> Workflow, frontend o módulos congelados modificados. Entregable único.
> Toda afirmación está anclada al corpus real (paquete/archivo/servicio). Lo que
> no pudo demostrarse se marca **NO VERIFICADA**. La Dirección pidió verdad
> incómoda antes que supuestos: este informe la prioriza.

---

## 1. Resumen ejecutivo

DeltaOps **YA modela el ciclo de vida de la OT** con un motor de estados
declarativo gobernado por el Workflow Engine (`lib/module-ordenes/src/domain/maquina-estados.ts`),
con estados `BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA → EN_EJECUCION ⇄ PAUSADA
→ EN_VALIDACION → CERRADA` (+ `CANCELADA`). Existe además una **bitácora
operacional append-only** (`ord_bitacora_read`, evento `modulo.ordenes.bitacora-registrada`)
con acciones `inicio/pausa/reanudacion/espera/finalizacion/...`, `actor_id`, y
—clave— **dos** timestamps: `ocurrido_at` (momento del hecho, admite hora de
dispositivo) y `registrado_at` (persistencia en servidor).

**Qué se puede medir HOY (con certeza):**
- **Tiempo calendario/hasta-cierre por marcas escalares** del aggregate
  (`fechas.inicio`, `fechas.finalizacion`, `fechas.cierre`) — **pero** estas
  marcas se sellan con **hora de servidor** (`new Date()`), no del dispositivo, y
  **no** capturan múltiples ciclos de pausa.
- **Tiempo efectivo y tiempo pausado** SÓLO si el operador registra
  disciplinadamente pares `inicio/pausa/reanudacion/finalizacion` en la bitácora
  con `ocurridoAt`. No es un cálculo garantizado por el contrato: es una
  **reconstrucción condicionada a datos opcionales** que el flujo NO obliga.

**Qué NO se puede medir hoy (declarado sin inventar):**
- **Duración efectiva confiable** de forma automática y garantizada — la
  bitácora es opcional y desacoplada de las transiciones del Workflow.
- **Mano de obra**: no existe NINGÚN dato de tarifa/hora, horas trabajadas por
  técnico, jornada, turno, costo laboral ni centro de costo de mano de obra.
- **identityId fuerte en la asignación** (G-1 de DGP-018 **sigue vigente**):
  `asignado_id` y `responsable` son `text` libre sin FK ni validación contra
  Identidad.
- **Costo de OT / costo de repuestos consumidos**: `registrar-recurso` es
  descriptivo (sin costo, sin decremento de inventario, sin FK a Abastecimiento).
- **Disponibilidad del activo por OT**: Órdenes **nunca** invoca Activos; no hay
  propagación de estado `MANTENIMIENTO/FUERA_SERVICIO` desde la OT.

**Conclusión de arquitectura:** la fuente de verdad para *duración real* y *mano
de obra* debe vivir en un modelo de **sesiones de trabajo append-only**
(time-tracking) alimentado por **comandos/eventos ADITIVOS propios de sesión que
EXIJAN y persistan `ocurridoAt` de dispositivo** (más `registradoAt` de
servidor). **Los eventos existentes de Workflow (`estado-cambiado` /
`instancia.transicionada`) NO sirven como fuente automática de los intervalos**:
sólo aportan hora de servidor (`transicionar` no acepta ni propaga `ocurridoAt`;
`sincronizarEstado` usa `new Date()`), por lo que una sesión derivada de
transiciones reproduciría exactamente GAP-CLOCK. La bitácora tampoco lo garantiza
(opcional y desacoplada). Por tanto la derivación desde eventos de
Workflow/bitácora se relega a **señal auxiliar de contraste/heurística**, nunca a
origen de los tramos. Se compone sobre Órdenes por `ordenId`/`entityRef` **sin**
modificar el aggregate frozen ni el motor, y **sin** duplicar
órdenes/técnicos/identidad. La propuesta detallada está en §24.

---

## 2. Estado actual

- **Paquete:** `lib/module-ordenes` (~6.5k LOC). Aggregate frozen desde DGP-009.1
  (`domain/orden.ts`), motor operacional DGP-009.2 (`infrastructure/operacional.ts`).
- **Persistencia (schema `deltaops`):** `ord_ordenes` / `ord_ordenes_read`
  (aggregate + read model), `ord_eventos` (bitácora durable de eventos =
  fuente de replay), `ord_agenda_read`, `ord_asignaciones` / `ord_asignaciones_read`,
  `ord_responsables_read`, `ord_bitacora_read`, `ord_historial_read`,
  `ord_relaciones` / `ord_relaciones_read`, `ord_documentacion_read`,
  `ord_planificacion`, `ord_recursos`, `ord_sla`, `ord_secuencias`,
  `ord_recibos` + `ord_sync_receipts` (idempotencia/offline). Verificado por
  `psql \dt deltaops.ord_*`.
- **RLS por tenant** en todas las tablas (política `tenant_isolation`,
  `current_setting('app.tenant_id')`), consistente con el resto del programa.
- **Shared Timeline:** todos los eventos del módulo (aggregate + operacionales)
  se registran vía `platform.timeline.record` (`module.ts`, `registrarEnTimeline`).

---

## 3. Estados reales de OT

Fuente: `domain/maquina-estados.ts` (NO asumidos; extraídos del contrato).

Estados de negocio (`ESTADOS`): `BORRADOR, ABIERTA, PLANIFICADA, ASIGNADA,
EN_EJECUCION, PAUSADA, EN_VALIDACION, CERRADA, CANCELADA`.
Inicial: `BORRADOR`. Finales: `CERRADA, CANCELADA`.

El ciclo se declara como `DefinicionWorkflow` NEUTRA (`DEFINICION_WORKFLOW_ORDEN`)
y el motor la ejecuta; el aggregate **no decide transiciones** (`aplicarEstado`
sólo REFLEJA el estado). Los tenants pueden **añadir** estados/transiciones por
configuración (`componerDefinicion`), validados por `validarWorkflow`.

**Transiciones canónicas** (de `DEFINICION_WORKFLOW_ORDEN.transiciones`):

| Origen (neutro) | Destino | Comando lógico | Permiso | Timestamp sellado | Evento |
|---|---|---|---|---|---|
| borrador | abierto | `abrir` | `modulo.ordenes.operar` | — | `estado-cambiado` |
| abierto | planificado | `planificar` | operar | — | `estado-cambiado` |
| planificado | asignado | `asignar` | operar | — | `estado-cambiado` |
| asignado | enEjecucion | `iniciar` | operar | **`fechas.inicio`** (1ª vez) | `estado-cambiado` |
| enEjecucion | pausado | `pausar` | operar | — (¡no sella!) | `estado-cambiado` |
| pausado | enEjecucion | `reanudarEjecucion` | operar | — (`fechas.inicio` ya existe) | `estado-cambiado` |
| enEjecucion | enValidacion | `enviarValidacion` | operar | **`fechas.finalizacion`** | `estado-cambiado` |
| enValidacion | enEjecucion | `devolver` | `modulo.ordenes.validar` | — | `estado-cambiado` |
| enValidacion | cerrado | `cerrar` (gate aprobación `validacionCierre`) | validar | **`fechas.cierre`** | `estado-cambiado` + `cerrado` |
| cualquier no-final | cancelado | `cancelar` (op. estándar) | operar | — | `estado-cambiado` |

Notas verificadas:
- El comando de aplicación es `modulo.ordenes.transicionar` (`module.ts` ~1103),
  que orquesta el motor y luego `sincronizarEstado` refleja el estado en la OT.
- El cierre está **gobernado por aprobación inline** (gate `validacionCierre`,
  modo individual, aprobadores `["validador"]`), resuelto por
  `modulo.ordenes.aprobarCierre` (`module.ts` ~1177). Rechazo → `enEjecucion`.
- El estado de dispositivo/actor de cada transición queda en `platform_audit`
  (`transicionar:<comando>`) y en el evento `<servicio>.instancia.transicionada`
  del motor (`workflow-engine/src/motor.ts` ~313), que incluye `estadoAnterior`,
  `comando` y `principal.id`.

---

## 4. Comandos

De `lib/module-ordenes/src/module.ts` (nombres reales, prefijo `modulo.ordenes.`):

- **Aggregate/ciclo:** `crear`, `editar`, `actualizar-asignacion` (responsable/
  supervisor/solicitante), `actualizar-ejecucion` (diagnóstico/tiempoReal/
  costoReal), `asociar-formulario`, `asociar-checklist`, `agregar-evidencia`,
  `transicionar`, `aprobarCierre`.
- **Operacional (DGP-009.2):** `bitacora.registrar`, `planificar`,
  `asignar-recurso-humano`, `registrar-recurso`, `sla.definir`, `crear-relacion`.
- **Consultas:** `detalle`, `listar`, `agenda`, `asignaciones`, `responsables`,
  `relaciones`, `activos-relacionados`, `historial`, `bitacora`, `documentacion`,
  `consola`.
- **Offline:** `procesarCola` (orquestador de `/sync`, `sincronizacion.ts`; no es
  comando del Kernel envolvente).

Autorizaciones observadas: transiciones `operar`/`validar`; escritura de
planificación/asignación/recursos `write`; bitácora `operar`.

---

## 5. Eventos

De `domain/orden.ts` (`EVENTOS_MODULO`) y `domain/operacional.ts`
(`EVENTOS_OPERACIONALES`):

**Aggregate:** `creada, actualizada, estado-cambiado, asignacion-actualizada,
ejecucion-actualizada, formulario-asociado, checklist-asociado, evidencia-agregada`.
**Operacionales:** `bitacora-registrada, planificacion-actualizada,
planificacion-bloqueada, asignacion-registrada, recurso-registrado,
sla-actualizado, relacion-creada`.

Cada evento es **autosuficiente** (payload completo, incluye `actorId`,
`tenantId`, `entityRef`). Se persiste en `ord_eventos` con el MISMO `event.id`
del outbox (`emitirEvento`/`persistir`), habilitando replay y proyección
idempotente (por `last_event_id`/`version` o append-only por `event_id`).

**Además**, el Workflow Engine emite `<servicio>.instancia.transicionada` por
cada transición (con `estadoAnterior`, `comando`, actor). **NO VERIFICADO** que
ese evento del motor llegue al Shared Timeline de Órdenes (el módulo sólo
registra en timeline sus `EVENTOS_MODULO`+`EVENTOS_OPERACIONALES`, ver §21).

---

## 6. Bitácora

`ord_bitacora_read` (verificado por `\d`): `tenant_id, event_id, orden_id,
accion, detalle (jsonb), actor_id, ocurrido_at, registrado_at`. Alimentada por
`bitacora-registrada` vía `aplicarBitacora` (append-only, idempotente por
`(tenant_id, event_id)`).

Acciones canónicas (`ACCIONES_BITACORA`): `inicio, pausa, reanudacion, espera,
cambio-responsable, llegada, salida, finalizacion`.

Respondiendo el checklist §4 de la directiva:
- **¿registra eventos con timestamp?** Sí — `ocurrido_at` (hecho) y
  `registrado_at` (persistencia). Distinción real, no cosmética.
- **¿identifica actor?** Sí (`actor_id = ctx.principal.id`).
- **¿identifica técnico?** Sólo si el actor ES el técnico (o vía
  `detalle`/`cambio-responsable`). No hay un campo "técnicoId" dedicado ni FK.
- **inicio / pausa / reanudación / finalización / múltiples ciclos de pausa /
  espera:** las **acciones existen** y la bitácora es append-only ⇒ **admite N
  ciclos de pausa**.
- **cancelación / reapertura / cierre:** NO son acciones de bitácora; viven como
  transiciones de estado (`cancelar`, `cerrar`; reapertura no existe —
  `reabrir:false`).

**Reconstrucción de TIEMPO TRANSCURRIDO / EFECTIVO:** matemáticamente posible
**si y sólo si** el consumidor registra la secuencia de acciones con `ocurridoAt`.
El contrato **no obliga** a registrar bitácora ni la acopla a las transiciones de
Workflow ⇒ la reconstrucción **no está garantizada** (ver §8/§9).

---

## 7. Timestamps

Inventario real y su **naturaleza** (crítico para duración):

| Dato | Tabla/campo | Origen del tiempo |
|---|---|---|
| `fechas.solicitada/programada` | `ord_ordenes(_read)` payload | servidor (creación) o input |
| `fechas.inicio` | idem | **servidor** (`aplicarEstado`, `new Date()` en `sincronizarEstado` ~465) |
| `fechas.finalizacion` | idem | **servidor** |
| `fechas.cierre` | idem | **servidor** |
| bitácora `ocurrido_at` | `ord_bitacora_read` | **dispositivo/negocio** si el cliente envía `ocurridoAt`; si no, **servidor** (`module.ts` ~1307) |
| bitácora `registrado_at` | idem | **servidor** (persistencia) |
| SLA `inicio_at/vencimiento_at/suspendido_desde` | `ord_sla` | servidor / input |
| audit `transicionar:<cmd>` | `platform_audit` | servidor |
| WF instancia `updatedAt` | motor | servidor |

**Verdad incómoda:** las marcas de ciclo del aggregate son **hora de servidor**,
por lo que en trabajo offline NO reflejan cuándo el técnico realmente inició/
terminó (ver §20). El **único** timestamp de hora-de-hecho disponible hoy es
`bitacora.ocurridoAt`, y es **opcional**.

---

## 8. Duración calculable

Distinguiendo obligatoriamente (directiva §5):

- **A. Tiempo calendario/transcurrido** — **CALCULABLE (con caveat de reloj).**
  `fechas.finalizacion − fechas.inicio` (o `cierre − inicio`). Caveat: hora de
  servidor; en offline puede diferir del tiempo real de campo.
- **B. Tiempo efectivo (EN_EJECUCION excl. pausas)** — **CONDICIONALMENTE
  CALCULABLE.** Sólo reconstruible sumando intervalos entre acciones de bitácora
  `inicio/reanudacion` y `pausa/espera/finalizacion` usando `ocurridoAt`. Requiere
  disciplina del operador; NO garantizado por contrato.
- **C. Tiempo pausado** — **CONDICIONALMENTE CALCULABLE.** Suma de intervalos
  `pausa → reanudacion` de la bitácora (`ocurridoAt`). El estado `PAUSADA` del
  Workflow **no sella** un timestamp de inicio de pausa en el aggregate.
- **D. Tiempo hasta cierre** — **CALCULABLE (con caveat de reloj).**
  `fechas.cierre − fechas.solicitada`/`inicio`.

---

## 9. Duración no calculable

**NO DISPONIBLE CON EL CONTRATO ACTUAL** (declarado sin inventar):

- **Tiempo efectivo/pausado GARANTIZADO y automático.** No existe acoplamiento
  entre las transiciones del Workflow (`pausar`/`reanudarEjecucion`) y una marca
  temporal durable de pausa. La `PAUSADA` no persiste `pausadaDesde`; sólo cambia
  el estado. La reconstrucción depende de datos opcionales de bitácora.
- **Duración real de campo en offline** (independiente del reloj de servidor):
  no existe un timestamp de hecho obligatorio para las transiciones (§20).
- **Duración por técnico** (cuando varios participan): la bitácora atribuye
  `actor_id`, pero no hay contrato de "sesión de trabajo por técnico" que segmente
  la duración por persona. **NO DISPONIBLE.**

---

## 10. Asignación

- **Responsable/supervisor/solicitante:** campos del aggregate
  (`orden.responsable/supervisor/solicitante`, `domain/orden.ts`), strings libres.
  Proyectados a `ord_responsables_read` en `creada`/`asignacion-actualizada`
  (`projection.ts` ~201).
- **Técnico/cuadrilla/contratista:** vía `asignar-recurso-humano` →
  `ord_asignaciones` + `ord_asignaciones_read`. `tipo ∈ {persona, grupo,
  cuadrilla, contratista}` (`TIPOS_ASIGNACION`), `asignado_id`, `rol`, `vigente`,
  `actor_id`. Append-only con cierre de vigentes opcional
  (`asignacionCerrarVigentes`).
- Existe soporte para **múltiples asignaciones** y **cuadrillas** (por `tipo`).

---

## 11. identityId (G-1 de DGP-018)

**G-1 SIGUE VIGENTE.** Evidencia dura:
- `ord_asignaciones.asignado_id` y `ord_responsables_read.responsable` son
  columnas `text` **sin FK ni validación** contra el módulo de Identidad
  (verificado por `\d`).
- El comando `asignar-recurso-humano` valida `asignadoId: z.string().min(1)` —
  **cualquier string** (nombre, rol, email, id): no verifica que sea un
  `identityId` real ni existente (`module.ts` ~1430).
- `actualizar-asignacion` idem para `responsable` (string libre).

**Qué impide resolverlo (sin tocar nada en Discovery):** no hay un **puerto de
Identidad** inyectado en Órdenes que permita validar/resolver `identityId` en el
comando de asignación, ni un catálogo/índice de técnicos por tenant que el módulo
consulte. DGP-018 ya mitigó en UI con *match estricto* (`responsable ==
identityId || email`), pero el **contrato backend sigue sin garantizar** la
relación asignación↔identidad. Resolverlo exige (fase futura) un contrato de
asignación que (a) tipifique `asignadoId` como `identityId` y (b) lo valide por
referencia contra Identidad — patrón ya usado para Activos (validación por
referencia). **NO se modifica en Discovery.**

---

## 12. Mano de obra

**Auditoría exhaustiva (directiva §7): NO EXISTE NINGÚN dato de mano de obra.**
Búsqueda en `lib/module-ordenes` y schema `ord_*`: **no** hay tarifa/hora,
costo por técnico/cuadrilla, horas trabajadas, jornada, turno, costo de mano de
obra, contrato laboral ni centro de costo *de mano de obra*.

Lo más cercano —y que NO es mano de obra— :
- `orden.tiempoEstimado`/`tiempoReal` (`Duracion` = `{minutos, detalle?}`): un
  **estimado/real global en minutos**, capturado manualmente por
  `actualizar-ejecucion`. No se deriva de sesiones ni de técnicos.
- `orden.costoEstimado`/`costoReal` (`Costo` = `{monto, moneda, detalle?}`):
  monto **global** manual; el `detalle` es texto libre (no desglosa mano de obra).
- `orden.centroCosto`: centro de costo **de la OT**, no de la mano de obra;
  string de catálogo.

**Conclusión:** la fundación de mano de obra debe **crearse desde cero** (fase
futura), sin inventar conceptos financieros aquí.

---

## 13. Activos

- Relación OT↔activo por **referencia denormalizada** (VO `ReferenciaActivo`:
  `activoId`, `entityRef = activo:<id>`, `etiqueta?`, `rol ∈ {principal,
  relacionado}`). Aggregate: `activoPrincipal` + `activosRelacionados[]`.
- **NO hay import ni invocación del módulo Activos desde Órdenes** (verificado:
  grep sin resultados de `activos.` / `ActivosPort` / `mantener` en
  `lib/module-ordenes`). La existencia del activo es responsabilidad del comando
  por validación de referencia; no hay integración transaccional.
- **Componentes/ubicación/proyecto:** `ubicacion` (VO), `proyecto`, `centroCosto`
  son strings de catálogo en la OT. No hay modelo de "componente" del activo en
  la OT.
- Para conectar posteriormente `OT → duración → activo → utilización`: el nexo
  es `activoId`. **Suficiente como clave de composición**, insuficiente hoy para
  duración efectiva (§9) y disponibilidad (§18).

---

## 14. Utilización (DGP-019.1)

- `lib/module-utilizacion` modela **lecturas de medidor** (horómetro/odómetro) y
  **tanqueos** por `activoId` (VO en `domain/value-objects.ts`): tanqueo tiene
  `activoId, litros, precioUnitario?, costoTotal? (o derivado precio×litros),
  fechaHora`. Cálculos: `litrosPorHora`, `litrosPor100Km`
  (`domain/calculos.ts`), read model de **resumen** por activo.
- **Combustible se ancla al ACTIVO, no a la OT** (no hay `ordenId` en tanqueo).
  Correcto por diseño (no duplicar combustible en Órdenes).
- **Composición futura** `Activo X → OT Y → tiempo efectivo → horas de
  mantenimiento → impacto en utilización/disponibilidad`: la clave común es
  `activoId`. Gaps que lo bloquean hoy: (a) tiempo efectivo no garantizado (§9);
  (b) sin propagación OT→estado de activo (§18). La composición es **legítima y
  sin duplicación** una vez existan sesiones de trabajo (§24).

---

## 15. Inventario

- `lib/module-inventario`: motor de **stock** (familias neutras de movimiento,
  `tipos-movimiento` por tenant) sin `ordenId`/`orden_id` en el dominio
  (verificado: grep de `ordenId` sin resultados en `domain/*.ts`).
- `lib/module-abastecimiento` (DGP-013): motor de **costos** por artículo
  (`EstadoCostos`: `costoPromedio`, `ultimoCosto`, `costoEstandar`), actualizado
  al recibir compras. **El costo vive en el read model propio de Abastecimiento**,
  no ligado a consumo por OT.
- En Órdenes, `registrar-recurso` (clase ∈ `{herramienta, material, epp,
  vehiculo, equipo-auxiliar}`) registra `referenciaId`, `cantidad?`, `unidad?`
  **descriptivos**: **sin costo, sin FK a artículo de inventario, y SIN
  decremento de stock**. Es una anotación, no una transacción de consumo.

**GAP declarado (cadena repuesto→OT→activo→costo INCOMPLETA):** no existe hoy la
relación completa `repuesto (artículo) → cantidad → costo → OT → activo →
consumo`. Falta el eslabón transaccional entre `registrar-recurso` (material) y
un movimiento de salida de inventario valorizado por Abastecimiento. **NO se
modifica Inventario en Discovery.**

---

## 16. Combustible

Ver §14. Datos existentes para tanqueo (Utilización): `tanqueo, litros,
costoTotal/precioUnitario, horómetro/odómetro (lecturas), activoId, usuario
(actor)`. **Relación con costos del activo:** componible por `activoId` en una
fase de costos, sumando `costoTotal` de tanqueos del periodo. **No duplicar
combustible en Órdenes** (regla respetada: Órdenes no tiene tanqueos).

---

## 17. Costos

**Datos EXISTENTES (parciales, manuales):**
- OT: `costoEstimado`/`costoReal` global manual (§12).
- Abastecimiento: costo por artículo (`EstadoCostos`).
- Utilización: `costoTotal` de tanqueos por activo.

**Datos FALTANTES para "COSTO DE OT" y "COSTO DE MANTENIMIENTO DEL ACTIVO":**
- **Mano de obra** (tarifa × horas efectivas por técnico): inexistente (§12).
- **Repuestos consumidos valorizados por OT**: sin cadena transaccional (§15).
- **Servicios externos / consumibles**: no hay modelo dedicado (sólo
  `registrar-recurso` descriptivo o `costoReal.detalle` texto libre).
- **Agregación combustible→OT**: combustible es por activo/periodo, no por OT;
  requiere criterio de imputación (fase de costos).

No se implementan costos en DGP-020 (regla). Se documenta el faltante.

---

## 18. Disponibilidad del activo

- Activos **SÍ** tiene contrato explícito de estado
  (`lib/module-activos/src/domain/maquina-estados.ts`): `BORRADOR, REGISTRADO,
  OPERATIVO, MANTENIMIENTO, FUERA_SERVICIO, RETIRADO`, con comandos `mantener`,
  `operar`, `fuera-servicio`, `retirar` y evento `modulo.activos.en-mantenimiento`.
- **PERO** ese estado lo gobiernan **comandos de Activos**, no la OT. Órdenes
  **nunca** invoca esas transiciones (verificado, §13). Por tanto **NO** puede
  derivarse hoy "cuándo un activo entró/salió de mantenimiento" **a partir de la
  OT**, ni "cuánto estuvo fuera de servicio por causa de una OT".
- La directiva prohíbe asumir `OT abierta = activo fuera de servicio`. Coherente:
  ese vínculo **no existe** en el contrato.

**GAP declarado (disponibilidad por OT):** falta un contrato que relacione
transiciones de OT con el estado de disponibilidad del activo (o un evento
consumible por Activos). **NO se modifica en Discovery.**

---

## 19. Workflow

- Motor NEUTRO reutilizable (`lib/workflow-engine`), definiciones por tenant con
  clave por módulo (`ciclo-item` para Órdenes). El ciclo **YA permite** inicio
  (`iniciar`), pausa (`pausar`), reanudación (`reanudarEjecucion`), finalización
  (`enviarValidacion`) y cierre (`cerrar` con gate de aprobación).
- Por cada transición el motor emite `<servicio>.instancia.transicionada`
  (`motor.ts` ~313) con `estadoAnterior`, `comando`, actor; y audita
  `transicionar:<comando>`. La **instancia** guarda `updatedAt` (servidor).

**¿Timestamps de transición disponibles de forma confiable?** Parcialmente:
- El **evento** de transición y el audit existen (hora de servidor).
- Pero el motor **no persiste una tabla de historial de transiciones con
  timestamp por transición** consultable como serie (no hay `wf_*` en
  `deltaops`; **NO VERIFICADO** que exista historial durable de transiciones del
  motor con timestamp por paso — la evidencia apunta a que el timestamp confiable
  por transición es el del **audit**/evento outbox, no un contrato de "línea de
  tiempo de estados").

**GAP (extensión de Workflow, descrito sin implementar):**
- **Contrato:** una marca temporal de hecho (device-time) por transición
  `pausar`/`reanudarEjecucion`/`iniciar`/`enviarValidacion`, o un evento
  consumible que la porte.
- **Transición/Evento:** `pausar`/`reanudarEjecucion` no llevan `ocurridoAt`.
- **Dato:** `pausadaDesde`/`reanudadaEn` durables.
- **Impacto:** sin ellos, tiempo efectivo/pausado sólo es reconstruible por
  bitácora opcional (§9). *Recomendación:* NO extender el motor neutro; resolver
  con un modelo de sesiones que consuma los eventos/bitácora (§24), preservando
  el motor sin cambios.

---

## 20. Offline

- `/sync` (`sincronizacion.ts`) usa protocolo de **claim durable** por `opId`
  (`ord_sync_receipts`, `INSERT ... ON CONFLICT DO NOTHING RETURNING xmax=0`),
  `esperarFinalizacion`/`finalize`/`release`, con idempotencia adicional a nivel
  de comando por `ord_recibos`. Conflictos → `KRN-CFL-001`; infra → reintentable.
- **Qué transiciones pueden ejecutarse offline:** cualquiera encolada como
  operación de `procesarCola` (incluye `transicionar`, `bitacora.registrar`,
  `asignar-recurso-humano`, etc.). La creación offline exige `id` de cliente.

**Verdad crítica sobre el timestamp (directiva §16 A vs B):**
- Para **transiciones de estado** (`fechas.inicio/finalizacion/cierre`): el
  tiempo es **B. hora de sincronización con el servidor** — el comando se
  RE-EJECUTA en el servidor y `aplicarEstado` sella `new Date()`
  (`module.ts` ~465). **NO** conserva la hora del dispositivo.
- Para **bitácora**: es **A. hora del dispositivo** *si y sólo si* el cliente
  envía `ocurridoAt` en la operación encolada; en su defecto, **B. servidor**
  (`module.ts` ~1307). `registrado_at` siempre es servidor.

**Implicación para duración real:** en escenarios offline, la duración confiable
de campo SÓLO es capturable vía `bitacora.ocurridoAt`. Las marcas de ciclo del
aggregate **no** son fiables como "hora real" en offline. Esto es el hallazgo más
delicado del Discovery para el objetivo de "duración real".

**Resolución de conflictos:** por `opId` (idempotencia) + control optimista de
versión del aggregate/instancia (`KRN-CFL-001`). No hay merge semántico de
intervalos de tiempo (no aplica hoy porque no hay modelo de intervalos).

---

## 21. Timeline

- Todos los `EVENTOS_MODULO` + `EVENTOS_OPERACIONALES` se registran en el
  **Shared Timeline canónico** (`platform.timeline.record`) vía handlers
  `timeline:<evento>` (`module.ts` ~2002), idempotentes por `entryId=event.id`.
  `occurredAt` del timeline usa `payload.actualizadoAt || ocurridoAt || now`.
- **Suficiencia para reconstruir una jornada operacional:** la timeline **lista**
  los hechos (transiciones, bitácora, asignaciones) con actor y `occurredAt`,
  pero hereda las limitaciones de §7/§9: `occurredAt` de transiciones es hora de
  servidor y no hay segmentación por técnico. Reconstruye la **secuencia**, no la
  **duración efectiva garantizada**. No crear otra timeline (regla respetada).
- **NO VERIFICADO:** que el evento `instancia.transicionada` del motor llegue al
  Shared Timeline de Órdenes (los handlers de timeline del módulo sólo cubren sus
  propios eventos, no los del servicio de workflow).

---

## 22. Seguridad

- **Identidad canónica + RBAC:** cada comando exige permisos del namespace
  (`modulo.ordenes.operar|validar|write`). `ctx.principal.id` estampa el actor en
  eventos, `platform_audit` y read models (`actor_id`).
- **RLS + tenant isolation:** políticas por tenant en todas las tablas `ord_*`
  (verificado). `setTenant`/`withTenantRead` fijan `app.tenant_id`.
- **Trazabilidad por transición:** "quién inició/pausó/reanudó/finalizó/cerró"
  → `platform_audit` (`transicionar:<cmd>`, `aprobarCierre`) + evento
  `estado-cambiado` (con `actorId`) + evento del motor (`estadoAnterior`, actor).
  "Qué técnico participó" → bitácora `actor_id` y asignaciones `asignado_id`
  (pero sin identityId fuerte, §11).
- No introducir autorización paralela: cualquier fase futura debe reutilizar el
  RBAC/RLS existente (regla).

---

## 23. Gaps

Clasificación (EXISTENTE = ya cubierto; BLOQUEANTE = impide el objetivo;
NO BLOQUEANTE = composición posible con caveats; FUTURO = fundación nueva).

| ID | Gap | Clasificación |
|---|---|---|
| **G-1** | Asignación sin `identityId` fuerte (`asignado_id`/`responsable` = text libre, sin FK/validación contra Identidad) | **BLOQUEANTE** (confirmado vigente, §11) |
| **GAP-DUR** | Tiempo efectivo/pausado no garantizado: pausas del Workflow sin marca temporal durable; bitácora opcional y desacoplada. Sólo se resuelve con comandos de sesión aditivos (§24), NO derivando de transiciones | **BLOQUEANTE** para "duración real automática" (§9/§19) |
| **GAP-CLOCK** | Transiciones sellan hora de SERVIDOR; en offline no reflejan hora real de campo. Los eventos de Workflow NO resuelven el device-time; sólo lo resuelve un `ocurridoAt` de dispositivo capturado por comando propio de sesión (§24) | **BLOQUEANTE** para "duración real offline" (§20) |
| **GAP-MO** | Mano de obra inexistente (tarifa/horas/turno/jornada/costo laboral) | **FUTURO** (fundación nueva, §12) |
| **GAP-TURNO** | Turnos/jornada inexistentes | **FUTURO** |
| **GAP-REP** | Cadena repuesto→OT→activo→costo incompleta (`registrar-recurso` descriptivo, sin costo/stock/FK) | **NO BLOQUEANTE** para duración; **BLOQUEANTE** para costo (§15) |
| **GAP-DISP** | Sin contrato OT→estado de disponibilidad del activo (Órdenes no invoca Activos) | **NO BLOQUEANTE** para duración; relevante para disponibilidad (§18) |
| **GAP-COSTO** | Sin agregación de costo de OT / costo de mantenimiento del activo | **FUTURO** (depende de GAP-MO, GAP-REP) (§17) |
| **GAP-WF-HIST** | Historial durable de transiciones del motor con timestamp por paso: NO VERIFICADO | **NO BLOQUEANTE** (mitigable vía eventos/bitácora) (§19) |
| **GAP-TL-WF** | Evento `instancia.transicionada` del motor podría no llegar al Shared Timeline de Órdenes | **NO BLOQUEANTE** (§21) |

Elementos **EXISTENTES** (no son gaps): ciclo de estados completo, bitácora
append-only con doble timestamp, asignaciones multi-tipo (incl. cuadrilla),
idempotencia/offline robusto, RBAC/RLS/tenant isolation, Shared Timeline,
referencia OT↔activo por `activoId`.

---

## 24. Arquitectura propuesta

Respuestas a las 14 preguntas de la directiva §19 (propuesta de diseño, **no**
implementación):

1. **¿Modificar `module-ordenes`?** *Mínimamente y sólo aditivo, en fase
   posterior.* El aggregate frozen NO se toca. La opción preferida es **no**
   añadir estado de duración al aggregate, sino consumir sus eventos/bitácora.
2. **¿Módulo nuevo?** **Sí, recomendado:** un módulo/servicio de
   **time-tracking / sesiones de trabajo** (p. ej. `module-tiempos` o submódulo
   operacional) que sea la **fuente de verdad de la duración real y la mano de
   obra**, compuesto sobre Órdenes (por `ordenId`/`entityRef`) e Identidad (por
   `identityId`). NO duplica órdenes/técnicos/identidad (§21 directiva).
3. **¿Extender un read model existente?** Sí para **exponer** métricas derivadas
   (p. ej. un read model `ord_duracion_read` proyectado desde sesiones), pero la
   fuente de verdad vive en el nuevo modelo append-only, no en un read model.
4. **¿Read model específico?** Sí: un read model de **sesiones/duración por OT y
   por técnico** (append-only de intervalos + agregado por OT/activo/técnico).
5. **¿Dónde vive la fuente de verdad?** En un **store append-only de tramos de
   sesión de trabajo** alimentado por **comandos propios de sesión que EXIGEN
   `ocurridoAt` de dispositivo** (validación obligatoria, no opcional) y sellan
   `registradoAt` de servidor. Es una disciplina de captura **estructurada y
   obligatoria**, distinta de la bitácora (opcional). **NO** se deriva de las
   transiciones de Workflow como origen de los intervalos (reproduciría
   GAP-CLOCK). El contrato mínimo propuesto y las reglas deterministas están en
   el bloque "Contrato mínimo de sesión" al final de esta sección.
6. **¿Dónde se calculan las duraciones?** En **proyecciones puras** (funciones
   de dominio) que consumen los intervalos de sesión: `calendario`, `efectivo`,
   `pausado`, `hasta-cierre` como métricas SEPARADAS (nunca mezcladas, §5).
7. **¿CQRS?** Se mantiene: comandos append-only + eventos autosuficientes +
   proyecciones idempotentes por `event_id`/`(tenant,id)`, igual que
   DGP-009.2/019.1.
8. **¿Workflow?** **Sin cambios al motor neutro.** Las sesiones se abren/cierran
   por **comandos propios de sesión** (aditivos), NO por los eventos de
   transición del motor. Los eventos `estado-cambiado`/`instancia.transicionada`
   se usan sólo como **señal auxiliar de contraste** (p. ej. avisar si hay una
   sesión abierta cuando la OT ya está `CERRADA`, o detectar tramos sin sesión):
   nunca como fuente automática de intervalos, porque sólo portan hora de
   servidor.
9. **¿RLS?** Todas las tablas nuevas con política `tenant_isolation` por
   `app.tenant_id`, idéntico patrón.
10. **¿Offline First?** Cada comando de sesión EXIGE `ocurridoAt` de dispositivo
    (única forma de resolver GAP-CLOCK) y sella `registradoAt` de servidor; se
    sincroniza con el protocolo de claim durable por `opId` ya existente
    (idempotencia); solapes/incompletos/desviaciones de reloj se resuelven con
    las **reglas deterministas** del bloque "Contrato mínimo de sesión".
11. **¿Relación con Utilización?** Por `activoId`: `OT → sesiones → horas de
    mantenimiento` se cruza con lecturas/tanqueos del activo. Composición, sin
    duplicar combustible.
12. **¿Relación con Inventario/Abastecimiento?** Fase de costos: cerrar GAP-REP
    ligando `registrar-recurso` (material) a un movimiento de salida valorizado
    (costo desde Abastecimiento), imputado a `ordenId`+`activoId`.
13. **¿Relación con Activos?** Por `activoId` (referencia existente). Opcional:
    contrato OT→disponibilidad (GAP-DISP) mediante evento consumible por Activos,
    sin que Órdenes fabrique privilegios cross-module (lección DGP-019.1:
    principal de servicio de mínimo privilegio si alguna vez propaga).
14. **¿Cómo se preparan costos?** Fundando primero **mano de obra** (tarifa×horas
    efectivas por `identityId`) y **repuestos valorizados por OT**, luego
    agregando combustible por `activoId`/periodo → `costo de OT` y `costo de
    mantenimiento del activo`. Todo en fases posteriores.

**Principio rector (§21 directiva):** cero duplicación. La solución **compone**
sobre Órdenes (por `ordenId`/`entityRef`; el ciclo/bitácora/eventos son contexto
y señal auxiliar, NO la fuente de los intervalos), Identidad (identityId),
Workflow (motor neutro, sin cambios), Activos (activoId + estado), Utilización
(activoId) e Inventario/Abastecimiento (costo). Ningún segundo sistema.

### Contrato mínimo de sesión (propuesto — NO implementado)

Fuente de verdad = **tramos de sesión** append-only. La captura es OBLIGATORIA en
el cliente y device-time; el servidor NUNCA inventa el `ocurridoAt`.

**Comandos aditivos propuestos** (namespace tentativo `modulo.tiempos.*`; nombres
sujetos a diseño de la fase):

- `sesion.abrir` — abre un tramo de trabajo.
- `sesion.pausar` / `sesion.reanudar` — cierra/abre subtramos de pausa dentro de
  una sesión.
- `sesion.cerrar` — cierra el tramo (finalización).

**Payload común propuesto** (todos los campos serializables, Offline First):

```
{
  id,               // id de tramo generado por el cliente (Offline First)
  ordenId,          // vínculo a la OT (referencia; no toca el aggregate)
  identityId,       // técnico dueño del tramo (requiere G-1 resuelto; DGP-020.1)
  tramo,            // "trabajo" | "pausa"  (tipo de tramo)
  borde,            // "inicio" | "fin"     (apertura/cierre del tramo)
  ocurridoAt,       // OBLIGATORIO, ISO-8601, HORA DE DISPOSITIVO
  registradoAt,     // sellado por el servidor al persistir (no lo envía el cliente)
  opId,             // idempotencia durable (claim por opId, patrón existente)
  actorId,          // ctx.principal.id (puede diferir de identityId)
  detalle?          // libre, acotado
}
```

**Eventos propuestos:** `modulo.tiempos.tramo-registrado` (autosuficiente,
payload completo), proyectado a un read model append-only
`tmp_sesiones_read`/`tmp_tramos_read` (nombres tentativos) y agregado
`tmp_duracion_read` por `(ordenId, identityId)` con métricas SEPARADAS
(calendario/efectiva/pausada/hasta-cierre, §5). RLS `tenant_isolation` por
`app.tenant_id` en todas las tablas nuevas; nada se escribe en tablas `ord_*`.

**Reglas DETERMINISTAS de saneamiento** (aplicadas en la proyección pura, sin
mutar la fuente append-only):

1. **Idempotencia:** claim durable por `opId` (patrón `ord_sync_receipts`) + guard
   append-only por `(tenant_id, event_id)`; un `opId`/tramo repetido no crea un
   segundo hecho. Índice único por `op_id` como cinturón (lección DGP-019.1).
2. **Ordenamiento canónico:** los tramos se ordenan por `ocurridoAt` asc y, ante
   empate, por `event_id` (desempate estable y determinista). El cálculo usa
   SIEMPRE `ocurridoAt`, nunca `registradoAt`.
3. **Sesión abierta sin cierre (intervalo incompleto):** no se imputa duración
   "hasta ahora". El agregado marca el tramo como `abierto`/`incompleto` y lo
   EXCLUYE del tiempo efectivo cerrado; se expone aparte (`tramosAbiertos`) para
   alerta operativa. Cierre implícito SÓLO si existe un cierre posterior
   explícito; nunca por reloj de servidor.
4. **Tramos solapados (mismo `identityId`):** se normalizan por **unión de
   intervalos** (merge) para no doble-contar; el solape se REPORTA como anomalía
   (`solapes[]`) pero no se descarta el dato original. Tramos de técnicos
   DISTINTOS pueden solaparse legítimamente (trabajo en paralelo) y se cuentan por
   técnico, no se fusionan entre personas.
5. **Pausa fuera de trabajo / bordes huérfanos:** un `fin` sin `inicio` previo o
   una `pausa` sin `trabajo` abierto se marca `huérfano` y se excluye del cálculo,
   reportándose en `anomalias[]` (nunca se infiere el borde faltante).
6. **`ocurridoAt` > `registradoAt` o desviación de reloj:** se tolera un desfase
   configurable `δ` (p. ej. por política de tenant). Si `ocurridoAt` supera
   `registradoAt` más allá de `δ` (reloj de dispositivo adelantado) el tramo se
   marca `reloj-sospechoso` y se **normaliza acotando** `ocurridoAt` a
   `registradoAt` **sólo para el cálculo derivado** (la fuente conserva el valor
   original, auditable). Un `ocurridoAt` absurdamente anterior (device atrasado)
   también se marca; la normalización nunca reescribe la fuente append-only.
7. **Monotonicidad por sesión:** dentro de un mismo par
   `abrir…cerrar`, los subtramos de pausa deben quedar contenidos; los que caen
   fuera se marcan `incoherente` y se excluyen, reportados en `anomalias[]`.

Todas las reglas son puras y deterministas (mismo input ⇒ mismo agregado),
mantienen CQRS (append-only + proyección idempotente), RLS, Offline First y **no
tocan el aggregate de Órdenes ni el motor de Workflow**.

---

## 25. Fases recomendadas

Emergen del análisis (no se asume la estructura de ejemplo de la directiva):

- **DGP-020.1 · Contrato de identidad en asignación (desbloquea G-1).**
  Prerrequisito de todo lo demás: tipar/validar `asignadoId`/`responsable` como
  `identityId` por referencia contra Identidad, con `GET ...?asignadoA=<identityId>`
  fiable. Aditivo, sin romper contratos existentes.
- **DGP-020.2 · Duración real de OT (sesiones de trabajo).** Fuente de verdad
  append-only de tramos capturados por **comandos de sesión aditivos que EXIGEN
  `ocurridoAt` de dispositivo** (única vía que resuelve GAP-DUR y GAP-CLOCK); NO
  se derivan de transiciones de Workflow (sólo señal auxiliar de contraste).
  Incluye el contrato mínimo y las reglas deterministas de §24 (idempotencia,
  intervalos incompletos/solapados, desviación de reloj, ordenamiento).
  Proyecciones de duración calendario/efectiva/pausada/hasta-cierre. Depende de
  DGP-020.1 (identityId por tramo).
- **DGP-020.3 · Fundación de mano de obra.** Tarifa/hora, horas efectivas por
  técnico (desde sesiones), turno/jornada; costo de mano de obra por OT/activo.
- **DGP-021 · Costos de mantenimiento.** Repuestos valorizados por OT (GAP-REP) +
  combustible por activo (Utilización) + mano de obra → costo de OT y costo de
  mantenimiento del activo. Disponibilidad por OT (GAP-DISP) como línea paralela.

Orden por dependencias: 020.1 → 020.2 → 020.3 → 021 (021 y disponibilidad pueden
solaparse). **Ninguna fase se inicia sin aprobación explícita de la Dirección.**

---

## 26. Riesgos

- **R1 · Fiabilidad del reloj (offline).** Si la duración se basa en hora de
  servidor será incorrecta en campo (por eso las sesiones EXIGEN `ocurridoAt` de
  dispositivo, no la hora de las transiciones). Riesgo residual: relojes de
  dispositivo manipulados/desincronizados. Mitigación: regla de saneamiento
  `reloj-sospechoso` con tolerancia `δ` y normalización sólo en el cálculo
  derivado (§24), conservando el valor original auditable.
- **R2 · Disciplina de captura.** Si la duración efectiva dependiera de acciones
  opcionales (bitácora) o de eventos de servidor (transiciones), los datos serían
  incompletos o con reloj equivocado. Mitigación: la captura de sesiones es
  OBLIGATORIA y estructurada por comando propio; los eventos de Workflow/bitácora
  son sólo señal auxiliar de contraste, NUNCA fuente automática de los tramos.
- **R3 · Ambigüedad de identidad (G-1).** Sin identityId fuerte, métricas por
  técnico y costo de mano de obra son atribuibles erróneamente. Mitigación:
  DGP-020.1 primero.
- **R4 · Tentación de duplicar.** Crear un "segundo sistema" de tiempos/técnicos
  violaría §21. Mitigación: componer estrictamente sobre dominios existentes.
- **R5 · Escalada cross-module.** Si sesiones/costos propagan a Activos/
  Inventario, repetir el antipatrón "admin fabricado" (corregido en DGP-019.1).
  Mitigación: principal de servicio de mínimo privilegio + actor originador como
  metadato.
- **R6 · Merge de intervalos concurrentes.** Offline puede generar solapes;
  requiere reglas deterministas (aún NO definidas).

---

## 27. Deuda técnica

- **DT1 · Pausa sin marca temporal durable.** El estado `PAUSADA` no persiste
  `pausadaDesde`; la reconstrucción depende de bitácora opcional (§9).
- **DT2 · `registrar-recurso` descriptivo.** Materiales anotados sin costo ni
  vínculo transaccional a inventario (§15) — deuda para costos.
- **DT3 · `tiempoReal`/`costoReal` globales manuales.** Coexistirán con la nueva
  fuente de verdad de duración/costo; definir precedencia/migración para evitar
  doble verdad.
- **DT4 · Historial de transiciones del motor.** NO VERIFICADO que exista una
  serie temporal durable por transición; hoy se depende de audit/eventos.
- **DT5 · Timeline del motor.** `instancia.transicionada` podría no reflejarse en
  el Shared Timeline de Órdenes (§21) — revisar cobertura.
- **DT6 · Antipatrón cross-module en otros módulos.** DGP-019.1 notó que
  `correctivo-runtime` usa `contextFor*(actorId,"admin",...)`; si futuras fases de
  costos/disponibilidad propagan cross-module, no replicar ese patrón.

---

### Anexo · Índice de evidencia (paquete/archivo · servicio)

- Ciclo/estados/transiciones: `lib/module-ordenes/src/domain/maquina-estados.ts`.
- Aggregate y marcas de tiempo (`aplicarEstado`, `fechas`):
  `lib/module-ordenes/src/domain/orden.ts`; VO `Fechas/Duracion/Costo`:
  `.../domain/value-objects.ts`.
- Comandos, timeline, `sincronizarEstado` (hora servidor), bitácora
  (`ocurridoAt`), asignación (identityId libre), recurso (sin costo):
  `lib/module-ordenes/src/module.ts`.
- Bitácora/eventos operacionales/read models/tablas:
  `.../domain/operacional.ts`, `.../infrastructure/operacional.ts`,
  `.../projection.ts`; schema real vía `psql \d deltaops.ord_*`.
- Offline/claim durable: `lib/module-ordenes/src/sincronizacion.ts`.
- Workflow (transición emite evento con `estadoAnterior`/actor):
  `lib/workflow-engine/src/motor.ts`, `.../definicion.ts`.
- Activos (estado MANTENIMIENTO/FUERA_SERVICIO):
  `lib/module-activos/src/domain/maquina-estados.ts`.
- Utilización (tanqueo/costo/cálculos por activo):
  `lib/module-utilizacion/src/domain/{value-objects,calculos,ports}.ts`.
- Inventario/Abastecimiento (stock sin ordenId; costos por artículo):
  `lib/module-inventario/src/domain/stock.ts`,
  `lib/module-abastecimiento/src/domain/articulo.ts`.
- G-1: `artifacts/deltaops/docs/DGP-018-INVENTARIO-CONTRATOS.md`.
