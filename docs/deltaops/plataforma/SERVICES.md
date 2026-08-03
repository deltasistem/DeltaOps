# Catálogo de Servicios (DGP-003)

Cada servicio se declara en `lib/platform/src/services/<nombre>.ts` como un
`PlatformServiceDefinition`. Convención de nombres: comandos y consultas
`platform.<servicio>.<operación>`; permisos `platform.<servicio>.<acción>`.

## platform.config
- Comandos: `set` (override por tenant). Consultas: `get`, `overrides`.
- Precedencia: override tenant → default del servicio → config global.

## platform.notification
- Plantillas y preferencias (CRUD), `queue` (filtra destinatarios por
  preferencia de canal; agrupa por `groupKey`), `markDelivered`.
- Consultas: `pending`, plantillas y preferencias.
- Eventos: `platform.notification.queued`, `…delivered`.
- Config: `max-reintentos`, `agrupacion-ventana-seg`.

## platform.attachment
- `register` (versionado: `attachmentId` previo pasa a `superseded`;
  `hashSha256` obligatorio), `delete`, `applyRetention`.
- Consultas: `get`, `byEntity`, `signedUrl` (HMAC con `SESSION_SECRET`,
  TTL configurable por tenant).
- Eventos: `…registered`, `…deleted`.

## platform.comment
- `create` (hilos vía `parentId`, extracción de @menciones), `edit`
  (solo autor), `delete` (lógico).
- Consultas: `byEntity`, `thread`. Eventos: `…created/edited/deleted`.

## platform.timeline
- SOLO proyección de eventos (comment/attachment/task); idempotente por
  `event.id`. `rebuild` reproyecta desde la auditoría.
- Consultas: `byEntity`, `recent`.

## platform.task
- `create`, `assign`, `complete` (máquina de estados), `sweepReminders`
  (emite `…reminder-due` según antelación configurable).
- Consultas: `get`, `list`, `history` (derivada de auditoría).
- Eventos: `…created/assigned/completed/reminder-due`.

## platform.search
- `indexDocument`, `rebuild`; indexación automática desde eventos
  (comment/task). Consultas: `global`, `contextual` (ranking por tokens).

## platform.export
- `request`, `updateProgress`, `complete`, `cancel`; estados
  `pending→running→completed/failed/cancelled`. Consultas: `get`, `list`.

## platform.import
- `createSession` (validación declarativa por campos requeridos),
  `execute` (cada fila válida se despacha al comando destino por el pipeline
  del Kernel — nunca escritura directa). Consultas: `preview`, `list`.

## platform.report
- Plantillas (CRUD, `plantillaVersion`), `run` (job con versión de plantilla
  congelada), `completeJob`. Consultas: plantillas, `history`.

## platform.qr
- `issue` (tipos qr/barcode/nfc, código único por tenant, prefijo
  configurable), `revoke`, `resolve` (emite `…resolved` para trazabilidad).
- Consulta: `list`.

## platform.dashboard
- Dashboards y widgets (CRUD), `setPreference` por usuario.
- Consultas: `compose` (dashboard + widgets resueltos), `preferences`.

## platform.kpi
- Definiciones (CRUD + `definition.newVersion`), `snapshot` (valor externo;
  la plataforma NO calcula KPIs de negocio). Consultas: `results`.

## platform.integration
- Conectores (CRUD + enable/disable), `webhook.register`,
  `webhook.dispatch` (encola por evento → outbox: reintentos y dead letter
  del Kernel). `credencialRef` referencia secretos externos, jamás en claro.

## platform.ai
- Registries: conversation, prompt, model, provider, inference, evaluation,
  cost. `infer` usa el `AiProviderPort`; único proveedor: `FakeAiProvider`
  (determinista, costo 0). **Sin OpenAI ni proveedores reales** (DGP-003).
