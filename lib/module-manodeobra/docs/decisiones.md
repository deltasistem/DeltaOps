# DGP-020.3 · Fundación de Mano de Obra — Decisiones de diseño y GAPs

Módulo **NUEVO** `@workspace/module-manodeobra` (patrón DGP-014/016: composición
pura sobre contratos públicos congelados). Determina de forma **auditable**:
quién trabajó, en qué OT, sobre qué activo, cuánto tiempo efectivo, categoría,
tarifa vigente, costo derivado, tenant, momento y fuente del tiempo. **No** es el
módulo de costos integral (DGP-021).

## 1. Fuente única de tiempo (autoridad externa)

La duración **efectiva** proviene EXCLUSIVAMENTE de las sesiones de trabajo de
DGP-020.2, leídas por la query pública `modulo.ordenes.sesion.duraciones`
(`efectivoMs` = autoridad). El módulo:

- **NUNCA** recalcula tramos ni lee tablas `ord_*` ni `idn_*` por SQL directo.
- **COPIA** `efectivoMs` como *snapshot documentado* en la valoración. No es una
  segunda fuente de verdad: es la foto del valor autoritativo en el momento de
  valorar (para auditar el costo derivado sin depender de relecturas).

## 2. Integración sesión → valoración: **ORQUESTACIÓN** (Opción B) — GAP resuelto

### GAP diagnosticado
El diseño ideal —que `module-manodeobra` se **suscribiera** por outbox al evento
`modulo.ordenes.sesion-cerrada` con sus propios `eventHandlers`— **no es viable**
en el corpus actual:

- Cada módulo compone su **propio** `createPlatformRuntime` aislado (sólo su
  módulo en `extraServices`). No existe un runtime multi-módulo ni un drenador de
  outbox en segundo plano.
- El outbox PG (`deltaops.kernel_outbox`) es una tabla **única compartida**, pero
  `OutboxProcessor.processPending()` reclama con `FOR UPDATE SKIP LOCKED` y marca
  procesado **globalmente**. Un `EventDispatcher` con 0 handlers devuelve `[]`,
  `allSucceeded([])` = ok ⇒ el registro se marca procesado igual.
- `ordenes-module.ts` drena su **propio** outbox de forma síncrona en cada
  request; reclama y marca procesado el `sesion-cerrada` de inmediato. Un runtime
  de mano de obra separado competiría en carrera y perdería el evento.
- Ningún módulo del corpus se suscribe a eventos de **otro** módulo por outbox:
  la reacción cross-módulo real es **PULL** (queries públicas; p.ej. el fan-out de
  analytics) o **WRITE** por comando directo + drenaje del runtime destino
  (correctivo/preventivo → ordenes).

### Decisión
Disparador **PULL orquestado desde el api-server** (coherente con DGP-007, «sync
por orquestación»):

- Comando idempotente `modulo.manodeobra.valoracion.procesar-sesion
  { sesionId, ordenId? }`, guarda durable por `(tenant, sesionId)` (índice único
  = PK de `mdo_valoraciones`). Reprocesar **no** duplica: si ya existe ⇒ no-op ok.
- Internamente lee `sesion.duraciones` con **contexto de servicio**, verifica
  estado `CERRADA` (si no lo está ⇒ rechazo de negocio), resuelve recurso +
  tarifa vigente y persiste el snapshot.
- **Cableado api-server**: tras el `drain()` de Órdenes en la ruta de cierre de
  sesión —tanto el POST directo como el camino `/sync` (cola offline)— se encadena
  la invocación al comando con un **principal de servicio** (patrón DGP-019.1, no
  un admin fabricado). **FAIL-SAFE**: si la valoración falla, la sesión queda
  cerrada igual (log + regenerable re-invocando `procesar-sesion`); jamás se rompe
  el cierre por un fallo de valoración.
- **Red de seguridad**: query administrativa `valoraciones.pendientes` (sesiones
  cerradas de la OT sin valoración, por composición de queries públicas) para que
  la UI muestre «pendiente de valorar»; el comando `procesar-sesion` sirve de
  reintento manual/administrativo.

## 3. Identidad canónica y nombre de presentación

- La identidad es **siempre** canónica (`identityId`). El nombre **no** se
  persiste como identificador: se resuelve al mostrar vía `IdentidadPort`
  (fail-closed; adaptador de producción en el api-server sobre el servicio público
  de Identidad). El modo técnico «mías» usa el `identityId` del contexto
  (`metadata.identityId`), con match canónico estricto (nunca el ID espejo legacy).

## 4. Categorías (catálogo estándar, DATOS)

- `catalogo:categorias-mdo` en el Record Store (patrón `CatalogoService` de
  Activos). Catálogo **vacío** ⇒ se admiten/exponen las categorías CANÓNICAS por
  defecto: `tecnico-mecanico`, `tecnico-electrico`, `soldador`, `operador`,
  `supervisor`, `ayudante`, `especialista`. Ninguna categoría es rama de lógica.

## 5. Recurso humano (agregado ligero)

- `mdo_recursos`: `(tenant, identityId único)` + `categoriaClave` + estado
  `ACTIVO|INACTIVO` + auditoría. INACTIVO no seleccionable; jamás se borra. El
  upsert por `identityId` es idempotente y **reactiva** un recurso INACTIVO.

## 6. Tarifa versionable

- `mdo_tarifas`: `sujetoTipo='CATEGORIA'` + `sujetoId=categoriaClave` **hoy**; el
  esquema/contrato admite `'IDENTIDAD'` a **futuro** sin romper snapshots (el
  snapshot copia el valor, no la referencia).
- `valor numeric(18,6)`, `moneda` explícita por fila, `unidad='HORA'` (única
  soportada; otra ⇒ rechazo de negocio), `vigenciaDesde/Hasta` (null = abierta),
  estado, auditoría completa (incl. `valorAnterior`/`motivo`).
- **Prohibido sobrescribir** una tarifa utilizada: cambiar = **cerrar** la
  vigencia abierta + **crear** una fila nueva, orquestado en **una sola UoW**
  (`tarifa.actualizar`). El **solape** de vigencias del mismo sujeto ⇒ rechazo
  determinista (dominio) + índice único parcial de vigencia abierta (base).

## 7. Valoración / snapshot inmutable

- `mdo_valoraciones`: snapshot de `sesionId, ordenId, activoId, identityId,
  categoriaClave, tarifaId + valor + moneda + unidad, efectivoMs, costo, estado,
  vigencia aplicada, timestamps`.
- Estados: `VALORADA` (recurso + tarifa vigente ⇒ costo calculado, **inmutable**),
  `SIN_TARIFA` (recurso pero sin tarifa ⇒ `costo NULL`, **nunca 0**),
  `SIN_RECURSO` (identidad no es recurso ⇒ `costo NULL`). Revalorar sólo aplica a
  `SIN_TARIFA`/`SIN_RECURSO` vía comando administrativo `valoracion.revalorar`.

## 8. Dinero y precisión (convención Abastecimiento)

- `numeric(18,6)` en PG. Cálculo `(efectivoMs / 3_600_000) × tarifa`, **sin
  redondear el tiempo**; se redondea **sólo** el resultado final a 4 decimales con
  `redondear()` (`Math.round((v + Number.EPSILON) * 1e4) / 1e4`).
- Casos deterministas: `2h30m × 40000 = 100000.0000`;
  `1h20m × 35000 = 46666.6667`.

## GAPs / decisiones abiertas documentadas

1. **Cruce de períodos tarifarios (§16).** Política: se aplica la tarifa vigente
   en `iniciadoAt` de la sesión. Si el intervalo `[iniciadoAt, cerradoAt)` cruza
   un borde de vigencia del sujeto, se aplica igualmente la de `iniciadoAt` y se
   marca `cruzaPeriodos=true`. El prorrateo multi-período se difiere a DGP-021
   (costos integral); esta fundación deja la señal auditable.
2. **Tarifa por identidad (`sujetoTipo='IDENTIDAD'`).** El esquema y los contratos
   ya lo admiten; el flujo actual opera por categoría. Al activarse, los snapshots
   existentes no cambian (copian valor, no referencia).
3. **Suscripción cross-módulo por outbox inexistente.** (Ver §2.) La integración
   es por **orquestación** en el api-server, coherente con DGP-007.
4. **Moneda por defecto.** `COP`/`CLP` son **configuración** del tenant
   (`modulo.manodeobra.moneda-defecto` o la moneda del tenant); nunca hardcode de
   dominio. El seed delta-demo configura la moneda del tenant demo (CLP hoy).
