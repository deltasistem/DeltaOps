# DELTAOPS · PDC-01 — Preparación Operativa (Encargo A)

> **Directiva:** PDC-01 «Preparación y Validación para Producción Controlada».
> **Alcance de este documento:** §7 (matriz de variables), §12 (auditoría de
> credenciales/usuarios demo), §14 (demo vs producción), §15 (checklist de carga
> de datos), §26 (observabilidad), §27/§28 (backup y rollback).
> **Fecha:** 2026-08-15.
>
> **Regla dura acatada:** CERO desarrollo de funcionalidades. Este entregable es
> **documentación y verificación** — no modifica lógica de negocio, no elimina
> datos ni credenciales, no crea módulos ni tablas.
>
> **Convención de estado:** 🟢 VERIFICADO EN CÓDIGO · 🟡 PENDIENTE / REQUIERE
> VERIFICACIÓN (con responsable) · 🔴 BLOQUEANTE · ⚪ NO APLICA · «VERIFICADO EN
> DOCUMENTACIÓN» = confirmado en la documentación del proveedor, ensayo real aún
> pendiente.
>
> **Secretos:** este documento **solo nombra** variables/secretos; **jamás**
> contiene valores. La lista de nombres presentes en el entorno se obtuvo del
> entorno de **desarrollo** actual (no del entorno de producción, que Dirección
> configura por separado).

---

## §7 — Matriz de variables de producción

Fuentes revisadas en código real (rutas relativas al repositorio):

- `lib/db/src/runtime-connection.ts` — resolución de la cadena de conexión de
  runtime y fail-fast (I-03 / MENOR-1).
- `lib/db/src/index.ts` — creación del pool de runtime (exige `DATABASE_URL`).
- `lib/db/drizzle.config.ts` — variables usadas por las migraciones (rol owner).
- `artifacts/api-server/src/deltaops/config.ts` — esquema Zod de configuración
  de la plataforma (validación fail-fast al arrancar).
- `artifacts/api-server/src/deltaops/session.ts` — cookie de sesión / `SESSION_SECRET`.
- `artifacts/api-server/src/app.ts` — CORS (`CORS_ORIGINS`), `trust proxy`.
- `artifacts/api-server/src/index.ts` — `PORT`.
- `artifacts/api-server/src/lib/logger.ts` — `LOG_LEVEL`, `NODE_ENV`.
- `artifacts/api-server/src/routes/deltaops/attachment-serve.ts` +
  `lib/platform/src/services/attachment.ts` — `ATTACHMENT_URL_SECRET`.
- `artifacts/api-server/src/deltaops/identity/notification-provider.ts` +
  `m365-graph-email.ts` — `NOTIFICATION_PROVIDER`, `GRAPH_*`.
- `artifacts/api-server/src/seed/seed-credentials.ts` — `DEMO_*` y
  `DELTAOPS_ADMIN_PASSWORD` (solo seed).

Leyenda de columnas:
- **Obligatoria**: ¿el arranque falla explícitamente si falta (en el contexto de
  la columna «Producción»)?
- **Producción**: valor/estado esperado en producción.
- **Secret**: ¿debe residir en el *secret store*, nunca en el repositorio?
- **Verificada**: estado observado en el entorno **de desarrollo** actual (solo
  nombre; nunca valor). La verificación en el entorno de **producción** es
  responsabilidad de Dirección/Infraestructura.

| Variable | Obligatoria | Producción | Uso | Secret | Verificada |
|---|---|---|---|---|---|
| `NODE_ENV` | Sí (efectiva) | `production` | Activa cookies `Secure`, fail-fast de conexión, CORS cerrado por defecto, fail-fast de proveedor de correo. Si falta, `config.ts` la asume `development`. | No | 🟡 Ausente en dev (Zod default `development`). En producción DEBE ser `production`. |
| `DATABASE_URL` | Sí | Conexión **admin** del proveedor. En producción **NO** debe usarla el runtime (solo migraciones/rollback y creación del pool base). | No literal en repo | 🟢 Presente en dev. |
| `DELTAOPS_APP_PASSWORD` | **Sí en producción** (fail-fast I-03) | Contraseña del rol de mínimo privilegio `deltaops_app` (NOSUPERUSER, NOBYPASSRLS). Sin ella y sin `DELTAOPS_DB_ROLE=owner`, `resolveRuntimeConnectionString` **lanza** en producción (no hay fallback a superusuario). | **Sí** | 🟢 Presente en dev. |
| `DELTAOPS_APP_USER` | No (default `deltaops_app`) | Normalmente sin definir; el default fijo `deltaops_app` es correcto. | No | ⚪ No requerida. |
| `DELTAOPS_OWNER_PASSWORD` | Condicional | Contraseña del rol `deltaops_owner` para **migraciones/mantenimiento**. Con `DELTAOPS_DB_ROLE=owner` en producción, si falta, **lanza** (MENOR-1). | **Sí** | 🟢 Presente en dev. |
| `DELTAOPS_OWNER_USER` | No (default `deltaops_owner`) | Normalmente sin definir. | No | ⚪ No requerida. |
| `DELTAOPS_DB_ROLE` | No (solo procesos admin) | **Sin definir** para el runtime. Se pone `owner` **únicamente** en el proceso de migración/seed, nunca en el servicio de runtime. | No | 🟡 No definida en dev (correcto). |
| `PGHOST` / `PGPORT` / `PGDATABASE` | Sí (para componer la cadena) | Host/puerto/base de PostgreSQL; la cadena de runtime se **compone** en código (`composeUrl`), nunca literal. `PGPORT` default `5432`. | No | 🟢 `PGHOST`/`PGPORT`/`PGDATABASE` presentes en dev. |
| `PGUSER` / `PGPASSWORD` | No (uso del proveedor) | Credenciales admin que el proveedor inyecta junto a `DATABASE_URL`; el runtime de mínimo privilegio no las usa. | Sí (`PGPASSWORD`) | 🟢 Presentes en dev (inyectadas por la plataforma). |
| `SESSION_SECRET` | **Sí** (Zod `min(1)`) | Secreto de firma de la cookie de sesión (`connect-pg-simple`). **También** firma URLs de adjuntos si `ATTACHMENT_URL_SECRET` no está separado. `config.ts` **falla al arrancar** si falta. | **Sí** | 🟢 Presente en dev. |
| `ATTACHMENT_URL_SECRET` | No (fallback a `SESSION_SECRET`) | Secreto **dedicado** para firmar/verificar URLs HMAC de adjuntos. **Recomendado en producción** para desacoplar la rotación del secreto de sesión del de adjuntos (LITE-11 §10 S-2). | **Sí** | 🟡 Ausente en dev (usa fallback `SESSION_SECRET`). Definirla en producción. |
| `CORS_ORIGINS` | No | Lista blanca de orígenes separada por comas (dominios reales de producción). **Sin ella en producción, CORS queda cerrado** (solo mismo origen) — seguro por defecto. **No usar `*`.** | No (config, no secreto) | 🟡 Ausente en dev (modo permisivo dev). Requiere el/los dominio(s) definitivo(s) — 🟡 PENDIENTE DE DIRECCIÓN. |
| `PORT` | No (default de plataforma) | Puerto de escucha; la plataforma lo suele inyectar. | No | 🟡 No leída explícitamente en dev; provista por la plataforma al publicar. |
| `LOG_LEVEL` | No | Nivel de `pino` (p. ej. `info`/`warn`). Opcional. | No | 🟡 Ausente en dev (default del logger). |
| `NOTIFICATION_PROVIDER` | Sí (efectiva en producción) | Debe ser `m365-graph` (o `graph`). **`fake` es inválido en producción** (lanza). Si falta, el default es `fake` ⇒ lanzaría en producción. | No | 🟢 Presente en dev. |
| `GRAPH_TENANT_ID` | Sí (si Graph activo) | Tenant de Entra ID (independiente del tenant DeltaOps). Config inválida en producción ⇒ **fail-fast** al arrancar. | No (id público) | 🟢 Presente en dev. |
| `GRAPH_CLIENT_ID` | Sí (si Graph activo) | App-registration (OAuth client_credentials). | No (id público) | 🟢 Presente en dev. |
| `GRAPH_CLIENT_SECRET` | Sí (si Graph activo) | Secreto de cliente OAuth. Nunca se registra (redacción activa). | **Sí** | 🟢 Presente en dev. |
| `GRAPH_SENDER` | Sí (si Graph activo) | Buzón remitente autorizado (`Mail.Send`); validado como correo. | No | 🟢 Presente en dev. |
| `GRAPH_OAUTH_TOKEN_ENDPOINT` | No (derivado) | Override del endpoint OAuth; por defecto se deriva de `GRAPH_TENANT_ID`. | No | ⚪ Opcional. |
| `GRAPH_BASE_URL` | No (default `graph.microsoft.com/v1.0`) | Override de la base de Graph. | No | ⚪ Opcional. |
| `GRAPH_OAUTH_SCOPE` | No (default `.default`) | Override del scope. | No | ⚪ Opcional. |
| `GRAPH_TIMEOUT_MS` | No (default 15 000) | Timeout de las llamadas Graph. | No | ⚪ Opcional. |
| `GRAPH_MAX_REINTENTOS` | No (default 2) | Reintentos ante errores temporales (429/5xx). | No | ⚪ Opcional. |
| `M365_CLIENT_ID` / `M365_CLIENT_SECRET` / `M365_TENANT_ID` / `M365_MAIL_FROM` | No | **Legado.** Solo aparecen en un test del proveedor (`m365-graph-email.test.ts`); el runtime usa `GRAPH_*`. **No son requeridas en producción.** Candidatas a retirar del entorno (ver §12). | (fueron secretos) | 🟡 Presentes en dev como legado — no las lee el runtime. |
| `DEMO_ADMIN_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`, `DEMO_PLANIFICADOR_PASSWORD`, `DEMO_TECNICO_PASSWORD`, `DEMO_CONSULTA_PASSWORD` | Solo si se ejecuta la seed demo en producción | Contraseñas de los 5 usuarios demo. En producción, la seed **exige** estas vars (sin default). Si NO se siembra demo en producción, no aplican. | **Sí** (si se usan) | 🟡 Ausentes en dev (usan default derivado no secreto). Ver §12/§14. |
| `DELTAOPS_ADMIN_PASSWORD` | Solo si se siembra el admin de plataforma en producción | Contraseña del `SUPER_ADMIN` de plataforma (`admin@deltaops.dev`). En producción la seed la **exige**. | **Sí** (si se usa) | 🟡 Ausente en dev. Ver §12. |
| `DELTAOPS_TENANT` | No (constante) | **No es variable de entorno leída**: es la constante `"deltaops"` (`reference-runtime.ts`). Se documenta para evitar confusión. | No | ⚪ Constante en código. |

> **Nota sobre `DATABASE_MIGRATION_URL` (aclaración solicitada):** la variable
> `DATABASE_MIGRATION_URL` mencionada en la directiva §7 **NO EXISTE** en el
> código. El equivalente real es la **combinación** `DELTAOPS_DB_ROLE=owner` +
> `DELTAOPS_OWNER_PASSWORD` (+ `PGHOST`/`PGDATABASE`), que hace que
> `resolveRuntimeConnectionString` (`lib/db/src/runtime-connection.ts`) componga
> una cadena para el rol `deltaops_owner`. Las migraciones (`drizzle.config.ts`)
> usan exactamente esas variables. El runtime del servicio **nunca** debe llevar
> `DELTAOPS_DB_ROLE=owner`; solo el proceso de migración/mantenimiento lo activa.

**Regla crítica confirmada (directiva §8):** en producción no existe fallback
silencioso a superusuario. Sin `DELTAOPS_APP_PASSWORD` (y sin rol owner
explícito) el runtime **lanza** (I-03); con rol owner pero sin
`DELTAOPS_OWNER_PASSWORD` también **lanza** (MENOR-1). Ambos caminos verificados
en `runtime-connection.ts`. 🟢 VERIFICADO EN CÓDIGO. La verificación **en vivo**
del rol efectivo en la BD de producción (`SELECT current_user`, `usesuper`,
`rolbypassrls`) queda 🟡 PENDIENTE (Infraestructura, tras publicar).

---

## §12 — Auditoría de credenciales y usuarios de demostración

Objetivo: inventario claro para Dirección. **No se elimina ni rota nada aquí.**
Fuente: `artifacts/api-server/src/seed/seed-delta-demo.ts` y `seed-credentials.ts`.

| # | Sujeto | Tipo | Origen | Clasificación | Justificación |
|---|---|---|---|---|---|
| 1 | `admin@delta.demo` (Carlos Pacheco, `TENANT_ADMIN`) | Usuario demo del tenant `delta-demo` | Seed demo | **CONSERVAR** (si se decide C) / **REEMPLAZAR** (si A/B) | Es el admin del tenant de demostración. Su destino depende de §14. |
| 2 | `supervisor@delta.demo` (María Fuentes, `SUPERVISOR`) | Usuario demo | Seed demo | **CONSERVAR / REEMPLAZAR** | Usuario ficticio de demostración; en producción real se reemplaza por personas reales. |
| 3 | `planificador@delta.demo` (Jorge Rivas, `PLANIFICADOR`) | Usuario demo | Seed demo | **CONSERVAR / REEMPLAZAR** | Ídem. |
| 4 | `tecnico@delta.demo` (Ana Soto, `TECNICO`) | Usuario demo | Seed demo | **CONSERVAR / REEMPLAZAR** | Ídem. |
| 5 | `consulta@delta.demo` (Luis Vega, `CONSULTA`) | Usuario demo | Seed demo | **CONSERVAR / REEMPLAZAR** | Ídem. |
| 6 | `admin@deltaops.dev` (`SUPER_ADMIN`, tenant `deltaops`) | Admin de **plataforma** | Seed | **ROTAR** (conservar la cuenta, rotar credencial) + revisar dominio | Es la cuenta de super-administración operativa. Debe conservarse (alguien debe administrar la plataforma) pero su contraseña debe **rotarse** a un valor de producción vía `DELTAOPS_ADMIN_PASSWORD`, y evaluarse si el correo `@deltaops.dev` es el definitivo. |
| 7 | Contraseñas `DEMO_*` (5) | Secretos de seed demo | `seed-credentials.ts` | **REEMPLAZAR** (si se siembra demo en producción) / **N/A** (si no) | En producción la seed **exige** estas vars (sin default). Si NO se siembra demo en producción, no deben existir. Nunca usar los defaults de desarrollo. |
| 8 | `DELTAOPS_ADMIN_PASSWORD` | Secreto de seed (admin plataforma) | `seed-credentials.ts` | **ROTAR / DEFINIR** | Debe definirse con un valor de producción antes de sembrar el admin de plataforma. |
| 9 | Default de desarrollo derivado `dev-<var>-0001!` | Patrón de contraseña dev | `seed-credentials.ts` (`defaultDev`) | **CONSERVAR** (solo dev) | Es un fallback **exclusivo de desarrollo/test**; en producción `credencialDemo()` lanza si falta la var real. No es un secreto de producción; no debe aparecer nunca en producción. |
| 10 | Tenants efímeros `t-utl-*` | Tenants de test | `utilizacion-idempotencia.integration.test.ts` (sufijo único por corrida) | **ELIMINAR** (solo si aparecen como huérfanos en una BD compartida) | Creados **solo** por suites destructivas con sufijo único; **no** son datos de seed. En una BD de producción **no deberían existir**. Si aparecieran (por haber corrido tests contra una BD compartida), son huérfanos a eliminar por el propietario de la BD — **NO** automáticamente. |
| 11 | Vars `M365_*` (4, legado) | Secretos legados | Entorno | **ELIMINAR** (del entorno) | El runtime usa `GRAPH_*`; `M365_*` solo aparecen en un test. Retirarlas del entorno de producción para reducir superficie. |
| 12 | Datos de contacto ficticios `ventas@<clave>.demo` | Datos demo (no credenciales) | `seed-delta-demo.ts` | **CONSERVAR / N/A** | Snapshots de contacto de terceros de demostración; no son credenciales. Su destino sigue a §14. |

**Instrucción a Dirección:** antes del lanzamiento debe decidirse §14; una vez
decidido, aplicar sobre los ítems 1–8 la acción marcada (REEMPLAZAR/ROTAR) y
retirar los ítems 10–11 del entorno de producción. **Ninguna acción destructiva
se ejecuta en esta fase.**

---

## §14 — Estrategia demo vs producción

Contexto técnico verificado:
- Existe el tenant permanente `delta-demo` (`DEMO_TENANT`) con datos de
  demostración y los históricos importados (LITE-09) sembrados sobre él.
- La **RLS por `tenant_id`** aísla cada tenant; el runtime conecta como
  `deltaops_app` (NOBYPASSRLS), de modo que un tenant no ve datos de otro.
- La idempotencia del importador histórico (LITE-09) usa **claves deterministas
  UUIDv5** (RFC 4122 SHA-1, namespace del programa) sobre la tupla
  **`(tenant, archivo, tipo, Id de Forms | hash de fila)`**. El `tenant` forma
  parte de la clave: re-importar la misma fuente en un tenant **distinto**
  genera ids **distintos** (no colisiona con `delta-demo`); re-importar en el
  **mismo** tenant converge (0 duplicados).

### Opción A — Convertir `delta-demo` en el tenant de producción
- **Ventaja:** cero migración de datos; los históricos LITE-09 ya están dentro.
- **Riesgos:**
  - Arrastra los 5 usuarios ficticios y el branding «DELTA DEMO»; habría que
    reemplazar usuarios y branding **in situ** sobre datos ya productivos.
  - El slug `delta-demo` quedaría como identidad permanente del tenant real
    (estéticamente y en URLs/logs), difícil de revertir.
  - El wipe idempotente de la seed demo (`limpiarTenantDemo`) borra **todo** el
    tenant `delta-demo`: si por error se re-ejecuta la seed demo contra
    producción, **destruiría los datos productivos**. Riesgo operativo alto.
- **Veredicto:** técnicamente posible pero **frágil**; mezcla identidad demo con
  producción y deja una trampa destructiva (seed demo sobre el tenant real).

### Opción B — Tenant de producción nuevo + migrar con el importador
- **Ventaja:** identidad limpia; separa demo de producción; el importador es
  admin-only, idempotente, con preview/validación/reporte.
- **Sobre los históricos:** dado que el `tenant` es parte de la clave UUIDv5,
  re-importar las fuentes originales al tenant nuevo **no colisiona** con
  `delta-demo` y es idempotente dentro del tenant nuevo.
- **Riesgos / condiciones:**
  - Requiere disponer de los **archivos fuente originales** de LITE-09 para
    re-importar. Que esos archivos estén disponibles es 🟡 **REQUIERE
    VERIFICACIÓN** (Dirección/quien ejecutó LITE-09).
  - La re-importación al tenant nuevo debe ejecutarse por el importador oficial
    (no copia SQL cruda entre tenants), preservando fechas operacionales reales
    (§13 de la directiva).
- **Veredicto:** limpio y seguro **si** los archivos fuente están disponibles.

### Opción C — Conservar `delta-demo` como entorno demo independiente
- **Ventaja:** demo intacta para formación/ventas; producción arranca en un
  tenant nuevo y separado; máxima separación de responsabilidades.
- **Riesgos:** duplica datos históricos (una copia demo, una productiva) — pero
  RLS y las claves por-tenant lo hacen seguro; el «costo» es solo de
  almacenamiento y de mantener dos conjuntos.
- **Veredicto:** el más conservador; no toca `delta-demo` (alineado con la
  prohibición de la directiva de no borrar demo).

### Recomendación técnica

**Se recomienda la Opción C** (conservar `delta-demo` como demo independiente y
crear un **tenant de producción nuevo**), y poblar el tenant productivo por el
importador oficial (Opción B como mecánica de carga). Justificación:

1. Es la **más segura**: nunca convierte datos demo en datos productivos ni deja
   la trampa destructiva de la seed demo apuntando al tenant real (elimina el
   riesgo principal de A).
2. Respeta la directiva (§14): **no borra `delta-demo`** hasta decisión
   explícita, y permite conservarlo para formación/piloto.
3. Aprovecha las garantías ya verificadas: RLS por tenant + idempotencia UUIDv5
   con `tenant` en la clave ⇒ la carga productiva es aislada e idempotente.

**Condición 🟡 (Dirección/Infraestructura):** confirmar disponibilidad de los
archivos fuente originales de LITE-09 para poblar el tenant productivo por el
importador. Si no estuvieran disponibles, evaluar una migración controlada
tenant→tenant por el importador con exportación previa (fuera del alcance de
esta fase; documentar como tarea operativa). **No se decide por suposición ni se
ejecuta nada aquí.**

---

## §15 — Checklist de carga de datos de producción

Principio: **no cargar datos manualmente si existe el importador oficial.** La
importación histórica es **admin-only** (`SUPER_ADMIN`/`TENANT_ADMIN`; CONSULTA
jamás — fail-closed 403), validada, idempotente, con preview y reporte de
omitidos (`historicos-module.ts`).

Flujo oficial por lote (endpoints reales bajo `…/deltaops/activos/historicos`):

```
Excel/fuente
  → subir            (POST …/historicos/subir; devuelve uploadId estable por hash+nombre)
  → analizar/preview (POST …/historicos/analizar)
  → validar          (POST …/historicos/validar)
  → confirmar/importar (POST …/historicos/importar)
  → reporte          (procedencia + lote + omitidos)
```

Orden de carga (respetando dependencias referenciales), cada paso vía importador
o vía comandos oficiales del módulo correspondiente, con preview→validación→
confirmación→reporte:

1. [ ] **Empresas / tenant** — crear el tenant productivo (§14) con branding y
       módulos contratados.
2. [ ] **Centros** (centros/sedes) — catálogo configurable del tenant.
3. [ ] **Ubicaciones** — jerarquía de ubicaciones.
4. [ ] **Centros de costos** — catálogo del tenant.
5. [ ] **Roles** — roles del sistema por tenant (ya provistos por el modelo
       Enterprise; verificar entitlements/módulos).
6. [ ] **Usuarios / responsables** — identidades + membresías reales (no los
       usuarios demo). Contraseñas por el *secret store*, nunca literales.
7. [ ] **Activos** (incluye equipos de terceros/arrendados, p. ej. C11 SIGAR) —
       por importador; respetar la regla de mantenimiento de terceros (§20).
8. [ ] **Equipos de terceros** — snapshots de proveedor cuando aplique.
9. [ ] **Rutinas / planes** — configuraciones de mantenimiento por activo.
10. [ ] **Configuraciones** — catálogos y parámetros del tenant.
11. [ ] **Históricos** (LITE-09: horómetros, preoperacionales, mantenimientos,
        combustible, jornadas) — por importador, preservando **fecha operacional
        real**; idempotente por UUIDv5.
12. [ ] **Verificación post-carga** — conteos por tabla, hoja de vida de un
        activo real, C11 SIGAR (sin mantenimientos internos inventados),
        cronología coherente, 0 duplicados tras una segunda pasada de prueba.

Reglas: cada importación debe pasar por **preview** antes de confirmar; el
**reporte** de omitidos debe archivarse; el importador **no** debe exponerse a
usuarios operativos.

---

## §26 — Observabilidad operativa

**Dónde se observan los logs:** en el **panel de publicación de la plataforma
Replit** (logs del *deployment* / consola del servicio publicado). La aplicación
emite **logs estructurados** con `pino`/`pino-http`
(`artifacts/api-server/src/lib/logger.ts`): cada petición registra
`id/método/url` (URL **sin query string**) y `statusCode`. El nivel se controla
con `LOG_LEVEL`.

**Cómo detectar cada condición:**

| Condición | Señal a buscar | Fuente |
|---|---|---|
| Errores 5xx | `statusCode` ≥ 500 en los logs de petición; pico de tasa de error en el panel del deployment. | `pino-http` + panel de plataforma. |
| Caída / indisponibilidad de BD | Fallos de conexión del pool; `…/ready` deja de responder 200 (comprueba dependencias críticas). | Pool `@workspace/db`; endpoint de readiness. |
| Estado de readiness | Sondear el endpoint `…/ready` (health gate de aplicación preparada, vs `…/health` = proceso vivo). | Router de plataforma (`routes/deltaops/index.ts`). |
| Fallos de autenticación | Respuestas 401/403 en rutas `/api/auth/*` y de módulos; el guard estricto de identidad rechaza sesiones sin membresía/tenant/epoch. | Middleware de identidad. |
| Errores de importación | Respuestas de error en `…/historicos/analizar|validar|importar`; reporte de omitidos del lote. | `historicos-module.ts`. |
| Fallos de envío de correo (Graph) | `warn` «Graph: fallo de envío» con `status`/`graphCode` (secretos **redactados**); filas del outbox marcadas `FAILED`. | `m365-graph-email.ts`. |

**Prohibiciones de registro (verificadas):** **NUNCA** registrar contraseñas,
tokens, cookies, secretos ni credenciales.
- El logger redacta `authorization`, `cookie` y `set-cookie`; el serializador de
  peticiones elide el *query string* (`req.url?.split("?")[0]`).
- El proveedor Graph tiene `redactarSecretos()` y nunca registra
  `Authorization`/`access_token`/`client_secret`; los mensajes de error de Graph
  solo llevan `status` + código Graph.

🟢 VERIFICADO EN CÓDIGO (redacción y elisión). 🟡 PENDIENTE: confirmar en el
panel del deployment la retención/alertas de logs del proveedor (Infraestructura).

---

## §27/§28 — Procedimientos de backup y plan de rollback

### Mecanismo de backup del proveedor (Replit) — VERIFICADO EN DOCUMENTACIÓN

Según la documentación de la plataforma Replit para bases de datos PostgreSQL:

- **Tipo:** *Point-in-Time Recovery* (PITR) automático sobre la base gestionada.
- **Retención:** **7 días** en el plan **Core**; **28 días** en planes
  **Pro/Teams**. 🟡 La retención efectiva del plan contratado por Dirección
  **REQUIERE VERIFICACIÓN** en la cuenta.
- **Restauración:** se realiza a una **instancia SEPARADA**, **sin
  sobrescribir** la base de producción, desde el panel de base de datos
  (*Database pane → restore settings*), eligiendo el punto en el tiempo.
- **Separación de entornos:** las bases de **desarrollo** y **producción** son
  **SEPARADAS**; el esquema se aplica a producción **al publicar**.

> Estado: **VERIFICADO EN DOCUMENTACIÓN** del proveedor. El **ensayo real de
> restauración** (restaurar a una instancia separada y comparar empresas /
> activos / órdenes / preoperacionales / combustible / horómetros / históricos /
> usuarios / relaciones / integridad, conforme a §5 de la directiva) **aún está
> PENDIENTE** y debe ejecutarlo Infraestructura **antes** de autorizar
> producción. 🟡 PENDIENTE (ensayo). **Nunca usar producción como laboratorio.**

### §27 — Procedimiento operativo de backup

**ANTES DEL DEPLOY:**
1. **Backup:** confirmar que PITR está activo y anotar que existe un punto de
   restauración inmediatamente anterior al deploy (o crear un checkpoint/backup
   manual si el plan lo ofrece).
2. **Verificación:** confirmar disponibilidad del restore (panel de BD) y que la
   ventana de retención cubre el momento.
3. **Registro de timestamp:** anotar fecha/hora UTC del punto de referencia.
4. **Confirmación de disponibilidad del restore:** verificar que se puede
   restaurar a una instancia separada.

**ANTES DE MIGRACIÓN:**
1. **Backup:** punto de restauración previo (PITR) registrado.
2. **Validación:** revisar el diff de migración; ejecutar como `deltaops_owner`
   (`DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD`), **nunca** el runtime.
3. **Migración:** aplicar migraciones (el runtime **no** ejecuta DDL).
4. **Smoke test:** `…/ready` 200; login de un `SUPER_ADMIN`; lectura de un
   activo/hoja de vida real.
5. **Rollback si falla:** ver §28 (restauración por PITR a instancia separada y
   promoción/reapunte según proveedor; nunca degradar a superusuario).

### §28 — Plan de rollback

**Aplicación:**
- Volver a una **versión estable anterior** mediante el mecanismo de la
  plataforma: **restaurar el checkpoint** correspondiente y **volver a publicar**.
- **Aclaración de plataforma:** Replit **ya no soporta el rollback in-place del
  deployment**; el rollback de aplicación se hace por **checkpoint + republicar**
  la versión estable. 🟡 Confirmar el flujo exacto de checkpoints con
  Infraestructura.

**Base de datos:**
- Usar **PITR** para restaurar a una **instancia separada** en el punto anterior
  al incidente; validar la copia restaurada y promover/reapuntar según el
  procedimiento del proveedor. **Nunca** restaurar sobrescribiendo producción sin
  validación previa.

**Configuración:**
- Restaurar los valores anteriores de las variables de configuración no
  secretas (`CORS_ORIGINS`, `NODE_ENV`, `NOTIFICATION_PROVIDER`, etc.).
- **Rollback de conexión:** en **producción NO** se admite «quitar
  `DELTAOPS_APP_PASSWORD`» como vía de rollback (reintroduciría un runtime
  superusuario y anularía la RLS). El rollback de conexión en producción repone
  la credencial de **mínimo privilegio**, no degrada a admin.

**Secrets:**
- Rotar/revertir según el procedimiento del *secret store* (`SESSION_SECRET`,
  `ATTACHMENT_URL_SECRET`, `DELTAOPS_APP_PASSWORD`, `DELTAOPS_OWNER_PASSWORD`,
  `GRAPH_CLIENT_SECRET`, `DELTAOPS_ADMIN_PASSWORD`).

**Regla absoluta (directiva §28):** **JAMÁS «volver a superusuario»** como
mecanismo de rollback. El estado final nunca deja un runtime superusuario ni sin
FORCE RLS.

---

## Referencias cruzadas y actualización de manuales

- El **Manual de Operación** (`docs/manual/DELTAOPS-LITE-OPERACION.md`, §3.6
  «Backup y restauración») marca hoy el backup del proveedor como **NO
  VERIFICADO**. Este documento actualiza ese estado a **VERIFICADO EN
  DOCUMENTACIÓN** (mecanismo PITR: retención 7 días Core / 28 días Pro-Teams,
  restore a instancia separada vía *Database pane*), manteniendo **PENDIENTE el
  ensayo real de restauración**. Ver la nota añadida en dicha sección.
- El **Manual Técnico** (`DELTAOPS-LITE-MANUAL-TECNICO.md`, §12) conserva su
  descripción de backup lógico; el mecanismo PITR del proveedor complementa (no
  sustituye) esa vía.

---

## Resumen de estados (Encargo A)

| Sección | Estado |
|---|---|
| §7 Matriz de variables | 🟢 VERIFICADA EN CÓDIGO; 🟡 valores de producción los define Dirección; `CORS_ORIGINS`/dominio 🟡 PENDIENTE DE DIRECCIÓN. |
| §8 (referida) Regla `DATABASE_URL`/fail-fast | 🟢 VERIFICADO EN CÓDIGO; 🟡 verificación en vivo del rol en producción PENDIENTE. |
| §12 Auditoría de credenciales/demo | 🟢 Inventario y clasificación entregados; acciones (ROTAR/REEMPLAZAR/ELIMINAR) 🟡 a ejecutar por Dirección tras §14. Nada eliminado. |
| §14 Demo vs producción | 🟢 Análisis de A/B/C + recomendación (C con carga por importador); 🟡 condición: disponibilidad de fuentes LITE-09. |
| §15 Checklist de carga | 🟢 Entregado (flujo oficial preview→validación→confirmación→reporte). |
| §26 Observabilidad | 🟢 VERIFICADO EN CÓDIGO (redacción/elisión); 🟡 retención/alertas del panel PENDIENTE. |
| §27/§28 Backup y rollback | 🟢 Procedimientos documentados; backup del proveedor **VERIFICADO EN DOCUMENTACIÓN**; 🟡 **ensayo de restauración PENDIENTE** (Infraestructura, bloqueante para autorizar producción según directiva §29). |

**Sin desarrollo de funcionalidades. Sin eliminación de datos o credenciales.
Sin commits.**
