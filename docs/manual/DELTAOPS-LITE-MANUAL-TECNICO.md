# DELTAOPS LITE · Manual Técnico (§28)

> Documento técnico para ingeniería y operaciones. Español formal. **No contiene
> secretos**: los secretos se nombran, nunca se transcriben sus valores. Las
> afirmaciones no comprobables de primera mano se marcan **NO VERIFICADO** /
> **REQUIERE VERIFICACIÓN**.
>
> Fuentes: `artifacts/`, `lib/`, `.env.example`, y los cierres/discovery
> `DGP-023.5-CIERRE-RLS-POSTGRES.md`, `DGP-023.6-DESCUBRIMIENTO-INFRA-SECRETS.md`,
> `DELTAOPS-LITE-11-AISLAMIENTO-BD-TEST.md`.

---

## 1. Arquitectura general

DeltaOps es un **monorepo pnpm** con dos capas:

- **`artifacts/`** — artefactos desplegables (mutables): `api-server` (backend
  Express + runtime de módulos), `deltaops` (frontend React/Vite),
  `mockup-sandbox` (diseño).
- **`lib/`** — librerías/paquetes de plataforma y de dominio **congelados por
  contrato** (`@workspace/db`, `@workspace/kernel`, `@workspace/platform`,
  `@workspace/design-system`, `@workspace/api-zod`, y los `module-*` de cada
  bounded context: activos, ordenes, inventario, planes, abastecimiento,
  preventivo, correctivo, analytics, utilizacion, manodeobra, costos, reference,
  dynamic-forms, workflow-engine, …).

### 1.1 Kernel, UoW, outbox, CQRS y Record Store

- **Kernel** (`@workspace/kernel`): unidad de trabajo (**UoW**) transaccional,
  emisión de eventos de dominio y **outbox** transaccional
  (`kernel_outbox` / `kernel_dead_letter`). Los eventos persisten `tenant_id`
  (corrección N-2 de DGP-023.5) desde `payload->>'tenantId'`.
- **CQRS / Record Store**: la plataforma persiste registros en un almacén
  genérico (`deltaops.platform_records`) además de las proyecciones de lectura
  por módulo (tablas `*_read`). Las lecturas del Record Store y del *audit trail*
  fijan `app.tenant_id` en transacción (corrección N-5 de DGP-023.5): sin
  contexto de tenant devuelven 0 filas bajo FORCE RLS.
- **Procesamiento del outbox**: hoy **in-process**
  (`OutboxProcessor.processPending`, drenado in-request/seed). **Gap operativo
  (DGP-023.6 §13):** no hay *worker* o intervalo dedicado; en producción conviene
  un drenador programado.

---

## 2. Frontend

- **React + Vite**, enrutado con `wouter` (`artifacts/deltaops/src/App.tsx`).
  Base configurable por `BASE_PATH` (`/deltaops/`).
- **Design System** propio (`@workspace/design-system`): tokens `--do-*`,
  `ThemeProvider` (Claro/Oscuro/Automático, persistido en
  `localStorage["do-tema"]`), `ToastProvider`, componentes empresariales.
- **RBAC de presentación** (`src/lib/identidad/rbac.ts`): decide qué superficies
  ofrecer según rol/entitlements. **No es la autoridad**: el backend rechaza
  cualquier operación no autorizada (nunca hay bypass). Rutas exclusivas de
  SUPER_ADMIN (`/plataforma`, `/motores`, `/motores/playground`,
  `/consola-activos`, `/administracion/saas`) protegidas por guard de ruta
  (`SoloSuperAdmin`) además del 403 del backend.
- **Navegación por proceso** (LITE): agrupa las rutas/entitlements existentes en
  grupos operativos (Inicio / Mantenimiento / Equipos / Inventario /
  Indicadores…). Los módulos se ocultan si el tenant no tiene el entitlement.
- **Modo offline / sincronización**: cada módulo expone una superficie
  `…/sincronizacion` y colas por tenant (`purgarColasDeOtrosTenants`,
  `guardas-offline`). En producción el frontend es **estático**.

---

## 3. Backend

- **Express** (`artifacts/api-server/src/app.ts`). Toda la API vive bajo `/api`;
  la plataforma bajo `/api/deltaops/*`.
- **`trust proxy = 1`** para que las cookies `secure` funcionen tras la
  terminación TLS del proxy.
- **CORS por allowlist** (LITE-10 §27): `CORS_ORIGINS` (coma-separado) con
  `credentials:true`; sin variable, en dev/test se refleja el origen y en
  producción CORS queda cerrado (mismo origen). Peticiones sin `Origin`
  (curl/same-origin/health) siempre pasan.
- **Orden de montaje (relevante para autorización):** identidad →
  plataforma legacy → *attachment-serve* (autorizado por firma HMAC, no sesión) →
  consola de plataforma (guard admin/super-admin) → visibilidad de navegación →
  `requireIdentityForModules` → `enforceEntitlements` → routers de cada módulo.
- **Manejo de errores**: `deltaopsErrorHandler` montado bajo `/api/deltaops`.
- **Bootstrap** (`index.ts`): exige `PORT` (lanza si falta/ inválido);
  `app.listen(port)`; graceful shutdown en `SIGTERM/SIGINT` (cierra servidor y
  `pool.end()`, con timeout de 10 s).

---

## 4. PostgreSQL: roles, RLS y FORCE (DGP-023.5)

**Separación de roles** (migración `0051`, idempotente):

| Rol | LOGIN | SUPERUSER | BYPASSRLS | DDL | Uso |
|---|---|---|---|---|---|
| `deltaops_owner` | sí | no | no | sí (owner) | Migraciones, seed, propiedad de los objetos |
| `deltaops_app_rw` | no | no | no | no | Agrupa privilegios DML (rol de grupo) |
| `deltaops_app` | sí | no | no | no | **Runtime del API** (mínimo privilegio) |

- `deltaops_app` es **miembro** de `deltaops_app_rw`; posee **0 objetos** en el
  esquema, tiene `USAGE` en el esquema (no `CREATE`), DML sobre las tablas,
  `USAGE, SELECT` en secuencias y `EXECUTE` de la función N-1. Ningún `GRANT ALL`.
- **Ownership**: esquema `deltaops`, ~174 tablas, la secuencia y la función
  `SECURITY DEFINER` `deltaops.tenants_para_super_admin()` pertenecen a
  `deltaops_owner`.
- **FORCE ROW LEVEL SECURITY** activo en **166 tablas** tenant-scoped
  (migración `0052`). `ten_tenants` queda con RLS pero **sin FORCE** por diseño
  (la función `SECURITY DEFINER` de N-1 lista tenants para SUPER_ADMIN). 7 tablas
  globales/infra permanecen sin RLS por diseño de DGP-023.4.
- **Aislamiento verificado (DGP-023.5 FASE 11):** conectado como `deltaops_app`,
  sin contexto de tenant ⇒ 0 filas (fail-closed); con contexto ⇒ sólo filas del
  tenant; escrituras/lecturas cross-tenant (SELECT/INSERT/UPDATE/DELETE/IDOR)
  bloqueadas por política.
- **Regla DGP-023.5 §13 (absoluta):** el runtime **jamás** vuelve a
  superusuario; en producción el pool hace **FAIL-FAST** si falta
  `DELTAOPS_APP_PASSWORD` (ver §7 y el hallazgo I-03 de DGP-023.6).

---

## 5. Autenticación y sesiones

- **Identidad multi-tenant** (DGP-017): identidades en `deltaops.idn_identities`,
  membresías por tenant y rol en `deltaops.idn_memberships`, roles como datos en
  `deltaops.idn_roles`.
- **Login**: `POST /api/deltaops/auth/login` (email + password + tenantId).
  Respuesta `409 SELECT_TENANT` cuando la identidad pertenece a varias empresas.
  Otros: `logout`, `session`, `switch-tenant`, `password/*`, `invitations`.
- **Sesiones**: `express-session` sobre PostgreSQL
  (`connect-pg-simple`, tabla `deltaops.sessions`, `createTableIfMissing:false`).
  Cookie `deltaops.sid`, `httpOnly:true`, `sameSite:lax`,
  `secure = (NODE_ENV==="production")`, `maxAge` 8 h, `resave:false`,
  `saveUninitialized:false`, host-only.
- **Revocación efectiva (auth_epoch):** el middleware invalida la sesión si
  `authVersion !== authEpoch`; `switch-tenant` renueva `authVersion`. Hay
  regeneración de sesión anti-fixation.

### 5.1 RBAC canónico (backend)

Catálogo canónico (`artifacts/api-server/src/deltaops/identity/rbac.ts`):

| Rol canónico | Nombre | Rol legacy de módulo | Admin de tenant | Super admin |
|---|---|---|---|---|
| `SUPER_ADMIN` | Super Administrador | admin | sí | **sí** |
| `TENANT_ADMIN` | Administrador de Empresa | admin | sí | no |
| `SUPERVISOR` | Supervisor | operador | no | no |
| `PLANIFICADOR` | Planificador | operador | no | no |
| `TECNICO` | Técnico | operador | no | no |
| `CONSULTA` | Consulta | lector | no | no |

El rol canónico se mapea a un rol legacy (`admin`/`operador`/`lector`) que
consumen los `principal*` de cada módulo (contratos congelados), evitando
`if (rol === "admin")` disperso. La autorización real es **server-side**.

---

## 6. Secrets (nombres, sin valores)

| Secreto | Obligatorio | Uso |
|---|---|---|
| `SESSION_SECRET` | sí | Firma de cookies de sesión; *fallback* de la clave HMAC de adjuntos |
| `NEON_DATABASE_URL` | sí en prod | Endpoint Neon `neondb` como `deltaops_app`, con TLS obligatorio normalizado a `verify-full`; su contraseña embebida no se usa ni se registra |
| `DELTAOPS_APP_PASSWORD` | sí en prod | Contraseña efectiva del rol Neon `deltaops_app`; no se usa en heliumdb |
| `DELTAOPS_OWNER_PASSWORD` | sí para migración/seed | Contraseña del rol owner |
| `ATTACHMENT_URL_SECRET` | opcional | Clave HMAC dedicada de URLs firmadas de adjuntos (fallback a `SESSION_SECRET`) |
| `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` / `GRAPH_SENDER` | sí si `m365-graph` | Microsoft Graph (Mail.Send) |
| `DEMO_*_PASSWORD`, `DELTAOPS_ADMIN_PASSWORD` | sí en prod (seed) | Contraseñas de usuarios sembrados |
| `DATABASE_URL` / `PG*` | sí fuera de prod | Conexión administrada de desarrollo/test; nunca es fallback en producción |

- **Higiene verificada (DGP-023.6 §2):** cero secretos reales en repositorio,
  docs, tests, fixtures/seeds ni en los últimos 30 commits; los únicos literales
  son placeholders de `.env.example` y la credencial local de
  `docker-compose.yml` (`deltaops:deltaops`, sólo Docker local).
- Los `M365_*` presentes en el store no son consumidos por el código actual
  (que lee `GRAPH_*`); parecen legado (I-09b). **REQUIERE VERIFICACIÓN** su
  retiro.
- **Riesgo I-02 (mitigado):** históricamente el HMAC de adjuntos reutilizaba
  `SESSION_SECRET`; LITE-11 §10 introdujo `ATTACHMENT_URL_SECRET` (opcional) para
  separar dominios de firma.

---

## 7. Resolución de conexión y FAIL-FAST

`lib/db/src/index.ts` (con `runtime-connection.ts` como función pura testeable):

1. Si `DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD` → URL de
   `deltaops_owner` (migración/seed explícito; no es runtime normal).
2. En `NODE_ENV=production` → `NEON_DATABASE_URL` validada como `neondb` +
   `deltaops_app` + TLS, con `DELTAOPS_APP_PASSWORD` como contraseña efectiva.
3. Fuera de producción → `DATABASE_URL` de heliumdb, sin reutilizar la
   contraseña productiva.

**Hardening Neon:** en producción, si falta `NEON_DATABASE_URL`, apunta a otra
base, declara otro usuario o no exige TLS, el resolvedor **LANZA** con mensaje
redactado. No existe fallback productivo a `DATABASE_URL`, `PG*` ni heliumdb.
Fuera de producción se conserva heliumdb mediante `DATABASE_URL`. Cubierto por
`lib/db/src/__tests__/runtime-connection.test.ts`, incluidos los casos que
comprueban que los errores no exponen URL ni credenciales.

---

## 8. Migraciones

- Herramienta: **drizzle-kit** (`lib/db`). Scripts `push`/`push-force` exportan
  `DELTAOPS_DB_ROLE=owner` ⇒ conectan como `deltaops_owner`.
- Migraciones relevantes: `0049` (columna `tenant_id` en outbox, aditiva),
  `0050` (función `SECURITY DEFINER` para SUPER_ADMIN), `0051` (separación de
  roles, idempotente), `0052` (FORCE RLS en 166 tablas).
- Rollback granular documentado en DGP-023.5 FASE 13 (ver Manual de Operación
  §3.5): `NO FORCE`, `REVOKE`/`ALTER OWNER`/`DROP ROLE` en orden inverso, `DROP
  COLUMN`/`DROP FUNCTION` para las aditivas — nunca dejando superusuario.

---

## 9. Importador histórico

- Rutas: `artifacts/api-server/src/routes/deltaops/historicos-module.ts`, base
  `/api/deltaops/activos/historicos`.
- **Fail-closed admin-only:** middleware de guard que exige sesión (401 si no) y
  rol `SUPER_ADMIN`/`TENANT_ADMIN` (403 en caso contrario). Verificado por curl
  en LITE-11: técnico/consulta reciben 403 en todos los endpoints; sin sesión,
  401.
- Endpoints: `GET tipos-fuente`, `GET archivos-disponibles`, `POST analizar`
  (detección de tipo), `POST validar` (dry-run), `POST importar` (aplica),
  `POST subir`. La entrada admite `uploadId`, `archivo` (asset de servidor) o
  `contenidoBase64`.
- **Idempotencia:** deduplicación por `opId` determinista (UUIDv5 derivado del
  contenido y del activo). Verificado en LITE-11: re-importaciones idénticas dan
  **Δ=0** (0 duplicados). Los tipos de fuente incluyen combustible/tanqueos,
  checklists preoperacionales (cargador/montacargas), horas-hombre (jornadas) y
  planes de mantenimiento preventivo.
- Los datos históricos canónicos viven como entradas de **timeline**
  (`platform.timeline`, `data->>'eventType' = historico.*`) además de las
  proyecciones de módulo.

---

## 10. Tests y aislamiento de BD de test (LITE-11, barreras B1–B4)

- **Unitarios/contrato**: corren sin PostgreSQL. **Destructivos** (integración
  PG): sólo contra `DATABASE_TEST_URL`, mediante un **pool dedicado**; nunca
  reutilizan el pool de runtime (`DATABASE_URL`).
- **Guard centralizado** en `@workspace/db` (`lib/db/src/test-guard.ts`):
  `suiteDestructiva(describe)` + `crearPoolDestructivo()`. `api-server` lo
  re-expone vía `src/test-support/pg-destructivo.ts`; 16 suites `*.pg.test.ts` de
  `lib/*` lo importan directamente (sin copy-paste).
- **Barreras (todas deben cumplirse; si no, ABORTA/OMITE, nunca cae a
  `DATABASE_URL`):**
  - **B1** `NODE_ENV` no es producción → THROW.
  - **B2** `DATABASE_TEST_URL` presente → si falta, SKIP limpio.
  - **B3** `DATABASE_TEST_URL` ≠ BD de runtime (host+puerto+nombre) → THROW.
  - **B4** marcador en vivo `deltaops.is_test_database='true'` o nombre en
    allowlist/patrón `test` → THROW si no.
- **Caso especial `seed-delta-demo`:** `seedDeltaDemo()` está cableado al pool de
  runtime; su gate exige que la **propia BD de runtime** esté marcada como de
  test (`runtimeEsBdDeTest`) en `beforeAll`; si no, **aborta sin sembrar**.
- Resultado esperado sin `DATABASE_TEST_URL`: **17 archivos pasan · 13 omitidos**.
  Los scripts corren con `DELTAOPS_DB_ROLE=owner`; el guard aplica igual.

---

## 11. Deployment

- **Autoscale**, `router = "application"` (Replit). Instancias **efímeras**; sin
  estado local persistente (referencia-only). Estado durable = PostgreSQL +
  `deltaops.sessions`.
- API: build → `dist/index.mjs`, `NODE_ENV=production`, `PORT=8080`.
- Frontend: **estático** (`dist/public`, rewrite SPA), `BASE_PATH=/deltaops/`.
- Health *gate* actual → `…/platform/health` (liveness). Readiness real en
  `…/platform/ready`.
- **Producción externa (requisitos, DGP-023.6 §11):** PostgreSQL 16 con RLS y el
  mismo modelo de roles (migración `0051` idempotente); Node.js 24; servido
  estático del frontend; reverse proxy con HTTPS/TLS que reenvíe
  `X-Forwarded-Proto`; dominio productivo; *secret store*; backups de PostgreSQL;
  colector de logs. **NO se diseña arquitectura completa** aquí.

---

## 12. Backup y rollback (estado de verificación honesto)

- **Backup de datos**: la base PostgreSQL completa (negocio + `idn_*` +
  `sessions` + outbox + auditoría). Secretos a conservar aparte (ver §6 y Manual
  de Operación §3.6).
- **Rollback de código/migraciones/config**: documentado y **probado en lo no
  destructivo** en DGP-023.5 FASE 13 (rollback de runtime probado por simulación
  del resolver; FORCE/roles con procedimiento granular). **Regla:** el runtime
  jamás debe quedar como superusuario.
- **Estado de verificación:**
  - Rollback de configuración/runtime y de migraciones RLS: **VERIFICADO por
    simulación / SQL** (DGP-023.5).
  - **Backup/restauración provistos por la plataforma de alojamiento
    (snapshots, PITR, retención): NO VERIFICADO** — no comprobable desde este
    entorno; **REQUIERE VERIFICACIÓN** con el proveedor y una restauración de
    prueba.

---

## 13. Observabilidad

| Aspecto | Estado |
|---|---|
| Logs | `pino`/`pino-http` estructurados; redacción de `authorization`/`cookie`/`set-cookie` |
| Liveness | `…/platform/health` (siempre 200; no verifica BD — I-09) |
| Readiness | `…/platform/ready` (verifica `SELECT 1` + `SESSION_SECRET`; 503 si falla) |
| Métricas | `…/platform/metrics` (in-memory; se pierden al reiniciar — gap) |
| Errores 5xx | `deltaopsErrorHandler` bajo `/api/deltaops` |
| Startup/Shutdown | fail-fast si falta `PORT`/config/Graph; graceful shutdown (SIGTERM/SIGINT) |
| Auditoría | *audit trail* + `kernel_outbox` (con `tenant_id` tras N-2); consola SUPER_ADMIN fail-closed |
| Procesamiento outbox | in-process (sin worker dedicado — gap operativo) |

> **REQUIERE CONFIGURACIÓN / NO VERIFICADO:** exportación de logs/métricas a un
> colector externo y drenador programado del outbox no están presentes; deben
> proveerse en la infraestructura de producción.
