# DGP-019 — INFORME DE DESCUBRIMIENTO Y DISEÑO PROPUESTO
## Enterprise Asset Operations & Utilization Foundation

**Programa DeltaOps · Fase DISCOVERY + ARCHITECTURE REVIEW · Agosto 2026**

> Este documento NO implementa nada. Cumple la Fase 14 de la directiva DGP-019: presenta lo que existe, lo que se reutiliza, los gaps reales y el diseño propuesto, para aprobación de la Dirección antes de escribir código.

---

## 1. Qué existe actualmente

### 1.1 Módulo Activos (`lib/module-activos`)
- **Tablas**: `deltaops.act_activos` (aggregate) y `act_activos_read` (CQRS) — migración `0007_activos_module.sql`. Campos fijos: `codigo_empresarial`, `nombre`, `estado` (BORRADOR/REGISTRADO/OPERATIVO/MANTENIMIENTO/FUERA_SERVICIO/RETIRADO), `tipo`, `criticidad`, `ubicacion_id`, versión/auditoría.
- **Horómetro y odómetro ya existen como concepto de dominio**, pero solo como *último valor* dentro de `datos jsonb` (`datos.horometro`, `datos.odometro`), actualizado por los comandos públicos `actualizar-horometro` / `actualizar-odometro` (`MedicionInput`), con eventos `modulo.activos.horometro-actualizado` / `.odometro-actualizado` de payload autosuficiente. **No existe historial de lecturas** (el valor se reemplaza en el estado del aggregate).
- Responsable en `datos.responsable` + histórico append-only `act_responsables_hist`; ubicación `ubicacion_id` + `act_ubicaciones_hist`; historial interno `act_historial`; relaciones `act_relaciones(_read)` (migración `0008_activos_operacional.sql`).
- `centroCosto` y `proyecto` ya existen como referencias string en el dominio del activo y viajan en los eventos (`domain/activo.ts`).
- Contratos públicos: OpenAPI congelado (`openapi/activos.openapi.json`), comandos (crear/editar/transiciones/ubicación/responsable/mediciones/relaciones/catálogos/colaboración/QR/sync) y queries (`listar`, `detalle`, `timeline`, `historial-*`, `qr-resolver`…), montados en `/api/deltaops/activos`.

### 1.2 Órdenes / Planes / Preventivo / Correctivo
- `ord_ordenes_read` relaciona orden con `activo_principal_id` (indexado), `responsable`, `supervisor`, `tipo` (tipo de mantenimiento), `estado` (`0011_ordenes_cqrs.sql`). Query pública `GET /ordenes?activoPrincipalId=` ya usada por Ecosistema.
- Agenda guarda solo tiempos **planificados**. La **bitácora operacional append-only** registra `inicio, pausa, reanudacion, espera, llegada, salida, finalizacion` con `ocurrido_at` — permite reconstruir intervalos reales de ejecución, pero **no existe contrato de `duracion_real` ni `horas_trabajadas`** ni entidad de partes de mano de obra.
- Correctivo vincula solicitud/diagnóstico a `activo_id` y `orden_trabajo_id`; Preventivo programa por `activoId`; Planes registra generación `planId/actividadId/activoId/ordenTrabajoId`.

### 1.3 Abastecimiento / Inventario / costos
- Read model público de costos **por artículo**: `abastecimiento.costos` (`tenantId, articuloId, moneda, metodoValoracion, costoUnitario, cantidadAcumulada`; Inventario es la autoridad de valoración). **No hay atribución de costos a orden, activo ni mano de obra.**
- Catálogo de **proveedores** con `tipo` configurable — una estación de combustible es representable como proveedor sin nuevo contrato (adaptación de catálogo, no semántica nueva).
- **No existe en todo el corpus** ningún concepto de combustible, tanqueo, litros, consumo, L/h, utilización, disponibilidad ni costo por hora.

### 1.4 Plataforma (reutilizable tal cual)
- **Shared Timeline** (`platform.timeline`): comando `record` idempotente (`tl:${entryId}`), queries `byEntity/recent/query`; los módulos proyectan sus eventos a timeline vía handler en la misma disciplina que Correctivo (`registrarEnTimeline`). La ficha de activo ya muestra timeline.
- **Record Store genérico** con RLS (`app.tenant_id` vía `set_config` por transacción, `pgSessionOf(uow)`), versionado optimista, borrado lógico.
- **Workflow Engine** y **Dynamic Forms**: motores congelados, componibles solo por exports públicos, con puertos fail-safe (patrón Correctivo).
- **Offline First** (`src/lib/offline/`): cola por tenant+módulo, `opId` obligatorio, `mutarConOffline`, endpoint `/sync` por módulo con `procesarCola` (claim durable de `opId` + recibos idempotentes).
- **QR** (`platform.qr`): `issue/resolve/list` por `entityRef` opaco; Activos ya emite y resuelve sin duplicar el resolutor.
- **Identidad/Tenancy**: `ExecutionContext` con principal (rol, permisos, capacidades) y `tenantOf(ctx)` fail-closed; autorización declarativa por comando (permisos + capacidades + policies) antes del handler.
- **Analytics (DGP-016)**: registro declarativo de fuentes read-only (`RegistroFuentes`, `Fuente {modulo, dataset}`); un módulo nuevo solo debe exponer datasets read-only para que sus datos sean indicadores. Expresiones ratio/tasa/MTBF/MTTR ya existen.

---

## 2. Qué puede reutilizarse (sin tocar nada congelado)

| Necesidad DGP-019 | Contrato existente reutilizado |
|---|---|
| Identidad del activo, estado, responsable, centroCosto/proyecto | Queries públicas de Activos (`detalle`, `listar`) |
| Último horómetro/odómetro y sus eventos | Comandos `actualizar-horometro/odometro` + eventos `.horometro-actualizado/.odometro-actualizado` |
| Historial visible del activo | `platform.timeline` (`byEntity` sobre el `entityRef` del activo) |
| Órdenes por activo, estados, bitácora de ejecución | `GET /ordenes?activoPrincipalId=`, `/{id}/historial`, `/{id}/bitacora` |
| Mantenimiento preventivo/correctivo por activo | Queries públicas de Preventivo/Correctivo/Planes |
| Estación/proveedor de combustible | Catálogo de proveedores de Abastecimiento (tipo configurable) |
| Costos de repuestos | `abastecimiento.costos` (por artículo) |
| Persistencia con RLS | Record Store / patrón de módulo con `pgSessionOf(uow)` |
| Gobernanza de comandos | Kernel (permisos/capacidades/policies) + Workflow Engine si un flujo lo exige |
| Evidencia/observación en capturas | Dynamic Forms + adjuntos referencia-only (patrón DGP-008.3) |
| Offline y sync | Framework offline existente + `/sync` con claim durable de `opId` |
| QR → ficha → captura | `platform.qr` + flujo de escaneo existente (`ecosistema/flujo-escaneo`) |
| KPIs futuros | Registro de fuentes de Analytics (datasets read-only del módulo nuevo) |

---

## 3. Qué falta (gaps reales)

- **GAP-A (central): historial de lecturas de medidores.** Activos solo conserva el último valor. Se necesita un almacén append-only de lecturas con detección de inconsistencias. *No requiere modificar Activos*: se resuelve por composición (nuevo módulo que escucha/registra y usa los comandos públicos de Activos).
- **GAP-B: registro de combustible/tanqueos.** No existe en ningún dominio. Requiere entidad nueva.
- **GAP-C: duración real de ejecución de OTs.** La bitácora de Órdenes tiene los eventos (`inicio…finalizacion`) pero no hay contrato de `duracion_real`/`horas_trabajadas`. Derivar horas desde la bitácora es posible *solo como lectura por composición*, con la política "sin datos" cuando los pares inicio/fin no estén completos. Un contrato formal de horas en Órdenes exigiría modificar módulo congelado → **se declara GAP y NO se toca** (directiva: declarar y detenerse).
- **GAP-D: costos de mano de obra y atribución de repuestos a OT/activo.** No existe tarifa por técnico ni consumo de repuestos atribuido a orden. El costo/hora completo NO es calculable hoy; solo costo de combustible por hora/km y costos parciales. Se documenta como deuda (Fase 5 de la directiva lo permite explícitamente).
- **GAP-E: tiempo detenido / disponibilidad fina.** Los cambios de estado del activo (eventos `.en-mantenimiento`, `.fuera-servicio`, `.operativo`) permiten derivar ventanas de indisponibilidad gruesas; no existe registro de turnos/calendario operativo. Disponibilidad se calculará solo sobre lo que los eventos soportan; lo demás = "sin datos".
- **GAP-F: medidores personalizados.** El dominio de Activos solo conoce horómetro/odómetro. El módulo nuevo modelará `tipoMedidor` extensible; para tipos personalizados el último valor NO podrá reflejarse en `datos.horometro/odometro` del activo (solo los dos canónicos), lo cual es aceptable y se documenta.

---

## 4. Diseño propuesto: módulo `module-utilizacion` (nuevo, por composición)

Un único módulo de negocio nuevo `lib/module-utilizacion` (nombre de servicio `modulo.utilizacion`), siguiendo el patrón canónico de Correctivo (dominio puro → descriptor `PlatformServiceDefinition` → adaptadores Fake/PG → projection/sincronización/OpenAPI → runtime con `extraServices`). **Cero modificaciones a módulos/motores congelados.** Fuente de verdad:

- Lecturas de medidores y tanqueos → **viven en el módulo nuevo** (no existen en otro dominio).
- Activo, órdenes, mantenimiento, costos de artículos → **siguen viviendo en sus dominios**; el módulo nuevo solo referencia por id y consulta por queries públicas mediante puertos fail-safe (patrón DGP-014/015: puertos validados contra la query pública real).

### 4.1 Medidores (Fase 2)
- Entidad `Lectura`: `id, tenantId, activoId, tipoMedidor (horometro|odometro|kilometraje≡odometro|personalizado:<clave>), valor, unidad (h|km|otra), ocurridoAt, registradoPor (identityId canónico), origen (manual|qr|sync-offline|orden), observacion?, evidenciaRef? (referencia-only), opId`.
- Append-only con historial completo; corrección por **anulación + nueva lectura** (nunca update destructivo), ambas en timeline.
- **Política de inconsistencia (documentada antes de implementar):** si `valor < última lectura válida del mismo medidor`, la lectura se registra con marca `inconsistente=true` y motivo, se emite evento `modulo.utilizacion.lectura-inconsistente` y NO actualiza el "último valor"; puede regularizarse declarando `reinicioMedidor=true` (cambio de medidor físico) que ancla un nuevo tramo. No se rechaza silenciosamente ni se inventa valor.
- **Sincronización con Activos:** tras registrar una lectura válida de horómetro/odómetro, el módulo invoca el comando público `actualizar-horometro/odometro` de Activos (orquestación idempotente por `opId`, patrón DGP-009.3) para que `datos.horometro/odometro` del activo siga siendo la verdad del "último valor". Sin duplicar el dato: el historial es del módulo nuevo, el último valor es del activo.

### 4.2 Combustible (Fase 3)
- Entidad `Tanqueo`: `id, tenantId, activoId, ocurridoAt, litros, tipoCombustible (catálogo del módulo), precioUnitario?, costoTotal?, moneda?, lecturaMedidorRef? (id de Lectura tomada en el momento — se captura como lectura normal y se enlaza), operador (identityId), proveedorId? (referencia a Abastecimiento), centroCosto?/proyecto? (mismas referencias string del activo), observacion?, evidenciaRef?, opId`.
- El tanqueo con lectura asociada habilita el cálculo posterior de L/h (Δlitros/Δhoras entre tanqueos con horómetro) o L/100km (con odómetro) **según el tipo de medidor disponible por activo**; equipo sin medidor ⇒ métricas de consumo "sin datos".
- Costo de combustible por hora/km derivable de `costoTotal` + deltas de medidor. No se implementa costeo financiero completo (GAP-D).

### 4.3 Utilización y disponibilidad (Fase 4)
- **Solo lecturas derivadas de fuentes reales**, expuestas como queries/read models del módulo:
  - Horas trabajadas = deltas de horómetro entre lecturas válidas (fuente confiable primaria). Nunca se infieren de agenda planificada.
  - Tiempo en mantenimiento / fuera de servicio = ventanas entre eventos de estado del activo (proyección desde eventos públicos `.en-mantenimiento`/`.operativo`/`.fuera-servicio`).
  - Relación con OTs = composición sobre queries públicas de Órdenes (por `activoPrincipalId`) y bitácora; duración real solo cuando existan pares inicio/finalización completos (GAP-C), si no ⇒ "sin datos".
- Regla transversal: **"sin datos" ≠ 0**. Todo indicador expone `{valor} | {sinDatos: motivo}`.

### 4.4 Persistencia y CQRS
Tablas nuevas propias del módulo (esquema `deltaops`, RLS idéntica al resto, migración `.sql` aplicada con psql — lección DGP-011.2):
- `utl_lecturas` (aggregate append-only) + `utl_lecturas_read` (consulta por activo/medidor/rango, con guarda de idempotencia (read model, tenant, eventId));
- `utl_tanqueos` + `utl_tanqueos_read`;
- `utl_estado_activo_read` (proyección de ventanas de estado del activo desde eventos públicos de Activos — read model, no segunda fuente de verdad);
- catálogo `utl_catalogos` (tipos de combustible, tipos de medidor personalizados) vía patrón de catálogos existente.
Toda consulta vía read models (incluye detalle — test de sabotaje, lección DGP-009.2). Timeline por comandos de plataforma en la misma UoW disciplinada (outbox ≠ event store — bitácora propia si se requiere, lección DGP-008.2).

### 4.5 Eventos (Fase 7 — solo contratos, sin IA)
Eventos con payload autosuficiente: `modulo.utilizacion.lectura-registrada`, `.lectura-inconsistente`, `.lectura-anulada`, `.tanqueo-registrado`, `.tanqueo-anulado`. Estos, junto a los eventos ya existentes de Activos/Órdenes, son la base declarada para alertas futuras (consumo anormal, exceso de horas, vencimientos). No se implementa detección en DGP-019.

### 4.6 Experiencia (Fases 8-9) — dentro de la política visual global
- **Ficha operacional del activo** (nueva pestaña/sección en la ficha existente de Activos, compuesta — no una app aislada): últimos medidores, consumo reciente, indicadores básicos (horas último período, L/h o L/100km cuando existan datos, estado/disponibilidad gruesa), historial (timeline existente + lecturas/tanqueos).
- **Captura de medición** y **registro de tanqueo**: formularios vía Dynamic Forms (literal, lección DGP-008.3), mobile-first ~390px, offline-first con la cola existente, accesibles desde ficha y desde el flujo QR existente (escanear → ficha → registrar).
- Tema Claro/Oscuro/Automático heredado del ThemeProvider raíz; tokens `--do-*` exclusivamente; Shell del módulo sin `data-do-theme` (guardas ya existentes lo verifican).
- Sin dashboard ejecutivo. Indicadores básicos por activo únicamente; los KPIs corporativos se declararán en Analytics registrando datasets read-only del módulo (`utilizacion.lecturas`, `utilizacion.tanqueos`) — composición pura DGP-016.

### 4.7 Seguridad, offline y QR (Fases 10-12)
- Tenancy/RLS: `tenantOf(ctx)` fail-closed en cada handler, `set_config` por transacción, mínimo privilegio por rol (TECNICO captura; CONSULTA solo lee; capacidades nuevas `utilizacion.lecturas.registrar`, `utilizacion.tanqueos.registrar`, `utilizacion.leer` mapeadas a los roles canónicos). Autorización solo desde la sesión (DGP-017). Nada de filtros solo-frontend.
- Offline: lecturas y tanqueos son las operaciones offline (input completo ⇒ offline literal, lección DGP-009.3); comandos oficiales del runtime en la cola (no rutas HTTP, lección DGP-012); `/sync` con claim durable del `opId` antes de ejecutar (lección DGP-008.1) y recibos idempotentes.
- QR: se reutiliza `platform.qr` y el flujo de escaneo existente añadiendo las acciones "registrar horómetro" y "registrar tanqueo" al destino de la ficha (un deep link no está terminado hasta que el destino consume el parámetro — test ruta→acción, lección DGP-010).
- Claves de workflow (si algún flujo requiere aprobación, p.ej. anulación de lecturas): prefijadas por módulo (lección DGP-015). Por defecto DGP-019 no requiere Workflow Engine; se decidirá en diseño detallado y, si se usa, con WorkflowPort explícito de fallo seguro (lección DGP-011.1).

---

## 5. Cómo se preservan los invariantes del programa

1. **CQRS**: aggregates append-only + read models con idempotencia por eventId; toda consulta vía read models; OpenAPI congelado + test de drift + tests de contrato (lecciones DGP-008.2/009.2/009.3/016).
2. **Multitenancy**: RLS en escrituras y lecturas (DGP-004), contexto solo de sesión (DGP-017).
3. **Offline First**: framework existente, sin cola paralela.
4. **Timeline**: `platform.timeline` único; lecturas/tanqueos/anulaciones se proyectan al `entityRef` del activo; sin segunda línea de tiempo.
5. **QR**: `platform.qr` único, sin duplicar resolutor.
6. **Órdenes/mantenimiento**: solo composición por queries públicas; ningún contrato de Órdenes se modifica (GAP-C declarado).
7. **Corpus congelado**: `lib/*` existente intacto; el módulo nuevo es un paquete nuevo `lib/module-utilizacion` que compone motores solo por exports públicos (DGP-014). *Nota: crear un paquete nuevo bajo `lib/` sigue el patrón de todos los módulos previos y no modifica ninguno existente; si la Dirección prefiere otra ubicación, se acata.*

## 6. Riesgos

- **R1 — Calidad de datos de campo**: lecturas erróneas/inconsistentes; mitigado por política de inconsistencia explícita + anulación auditable + evidencia opcional.
- **R2 — Tentación de inferir horas**: mitigado por regla "sin datos ≠ 0" y tests que la verifiquen (sabotaje).
- **R3 — Doble verdad del último medidor**: mitigado por orquestación idempotente hacia los comandos públicos de Activos; el historial nunca vive en Activos ni el último valor en Utilización.
- **R4 — Crecimiento de lecturas** (volumen): índices por (tenant, activo, medidor, ocurrido_at); paginación obligatoria en queries.
- **R5 — Reinicio/cambio de medidor físico**: modelado explícito de tramos (`reinicioMedidor`) para no corromper deltas.

## 7. Deuda técnica declarada

- GAP-C (duración real de OTs como contrato), GAP-D (mano de obra y atribución de repuestos → costo operativo/hora completo), GAP-E (calendario operativo/turnos para disponibilidad fina), GAP-F (últimos valores de medidores personalizados no reflejados en Activos), persistencia server-side de preferencias (arrastrada), G-1/G-8 de DGP-018 (sin cambios).

## 8. Propuesta de fases internas de implementación (tras aprobación)

- **DGP-019.1 — Dominio y persistencia**: `lib/module-utilizacion` (lecturas + tanqueos + catálogos + eventos + política de inconsistencia), migraciones, CQRS, sync/offline, OpenAPI + drift, montaje en api-server. Tests de dominio/contrato/sabotaje.
- **DGP-019.2 — Composición y proyecciones**: orquestación hacia Activos (último valor), proyección de ventanas de estado, queries de utilización/consumo con "sin datos", timeline, datasets read-only para Analytics, QR/deep links.
- **DGP-019.3 — Experiencia**: ficha operacional del activo, captura de medición y tanqueo (Dynamic Forms, offline, móvil 390px), indicadores básicos por activo, e2e real por rol + revisión visual.

Cada subfase cierra con suite verde, revisión arquitectónica independiente iterada a PASS y validación e2e real.

---

**El código no se toca hasta que la Dirección apruebe este diseño.**
