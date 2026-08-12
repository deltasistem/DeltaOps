# DGP-021 — DESCUBRIMIENTO: COSTOS DE MANTENIMIENTO

Estado: DISCOVERY. Ningún cambio de código, migraciones, contratos, frontend, backend, workflow, identity ni RLS fue realizado en esta fase.

---

## 1. Objetivo

Diseñar la futura capacidad de COSTOS DE MANTENIMIENTO de DeltaOps: una fuente de verdad auditable y componible que permita demostrar de dónde salió cada peso del costo de mantener y operar cada activo y cada orden de trabajo. Este documento audita el corpus real, clasifica cada relación (CONFIRMADA / PARCIAL / NO EXISTE / GAP), propone el modelo económico y las fases de implementación, y deja las decisiones pendientes a Dirección.

Principio rector aplicado en todo el documento: **NO INVENTAR DATOS**. Todo hallazgo lleva evidencia `archivo:línea` del corpus. «Sin datos» jamás se representa como $0.

## 2. Alcance

- Incluye: auditoría del corpus (módulos, contratos, read models, comandos, eventos, migraciones, seeds), fuentes reales de costo, modelo económico propuesto, estrategias de snapshot/moneda/offline/auditoría/RBAC/RLS/Analytics, registro de gaps, alternativas arquitectónicas, arquitectura recomendada y fases futuras.
- Excluye: implementación, dashboards ejecutivos (§19 de la directiva), contabilidad de costos completa (facturación, impuestos, depreciación, centros de costo contables), conversión de monedas.

## 3. Corpus auditado

| Área | Cómo se auditó |
|---|---|
| module-activos | Contratos públicos y ficha (contexto DGP-008/019.2); relación entityRef y medidores propagados desde utilización |
| module-ordenes | `lib/module-ordenes/src/{domain,module.ts,openapi,docs}` — recursos, asignaciones, activo principal, costos estimado/real, sesiones |
| module-utilizacion | `lib/module-utilizacion/src/{domain/value-objects.ts,infrastructure/operacional.ts,openapi/spec.ts,sincronizacion.ts,calculos.ts}` — tanqueos, lecturas, resumen |
| module-manodeobra | Contratos DGP-020.3 (contexto directo de la fase recién cerrada) verificados contra `lib/module-manodeobra` |
| module-inventario | `lib/module-inventario/src/{domain,module.ts}` + `lib/db/src/schema/deltaops-inventario.ts` + migración `0015_inventario_cqrs.sql` |
| module-abastecimiento | `lib/module-abastecimiento/src/{domain,module.ts,projection.ts,cost-engine.ts,openapi}` + schema `deltaops-abastecimiento.ts` + migración `0022` |
| module-planes / preventivo / correctivo | Contexto DGP-012/014/015: orquestan OTs vía contratos de ordenes; no poseen datos económicos propios (verificado: ninguna entidad monetaria en sus dominios) |
| Analytics | Patrón DGP-016: KPIs/dashboards declarativos, fuentes registradas, fan-out vía queries públicas |
| Plataforma | Record Store, Workflow Engine, Identity, tenancy, RLS, Offline (§26/§39), Outbox, Dynamic Forms, QR, Timeline — contratos congelados conocidos y reverificados donde se citan |
| API/OpenAPI | Specs por módulo + drift tests existentes |

## 4. Hallazgos por fuente de costo

### 4.1 Mano de obra (contrastada con DGP-020.3 y DGP-020.2) — FUENTE LISTA

- Cadena **OT → sesión → identityId → valoración → costo: CONFIRMADA** de extremo a extremo. Sesiones (DGP-020.2) son la única fuente de tiempo (`ord_sesion_duraciones_read`, `efectivoMs` por tramos con hora de servidor); la valoración (DGP-020.3) toma la tarifa vigente en `iniciadoAt` y produce un **HECHO ECONÓMICO SNAPSHOT ya existente**: `mdo_valoraciones` preserva tarifa aplicada (id/valor/moneda/unidad), categoría, identityId, ordenId, activoId (derivado del backend, no del frontend), efectivoMs, costo (string decimal, half-up 4 decimales al final), estado (VALORADA/SIN_TARIFA/SIN_RECURSO), opId y timestamps. VALORADA es inmutable; revalorar solo opera sobre estados deficitarios.
- Moneda: de `ten_tenants.moneda` (config del tenant), sin hardcode.
- Estimado vs final: existe «costo estimado» de sesión abierta (solo presentación, backend-derived) y valoración final al cierre. Anulación de valoraciones: NO EXISTE (no hubo caso de uso; la sesión es el hecho de tiempo y no es anulable hoy) → GAP-COST-08 parcial.
- Precisión: frontera zod string-only, aritmética BigInt en micros. **Es el patrón monetario de referencia para todo DGP-021.**
- Conclusión: mano de obra **NO requiere capa adicional**; ya es hecho económico snapshot consultable por OT, activo e identidad vía queries públicas (`manodeobra.valoraciones`, `resumen`, `mias`).

### 4.2 Repuestos y materiales (Inventario) — REFERENCIA FÍSICA SIN HECHO ECONÓMICO

Distinción central verificada: el corpus tiene **referencia de artículo** y **movimiento físico**, pero **no hecho económico de consumo**.

1. Artículo: catálogo maestro sin existencias (`lib/module-inventario/src/domain/item.ts:4-9`); campos de clasificación, `unidadBase`, trazabilidad, y costos de referencia `costoPromedio`/`costoUltimaCompra`/`costoEstandar` (monto+moneda) (`item.ts:68-70`) — **referencia viva**, mutable después (`item.ts:218-236`), no snapshot.
2. Existencias: posición por item+ubicación+bodega con siete cubetas (disponible, reservado, comprometido, tránsito, inspección, bloqueado, vencido) (`stock.ts:23-53`); mutación solo por movimiento; **sin costo** en `inv_existencias_read` (`deltaops-inventario.ts:179-203`).
3. Movimientos: familias entrada/salida/devolución/ajuste±/consumo/transferencia/reserva/conteo (`stock.ts:117-145`), comandos `inventario.mover|transferir|ajustar|reservar|...` (`module.ts:906-1640`). El movimiento registra cantidad, stock antes/después, quién, cuándo, bodega/ubicación/lote/serie (`inventario.ts:47-70`) — **pero NO costo al momento** (`inventario.ts:119-143`) **ni unidad explícita** (aplica unidad base del ítem) **ni activo**; la relación con OT es una `referencia {tipo,id}` **opaca, opcional y no validada** (`inventario.ts:64-65`).
4. `ordenes.registrar-recurso`: `clase` enum + `referenciaId` obligatorio + cantidad/unidad opcionales, **sin costo** y **sin FK a inventario** — «solo referencias, sin inventario» (`lib/module-ordenes/docs/recursos.md:1-18`; `module.ts:1851-1881`). **NO identifica inequívocamente un repuesto** ni constituye consumo.
5. Devolución/anulación: la devolución suma disponible físicamente (`stock.ts:167-170`) pero sin reverso económico; no existe anular-salida.

**Clasificación:** artículo CONFIRMADA (referencia); existencias CONFIRMADA; movimiento físico CONFIRMADA; costo unitario al consumir **NO EXISTE** (GAP-COST-02); atribución salida→OT **PARCIAL** (referencia opaca) y salida→activo **NO EXISTE** (GAP-COST-01); consumo económico atribuible **NO EXISTE hoy**.

### 4.3 Abastecimiento — COSTO RECIBIDO CONFIRMADO; CONSUMIDO NO EXISTE

- Entidades CONFIRMADAS: solicitudes (estados creada→cerrada), cotizaciones (precio Dinero), órdenes de compra (proveedorId, moneda, líneas con precio unitario, total, acumulado recibido, estados borrador→recibida/cancelada — `domain/orden-compra.ts:26-70`), recepciones append-only (`domain/recepcion.ts:4-28`). Impuestos: **NO EXISTEN**.
- Motor de costos (`cost-engine.ts`): la **recepción registrada** con cantidad positiva dispara la valoración — promedio ponderado acumulativo, último costo, estándar — proyectada a `abs_costos_read` (numeric 18,6) por artículo (`module.ts:1251-1313`; `projection.ts:165-206`). Cambio de precio NO recalcula retroactivamente; recepciones históricas conservan su precio de línea.
- Naturaleza del costo: **comprometido = PARCIAL** (total de OC por estado, sin ledger); **recibido = CONFIRMADO** (cost-engine); **adquirido/facturado = NO EXISTE** (sin facturas); **consumido = NO EXISTE** (el consumo ocurre en inventario, sin costo).
- Relación con inventario: recepción→inventario solo vía comando explícito `abastecimiento.materializar-recepcion` → `materializador.ingresar` idempotente con costo unitario/moneda y dedup durable (`module.ts:1327-1403`) — **CONFIRMADA condicional**, no automática. **Este es el único punto del corpus donde un costo unitario viaja hacia un movimiento de inventario** (entrada; nunca salida).
- Compra→OT: PARCIAL (origen opaco `orden-trabajo` en solicitud, sin FK); compra→activo: NO EXISTE (GAP-COST-03).
- **Riesgo de precisión:** el VO `Dinero` del dominio usa `number` JS con redondeo (`value-objects.ts:18-40`) aunque persista `numeric`. Divergente del patrón string/BigInt de mano de obra (GAP-COST-10).
- **GAP-COST-14 (BLOQUEANTE para materiales):** hoy **no existe camino permitido para obtener el costo de referencia con precisión exacta**. La única query pública de costos, `modulo.abastecimiento.costos`, devuelve `costoUnitario` y cantidades como `number` JS (`module.ts:1667-1680`) — consumirla reintroduce la contaminación float; y `abs_costos_read` es un read model **interno** de abastecimiento, prohibido para lectura cross-módulo por otro módulo. El snapshot de costo del consumo de materiales requiere primero un contrato público de costos en cadena decimal canónica (o una excepción §45 aprobada por Dirección), documentado como prerrequisito de fase en §19.

### 4.4 Combustible (contrastado con DGP-019) — HECHO SNAPSHOT CONFIRMADO, MONEDA DÉBIL

- Tanqueo: hecho append-only con activoId, fechaHora, litros, tipoCombustible, precioUnitario, costoTotal, **moneda opcional**, proveedorId (string sin FK), identityId canónico, evidenciaRef, opId, estado/anulación (`lib/module-utilizacion/src/domain/value-objects.ts:172-192`). El costo es **snapshot del hecho**: capturado, o compuesto `precioUnitario×litros` al registrar; si faltan ambos queda **null, nunca 0** (`value-objects.ts:202-224`). Anulación CONFIRMADA (motivo+actor+fecha; los resúmenes solo computan vigentes).
- Tanqueo→OT: **NO EXISTE**. Tanqueo→activo: CONFIRMADA. Es un **costo del activo**, no de una OT — correcto conceptualmente (repostar no es mantener).
- Moneda: columna opcional por registro, **sin fallback a la moneda del tenant** (el seed demo envía "USD" mientras el tenant es CLP) → GAP-COST-04 agravado: hoy pueden coexistir tanqueos sin moneda y con monedas mixtas.
- Horómetro/odómetro: lecturas puntuales con reglas anti-decrecimiento (inconsistente ⇒ no propaga), reinicio de medidor por tramo; `utilizacion.resumen` deriva Δh, Δkm, litros, costo, L/h, L/100km, costo/h, costo/km **devolviendo `sin-datos` ante extremos faltantes, delta ≤0 o denominador no positivo** (`calculos.ts:20-44`) — el corpus ya implementa el principio «sin datos ≠ 0».
- Offline: registrar-tanqueo ya es creación offline oficial (id client-minted, claim durable) (`sincronizacion.ts:51-53,126-175`).

### 4.5 Órdenes de trabajo — EJE DE ATRIBUCIÓN, CON DEBILIDADES

- `activo_principal_id`: **PARCIAL** — opcional (`orden.ts:73-75`), referencia opaca sin validación contra module-activos en el comando (`value-objects.ts:134-137`), y **editable después de crear** (`module.ts:1015-1076`). Consecuencia directa para costos: una OT sin activo no puede atribuir su costo a ningún activo (GAP-COST-11), y un cambio de activo posterior reabre la pregunta de a qué activo pertenece el costo histórico (las valoraciones de mano de obra ya lo resuelven por snapshot de `activoId` al valorar; el mismo criterio debe regir todo hecho económico).
- Tipo de OT: string obligatorio contra catálogos del tenant (`orden.ts:64-68`) — «costo por tipo de mantenimiento» es posible solo como agrupación por claves de catálogo del tenant, sin semántica preventivo/correctivo garantizada (PARCIAL).
- `costoEstimado`: existe, opcional, `{monto:number≥0, moneda, detalle?}` (`value-objects.ts:85-105`); `costoReal`: existe como registro manual global en ejecución (`module.ts:1164-1216`). Ambos **number JS**, sin desglose, sin snapshot de componentes, no conectados a ninguna fuente real → hoy `costoReal` es una **declaración manual**, no un costo demostrable (GAP-COST-05).
- Estados económicos: **NO EXISTEN** en órdenes (solo workflow y SLA).
- Downtime: **NO EXISTE** — sesiones miden tiempo de trabajo humano, no indisponibilidad del activo (GAP-COST-06).

### 4.6 Planes / Preventivo / Correctivo / Analytics / Timeline

- Planes/preventivo/correctivo no poseen datos económicos propios; generan OTs vía contratos, por lo que heredan la atribución de la OT. El «tipo» de la OT que generan es la única vía actual para segmentar costos preventivo vs correctivo (PARCIAL).
- Analytics (DGP-016) ya soporta KPIs/dashboards declarativos con fuentes registradas y fan-out vía queries públicas: **la vía de exposición futura de métricas económicas existe y no requiere cambios de plataforma**.
- Timeline compartida registra hechos operacionales por comandos de plataforma; apta para trazar hechos económicos como entradas de bitácora referencia-only.

## 5. Relación OT → Activo → Hechos económicos (clasificación §8)

| Relación | Clasificación | Evidencia/nota |
|---|---|---|
| OT → activo principal | PARCIAL | opcional, opaca, editable (§4.5) |
| OT → sesión → identityId | CONFIRMADA | DGP-020.2, match estricto de identidad |
| Sesión → valoración mano de obra (snapshot con OT y activo) | CONFIRMADA | DGP-020.3 |
| OT → recurso registrado (repuesto) | PARCIAL | referencia sin costo ni FK |
| Salida de inventario → OT | PARCIAL | referencia opaca opcional |
| Salida de inventario → activo | NO EXISTE | sin campo |
| Salida de inventario → costo | NO EXISTE | movimiento sin valorización |
| Recepción → costo por artículo | CONFIRMADA | cost-engine / abs_costos_read |
| Compra → OT / activo | PARCIAL / NO EXISTE | origen opaco / sin campo |
| Tanqueo → activo | CONFIRMADA | snapshot del hecho |
| Tanqueo → OT | NO EXISTE | por diseño; costo de operación, no de OT |
| Lecturas → horas/km por período | PARCIAL | confiable solo con dos lecturas válidas del mismo tramo |
| OT → downtime del activo | NO EXISTE | GAP-COST-06 |
| Responsable «supervisor» de OT | texto libre | no usable para atribución económica |

## 6. Estados económicos (§11)

Existen en el corpus, con evidencia: **estimado** (costoEstimado de OT; costo estimado de sesión abierta), **reservado/comprometido físico** (cubetas de stock — cantidades, no dinero), **comprometido monetario parcial** (total de OC por estado), **recibido/valorado** (cost-engine; valoraciones VALORADA), **sin datos** (SIN_TARIFA/SIN_RECURSO; `sin-datos` de utilización), **anulado** (tanqueos; no en valoraciones ni movimientos). **NO EXISTEN**: consumido valorizado, facturado, final consolidado. Propuesta mínima justificada para la futura composición: `ESTIMADO`, `CONSUMIDO` (hecho snapshot firme), `SIN_DATOS`, `ANULADO` — sin inventar estados contables (facturado/final quedan fuera del alcance hasta que exista fuente).

## 7. Modelo económico propuesto (§9)

### 7.1 Alternativas evaluadas

**A. Cada módulo conserva su costo y un agregador los compone (composición pura).**
- ✓ Cero duplicación de dominio; fuentes de verdad intactas; patrón ya validado (DGP-016 Analytics, DGP-018/019.2 experiencia). ✓ RLS/identidad heredados de cada fuente. ✓ Sin migraciones nuevas para mano de obra y combustible.
- ✗ No resuelve el gap central: **el consumo de repuestos no tiene costo en ninguna fuente** — no hay nada que agregar para repuestos. ✗ Composición en caliente (fan-out de queries) por cada consulta de costo de activo con muchas OTs. ✗ Sin lugar donde materializar snapshots de componentes hoy inexistentes.

**B. Nuevo módulo de costos que consume contratos públicos.**
- ✓ Sede natural para los hechos económicos que HOY FALTAN (consumo valorizado de repuestos) sin tocar módulos congelados: el patrón orquestación en api-server (DGP-020.3, Opción B) permite reaccionar al drain de otros módulos. ✓ Snapshots inmutables propios, RLS propia, OpenAPI propia, estados económicos propios. ✓ Evolución natural hacia «otros costos» (servicios de terceros) sin tocar dominios existentes.
- ✗ Riesgo de duplicar hechos que ya son snapshot (valoraciones, tanqueos) si se copian en vez de componerse. ✗ Módulo nuevo = superficie nueva de mantenimiento.

**C. Read model transversal de costos (proyección multi-módulo).**
- ✗ Violaría el patrón del corpus: no existe suscripción cross-módulo por outbox (cada runtime drena y marca procesado globalmente — lección DGP-020.3); un proyector transversal exigiría handlers sobre eventos ajenos o SQL sobre tablas internas ajenas, ambos prohibidos. Descartada.

**D. Extender cada módulo congelado con costos.** Violaría §45 (Inventario, Abastecimiento, Órdenes congelados) y dispersaría el dominio económico. Descartada.

### 7.2 Recomendación: **HÍBRIDO B+A — «module-costos» delgado**

Un módulo nuevo `lib/module-costos` con **dos responsabilidades estrictamente separadas**:

1. **Materializar SOLO los hechos económicos que no existen en ninguna fuente** — inicialmente el **consumo valorizado de repuestos**: hecho snapshot `CONSUMO_MATERIAL` (tenantId, hechoId, origen=`inventario`, ordenId, activoId, itemId, cantidad, unidad, costoUnitario snapshot al momento del consumo, costoTotal, moneda, identityId, opId, estado, referencia al movimiento físico, timestamps). El costo de referencia se obtiene **únicamente vía un contrato público de abastecimiento en cadena decimal canónica que HOY NO EXISTE** (GAP-COST-14, prerrequisito de §19); queda **prohibido** leer `abs_costos_read` directamente desde otro módulo y prohibido consumir la query pública actual mientras exponga `number` JS. Creado por **orquestación en api-server** tras el drain del comando de salida/consumo de inventario (patrón fail-safe + comando idempotente + query de pendientes, idéntico a DGP-020.3). La devolución genera un hecho **compensatorio negativo referenciando el hecho original** (nunca edición del snapshot).
2. **Componer, sin copiar, los hechos que ya existen**: valoraciones de mano de obra y tanqueos se consultan por sus queries públicas y se agregan en read models de composición (`costo por OT`, `costo acumulado por activo`, `costo por período`) que almacenan referencias + totales por moneda + componentes con nivel de confianza, recalculables desde las fuentes (no fuente de verdad paralela).

La entidad genérica «HECHO ECONÓMICO» de §9 **se adopta como contrato interno del módulo de costos únicamente para los hechos que él origina** (hoy: consumo de materiales; mañana: otros costos). **No** se re-modelan valoraciones ni tanqueos como hechos económicos duplicados: ya son snapshots auditables en sus módulos y duplicarlos crearía dos fuentes de verdad.

Cada componente del costo de una OT declara: fuente, contrato, read model, nivel de confianza (CONFIRMADO/PARCIAL/SIN_DATOS), snapshot sí/no, fecha, moneda y estado (§12). Un componente ausente se reporta `SIN_DATOS`, jamás $0, siguiendo el patrón `sin-datos` ya existente en utilización.

**Costo de OT** = Σ mano de obra (CONFIRMADO) + Σ consumo de materiales (tras DGP-021.2) + otros hechos válidos; por moneda, sin conversión. Combustible NO entra al costo de OT (no hay vínculo tanqueo→OT y no debe inventarse); entra al **costo del activo**.
**Costo de activo** = Σ costos de sus OTs (por activoId snapshot de cada hecho) + combustible del activo + (futuro) otros. Segmentable por período y por tipo de OT (claves de catálogo del tenant).

## 8. Snapshot y cambios históricos (§10)

Regla general derivada del corpus: **todo hecho económico congela cantidad, precio/tarifa aplicada, moneda, unidad y atribución (OT/activo/identidad) en el momento del hecho; el cambio posterior de cualquier referencia viva jamás recalcula hechos pasados.**

| Concepto | Snapshot | Referencia viva |
|---|---|---|
| Tarifa de mano de obra aplicada | ✓ (ya implementado, DGP-020.3) | catálogo de tarifas vigentes |
| Costo unitario del material consumido | ✓ (a crear: desde `abs_costos_read` al consumir) | `costoPromedio/ultimo/estandar` del artículo |
| Precio/costo de tanqueo | ✓ (ya implementado) | — |
| Precio de línea de OC/recepción | ✓ (ya implementado) | precio de referencia del artículo |
| Nombre de técnico, proveedor, artículo, activo | referencia por id canónico | ✓ presentación resuelta al leer |
| Moneda del hecho | ✓ copiada al hecho | configuración del tenant |
| Totales compuestos por OT/activo | recalculables desde hechos (no fuente de verdad) | — |

El ejemplo de la directiva ya está garantizado para mano de obra (verificado en vivo en DGP-020.3: tras subir la tarifa 40.000→50.000, la valoración histórica quedó intacta). El mismo mecanismo (vigencias + snapshot al momento del hecho) se replica para materiales.

## 9. Moneda (§16)

- Moneda canónica del tenant: **CONFIRMADA** — `ten_tenants.moneda`, ya usada por mano de obra. Tarifas: moneda del tenant. Abastecimiento: moneda por OC/costos (numeric + columna moneda). Inventario: moneda en costos de referencia del artículo. Combustible: **moneda opcional por registro, sin fallback** (GAP-COST-04): existen datos con moneda null o distinta a la del tenant (seed demo: USD vs CLP).
- Estrategia propuesta: (a) toda agregación es **por moneda** (`costoPorMoneda[]`, patrón ya usado en el resumen de mano de obra); (b) **NUNCA convertir** — no existe política oficial de tipos de cambio; (c) hechos sin moneda se reportan como componente `SIN_DATOS` de moneda desconocida, no se suman a ninguna moneda; (d) decisión de Dirección pendiente: si el registro de tanqueo debe empezar a heredar la moneda del tenant por defecto (cambio de módulo congelado → requiere excepción §45 o quedar como está, documentado).
- Ninguna moneda hardcodeada en la futura implementación.

## 10. Offline (§17)

- Hechos económicos con origen offline hoy: **sesiones de trabajo** (mano de obra deriva de su sincronización, ya resuelto) y **tanqueos** (creación offline oficial con id client-minted y claim durable). **Salidas/consumos de inventario: hoy no están en el catálogo de creaciones offline** — el consumo offline de repuestos queda como GAP hasta que Dirección lo priorice; si se prioriza, usa el framework §26/§39 existente (cola única, opId, claim durable), sin segunda cola.
- La **valoración** de cualquier hecho ocurre siempre en el servidor al sincronizar (patrón DGP-020.3: orquestación post-drain, fail-safe, reproceso idempotente + query de pendientes). El cliente jamás calcula ni adjunta costos; offline se muestra «pendiente de valoración», nunca una cifra inventada.
- Concurrencia: idempotencia por opId + guarda durable por (hecho origen) — un mismo movimiento nunca genera dos hechos económicos.

## 11. Auditoría (§18)

Toda cifra futura responde: quién (identityId canónico), qué (tipo de hecho + referencia al hecho físico origen), cuándo (hora de servidor del hecho; device-time solo aditivo como en DGP-020), sobre qué OT y activo (ids snapshot), cantidad y unidad, tarifa/precio aplicado con su versión/vigencia, de dónde salió (fuente + contrato + evento origen), moneda, si fue modificada (nunca: snapshots inmutables; correcciones = hechos compensatorios) y si fue anulada (estado + motivo + actor + fecha, patrón tanqueos).
Cifras que HOY no pueden responder esto: `costoReal` manual de la OT (declaración sin fuente — se propone deprecarlo en presentación a favor del costo compuesto, decisión de Dirección) y costos de referencia del artículo (referencia viva, no auditable como hecho).

## 12. RBAC propuesto (§21) — solo matriz, sin crear permisos

| Capacidad | SUPER_ADMIN | TENANT_ADMIN | SUPERVISOR | PLANIFICADOR | TECNICO | CONSULTA |
|---|---|---|---|---|---|---|
| Ver costos de OT/activo (tenant) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Ver costos de sus propias OTs/hechos | ✓ | ✓ | ✓ | ✓ | ✓ (solo lo suyo, backend fail-closed) | — |
| Registrar consumo de material en OT | ✓ | ✓ | ✓ | — | ✓ (en OTs asignadas) | — |
| Corregir/compensar hecho | ✓ | ✓ | ✓ | — | — | — |
| Anular hecho | ✓ | ✓ | — | — | — | — |
| Revalorar (SIN_DATOS→valorado) | ✓ | ✓ | — | — | — | — |
| Administrar tarifas/precios de referencia | ✓ | ✓ | — | — | — | — |
| Costos globales / export Analytics | ✓ | ✓ | ✓ | ✓ | — | ✓ |

Coherente con DGP-020.3 (técnico solo lo suyo incluso en consultas indirectas) y DGP-019.2 (RBAC de presentación = experiencia completa).

## 13. RLS y multitenancy (§20)

Todas las fuentes auditadas usan RLS por tenant con `set_config` por transacción (patrón DGP-003/004); las tablas nuevas del módulo de costos nacen con RLS en su migración (patrón 0043). Composición: siempre dentro del tenant de la sesión; identidad canónica desde la sesión (epoch validado, DGP-017); autorización backend en toda query incluida la indirecta (por ordenId/activoId); jamás filtros frontend como aislamiento. Cross-tenant: probado con tests PG por tabla nueva, como en todas las fases.

## 14. Analytics (§19)

| Métrica | Estado |
|---|---|
| Costo mano de obra por OT/activo/período | **DISPONIBLE** (fuente existente) |
| Costo combustible por activo/período | **DISPONIBLE** (por moneda; huecos = sin-datos) |
| Costo por tanqueo, litros por período | **DISPONIBLE** |
| Costo repuestos por OT/activo | **DISPONIBLE CON DATOS FUTUROS** (requiere DGP-021.1/021.2) |
| Costo total por OT / acumulado por activo / top activos | **DISPONIBLE CON DATOS FUTUROS** (composición; parcial solo-mano-de-obra posible antes, etiquetada como parcial) |
| Costo por hora de operación / por km | **DISPONIBLE CON DATOS FUTUROS** (§15; denominador solo con lecturas válidas del período) |
| Costo por tipo de mantenimiento | **DISPONIBLE CON DATOS FUTUROS** (agrupación por claves de catálogo del tenant; sin semántica garantizada) |
| Estimado vs real por OT | **DISPONIBLE CON DATOS FUTUROS** (estimado existe; real requiere composición; comparación por moneda) |
| Tendencia de costos | **DISPONIBLE CON DATOS FUTUROS** |
| Costo de indisponibilidad | **NO DISPONIBLE** (GAP-COST-06) |
| Costo facturado | **NO DISPONIBLE** (sin facturas en el corpus) |

Exposición: datasets/read models registrados como fuentes declarativas del patrón Analytics DGP-016 (sin dashboards en DGP-021).

## 15. Costo por hora de operación (§14 — prioritario)

Los cuatro «tipos de hora» NO son equivalentes y el corpus los distingue:
- **Hora de mantenimiento** (sesiones DGP-020.2): tiempo humano trabajado — es NUMERADOR (costo de mano de obra), jamás denominador.
- **Hora de horómetro** (utilización): horas de operación del activo — **denominador correcto** para costo/h.
- **Km de odómetro**: denominador para costo/km.
- **Hora calendario**: solo para «costo por período», nunca como proxy de operación.

Fórmula posible HOY solo parcialmente: `utilizacion.resumen` ya calcula costo-combustible/h con Δhorómetro válido. El costo operativo/h completo = (mano de obra + materiales + combustible del período) / Δhorómetro del período, computable únicamente cuando: (a) existan hechos de materiales (DGP-021.x), (b) el período tenga dos lecturas válidas crecientes del mismo tramo — si no, **`sin-datos`** (patrón `calculos.ts:20-44`). GAP-COST-07 documenta el límite: sin disciplina de lecturas del tenant, el denominador no existe; no se inventa con horas calendario.

## 16. Disponibilidad y costo (§15)

No se asume «OT abierta = activo fuera de servicio». El corpus no registra paradas/indisponibilidad: los estados de OT son workflow, las sesiones miden trabajo humano y los estados de activo son operativos sin timestamps de transición consultables por período. **GAP-COST-06: el costo de indisponibilidad NO puede calcularse hoy** y requiere un contrato futuro de eventos de disponibilidad del activo (fuera de alcance DGP-021).

## 17. Registro de GAPs (§22)

| GAP | Estado | Evidencia |
|---|---|---|
| GAP-COST-01 Atribución de repuestos a OT | **ABIERTO** — referencia opaca en movimiento; recurso de OT sin FK ni costo | §4.2 |
| GAP-COST-02 Snapshot histórico de costo de repuestos | **ABIERTO** — movimiento sin costo; costo de artículo mutable | §4.2 |
| GAP-COST-03 Abastecimiento → consumo | **ABIERTO** — cost-engine llega hasta «recibido»; consumo sin valorización; compra sin activo | §4.3 |
| GAP-COST-04 Política de moneda | **PARCIAL** — moneda de tenant existe y rige tarifas; tanqueos con moneda opcional/mixta; sin conversión | §9 |
| GAP-COST-05 Costo real vs estimado | **ABIERTO** — costoReal manual sin fuente; estimado sin desglose | §4.5 |
| GAP-COST-06 Costo de disponibilidad | **ABIERTO** — sin datos de paradas | §16 |
| GAP-COST-07 Costo por hora de operación | **PARCIAL** — denominador existe solo con lecturas válidas por tramo | §15 |
| GAP-COST-08 Devoluciones/anulaciones | **PARCIAL** — anulación existe en tanqueos; devolución física sin reverso económico; valoraciones sin anulación | §4.2, §4.4 |
| GAP-COST-09 Otros costos (servicios terceros, peajes, etc.) | **ABIERTO** — sin fuente en el corpus | §7.2 |
| GAP-COST-10 Precisión monetaria de abastecimiento | **NUEVO** — Dinero con float JS en dominio (persistencia numeric); componer siempre desde strings de PG | §4.3 |
| GAP-COST-11 OT sin activo principal | **NUEVO** — activo opcional/editable ⇒ costos no atribuibles a activo | §4.5 |
| GAP-COST-12 Consumo de repuestos offline | **NUEVO** — salidas de inventario no están en el catálogo offline | §10 |
| GAP-COST-13 Unidad en movimientos | **NUEVO** — movimiento aplica unidad base implícita; el hecho económico debe copiar la unidad snapshot | §4.2 |
| GAP-COST-14 Contrato público de costos con precisión exacta | **NUEVO — BLOQUEANTE** — `modulo.abastecimiento.costos` expone floats JS (`module.ts:1667-1680`); `abs_costos_read` es interno; sin contrato string-decimal no hay snapshot legal de costo de materiales | §4.3, §7.2 |

## 18. Riesgos

1. Doble fuente de verdad si el módulo de costos copia hechos ya snapshot (mitigación: componer, no copiar — §7.2).
2. Floats de abastecimiento contaminando composición: la query pública actual ya es float y no hay fuente exacta accesible (GAP-COST-14). Mitigación única válida: nuevo contrato público string-decimal (decisión de Dirección) antes de cualquier snapshot de materiales; jamás adaptadores provisionales sobre tablas internas ajenas.
3. Monedas mixtas silenciosamente sumadas (mitigación: agregación por moneda, nunca conversión).
4. `costoReal` manual conviviendo con costo compuesto y confundiendo al usuario (decisión de Dirección pendiente).
5. Fan-out de composición sobre activos con muchas OTs (mitigación: read models de composición recalculables, no consultas en caliente).
6. Consumo registrado sin costo de referencia disponible (`abs_costos_read` vacío para el artículo) ⇒ hecho `SIN_DATOS` revalorable, nunca $0 ni bloqueo del movimiento físico.

## 19. Fases futuras propuestas (§24) — derivadas de los gaps

0. **DGP-021.0 — Contrato público exacto de costos de abastecimiento (PRERREQUISITO BLOQUEANTE)**: exponer costos de referencia (promedio/último/estándar, cantidad, moneda) como cadenas decimales canónicas leídas de `numeric` sin pasar por el VO float, vía query pública nueva del propio module-abastecimiento (módulo congelado ⇒ **requiere excepción §45 aprobada por Dirección**; alcance mínimo: solo lectura, aditivo, sin tocar dominio ni cost-engine). Sin esta fase, 021.1–021.2 no pueden snapshotear costos de materiales. Resuelve GAP-COST-14.
1. **DGP-021.1 — Fundación de hechos económicos (module-costos)**: hecho `CONSUMO_MATERIAL` snapshot + estados económicos mínimos + RLS + OpenAPI + reproceso/pendientes. Depende de **021.0**. Ataca GAP-COST-02/-13.
2. **DGP-021.2 — Atribución e integración de inventario**: camino oficial «consumir para OT» (orquestación post-drain sobre salida/consumo con referencia OT + activo derivado de la OT; devolución compensatoria). Depende de 021.0–021.1. Ataca GAP-COST-01/-08 (materiales); decide GAP-COST-12 (offline).
3. **DGP-021.3 — Composición costo OT / costo activo**: read models de composición por moneda + integración combustible al costo de activo + estimado-vs-compuesto. Depende de 021.1–2 (parcial solo-mano-de-obra posible antes, etiquetada). Ataca GAP-COST-05 parcialmente.
4. **DGP-021.4 — Costo por hora/km y datasets Analytics**: composición con denominadores de utilización (`sin-datos` estricto) + registro de fuentes Analytics. Depende de 021.3. Ataca GAP-COST-07.
5. **Fuera de secuencia (requieren decisión/contratos nuevos)**: moneda por defecto en tanqueos (§45), disponibilidad/downtime (GAP-COST-06), otros costos (GAP-COST-09), facturación.

Bloqueantes transversales: **GAP-COST-14 bloquea 021.1–021.4 en su componente de materiales** (021.0 lo resuelve, previa excepción §45); la composición solo-mano-de-obra + combustible de 021.3–021.4 no está bloqueada. Resto: decisiones de Dirección (§21).

## 20. Criterios de aceptación (§25) — verificación

1–2 corpus auditado sin relaciones inventadas (§3–5, evidencia archivo:línea); 3 mano de obra vs DGP-020.3 (§4.1); 4 combustible vs DGP-019 (§4.4); 5 sesiones vs DGP-020.2 (§4.1); 6 inventario (§4.2); 7 abastecimiento (§4.3); 8 fuente real de cada costo (§4, §12 de componentes); 9 gaps (§17); 10 snapshots (§8); 11 moneda (§9); 12 auditoría (§11); 13 offline (§10); 14 RBAC (§12); 15 RLS (§13); 16 sin-datos ≠ $0 (§7.2, §9, §15, patrón corpus); 17 métricas Analytics (§14); 18 qué NO puede calcularse (§14 «NO DISPONIBLE», §16, §17); 19 arquitectura sin duplicación (§7); 20 fases (§19); 21–22 revisión arquitectónica independiente ejecutada contra el corpus (registro en el informe de cierre).

## 21. Decisiones pendientes de Dirección

1. Aprobar o rechazar la arquitectura híbrida B+A (module-costos delgado: materializa solo lo inexistente, compone lo existente).
2. ¿Deprecar en presentación el `costoReal` manual de la OT a favor del costo compuesto, o mantener ambos etiquetados?
3. ¿Excepción §45 para que el tanqueo herede la moneda del tenant por defecto, o convivir con moneda opcional documentada?
4. ¿Priorizar el consumo de repuestos offline (GAP-COST-12) en 021.2 o diferirlo?
5. ¿Qué costo de referencia usar como snapshot del consumo: promedio ponderado (recomendado, es el que mantiene el cost-engine), último costo o estándar?
6. **Aprobar la excepción §45 para DGP-021.0** (query pública aditiva de costos exactos en module-abastecimiento) — sin ella no existe camino legal hacia el costo de materiales.
7. Confirmar que combustible se atribuye al activo (no a la OT) y que facturación/impuestos/conversión de moneda quedan fuera del programa hasta nueva directiva.
