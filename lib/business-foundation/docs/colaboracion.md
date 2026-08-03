# Familia Colaboración / Observabilidad — Business Foundation (DGP-006)

Runtimes genéricos y **100% neutros** (sin ningún concepto de negocio) que
enriquecen cualquier `DefinicionEntidad` del núcleo con capacidades
transversales de colaboración y observabilidad. Todo se apoya en los **Shared
Services** de la plataforma y pasa por el **Kernel** (permisos/capacidades, Zod,
UoW, outbox, auditoría) y el **RecordStorePort** (multitenancy + RLS).

Ubicación: `lib/business-foundation/src/colaboracion/`.

## Referencia estable

Las capacidades de colaboración ligan a una entidad mediante una referencia
opaca y estable entre reintentos offline:

```
<servicio>:<entidad>:<id>
```

`referenciaEntidad(def, id)` la construye. Es independiente del `entityRef`
interno del núcleo (que usa `.` como separador): la familia usa siempre la forma
con `:` de modo autoconsistente entre comentarios, adjuntos y cronología.

## Ensamblado

`crearColaboracion(def, opciones)` devuelve un **`ExtrasModulo` completo** del
núcleo: comandos, consultas, event handlers, **capacidades**, **permisos**,
**dependencias de plataforma** (`dependeDe`) y **`configuracionDefaults`**
(clave SIN prefijo). Basta pasarlo tal cual a `crearModuloGenerico`, que lo
fusiona (dedupe) con lo derivado de la `DefinicionModulo`, de modo que el
descriptor final declare TODO el contrato de colaboración:

```ts
const extras = crearColaboracion(entidad, { kpis, panel });
const servicio = crearModuloGenerico(modulo, extras);
```

No hace falta enumerar a mano las dependencias de plataforma: `crearColaboracion`
añade `platform.comment`, `platform.attachment` y `platform.timeline` según los
runtimes activos (el núcleo las deduplica junto a `platform.config`).

### Convenio de configuración

Alineado con el núcleo (`docs/nucleo.md`): los `configuracionDefaults` se
declaran con la clave **sin** prefijo de servicio (p. ej. `adjunto-max-bytes`,
`panel-<entidad>`). `registerPlatformService` las prefija al registrarlas, por lo
que los handlers **siempre** leen/escriben con la clave **prefijada**:
`tenantConfig.get(tenant, "<servicio>.<clave>")`. Un override por tenant
(`platform.config.set`) gana sobre el default.

## Runtimes

### 1. Comentarios (`comentarios.ts`)

Fachada tipada sobre `platform.comment`, ligada a la entidad.

- Comando `<servicio>.<entidad>.comentar` → `platform.comment.create`
- Consulta `<servicio>.<entidad>.comentarios` → `platform.comment.byEntity`

Permisos: `editar` para comentar, `leer` para consultar. La referencia estable
se pasa como `entityRef`. No persiste directamente: reutiliza el servicio de
plataforma (UoW/outbox/auditoría incluidos).

### 2. Adjuntos (`adjuntos.ts`)

Fachada sobre `platform.attachment`, misma referencia estable.

- Comando `<servicio>.<entidad>.adjuntar` → `platform.attachment.register`
- Comando `<servicio>.<entidad>.quitarAdjunto` → `platform.attachment.delete`
- Consulta `<servicio>.<entidad>.adjuntos` → `platform.attachment.byEntity`

Valida metadatos (nombre, mime, hash de 64 hex) y el **tamaño máximo** por
`TenantConfig` `adjunto-max-bytes` (default `10485760` = 10 MiB). Nunca toca
binarios: solo metadatos.

### 3. Historial / Auditoría (`historial.ts`)

Dos consultas sobre el `AuditTrailPort`:

- `<servicio>.<entidad>.historial` → historia reconstruida del registro
  (entradas legibles ordenadas cronológicamente, filtradas por
  `subjectId = id` y `service = <servicio>`).
- `<servicio>.<entidad>.auditoria` → entradas crudas paginadas (`limit`/`offset`).

Requiere el permiso `leer`. `capacidadAuditoria(def)` expone una capacidad
dedicada (`auditar-<entidad>`).

> Cada runtime exporta además su propio helper de capacidad, que
> `crearColaboracion` inscribe en el descriptor: `capacidadComentarios`
> (`comentar-<entidad>`), `capacidadAdjuntos` (`adjuntar-<entidad>`),
> `capacidadAuditoria` (`auditar-<entidad>`), `capacidadIndicadores`
> (`indicadores-<entidad>`) y `capacidadPanel` (`panel-<entidad>`).

### 4. Cronología / Timeline (`cronologia.ts`)

Puente hacia `platform.timeline`. La timeline de plataforma solo proyecta
eventos de plataforma; este runtime añade la proyección de los eventos del
**núcleo**.

- Handlers de proyección para `creada`, `actualizada`, `transicionada`,
  `eliminada` y opcionalmente `asignada`/`aprobada`.
- **Idempotencia**: la entrada usa `tl:<eventId>` como id (dedupe) y se
  construye SOLO desde el payload del evento.
- Consulta `<servicio>.<entidad>.cronologia` → `platform.timeline.byEntity`
  filtrando por la referencia estable.

Las entradas se persisten como `recordType = entry` del servicio
`platform.timeline`, con `entityRef` en forma de colon para que la consulta las
recupere.

### 5. Indicadores / KPI (`indicadores.ts`)

`DefinicionKpi { nombre, descripcion, tipo: 'contador' | 'porEstado', campo? }`.

- Handlers de proyección que mantienen un **snapshot vivo** por KPI en el
  RecordStore del propio servicio (`recordType = kpi`, id estable
  `kpi:<entidad>:<nombre>`).
- **Idempotentes por `eventId`** (patrón `_eventIds`): la reentrega del outbox
  no duplica el conteo.
- `contador`: +1 al crear, −1 al eliminar (no baja de 0).
- `porEstado`: cuenta por el `campo` indicado (default `estado`); las
  transiciones mueven el conteo del estado anterior al nuevo.
- Consulta `<servicio>.<entidad>.kpis` → valores actuales de todos los KPIs.

**Decisión de diseño**: no se usa `platform.kpi` porque está orientado a
catálogos versionados y snapshots periódicos con fuentes opacas, no a un valor
corriente incremental idempotente por evento. Se prefiere el RecordStore del
servicio (multitenant + RLS).

### 6. Panel / Dashboard (`panel.ts`)

`DefinicionPanel { titulo, widgets: [{ tipo: 'kpi' | 'lista' | 'estado', ... }] }`.

- Se persiste como **configuración del servicio** (`TenantConfig` JSON, clave
  `panel-<entidad>`), por lo que cada tenant puede sobrescribirlo con
  `platform.config.set`.
- Consulta `<servicio>.<entidad>.panel` resuelve los widgets a datos en UNA
  respuesta:
  - `kpi` → valor actual del KPI (consulta `.kpis`)
  - `estado` → conteo por estado (KPI `porEstado`)
  - `lista` → registros recientes (consulta `.listar` del núcleo, `limite`)

## Multitenancy, RLS y Offline First

- Toda lectura/escritura pasa por el `RecordStorePort` (RLS por tenant) o por
  Shared Services que ya lo aplican.
- Las proyecciones (cronología, KPIs) son **idempotentes** y se construyen solo
  desde el payload del evento; el `eventId` actúa de recibo.
- La referencia estable garantiza que los reintentos offline apunten al mismo
  recurso sin duplicar efectos.

## Pruebas

`src/colaboracion/__tests__/colaboracion.test.ts` (20 pruebas) cubre referencia
estable, comentarios (con multitenancy y autorización), adjuntos (con límite de
tamaño y default de config), historial/auditoría, cronología (proyección e
idempotencia), KPIs (contador, porEstado e idempotencia), panel (resolución de
widgets y override por tenant), la completitud del contrato del descriptor
(capacidades, permisos y dependencias) y el convenio de configuración
(resolución del default y override por tenant), sobre un runtime de plataforma
FAKE.
