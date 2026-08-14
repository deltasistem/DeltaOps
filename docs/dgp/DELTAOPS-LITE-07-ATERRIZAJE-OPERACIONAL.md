# DELTAOPS LITE-07 · Aterrizaje Operacional Delta: Equipo, Horómetro, Rutinas, Combustible, Mano de Obra y Hoja de Vida

> **Naturaleza (§1, §32).** Fase de **DISCOVERY + DISEÑO**. **No se implementó nada**: cero cambios de
> código, base de datos, migraciones, API, OpenAPI, RBAC/RLS, roles, permisos, workflows,
> infraestructura, configuración, navegación ni componentes visuales. No se eliminó ni duplicó nada. El
> único archivo creado es este documento.
>
> **Criterio de honestidad (§30).** Cada capacidad se clasifica en una de siete categorías, verificada
> contra el **código real** (no por nombre de módulo/tabla): **VERIFICADO FUNCIONALMENTE (VF)** ·
> **EXISTE PARCIALMENTE (EP)** · **EXISTE PERO NO ESTÁ EXPUESTO (ENE)** · **REQUIERE COMPOSICIÓN (RC)**
> · **REQUIERE DESARROLLO (RD)** · **NO VERIFICADO (NV)** · **NO APLICA A DELTA LITE (NA)**.
>
> **Fuentes de verdad (§2).** Código actual (`lib/module-*`, `artifacts/api-server`,
> `artifacts/deltaops`), esquema PostgreSQL `deltaops`, LITE-06 (auditoría funcional, re-verificada),
> LITE-04/05, y material empresarial en `attached_assets/` (Delta Brandbook, logos, especificaciones
> ETS/ESI). Regla: **CÓDIGO + evidencia real de negocio > documentación antigua**; sin evidencia →
> **NV**, sin inventar.

---

## 1. Resumen ejecutivo

**Veredicto general.** DeltaOps NO necesita reconstruirse: la mayor parte de la operación que la
Dirección describe **ya existe en el dominio y en los runtimes**, con calidad de ingeniería alta
(event-sourcing, idempotencia, RLS forzado, snapshots auditables). El problema es de **aterrizaje de
experiencia**: capacidades potentes están **no expuestas** o expuestas como CMMS/EAM genérico en lugar
de girar alrededor del equipo. Por tanto, LITE-08 será mayoritariamente **composición y exposición
por perfil**, no desarrollo de dominio nuevo.

**Hallazgos clave (todos verificados contra código):**

1. **Horómetro/Kilometraje — MUCHO MÁS MADURO de lo que la UI sugiere (VF en dominio).** El módulo de
   Utilización (DGP-019.x) ya trata las lecturas como **hechos append-only e inmutables**, impone
   **monotonicidad** (una lectura menor NUNCA se interpreta como reinicio automático; se marca
   `inconsistente`), y ofrece **corrección auditada** vía `regularizar-medidor` (exige motivo) y
   `anular-lectura` (motivo + actor + fecha). Soporta horómetro (h) y odómetro (km) canónicos. **No
   inventa lecturas.** Esto cumple la exigencia crítica del §5.

2. **La cadena «faltan 15 h para la rutina» EXISTE end-to-end en el backend, pero NO está expuesta como
   experiencia operacional (ENE + RC).** El motor de frecuencias de Planes (DGP-012) evalúa reglas de
   **uso** (`horometro/odometro/ciclos/produccion/contador`) además de temporales y por eventos, y
   devuelve `vencida`, `excedente` («faltan X»), `progreso` y `proximaMeta`. Utilización **propaga**
   cada lectura al Activo (`actualizar-horometro`/`actualizar-odometro`) y Planes/Preventivo leen esos
   medidores del Activo para evaluar la frecuencia. Falta la **superficie operacional** que muestre
   «Horómetro 1.185 h · Próxima rutina 1.200 h · Faltan 15 h · [Iniciar mantenimiento]».

3. **Combustible — asociado al activo, multi-energía, proveedor ya es snapshot (VF/EP).** Los tanqueos
   viven en Utilización, atados al **activo** (no a OT), con `tipoCombustible` **configurable por
   catálogo** (canónicos: diesel, gasolina, gas-natural, glp, electrico, biodiesel — **NO** ACPM-único),
   `litros`, `precioUnitario`, `costoTotal`, `moneda`, `lecturaMedidorRef`, `evidenciaRef`, y
   **`proveedorId` como string SIN FK dura** (ya es snapshot transaccional). El **rendimiento se
   deriva** (L/h, L/100km, costo/h, costo/km) con estado explícito **«sin datos suficientes»**; jamás
   se digita. GAPs: no hay campo `centroTrabajo` ni `ticket` dedicados en el tanqueo; el costo de
   combustible **no se materializa aún en Costos** (GAP-COST, ver punto 7).

4. **Horas hombre — VF (DGP-020.3), sin proceso administrativo pesado.** Las sesiones de trabajo de la
   OT capturan tiempo con **tramos append-only** (inicio/pausa/reanudación/cierre; la duración es
   derivada, nunca digitada) y el módulo de Mano de Obra materializa una **valoración snapshot**
   (`ordenId + activoId + identityId + efectivoMs + tarifa`), con estados `VALORADA/SIN_TARIFA/
   SIN_RECURSO`. El técnico registra su trabajo dentro de la ejecución de la OT.

5. **Repuestos — hoy pasan por Inventario (EP + RC).** El consumo de repuestos existe pero está
   **acoplado a Inventario** (Correctivo reserva/consume vía `InventarioPort`). No existe una forma
   ligera de registrar «repuesto + cantidad + costo + proveedor opcional» **directamente en la OT sin
   inventario**. Como Delta hoy **no opera inventario**, esto es un GAP de experiencia (RC/RD menor):
   inventario **no debe ser requisito para cerrar OT**.

6. **Centro de costos / centro de trabajo / ubicación / responsable (EP + RD).** El Activo modela
   `centroCosto`, `ubicacion` y `responsable`, **pero NO existe el concepto separado de «centro de
   trabajo/operación» ni «equipo/grupo de mantenimiento»** como entidades. Además `centroCosto` **está
   vacío en los 36 activos reales y NO se captura en el alta** (confirmado LITE-06 y re-verificado en
   `lib/activos/alta.ts`). La jerarquía Empresa→Centro de costos→Centro de trabajo→Ubicación→Activo del
   §18 requiere diseño (sin duplicar activos, respetando RLS).

7. **GAP-COST (combustible → activo, no OT) confirmado (EP).** El módulo Costos declara los tipos de
   hecho `COMBUSTIBLE` y `MANO_DE_OBRA` **pero sin comando de materialización** (para no duplicar la
   fuente de verdad de su módulo origen). El costo de combustible vive en el tanqueo (atado al activo).
   Para hoja de vida/indicadores por activo esto es correcto; para «costo de mantenimiento por OT», el
   combustible **no** entra por OT. Es un GAP de composición para reporting, no un defecto.

8. **Configuración de módulos por rol (§20) — NO EXISTE como la pregunta la plantea (NO EXISTE / RD).**
   Los entitlements de módulo son **por TENANT** y sólo los edita **SUPER_ADMIN** (`PATCH
   /tenant/modules` con `requireSuperAdmin`). La visibilidad **por rol** está **codificada** en
   `rbac.ts` (`gruposNavegacion`), no es parametrizable por el administrador de empresa. La
   recomendación **VISIBILIDAD ≠ SEGURIDAD** se mantiene: el backend sigue siendo la autoridad (RLS +
   permisos por comando).

9. **Roles (§7).** Ya existen 6 roles canónicos que colapsan a 3 buckets de módulo (admin/operador/
   lector); Órdenes y Utilización refinan por rol canónico. **NO existe rol OPERADOR** (correcto: la
   Dirección pide diseñarlo sólo conceptualmente, §19). El sistema **ya** soporta centro-grande y
   centro-pequeño sin exigir coordinador universal (verificado: PLANIFICADOR/TÉCNICO operan y ejecutan;
   SUPERVISOR/ADMIN validan; no hay coordinador obligatorio).

10. **Tema y responsive (§21/§22).** Existe **una única autoridad de tema** (`ThemeProvider` del Design
    System a nivel raíz de `App.tsx`, `data-do-theme` + clase `dark`, persistido en
    `localStorage["do-tema"]`). El diagnóstico de densidad/aprovechamiento de ancho/logo-en-oscuro es un
    problema de **experiencia por perfil**, a resolver en LITE-08 sin crear un segundo sistema visual.

**Conclusión ejecutiva:** el roadmap de LITE-08 debe priorizar (a) **exponer** rutinas por uso y hoja
de vida operacional (ya composables), (b) **captura ligera** de centro de costos, repuesto-en-OT y
campos de tanqueo faltantes, (c) **navegación y tema por perfil**, y (d) diseñar la jerarquía
multicentro. Casi nada exige tocar el núcleo.

---

## 2. Operación real identificada

El flujo objetivo de Dirección, mapeado a lo que HOY existe:

```
EQUIPO ─ VF (Activos)          → PanelOperacional 360° ya inyectado en la ficha
  ↓
LECTURA (horómetro/km) ─ VF    → Utilización: append-only, monotónica, auditable
  ↓
PREOPERACIONAL ─ VF (LITE-04)  → composición Forms+Activos en platform_records
  ↓
OPERACIÓN                      → uso real del equipo (fuera de sistema)
  ↓
RUTINA (por uso) ─ ENE/RC      → motor de frecuencias evalúa; falta superficie "faltan X h"
  ↓
MANTENIMIENTO/OT ─ VF (LITE-05)→ hallazgo→correctivo→OT idempotente
  ↓
EJECUCIÓN ─ VF                 → sesiones/tramos append-only
  ↓
HORAS HOMBRE ─ VF (DGP-020.3)  → valoración snapshot desde tramos
  ↓
REPUESTOS ─ EP/RC              → hoy vía inventario; falta captura ligera en OT
  ↓
COMBUSTIBLE ─ VF/EP            → tanqueo por activo, multi-energía, proveedor snapshot
  ↓
CIERRE ─ VF                    → gate validación, aprobador ≠ solicitante
  ↓
HOJA DE VIDA ─ EP/RC          → PanelOperacional + timeline; falta consolidación §16 completa
  ↓
INDICADORES ─ EP              → económicos y conteos sí; MTTR/MTBF/Disponib. sin insumos (LITE-06)
```

---

## 3. Diferencias entre DeltaOps actual y DeltaOps Lite (Operación Delta)

| Dimensión | DeltaOps actual | DeltaOps Lite (objetivo) |
|---|---|---|
| Centro de la experiencia | Módulos (CMMS/EAM) | El **equipo** («mi máquina») |
| Disparo de mantenimiento | Planes/programación manual | **Rutinas automáticas por uso** (horómetro/km) |
| Entrada a la operación | Menú de 9+ módulos | Home por perfil → mis equipos / mis órdenes |
| Combustible | Superficie de utilización | Experiencia asociada al equipo + hoja de vida |
| Repuestos | Inventario (bodegas/movimientos) | Registro ligero en la OT (inventario opcional) |
| Rol operador | Inexistente | Conceptual (sin crearlo aún) |
| Navegación | Todo como si fueran admins | Por perfil (técnico/operación/supervisor/admin) |
| Coordinador | No obligatorio (ya) | Explícitamente no requerido |

**Ninguna capacidad se elimina.** El cambio es de **exposición**, no de alcance.

---

## 4. Equipo como centro de la experiencia (§4, §27.4)

**Estado actual (verificado):** el Activo (`lib/module-activos`) modela como columnas de dominio:
`id/codigoEmpresarial/nombre/estado/tipo/criticidad`, y como campos de dominio **`centroCosto`,
`ubicacion`, `responsable`** (más `datos` jsonb para marca/modelo/serie/etc.). Existe historial
append-only de **ubicación** (`act_ubicaciones_hist`) y **responsable** (`act_responsables_hist`), con
comandos `cambiar-ubicacion`/`actualizar-responsable`. La ficha (`activos-ficha.tsx`) ya inyecta el
**PanelOperacional 360°** (DGP-019.2) con horómetro/odómetro/consumo/rendimiento/próximo
mantenimiento/últimas intervenciones/OTs/timeline.

**Identificación** (§4): código, nombre, tipo, estado → columnas VF; **marca/modelo/serial** → viven en
`datos` jsonb (EP: existen pero como datos genéricos, no como campos de primera clase capturados
consistentemente).

**Ubicación / contexto** (§4): `ubicacion` VF (con historial), `responsable` VF (con historial),
**`centroCosto` EP** (modelado pero vacío y sin captura en alta), **`centroTrabajo/operación` RD** (no
existe el concepto), **`equipo/grupo de mantenimiento` RD** (no existe como entidad).

**Diseño propuesto (sin implementar):** consolidar la ficha como **hoja de vida operacional** (§16)
reutilizando el PanelOperacional; añadir captura de `centroCosto` en el alta; introducir
conceptualmente `centroTrabajo` y `equipoMantenimiento` como dimensiones separadas de `ubicacion` y
`centroCosto` (nunca equivalentes). Un activo cambia de ubicación/operación/centro **sin duplicarse**
(el historial append-only ya lo permite para ubicación/responsable; centro de trabajo requeriría el
mismo patrón).

**Clasificación:** Equipo como centro = **EP → RC** (base sólida; falta consolidación de experiencia y
captura de dimensiones separadas).

---

## 5. Horómetro y kilometraje (§5 · CRÍTICO)

**Verificado funcionalmente (VF) en el dominio (`lib/module-utilizacion`):**

- **Hechos append-only e inmutables:** una lectura no se edita ni borra; toda «corrección» crea un
  hecho nuevo (`value-objects.ts`: «no hay UPDATE… un `anular-*` (motivo, actor, fecha) + un nuevo
  hecho»).
- **Monotonicidad:** una lectura **menor que la última válida NUNCA se interpreta como reinicio
  automático**; se conserva pero se marca `inconsistente` con `motivoInconsistencia` (`events.ts`,
  `policies.ts`). El cálculo de delta devuelve **«sin-datos»** ante retroceso o delta no positivo
  (`calculos.ts`): no produce números falsos.
- **Corrección/compensación auditada:** comando `regularizar-medidor` (REINICIO_MEDIDOR) **exige un
  motivo auditable** (policy `POLICY_PUEDE_REGULARIZAR`) y **capacidad `regularizar`** (gate por
  permiso). `anular-lectura` registra `{motivo, actorId, fechaHora}`.
- **Medidores canónicos:** horómetro (unidad `h`) y odómetro (unidad `km`), con validación de unidad por
  medidor. **No se asume que todos los activos usan horómetro** (el medidor es explícito por lectura).
- **Propagación al Activo:** cada lectura válida propaga «el último valor» al Activo vía los comandos
  oficiales `modulo.activos.actualizar-horometro` / `actualizar-odometro` (fail-safe: si falla, emite
  `sincronizacion-fallida`, no rompe la lectura).

**Experiencia objetivo del §5 («Horómetro 1.185 h · Próxima 1.200 h · Faltan 15 h · [Iniciar]»):** los
insumos existen (lectura actual en Activo + regla de frecuencia por uso en Planes que calcula
`excedente`/`proximaMeta`). **La superficie que lo muestre como acción operacional NO existe hoy**
(el PanelOperacional muestra «Próximo mantenimiento» por **fecha de próxima ocurrencia**, no el
«faltan X h» por medidor). **Clasificación: dominio VF; experiencia «faltan X h» = ENE + RC.**

---

## 6. Rutinas (§6, §24)

**Motor de frecuencias (`lib/module-planes/src/domain/frecuencia-engine.ts`, DGP-012 — VF):** evalúa de
forma determinista frecuencias **compuestas** que combinan:

- **temporales** (días/semanas/meses/años),
- **de uso** (`horas/horometro/odometro/ciclos/produccion/contador`),
- **por eventos**,

con `AnclajeFrecuencia` (medidores base + fecha última ejecución), `ContextoEvaluacion` (medidores
actuales), y devuelve por regla: `vencida`, `progreso`, **`excedente`** («faltan X»; negativo si
falta), **`proximaMeta`** (fecha para temporales, **valor para uso**), y modo de combinación. Existe
`Rutina` como agregación de actividades con recursos/checklists/formularios **por referencia**
(referencia-only, no duplica módulos).

**Vencimientos/tolerancias:** el módulo Preventivo (`programacion.ts`) envuelve `evaluarFrecuencia` con
ventanas de programación (fecha objetivo + **tolerancia en horas**) y expone `vencida`.

**Diferencia rutina vs plan (recomendación §24):** el sistema **NO exige** que una persona entre a
«crear/programar/asignar plan» para que exista la necesidad: el motor **ya deriva** la próxima
intervención desde el uso. La recomendación es **priorizar RUTINAS AUTOMÁTICAS POR USO** como fuente
operacional y **sacar la planificación manual de la navegación principal** (moverla a
administración/avanzado), **sin eliminar el motor preventivo**.

- Reutilizable: motor de frecuencias completo (temporal + uso + eventos), rutinas por referencia,
  tolerancias, próxima meta, vencimiento. **VF.**
- Falta: **exposición operacional** de la rutina por uso (disparador «faltan X h» → «Iniciar
  mantenimiento») y la **notificación de vencimiento** orientada al equipo. **RC + RD (notificación).**

---

## 7. Preventivo por uso (§27.7)

**Estado:** el módulo Preventivo (DGP-018/019) genera actividades/OT desde programación, con orígenes de
generación que incluyen **`medidor`** y **`frecuencia`** (catálogo `origenes-generacion`). Lee los
medidores actuales del Activo (`medidoresDeActivo` en `planes-runtime.ts` → `modulo.activos.detalle`
→ `horometro/odometro`), que a su vez son alimentados por Utilización (§5). Por tanto el
**preventivo por uso es funcional en el backend**.

**GAP de exposición:** que el disparo por medidor **genere automáticamente** la OT y la muestre al
usuario como «mantenimiento de 1.200 h listo para iniciar» requiere composición de superficie + una
política de generación (manual/automática) clara. **Clasificación: motor VF; automatización/exposición
por uso = EP → RC.** No inventar: si un activo no tiene lecturas suficientes, el motor devuelve estados
neutros (no fuerza vencimientos falsos).

---

## 8. Preoperacional (§8, §27.8 — mantener LITE-04)

**VF (LITE-04, re-confirmado):** flujo Equipo → Preoperacional → Checklist → Resultado → Hallazgo → OT.
El preoperacional es una **composición** (Dynamic Forms + Activos) almacenada en el Record Store
genérico (`platform_records`, recordType `preoperacional-ejecucion`); el **veredicto**
(APTO/APTO_CON_OBSERVACIONES/NO_APTO) se calcula en el servidor y se sella a la versión de plantilla.
Mobile-first ya presente. **Recomendación §8:** conservar tal cual; asegurar que puede iniciarse desde
QR / equipo / Home / tarea pendiente / mis equipos (los puntos de entrada QR y equipo existen; «Home /
tarea pendiente / mis equipos» son de **experiencia de navegación por perfil** — RC).

---

## 9. Hallazgo → OT (§9, §27.9 — mantener LITE-05)

**VF (LITE-05, re-confirmado):** `hallazgo.generar` encadena de forma **idempotente**: resuelve
procedencia → crea solicitud Correctiva (id determinista anclado al hallazgo, `origen=preoperacional`)
→ transiciones triage/diagnóstico/validación/aprobación → `generar-orden-correctiva` (dedup anclado al
hallazgo) → devuelve `ordenTrabajoId`. Conserva la **procedencia** (equipo, checklist, ítem, hallazgo,
criticidad, evidencia, usuario, fecha/hora). **No se crea otro sistema.** El ciclo de la OT
(BORRADOR→ABIERTA→PLANIFICADA→ASIGNADA→EN_EJECUCION⇄PAUSADA→EN_VALIDACION→CERRADA) es el mismo.
**Recomendación:** mantener; sólo mejorar el prefill de evidencias (deuda conocida LITE-06) en fase de
implementación, sin cambiar el contrato en esta fase.

---

## 10. OT (§27.10)

**VF.** CRUD + `transicionar`, `planificar`, `asignar`, `asignar-recurso-humano`, `recursos`, `sla`,
`sesion/*`, `ejecucion`, `checklist`, `formulario`, `evidencias`, `documentacion`, `aprobar-cierre`,
`reproyectar`, `sync`, más read models (agenda, calendario, consola, historial, bitácora). El cierre es
de **dos pasos** por diseño (transición `cerrar` abre el gate `validacionCierre`; luego `aprobar-cierre`
con aprobador ≠ solicitante). La OT admite **estados extendidos por tenant** (workflow declarativo).

---

## 11. Ejecución (§27.11)

**VF.** La ejecución se registra con **sesiones de trabajo** cuya **fuente de verdad son tramos
append-only** (`lib/module-ordenes/src/domain/sesion.ts`): ABIERTA ⇄ PAUSADA → CERRADA, múltiples
ciclos, varias pausas suman; la **duración se deriva de los tramos** (efectivo/pausado/transcurrido),
nunca se digita; reglas de monotonicidad y «reloj sospechoso». La verificación de asignación (§6 de
LITE) tiene excepción para SUPERVISOR/ADMIN; PLANIFICADOR/TÉCNICO ejecutan sólo si están asignados
(bug de bypass ya corregido, según comentarios verificados en `ordenes-runtime.ts`).

---

## 12. Horas hombre (§14, §27.12)

**VF (DGP-020.3).** La **valoración de mano de obra** es un **snapshot auditable** que relaciona:
`ordenId`, `activoId`, `identityId` (técnico/persona), `efectivoMs` (copiado de las duraciones de la
sesión — autoridad externa, no recalculado), y la tarifa vigente al iniciar; estados
`VALORADA/SIN_TARIFA/SIN_RECURSO`. El costo estimado de una sesión abierta se calcula (duración actual ×
tarifa vigente) y marca `sinTarifa` sin inventar. Cubre los campos del §14: técnico, activo, OT, fecha,
inicio/fin (tramos), duración, observación; **centro de costos** cuando corresponda se toma del activo
(hoy vacío — ver §17 de este doc). **No crear otro módulo de mano de obra.** El técnico registra su
trabajo dentro de la ejecución de la OT, sin proceso administrativo pesado.

Matices honestos: la valoración depende de que exista **tarifa** (`mdo_tarifas`) y **recurso**
(`mdo_recurso`); sin ellos el estado es `SIN_TARIFA`/`SIN_RECURSO` (no bloquea la operación, pero el
costo de mano de obra no se consolida). **EP para el reporte económico; VF para captura de horas.**

---

## 13. Repuestos (§15, §27.13)

**Estado actual:** el consumo de repuestos existe pero está **acoplado a Inventario**. Correctivo define
`InventarioPort` (`verificarDisponibilidad`, `reservar`, `mover` consumo/devolución, `liberar-reserva`)
y su policy exige una intervención en asignación/ejecución para consumir. Los catálogos de recurso
incluyen `repuesto`. **No existe hoy** una vía ligera de registrar «repuesto + cantidad + unidad + costo
+ proveedor opcional + evidencia» **directamente en la OT sin pasar por bodegas/movimientos/
transferencias**.

**Requisito de Dirección (§15):** Inventario **NO** puede ser requisito para cerrar una OT (Delta no
opera inventario hoy). El técnico debe poder registrar el repuesto usado de forma mínima.

**Recomendación (sin implementar):** diseñar una **captura ligera de consumo en la OT** (línea:
repuesto/insumo, cantidad, unidad, costo si disponible, proveedor opcional como snapshot, observación/
evidencia) que **componga** con el hecho de costo `MATERIAL` de Costos (que ya soporta origen físico
opcional). Mantener Inventario completo como **capacidad administrativa/futura**, sin eliminarlo, sin
volverlo obligatorio. **Clasificación: EP (consumo vía inventario) → RC/RD (captura ligera en OT).**

**Verificación de no-bloqueo:** el cierre de OT (gate `validacionCierre` + `aprobar-cierre`) **no exige**
consumo de inventario ni selección de bodega. Confirmado: inventario **no** es hoy requisito de cierre.

---

## 14. Combustible (§10–13, §27.14)

**VF/EP (Utilización, tanqueos).** Cada tanqueo es un hecho **inmutable append-only atado al ACTIVO**
(no a OT), con: `fechaHora`, `litros`, `tipoCombustible` (catálogo configurable, multi-energía),
`precioUnitario`, `costoTotal` (derivado si sólo hay precio unitario), `moneda`, **`lecturaMedidorRef`**
(vínculo a la lectura de horómetro/km), `identityId` (responsable), **`proveedorId` string sin FK**,
`observacion`, `evidenciaRef`, `opId`. Anulación auditable con motivo/actor/fecha.

**Cumplimiento del §10 (campos mínimos):**

| Campo §10 | Estado | Nota |
|---|---|---|
| fecha / hora | VF | `fechaHora` |
| equipo | VF | `activoId` |
| tipo de combustible/energía | VF | catálogo (no ACPM-único) |
| cantidad / unidad | VF | `litros` (litros como unidad; otras energías: ver GAP) |
| horómetro/kilometraje | VF | `lecturaMedidorRef` |
| responsable | VF | `identityId` |
| proveedor (si aplica) | VF | `proveedorId` string, opcional |
| costo | VF | `precioUnitario`/`costoTotal`/`moneda` |
| evidencia | VF | `evidenciaRef` |
| centro de trabajo | **RD** | no existe campo (ni concepto centro de trabajo) |
| número de ticket | **EP/RD** | puede ir en `observacion`/evidencia; no hay campo dedicado |

**Multi-energía (§10):** confirmado (catálogo canónico `diesel/gasolina/gas-natural/glp/electrico/
biodiesel`, configurable por tenant). **No asumir ACPM.** Para energías no líquidas (eléctrico:
kWh), la unidad `litros` puede no ser semánticamente correcta → **GAP menor de unidad de energía (EP)**;
documentado, no se corrige aquí.

**Rendimiento (§12) — VF, siempre derivado:** `litrosPorHora` (L/h), `litrosPor100Km` (L/100km),
`costoPorHora`, `costoPorKm` en `calculos.ts`, todos con resultado **discriminado** que retorna
**«sin datos suficientes»** cuando faltan litros o delta de medidor. **El usuario nunca digita
rendimiento.** El PanelOperacional ya muestra la métrica correcta por medidor (L/h vs L/100km) con
empty state literal.

**Combustible → hoja de vida (§13):** cada tanqueo está atado al activo y el PanelOperacional ya lista
últimos tanqueos + consumo + rendimiento. La sección «ABASTECIMIENTO» del §13 (Fecha/Tipo/Cantidad/
Horómetro/Responsable/Costo/Proveedor/Evidencia) es **composable con los datos existentes (RC)**.

---

## 15. Proveedores como dato transaccional (§11, §27.15)

**Hallazgo (VF):** el dominio **ya trata al proveedor de combustible como snapshot**: `Tanqueo.proveedorId`
es un **string sin FK dura** («Proveedor de Abastecimiento (string, sin FK dura)»). Es decir, **el
tanqueo NO exige crear previamente un maestro de proveedores**. Existe además el módulo Abastecimiento
con un maestro completo de proveedores (para compras/OC), pero **no es requisito** para registrar un
tanqueo.

**Recomendación UX (§11, sin implementar):** para DeltaOps Lite, tratar el proveedor de combustible/
repuesto como **dato de transacción / snapshot**: nombre del proveedor (+ NIT/identificación opcional)
capturado en el momento, sin obligar a crear un maestro. La **administración completa de proveedores**
(Abastecimiento) queda como **capacidad administrativa**. **No modificar el dominio** (ya lo permite);
**no eliminar** el módulo de Abastecimiento. Si en el futuro se quiere trazar el mismo proveedor entre
transacciones, se puede componer por nombre/NIT sin volverlo obligatorio.

---

## 16. Hoja de vida del activo (§16, §27.16)

**Base existente (EP → RC):** el **PanelOperacional 360°** (DGP-019.2, `PanelOperacional.tsx`, 745
líneas) ya es una **composición pura sobre read models existentes** inyectada en la ficha del activo, y
cubre buena parte del §16: estado, horómetro/odómetro, consumo, último tanqueo, rendimiento por
medidor, disponibilidad (con «sin datos» literal), **próximo mantenimiento** (por fecha), **últimas
intervenciones**, resumen de OTs con navegación, **Timeline compartida** y QR, con acciones offline.

**Lo que falta para la hoja de vida consolidada del §16 (RC, sin duplicar hechos):**

| Sección §16 | Fuente existente | Estado |
|---|---|---|
| Estado / Horómetro / Ubicación / Responsable | Activo + Utilización | VF/EP |
| Centro de costos | Activo `centroCosto` | **EP (vacío, sin captura)** |
| Preoperacionales (último + resultado) | `platform_records` (preop) | RC (componer) |
| Mantenimiento (último X h · próximo X h · OT abiertas) | Planes (frecuencia por uso) + Órdenes | **RC (falta «próximo por uso»)** |
| Combustible (últimos tanques · consumo · rendimiento) | Utilización | VF/RC |
| Horas hombre (acumuladas · por mantenimiento) | Mano de obra (valoraciones) | RC (agregación) |
| Repuestos (últimos utilizados) | Correctivo/Costos (o futura captura ligera) | **EP/RC** |
| Historial (timeline preop→combustible→lectura→OT→horas→repuesto→cierre) | Timeline de eventos | VF/RC |

**Regla dura:** **no duplicar hechos** — la hoja de vida **compone** desde las fuentes existentes
(cada hecho vive una sola vez en su módulo). **Clasificación global: REQUIERE COMPOSICIÓN (RC)**, con
dos elementos que además requieren captura/exposición (centro de costos y próximo-por-uso).

---

## 17. Centros de costos (§18, §27.17)

**EP + RD.** El Activo modela `centroCosto` (columna de dominio) pero:

- **Vacío en los 36 activos reales** (re-verificado LITE-06).
- **No se captura en el alta** (`lib/activos/alta.ts::construirInput` captura nombre/tipo/estado/
  responsable/supervisor/ubicación, **pero NO `centroCosto`**).
- **No filtra bandejas ni indicadores** (Órdenes/Analytics no segregan por centro de costos).

La única segregación real hoy es por **empresa (tenant, RLS forzado)** + **responsable** de OT.
**Recomendación (§18):** diseñar la jerarquía **Empresa/Tenant → Centro de costos → Centro de trabajo/
operación → Ubicación → Activo** manteniendo los conceptos **separados** (nunca equivalentes), añadir
captura de `centroCosto` en el alta, y filtros por centro. **Sin duplicar activos**; el cambio de
centro/operación/ubicación se modela como historial append-only (como ya existe para ubicación/
responsable). RLS y backend siguen siendo la autoridad: **nunca** aceptar `tenantId`/centro sensible
desde el frontend como autoridad.

---

## 18. Centros de trabajo / operación (§27.18)

**RD (no existe el concepto).** El código NO tiene «centro de trabajo/operación» como dimensión: existe
`ubicacion` (con historial) y `centroCosto` (vacío), pero no una entidad de centro de trabajo ni de
acceso multi-centro por usuario. **Es una decisión de negocio + desarrollo** (ver Preguntas a
Dirección). Un usuario autorizado debería poder tener acceso a uno o varios centros y **cambiar de
contexto sin perder la identidad del activo** — hoy el cambio de contexto que existe es **switch de
tenant** (`/auth/switch-tenant`), no de centro dentro de un tenant.

---

## 19. Ubicación (§27.19)

**VF/EP.** `Ubicacion` es un value-object del Activo con **historial append-only** (`act_ubicaciones_hist`)
y comando `cambiar-ubicacion`. En los datos reales hay poca diversidad de ubicaciones (LITE-06). Un
activo cambia de ubicación **sin duplicarse** (VF). Falta captura consistente y uso en filtros (EP).

---

## 20. Responsables (§27.20)

**VF/EP.** `responsable` (y `supervisor` en `datos`) con historial append-only (`act_responsables_hist`)
y comando `actualizar-responsable`. Capturado en el alta (VF). Es hoy el mecanismo más cercano a
segregación operativa por persona. Falta relacionarlo con «equipo/grupo de mantenimiento» (RD).

---

## 21. Equipos / grupos de mantenimiento (§27.21)

**RD (no existe).** No hay entidad «equipo/grupo de mantenimiento». La asignación de OT es por **recurso
humano/identidad** (`asignar-recurso-humano`), no por grupo. El §6/§7 pide **no exigir coordinador
universal**: esto ya se cumple (la asignación/ejecución dependen de capacidades del centro, no de un
coordinador). Un «equipo de mantenimiento» sería una agrupación **opcional** de identidades para
asignación colectiva — decisión de negocio + desarrollo futuro.

---

## 22. Roles y capacidades (§7, §27.22)

**VF (con matices, ver LITE-06 §8).** 6 roles canónicos (SUPER_ADMIN, TENANT_ADMIN, SUPERVISOR,
PLANIFICADOR, TECNICO, CONSULTA) que **colapsan a 3 buckets de módulo** (admin/operador/lector).
Órdenes y Utilización refinan por rol canónico (validar/cerrar sólo SUPERVISOR+; PLANIFICADOR/TECNICO
operan/ejecutan sin bypass de asignación). **Ambos escenarios del §7 ya se soportan:**

- **Centro grande** (Asignador→Técnico→Supervisor→Validador): mapeable con PLANIFICADOR (asigna),
  TECNICO (ejecuta), SUPERVISOR (valida/cierra).
- **Centro pequeño** (Responsable ejecuta, supervisa y cierra): un SUPERVISOR (o TENANT_ADMIN) puede
  crear, ejecutar y cerrar; el sistema **no obliga** a que asignador ≠ ejecutor, salvo la única regla
  de cierre: **aprobador ≠ solicitante** (control de integridad, no jerarquía).

**NO crear jerarquía universal · NO exigir coordinador · usar RBAC existente · trazabilidad completa:**
todo verificado como ya cumplido. El **rol OPERADOR NO existe** y **NO debe crearse** en esta fase
(§19): sólo se diseña conceptualmente (Mi equipo → Preoperacional → Tanqueo → Lectura → Reportar
novedad), que se **mapea a capacidades existentes** (TECNICO/CONSULTA con navegación reducida).

---

## 23. Configuración por rol (§20, §27.23)

**Pregunta de Dirección: «¿En Configuración puedo parametrizar qué módulos ve cada rol?»**

| Elemento | Estado | Evidencia |
|---|---|---|
| Entitlements de módulo por **tenant** | **EXISTE** | `PATCH /tenant/modules` |
| ¿Editable por el **administrador de empresa**? | **NO** | `PATCH /tenant/modules` exige `requireSuperAdmin` |
| Parametrizar módulos **por rol** desde Configuración | **NO EXISTE** | La visibilidad por rol está **codificada** en `rbac.ts` (`gruposNavegacion`, `landingOperacional`), no es dato configurable |
| Roles/capacidades/permisos configurables | **PARCIAL** | Roles canónicos y permisos por comando son **fijos en código**; el tenant configura sólo entitlements de módulo (vía SUPER_ADMIN) |
| Navegación por perfil configurable | **NO EXISTE / REQUIERE IMPLEMENTACIÓN** | Es presentación derivada de rol+entitlement |

**Respuesta honesta:** **hoy NO se puede parametrizar en Configuración qué módulos ve cada rol.** La
experiencia por rol es **código**, no configuración. Los entitlements son **por tenant** y sólo
SUPER_ADMIN los cambia. **Recomendación (§20):** implementar (en fase futura) una **capa de
visibilidad por rol configurable** para el TENANT_ADMIN, bajo la regla **VISIBILIDAD ≠ SEGURIDAD**: el
frontend puede ocultar módulos por preferencia, pero el **backend sigue siendo la autoridad** (RLS +
permisos por comando); la configuración de visibilidad **nunca** debe conceder permisos inseguros ni
aceptar autoridad desde el frontend. **Clasificación: REQUIERE IMPLEMENTACIÓN.**

---

## 24. Navegación por perfil (§23, §27.24)

**Estado (EP):** `gruposNavegacion()` ya agrupa por proceso (Mantenimiento/Equipos/Inventario/
Indicadores/Referencia/Administración) y oculta por entitlement + capacidad admin; `landingOperacional`
define aterrizaje por rol. Pero la navegación principal aún expone **demasiada plataforma** para roles
operativos (LITE-06). **Diseño objetivo (sin implementar), aproximado al §23:**

| Perfil | Navegación propuesta |
|---|---|
| **Técnico** | Inicio · Mis equipos · Mantenimiento · Preoperacional |
| **Operación** (conceptual) | Inicio · Mis equipos · Preoperacional · Combustible · Lecturas |
| **Supervisor** | Inicio · Equipos · Mantenimiento · Preoperacionales · Indicadores |
| **Administrador** | Inicio · Mantenimiento · Equipos · Indicadores · Administración |

Las capacidades avanzadas (Abastecimiento, Inventario completo, Planes manuales, editor de dashboards,
Referencia) permanecen disponibles para quien las necesite, movidas a «Más»/Administración. **NO
eliminar módulos; cambiar la exposición.** **Clasificación: RC (composición de navegación).**

---

## 25. Responsive (§21, §27.25)

**Diagnóstico de experiencia (no lista CSS).** Base sólida: Design System único con tokens `--do-*`,
componentes responsive y hook `use-mobile`; el PanelOperacional está diseñado mobile-first (~390px).
Problemas observables/derivables del código y de LITE-06 §18:

- **Densidad alta** en Centro/Analytics/ficha (muchas pestañas) → carga cognitiva; priorizar
  Acción→Estado→Info crítica→Evidencia→Info secundaria (§21).
- **Doble familia de componentes** (DS `Do*` + `components/ui` shadcn con su propio `Toaster`) → riesgo
  de divergencia visual y de aprovechamiento de ancho. Recomendación: converger en el DS.
- **Aprovechamiento de ancho / max-width**: escritorio con áreas vacías vs móvil comprimido → definir
  contenedores con max-width razonable por tipo de pantalla.
- **Móvil de operación**: preoperacional/ejecución/tanqueo/lectura deben tener **acciones táctiles
  grandes**, no columnas reducidas. El PanelOperacional ya avanza en esto (EP).

**Clasificación: EP → RC/RD (rediseño de experiencia por perfil, no reescritura del DS).** Verificación
en hardware real: **NV** (no ejercitado en esta fase).

---

## 26. Tema claro / oscuro (§22, §27.26)

**VF (autoridad única).** `ThemeProvider` del Design System a **nivel raíz de `App.tsx`** es la **única
autoridad**: aplica `data-do-theme` + clase `dark` sobre `<html>` y persiste en
`localStorage["do-tema"]`; los `ThemeProvider` de cada Shell **heredan** (jamás fijan `data-do-theme`
local). No hay un segundo sistema de tema del DS.

**Riesgos a verificar en implementación (no en esta fase):**

- **Logo en tema oscuro (§22):** existen activos de marca (`Logo Full color-Blanco`, `...-Negro`,
  Brandbook) en `attached_assets/`. Debe garantizarse la variante **blanca sobre fondo oscuro** y
  **negra sobre fondo claro** para evitar «logo negro sobre fondo negro». **NV en runtime** aquí;
  documentado como verificación obligatoria.
- **Contraste de textos, selects nativos ilegibles, badges/menús/dropdowns/formularios**: revisar que
  usen tokens del DS y no estilos nativos. La coexistencia con `components/ui` es el principal foco.

**Clasificación: autoridad de tema VF; auditoría fina de logo/contraste = RC + NV (verificación
visual).** **No crear un segundo sistema visual; reutilizar el Design System.**

---

## 27. Indicadores (§17, §27.27) — clasificación A/B/C/D

Coherente con LITE-06 §11 (no inventar MTTR/MTBF/Disponibilidad/OEE):

| Indicador | Fuente real | Clase | Estado |
|---|---|---|---|
| Horas de operación | Utilización (delta horómetro) | **A** | VF |
| Horas hombre | Mano de obra (valoraciones) / tramos de sesión | **B** | EP (depende de tarifa/recurso) |
| Combustible (litros) | Tanqueos | **A** | VF |
| Consumo (L/h, L/100km) | Utilización (derivado) | **A/B** | VF (requiere lecturas suficientes) |
| Rendimiento | Utilización (derivado) | **B** | VF con «sin datos» honesto |
| Costo de combustible | Tanqueos (costoTotal) | **A** | VF (por activo; no por OT — GAP-COST) |
| Costo de mantenimiento | Costos (MATERIAL + otros) | **B** | EP (mano de obra/combustible no materializados) |
| OTs (abiertas/cerradas) | Órdenes read model | **A** | VF |
| Preventivos ejecutados | Preventivo/Órdenes | **B** | EP |
| Preventivos vencidos | Motor de frecuencias (vencida) | **B** | EP (requiere lecturas al día) |
| Correctivos | Correctivo/Órdenes | **A/B** | VF/EP |
| Equipos fuera de servicio | Estado del activo | **A/B** | EP |
| **MTBF / MTTR / Disponibilidad / OEE** | `insumosKpi` mayormente null | **D** | **No disponible** (no inventar) |

**Regla:** clasificar como **D** (no disponible) los KPIs de confiabilidad hasta que exista la captura/
derivación de insumos. No inventar indicadores.

---

## 28. Inventario como capacidad secundaria (§27.28, §15, §25)

**EP → clasificación ADMINISTRATIVO/FUTURO.** Inventario (bodegas, movimientos, transferencias, conteos,
series/lotes) es funcionalmente completo pero Delta **no lo opera hoy**. **NO eliminarlo; NO volverlo
requisito de cierre de OT.** Se conserva como capacidad **administrativa/futura**. La operación diaria
usa la **captura ligera de repuesto en la OT** (§13, a diseñar). Abastecimiento (OC, proveedores
maestro) → **ADMINISTRATIVO**.

## 29. Módulos CORE operacionales (§27.29)

Activos · Utilización (horómetro/km/combustible) · Preoperacional · Hallazgo · Órdenes (ejecución/
cierre) · Correctivo · Mano de obra (horas) · Rutinas por uso (motor de frecuencias expuesto) · Hoja de
vida · Indicadores básicos.

## 30. Módulos secundarios (§27.30)

Preventivo (motor sí; programación manual → segundar) · Planes (motor de frecuencias reutilizable;
planificación manual fuera de navegación principal) · Costos (composición de reporte) · Analytics
básico.

## 31. Módulos administrativos (§27.31)

Administración de empresa (usuarios/config/branding) · Abastecimiento (proveedores maestro, OC) ·
Inventario completo (bodegas/movimientos/transferencias/conteos) · Referencia (módulo neutro) ·
Consolas técnicas SUPER_ADMIN (Plataforma/Motores/Consola de Activos).

## 32. Módulos futuros / NO PRIORITARIOS (§25, §27.32)

Clasificación §25 (no eliminar, sólo clasificar): **OCULTO** (Design System, Playground de motores);
**ADMINISTRATIVO** (proveedores avanzados, OC, bodegas, transferencias, planificación manual
sofisticada, calendarios complejos, SaaS avanzado); **FUTURO** (predictivo, IA, multimoneda,
multiidioma); **CORE OPERACIONAL** (todo lo del §29). Multimoneda/multiidioma: el dominio tiene `moneda`
como campo pero no hay conversión — **FUTURO/NA para Lite**.

---

## 33. Datos existentes que YA pueden alimentar BI (§27.33)

Horómetro/odómetro (lecturas), horas de operación (deltas), combustible (litros/costo), consumo y
rendimiento derivados, costo/hora y costo/km, conteos y estados de OT, horas hombre (con tarifa/
recurso), tiempos de ejecución/cierre de OT (tramos). Todos con fuentes reales verificadas.

## 34. Datos que todavía requieren captura (§27.34)

- **centroCosto** (vacío, sin captura en alta) → filtros y costeo por centro.
- **centro de trabajo/operación** (concepto inexistente).
- **insumosKpi** de confiabilidad (tiempoReparacion/entreFallas/indisponible) → MTTR/MTBF/Disponibilidad.
- **repuesto en OT** (captura ligera hoy inexistente sin inventario).
- **campos de tanqueo** faltantes: centro de trabajo, ticket, unidad de energía no-líquida.
- **tarifas/recursos de mano de obra** poblados (para consolidar costo de mano de obra).

---

## 35. MATRIZ OBLIGATORIA DE CAPACIDADES (§28)

> No se marca «Existe» por existir un módulo: se verifica el **comportamiento real**. «Existe» = VF/EP
> (con nota); prioridad para DeltaOps Lite.

| Capacidad | Existe | Reutilizable | Requiere cambio | Prioridad | Motivo |
|---|---|---|---|---|---|
| Activos | Sí (VF/EP) | Alta | Captura centroCosto + consolidar ficha | ALTA | Centro de la experiencia; ficha 360° existe, falta centroCosto |
| Horómetro | Sí (VF) | Total | Exponer «faltan X h» | ALTA | Append-only, monotónico, corrección auditada, propaga a Activo |
| Kilometraje | Sí (VF) | Total | Igual que horómetro | ALTA | Odómetro canónico (km); mismas garantías |
| Preoperacional | Sí (VF) | Total | Puntos de entrada (Home/tareas) | ALTA | LITE-04; composición Forms+Activos, veredicto sellado |
| Checklist | Sí (VF) | Total | Ninguno de dominio | ALTA | Dynamic Forms versionado |
| Hallazgo | Sí (VF) | Total | Mejorar prefill evidencias (futuro) | ALTA | LITE-05; idempotente, conserva procedencia |
| OT | Sí (VF) | Total | Ninguno de dominio | ALTA | Ciclo completo + gate de cierre |
| Rutinas | Sí, motor (VF); exposición (ENE) | Alta | Exponer disparo por uso + notificación | ALTA | Motor de frecuencias (uso/temporal/eventos) no expuesto como rutina operacional |
| Combustible | Sí (VF/EP) | Alta | Campos: centro trabajo, ticket, unidad energía | ALTA | Tanqueo por activo, multi-energía, proveedor snapshot, rendimiento derivado |
| Horas hombre | Sí (VF) | Total | Poblar tarifas/recursos (config) | ALTA | DGP-020.3 snapshot desde tramos |
| Repuestos | Parcial (EP, vía inventario) | Media | Captura ligera en OT sin inventario | ALTA | Hoy acoplado a Inventario; Delta no opera inventario |
| Inventario | Sí (VF) | Baja (para Lite) | No volver requisito de cierre | BAJA | Completo pero no operado; administrativo/futuro |
| Hoja de vida | Parcial (EP/RC) | Alta | Consolidar composición §16 | ALTA | PanelOperacional 360° cubre gran parte; componer resto |
| Indicadores | Parcial (EP) | Alta | No exponer MTTR/MTBF/Disp. sin insumos | MEDIA | Económicos/conteos sí; confiabilidad clase D |
| Centros de costos | Parcial (EP) | Media | Captura + filtros | ALTA | Modelado pero vacío y sin captura |
| Centros de trabajo | No (RD) | N/A | Diseño de concepto + acceso multi-centro | MEDIA | Concepto inexistente; decisión de negocio |
| Roles | Sí (VF, matices) | Alta | Navegación por perfil (no crear OPERADOR) | ALTA | 6→3 buckets; soporta centro grande/pequeño sin coordinador |
| Configuración (módulos por rol) | No (RD) | N/A | Capa de visibilidad por rol configurable | MEDIA | Entitlements por tenant (SUPER_ADMIN); visibilidad por rol es código |

---

## 36. MATRIZ DE DATOS (§29)

| Dato | Fuente | Almacén actual (`deltaops`) | Quién lo registra | Cuándo | Qué lo consume | ¿Hoja de vida? | ¿BI? | ¿Preventivo? |
|---|---|---|---|---|---|---|---|---|
| Horómetro | Lectura de medidor | `utl_lecturas(_read)`; se propaga a `act_activos.datos.horometro` | Operador/Técnico | Al usar/revisar el equipo | Activos, Planes/Preventivo, Costos, Analytics, PanelOperacional | Sí | Sí (horas operación) | **Sí** (frecuencia por uso) |
| Kilometraje | Lectura de odómetro | `utl_lecturas(_read)`; propaga a `...odometro` | Operador/Técnico | Al usar el vehículo | Igual que horómetro | Sí | Sí | **Sí** |
| Combustible | Tanqueo | `utl_tanqueos(_read)` (atado a **activo**) | Operador/Técnico | Al tanquear | Utilización (rendimiento), hoja de vida | Sí | Sí (litros/costo) | Indirecto (uso) |
| Horas hombre | Tramos de sesión de OT → valoración | `ord_sesiones`,`ord_sesion_tramos`; `mdo_valoraciones` | Técnico | Durante la ejecución | Costos (mano de obra), indicadores | Sí | Sí (con tarifa) | No |
| Repuestos | Consumo (hoy vía inventario) | `cor_consumos_read`,`inv_movimientos`; costo en `cos_hechos` (MATERIAL) | Técnico/Almacén | En intervención/ejecución | Costos, hoja de vida | Sí (RC) | Sí (material) | No |
| OT | Orden de trabajo | `ord_ordenes(_read)` + asignación/planificación/sesiones | Planificador/Técnico/Supervisor | Del hallazgo/rutina al cierre | Historial, Costos, Analytics | Sí | Sí | Consume rutina |
| Preoperacional | Ejecución de checklist | `platform_records` (recordType preop) + Forms | Operador/Técnico | Antes de operar | Hallazgo, hoja de vida | Sí | Sí (conformidad) | Indirecto |
| Hallazgo | Derivado de preop | Derivado (id determinista) + `cor_solicitudes` | Operador/Supervisor | Al detectar no conformidad | Correctivo→OT | Sí | Sí | No |
| Centro de costos | Campo del activo | `act_activos.centroCosto` (**vacío**) | (No se captura) | (N/A hoy) | (Nada hoy) | Debería | Debería | No |
| Centro de trabajo | (No existe) | — | — | — | — | Debería | Debería | No |
| Ubicación | Value-object del activo | `act_activos.ubicacion` + `act_ubicaciones_hist` | Admin/Supervisor | Al ubicar/mover | Ficha, filtros (futuro) | Sí | Sí (por zona) | No |

---

## 37. Dependencias (§27.35)

- Utilización **alimenta** Activos (medidores) → Planes/Preventivo (frecuencia por uso) → Órdenes.
- Preoperacional → Hallazgo → Correctivo → OT (LITE-04/05).
- OT (sesiones/tramos) → Mano de obra (valoración) → Costos.
- Tanqueos → rendimiento/costo por activo → hoja de vida/indicadores (Costos NO materializa combustible).
- Todo protegido por **RLS por tenant**; el backend es la autoridad de permisos por comando.

## 38. Riesgos (§27.36)

- **Exposición sin dato de origen:** mostrar «faltan X h» sin lecturas al día produciría falsos → usar
  estados «sin datos» del dominio (ya soportados).
- **Confundir visibilidad con seguridad** al implementar configuración por rol → mantener backend como
  autoridad.
- **Acoplar repuesto a inventario** volvería a bloquear el cierre → captura ligera desacoplada.
- **Doble sistema de componentes** (DS + shadcn) → divergencia visual/tema.
- **Multicentro sin RLS extendido**: filtrar por centro en frontend no es seguridad → el filtrado de
  centro debe ser respaldado por backend.
- **Combustible no líquido** (eléctrico) con unidad `litros` → dato incoherente si no se ajusta unidad.

## 39. GAPs (§27.37)

1. **GAP-EXP-RUTINA:** motor de frecuencia por uso no expuesto como «faltan X h → Iniciar» (ENE/RC).
2. **GAP-CENTROCOSTO:** `centroCosto` vacío, sin captura en alta, sin filtros (EP/RD).
3. **GAP-CENTROTRABAJO:** concepto inexistente + acceso multi-centro dentro de un tenant (RD).
4. **GAP-REPUESTO-OT:** sin captura ligera de repuesto en OT sin inventario (RC/RD).
5. **GAP-COST-COMBUSTIBLE:** combustible atado al activo, no materializado en Costos por OT (EP).
6. **GAP-TANQUEO-CAMPOS:** faltan centro de trabajo, ticket, unidad de energía no-líquida (EP/RD).
7. **GAP-CONFIG-ROL:** no hay configuración de visibilidad de módulos por rol (RD).
8. **GAP-KPI-CONFIABILIDAD:** MTTR/MTBF/Disponibilidad sin insumos (clase D) (heredado LITE-06).
9. **GAP-MANODEOBRA-COSTO:** valoraciones dependen de tarifas/recursos hoy no poblados (EP).
10. **GAP-VISUAL:** densidad, doble familia de componentes, verificación de logo/contraste en oscuro (NV/RC).

---

## 40. Propuesta «DeltaOps Lite — Operación Delta» (§26)

Flujo con **cuándo aplica cada paso** (no todos ocurren siempre):

| Paso | Cuándo aplica | Quién | Estado hoy |
|---|---|---|---|
| **EQUIPO** | Siempre (punto de partida) | Todos | VF |
| **LECTURA** (horómetro/km) | Equipos con medidor; al operar/revisar | Operador/Técnico | VF |
| **PREOPERACIONAL** | Antes de operar (cuando la plantilla aplica) | Operador/Técnico | VF |
| **OPERACIÓN** | Uso real (fuera del sistema) | Operador | N/A |
| **RUTINA** | Cuando el uso alcanza la frecuencia (o tiempo) | Sistema (deriva) | Motor VF; exposición RC |
| **MANTENIMIENTO/OT** | Por hallazgo o por rutina vencida | Supervisor/Planificador | VF |
| **EJECUCIÓN** | Al intervenir | Técnico | VF |
| **HORAS HOMBRE** | Durante la ejecución | Técnico | VF |
| **REPUESTOS** | Si se usan (opcional, sin inventario) | Técnico | RC |
| **COMBUSTIBLE** | Al tanquear (independiente de OT) | Operador/Técnico | VF |
| **CIERRE** | Al validar (aprobador ≠ solicitante) | Supervisor/Admin | VF |
| **HOJA DE VIDA** | Consulta permanente (composición) | Todos | RC |
| **INDICADORES** | Consulta (económicos/conteos; confiabilidad no aún) | Supervisor/Admin | EP |

Principio: **el equipo es el centro**; la rutina por uso dispara el mantenimiento **sin exigir
coordinador**; el técnico registra horas/repuestos/combustible sin proceso administrativo pesado; todo
alimenta la hoja de vida por composición, sin duplicar hechos.

---

## 41. Roadmap de implementación por fases (§27.38)

> Orden por valor/riesgo. Cada fase es **implementación futura** (esta fase no ejecuta nada).

- **F1 · Exposición de rutina por uso + hoja de vida (mayormente composición, RC).** Superficie
  «Horómetro · Próxima rutina · Faltan X h · [Iniciar mantenimiento]» sobre el motor de frecuencias y
  el PanelOperacional; consolidar hoja de vida §16. Bajo riesgo (no toca dominio).
- **F2 · Captura ligera en operación (RC/RD menor).** Repuesto en OT sin inventario; campos de tanqueo
  faltantes (centro de trabajo/ticket/unidad de energía); captura de `centroCosto` en el alta.
- **F3 · Navegación y experiencia por perfil + tema/responsive (RC/RD).** Navegación reducida por perfil
  (técnico/operación/supervisor/admin); rediseño de densidad/ancho; verificación de logo/contraste en
  ambos temas. Sin crear rol OPERADOR ni segundo sistema visual.
- **F4 · Multicentro (RD + decisión de negocio).** Diseñar/implementar centro de trabajo, acceso
  multi-centro dentro del tenant, filtros por centro respaldados por backend/RLS.
- **F5 · Costeo e indicadores completos (EP→VF).** Poblar tarifas/recursos de mano de obra; materializar/
  componer combustible en costos por OT si se decide; capturar insumos de confiabilidad si Dirección lo
  requiere.
- **F6 · Configuración de visibilidad por rol (RD).** Capa configurable por TENANT_ADMIN bajo
  VISIBILIDAD ≠ SEGURIDAD.

Cada fase debe respetar: no eliminar capacidades, no crear dependencia de coordinador universal, no
volver inventario requisito, no convertir proveedores en barrera, mantener RLS/backend como autoridad.

---

## 42. Preguntas para Dirección (§32 — decisiones de negocio, no inventadas)

1. **Centro de trabajo/operación:** ¿es una dimensión **distinta** del centro de costos y de la
   ubicación (que hoy no existe en el sistema)? ¿Cómo se define un «centro de trabajo» en Delta?
2. **Acceso multi-centro:** ¿un usuario opera en varios centros **dentro de una misma empresa**? Hoy el
   cambio de contexto es por empresa (tenant), no por centro.
3. **Centro de costos:** ¿de dónde provienen los valores oficiales (catálogo contable)? ¿Se captura en
   el alta del activo o se importa? (Hoy está vacío.)
4. **Equipo/grupo de mantenimiento:** ¿se requiere asignar OT a un **grupo** además de a una persona?
5. **Repuesto en OT:** ¿basta registrar repuesto/cantidad/costo/proveedor libre, o se necesita algún
   vínculo mínimo a catálogo de artículos?
6. **Combustible no líquido (eléctrico/gas):** ¿qué unidades usa Delta (kWh, m³) y cómo se costean?
7. **Costo de combustible por OT vs por activo:** ¿el reporte de costo de mantenimiento debe incluir
   combustible (que hoy se asocia al activo, no a la OT)?
8. **Generación automática de OT por rutina vencida:** ¿la rutina vencida debe **crear la OT
   automáticamente** o sólo **notificar** que hace falta?
9. **Insumos de confiabilidad (MTTR/MTBF/Disponibilidad):** ¿Delta quiere capturarlos? Hoy no hay
   fuente suficiente; sin decisión, se mantienen como **no disponibles**.
10. **Configuración de módulos por rol:** ¿debe poder hacerlo el **administrador de empresa**
    (TENANT_ADMIN) o permanece como capacidad de SUPER_ADMIN por tenant?

---

## 43. Revisión independiente (§31)

| # | Verificación | Resultado |
|---|---|---|
| 1 | Documento contra código real | PASS (dominios y runtimes citados verificados) |
| 2 | Contra LITE-06 | PASS (coherente; MTTR/MTBF clase D, centroCosto vacío) |
| 3 | Contra LITE-04/05 | PASS (preop y hallazgo→OT conservados) |
| 4 | Horómetro | PASS (append-only, monotónico, corrección auditada, propaga) |
| 5 | Rutinas | PASS (motor de frecuencia por uso VF; exposición pendiente) |
| 6 | Combustible | PASS (por activo, multi-energía, proveedor snapshot, rendimiento derivado) |
| 7 | Horas hombre | PASS (DGP-020.3 snapshot desde tramos) |
| 8 | Hoja de vida | PASS (PanelOperacional 360° + composición RC) |
| 9 | Centros de costos | PASS (EP vacío/sin captura; RD centro de trabajo) |
| 10 | Roles | PASS (6→3; sin coordinador obligatorio; OPERADOR no creado) |
| 11 | Responsive | PASS (diagnóstico de experiencia; NV en hardware) |
| 12 | Tema claro/oscuro | PASS (autoridad única ThemeProvider raíz) |
| 13 | Navegación | PASS (por perfil, sin eliminar módulos) |
| 14 | No inventar funcionalidad | PASS (clasificación honesta 7 categorías) |
| 15 | No proponer eliminar capacidad | PASS (todo se conserva/reclasifica) |
| 16 | Sin dependencia obligatoria de coordinador | PASS (verificado en RBAC/Órdenes) |
| 17 | Inventario no es requisito operativo | PASS (cierre no exige inventario) |
| 18 | Proveedores no son barrera | PASS (proveedor = snapshot string sin FK) |
| 19 | Combustible/lecturas alimentan hoja de vida/indicadores | PASS (pipeline verificado) |
| 20 | Datos sensibles protegidos por backend/RLS | PASS (RLS forzado; frontend no es autoridad) |
| 21 | git status | PASS (sólo el doc nuevo + attachment de la directiva) |
| 22 | Cero cambios de implementación | PASS |

**Resultado: PASS.**

---

# INFORME OFICIAL DE CIERRE — DELTAOPS LITE-07

- **Veredicto:** DeltaOps ya posee, a nivel de dominio y runtime, la mayor parte de la operación Delta
  (horómetro monotónico/auditado, rutinas por uso, combustible multi-energía con proveedor snapshot y
  rendimiento derivado, horas hombre snapshot, hoja de vida 360° composable). El trabajo de LITE-08 es
  **exposición y composición por perfil**, más captura ligera puntual y diseño de multicentro. **No se
  requiere reconstruir ni eliminar nada.**
- **Hallazgos:** ver §1 y §39 (10 GAPs). Críticos: exposición de rutina por uso, centro de costos/
  trabajo, repuesto ligero en OT, GAP-COST combustible.
- **Decisiones:** clasificación honesta de 7 categorías (§30) aplicada a cada capacidad; módulos
  clasificados CORE/SECUNDARIO/ADMINISTRATIVO/FUTURO (§29-32, §25).
- **GAPs:** §39.
- **Matriz de capacidades:** §35.
- **Matriz de datos:** §36.
- **Propuesta operacional:** §40.
- **Roadmap:** §41.
- **Revisión independiente:** §43 (PASS).
- **Preguntas a Dirección:** §42 (10 decisiones de negocio pendientes).

**Estado:** cero cambios de implementación. Entregable único creado. **NO se inicia LITE-08.** Se
solicita aprobación de Dirección y respuesta a las preguntas del §42.
