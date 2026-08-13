# DGP-023 — DISCOVERY Y ARQUITECTURA DE HARDENING PARA PRODUCCIÓN

> **ESTADO: SOLO DISCOVERY.** No se modificó código, DB, contratos, RBAC, RLS, CORS, dependencias, configuración ni frontend/backend. Único entregable: este documento. **NO commit de implementación.** Fecha: 2026-08-13.

---

## 1. Objeto

Determinar qué necesita DeltaOps para pasar de entorno de desarrollo/piloto controlado a plataforma preparada para producción. Auditoría de seguridad, infraestructura, observabilidad, multitenancy, RBAC, RLS, secrets, backups, offline y privacidad; con matriz de riesgos, roadmap por fases, definición de MVP y decisiones de Dirección requeridas. No se implementa hardening.

## 2. Alcance

**Incluido:** superficie HTTP del `api-server`, CORS, rate limiting, headers de navegador, autenticación/sesiones, RLS de identidad, secrets/config, logs/observabilidad, backups/DR (lo que exista), deployment/rollback, infraestructura, frontend de producción, dependencias, RBAC, multitenancy sistemática, offline, data privacy.
**Excluido:** cambios de código, migraciones, rotación de secretos, cambios de infraestructura, implementación de controles. Módulos de negocio (activos, órdenes, inventario, etc.) se auditan solo desde la perspectiva de la frontera de seguridad y aislamiento, no de su lógica funcional.

## 3. Arquitectura actual (real, verificada)

Monorepo pnpm (`pnpm-workspace.yaml`) con `artifacts/` (api-server, deltaops [frontend], sgma, mockup-sandbox) y `lib/` (kernel, platform, db, module-*, design-system, etc.).

Pipeline HTTP del `api-server` (`artifacts/api-server/src/app.ts`), orden de montaje:
1. `pinoHttp` (logs) — `app.ts:42`
2. `cors()` **sin opciones** — `app.ts:61`  → **wildcard**
3. `express.json()` / `urlencoded` — `app.ts:62-63`
4. `deltaopsMetricsMiddleware` — `app.ts:66`
5. `createDeltaopsSession` (express-session sobre PostgreSQL) — `app.ts:67`
6. `identityRouter` (`/auth/*`, `/users`, `/roles`, `/tenant/*`, `/admin/*`) — `app.ts:74`
7. `deltaopsRouter` (health/ready/info/metrics + `/auth/me` compat) — `app.ts:76`
8. `attachmentServeRouter` (URLs firmadas HMAC) — `app.ts:79`
9. `platformConsoleRouter` (guard `requireIdentity`+`requireSuperAdmin`, DGP-022.1) — `app.ts:81`
10. `requireIdentityForModules` + `enforceEntitlements` — `app.ts:87-88` (SOLO superficies de módulo conocidas)
11. routers de módulo (reference, activos, ordenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics, utilizacion, manodeobra, costos) — `app.ts:89-100`
12. `router` (routers SGMA legacy) — `app.ts:101`  → **sin auth**
13. `deltaopsErrorHandler` — `app.ts:102`

Base de datos: PostgreSQL (Neon en Replit). Esquema multitenant en `deltaops.*` con RLS por `current_setting('app.tenant_id')`; esquema `public.*` legacy SGMA (assets/work_orders/…) sin tenancy.

Servidor en vivo durante la auditoría: puerto 80 y 8080 respondiendo `200` en `/api/deltaops/platform/health`.

## 4. Metodología

Auditoría **read-only**: lectura de código (`ReadFile`, `rg`), inspección de configuración (`app.ts`, `session.ts`, `config.ts`, `logger.ts`, `package.json`, `.env.example`, `docker-compose.yml`), consultas `psql` de solo lectura contra la BD real (catálogo `pg_class`/`pg_policy`/`pg_roles`), `curl` autenticado y anónimo contra el servidor en vivo (:80), y `pnpm audit` (sin instalar). Toda afirmación crítica lleva evidencia (archivo:línea / salida de comando). No se ejecutó ninguna mutación.

## 5. Evidencia (índice de pruebas reproducibles)

- **CORS live:** `curl -D- http://localhost:80/api/deltaops/platform/health` → `Access-Control-Allow-Origin: *`; preflight OPTIONS con `Origin: https://evil.example.com` → `204` con `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`; header `X-Powered-By: Express` presente; **ningún** header de seguridad.
- **Rate limiting:** 12 logins fallidos consecutivos → `401 ×12` (sin `429`/bloqueo); 8 `password/forgot` → `202 ×8` (sin límite).
- **RLS/rol DB:** `SELECT current_user, rolsuper, rolbypassrls` → `postgres | t | t` (**superusuario con BYPASSRLS**). `pg_class` en esquema `deltaops`: sin RLS → `idn_identities`, `idn_memberships`, `users`, `sessions`, `kernel_outbox`, `kernel_dead_letter`, `ntf_email_templates`. Resto de tablas de negocio: `relrowsecurity=t` pero `relforcerowsecurity=f`.
- **SGMA legacy sin auth:** `GET /api/work-orders` → `200` con datos reales (anónimo); `GET /api/assets` → `200`. `public.work_orders`=10 filas, `public.assets`=9, `public.technicians`=5. Routers en `routes/work-orders.ts`, `routes/assets.ts` (POST/PATCH/DELETE presentes, sin middleware de sesión).
- **Deps:** `pnpm audit` → 22 vulnerabilidades (14 high / 5 moderate / 3 low), todas en cadenas dev/build (`orval`, `typedoc`, `vite`, `postcss`), ninguna en runtime de producción.
- **Secrets:** `.env.example` con placeholders (`SESSION_SECRET=cambie-este-valor`); sin `VITE_` con secretos en el bundle; sin secretos hardcodeados en `.ts` de producción; `dist` sin `.map`.

## 6. Hallazgos (resumen)

| # | Hallazgo | Severidad |
|---|---|---|
| H-01 | Routers SGMA legacy (`/api/work-orders`, `/api/assets`, …) expuestos **sin autenticación** con CRUD completo | **CRÍTICO** |
| H-02 | App conecta a Postgres como **superusuario `postgres` (BYPASSRLS)** ⇒ RLS es no-op; aislamiento 100% app-layer | **CRÍTICO** |
| H-03 | Tablas de identidad (`idn_identities`, `idn_memberships`, `users`, `sessions`) **sin RLS** | **ALTO** |
| H-04 | **Sin rate limiting / anti brute-force** en login, forgot-password, sync, búsqueda, admin | **ALTO** |
| H-05 | **Sin headers de seguridad** (CSP/HSTS/X-Content-Type-Options/etc.) + `X-Powered-By` expuesto | **ALTO** |
| H-06 | **CORS wildcard `*`** en todos los entornos (sin política por entorno) | **MEDIO** (mitigado por ausencia de `Allow-Credentials`) |
| H-07 | **Sin backups/DR/rollback documentados**; sin RPO/RTO | **ALTO** (organizacional) |
| H-08 | RBAC: 6 roles canónicos colapsan a 3 legacy (SUPERVISOR/PLANIFICADOR/TECNICO→`operador`) | **MEDIO** (deuda funcional, no escalada) |
| H-09 | `login-fallido` declarado pero **nunca auditado** ⇒ sin forensía de brute-force | **MEDIO** |
| H-10 | Logs HTTP **sin `tenantId`/`identityId`/`opId`** (solo id/method/url/status) | **MEDIO** |
| H-11 | Offline: cola en `localStorage` plano, **sin purga en logout**; datos operativos en dispositivo compartido | **MEDIO** |
| H-12 | Dependencias dev/build con 14 vulnerabilidades high (fuera de runtime) | **BAJO** |
| H-13 | `SESSION_SECRET` validado solo `min(1)`; no verifica entropía ni no-default en producción | **MEDIO** |
| H-14 | Reutilización de `SESSION_SECRET` como clave HMAC de URLs firmadas de adjuntos | **BAJO** |
| H-15 | Infraestructura de producción real (Replit vs VPS/Neon) no documentada en repo | **INFORMATIVO** |

## 7. Riesgos

Ver **§25 Matriz de riesgos** para la clasificación completa (probabilidad/impacto/superficie/bloquea-producción).

## 8. Seguridad API

### 8.1 Inventario de superficies (método | ruta | auth | authz | tenant scope | RLS efectiva | riesgo)

**Identidad / Auth (`identity.ts`, montado en `/api`):**

| Método | Ruta | Auth | Authz | Tenant scope | RLS | Riesgo |
|---|---|---|---|---|---|---|
| POST | `/deltaops/auth/login` | pública | credenciales | por membresía elegida | app-layer | Sin rate limit (H-04) |
| POST | `/deltaops/auth/logout` | cookie | propia | sesión | n/a | OK |
| GET | `/deltaops/auth/session` | `requireIdentity` | propia | sesión | app-layer | OK |
| POST | `/deltaops/auth/switch-tenant` | `requireIdentity` | membresía destino | valida membresía | app-layer | OK (renueva epoch) |
| POST | `/deltaops/auth/password/change` | `requireIdentity` | propia | sesión | app-layer | OK |
| POST | `/deltaops/auth/password/forgot` | pública | anti-enum (202 neutro) | tenant derivado | app-layer | Sin rate limit (H-04) |
| POST | `/deltaops/auth/password/reset` | token 1-uso | token | tenant del token | app-layer | OK |
| POST | `/deltaops/auth/invitations/accept` | token | token | tenant del token | app-layer | OK |
| GET/POST/PATCH | `/deltaops/users*` | `requireIdentity`+`requireTenantAdmin` | TENANT_ADMIN | `ctx.tenantId` | app-layer | OK (BOLA acotado al tenant) |
| POST | `/deltaops/users/:id/(de)activate,force-recovery` | idem | TENANT_ADMIN | `ctx.tenantId` | app-layer | OK |
| GET/PATCH | `/deltaops/tenant/*` | `requireIdentity`(+admin/super según ruta) | TENANT_ADMIN / SUPER_ADMIN | `ctx.tenantId` | app-layer | OK |
| GET/POST | `/deltaops/admin/tenants*` | `requireIdentity`+`requireSuperAdmin` | SUPER_ADMIN | global | app-layer | OK |

**Plataforma:**

| Método | Ruta | Auth | Authz | Riesgo |
|---|---|---|---|---|
| GET | `/deltaops/platform/health,ready,info,metrics` | **pública** | ninguna | Liveness sin datos de tenant (aceptable) |
| GET | `/deltaops/platform/{services,capabilities,dependencies,knowledge-graph,services/health,queues,jobs,logs,storage,config-defaults}` | `requireIdentity`+`requireSuperAdmin` (DGP-022.1) | SUPER_ADMIN | OK (cerrado en DGP-022.1) |
| GET | `/deltaops/platform/attachments/:id` | firma HMAC + TTL | firma | Clave = SESSION_SECRET (H-14) |

**Módulos de negocio (`/deltaops/<modulo>/…`, 12 routers):** guard `router.use(BASE, …)` que exige `req.session.deltaopsUserId`, lee la fila espejo `deltaops.users` (id, rol, tenant) y construye `ExecutionContext` con **tenant derivado del servidor** (`activos-module.ts:19-35`). Previamente `requireIdentityForModules` re-fija `deltaopsUserId` a la fila espejo por (identidad, tenant) de la sesión (`middleware.ts:94-119`) y `enforceEntitlements` rechaza módulos no contratados (403). Cada `/sync` ejecuta con el mismo ctx (`activos-module.ts:294-301`). **Tenant nunca proviene del cliente.**

**SGMA legacy (`routes/*.ts`, montado en `/api`):** `work-orders`, `assets`, `dashboard`, `spare-parts`, `locations`, `work-centers`, `technicians`, `suppliers`, `maintenance-plans`. **Sin sesión, sin tenant, sin RLS.** GET/POST/PATCH/DELETE directos sobre `public.*`. Ver H-01.

### 8.2 Búsqueda de patrones de vulnerabilidad

- **IDOR/BOLA:** los módulos filtran siempre por tenant de sesión; `identityId`/`ordenId` en query son filtros dentro del tenant (BOLA acotado al mismo tenant; no cross-tenant). No se detectó IDOR cross-tenant en superficies DeltaOps.
- **tenant enviado por frontend:** `rg "body.(tenant|tenantId)"` → **0 coincidencias** en producción. Tenant siempre server-side.
- **identityId desde body / rol desde cliente:** no se usan para autorización; el rol sale de la membresía sellada en sesión (`session-context.ts:51`).
- **fail-open:** el pipeline de módulos es fail-closed (`middleware.ts`, `enforceEntitlements` 401 si falta contexto). **Excepción:** SGMA legacy es fail-open por diseño (sin guard) → H-01.
- **errores con info sensible:** `deltaopsErrorHandler` redacta mensajes 5xx en producción (`errors.ts:33-36`). OK.
- **endpoints internos expuestos:** consola de plataforma ya cerrada (DGP-022.1); no hay `/debug`/`/internal`. **Pero** SGMA legacy es una superficie interna/prototipo expuesta públicamente (H-01).
- **UI vs backend:** el backend es la autoridad (403 real), no depende de ocultar en UI (verificado en DGP-022.1). SGMA legacy es la divergencia: no hay UI DeltaOps que lo use, pero el endpoint responde.

## 9. CORS

**Estado real:** `app.use(cors())` sin opciones (`app.ts:61`). Live: `Access-Control-Allow-Origin: *`, todos los métodos, para cualquier `Origin`. **No** emite `Access-Control-Allow-Credentials: true` (mitigante: los navegadores NO envían la cookie `deltaops.sid` en peticiones cross-origin con ACAO `*`, por lo que un sitio malicioso no puede montar peticiones autenticadas del usuario víctima vía CORS). Sin distinción por entorno.

**Política recomendada (no implementar aún):**
- **Development:** allowlist explícita (`http://localhost:*` del dev-server) con `credentials: true`.
- **Staging:** allowlist del dominio de staging, `credentials: true`, métodos mínimos.
- **Production:** allowlist estricta del/los dominio(s) de la SPA, `credentials: true`, `Access-Control-Allow-Methods` mínimos, sin wildcard. Rechazar orígenes desconocidos.

## 10. Rate limiting

**Estado real:** **inexistente.** No hay `express-rate-limit` ni equivalente en `package.json`; login/forgot no aplican límite (evidencia §5). Sin protección brute-force, sin límites de `/sync`, búsqueda, admin ni uploads (no hay uploads binarios: la plataforma es referencia-only).

**Estrategia propuesta:** limitador por IP + por identidad/tenant en superficies sensibles: login (p.ej. ventana deslizante + backoff), forgot/reset, invitations/accept, `/sync` (por tenant), búsquedas y endpoints admin. Store compartido (mismo Postgres o memoria si single-node). Combinar con auditoría de `login-fallido` (H-09) para detección.

## 11. Headers y seguridad del navegador

| Control | Estado | Nota |
|---|---|---|
| CSP | **FALTANTE** | RECOMENDADO (SPA con assets propios) |
| HSTS | **FALTANTE** | RECOMENDADO (tras confirmar HTTPS/terminación TLS) |
| X-Content-Type-Options | **FALTANTE** | RECOMENDADO (`nosniff`) |
| Referrer-Policy | **FALTANTE** | RECOMENDADO |
| Permissions-Policy | **FALTANTE** | RECOMENDADO |
| X-Frame-Options / frame-ancestors | **FALTANTE** | RECOMENDADO (anti-clickjacking) |
| `X-Powered-By` oculto | **FALTANTE** (se expone) | RECOMENDADO desactivar |
| Cookie `HttpOnly` | **YA** | `session.ts:32` |
| Cookie `SameSite=lax` | **YA** | `session.ts:33` |
| Cookie `Secure` (prod) | **YA** | `session.ts:34` (`NODE_ENV==='production'`) + `trust proxy 1` (`app.ts:40`) |
| Protección session fixation | **YA** | `req.session.regenerate()` en login/switch (`identity.ts:134`) |
| Cache-Control respuestas sensibles | **FALTANTE** | RECOMENDADO para `/auth/session`, `/users`, auditoría |

No aplica ahora: uploads binarios (referencia-only). Recomendación general: adoptar `helmet` con configuración por entorno.

## 12. Identity / Sesiones

- **bcrypt:** `bcryptjs` rounds=12 (`crypto.ts:11-14`); `esHashBcrypt` valida formato; nunca texto plano. **YA.**
- **Tokens recuperación/invitación:** 32 bytes aleatorios, base64url; se persiste solo SHA-256 (`crypto.ts:31-38`); un solo uso, expirables, ligados a tenant (`identity.ts:351-371`). **YA.**
- **Anti-enumeración:** forgot responde `202` neutro siempre (`identity.ts:313-349`). **YA.**
- **Cookie/SESSION_SECRET:** firmada; store PostgreSQL (`session.ts`); `saveUninitialized:false`, `resave:false`; `maxAge` 8h. **YA** (salvo entropía del secreto, H-13).
- **auth_epoch / invalidación global:** login y switch incrementan `auth_epoch` autoritativo del servidor y lo sellan en la sesión (`identity.ts:132-140`); el middleware rechaza `401 AUTH_STALE` si la sesión trae epoch distinta (`middleware.ts:41-43`). **Política: una sola sesión vigente por identidad.** **YA.**
- **Sesiones concurrentes:** por diseño, un nuevo login invalida sesiones previas de la misma identidad (epoch). Verificado en e2e DGP-017.

**Qué ocurre si… (fail-closed, verificado en `verificarSesionEnterprise` `middleware.ts:25-62`):**
- **Usuario desactivado con sesión activa** → identidad `DESHABILITADO` ⇒ `403 USER_DISABLED`.
- **Cambio de rol** → el rol vive en la sesión sellada; NO se refleja hasta re-login/switch (el rol de membresía cambia en BD, pero la sesión conserva `rolCanonico` hasta que expira/epoch). **Observación:** un cambio de rol no invalida la sesión (no incrementa epoch); un downgrade de privilegios no es inmediato. → considerar en roadmap.
- **Eliminar membresía** → `membresia` no ACTIVO ⇒ `403 MEMBERSHIP_INACTIVE`.
- **Cambio de tenant del usuario** → switch-tenant renueva epoch; sesiones viejas quedan stale.
- **Sube auth_epoch** → `401 AUTH_STALE` inmediato.

## 13. RLS

**Hallazgo estructural (H-02, CRÍTICO):** la aplicación se conecta como `postgres` (superusuario, `rolbypassrls=true`). En PostgreSQL, un rol con BYPASSRLS **ignora todas las políticas RLS**. Por tanto, **la RLS declarada NO se aplica en runtime**; el aislamiento por tenant descansa **enteramente** en la capa de aplicación: cada repositorio de módulo fija `set_config('app.tenant_id', …, true)` por transacción y las políticas filtran `tenant_id = current_setting('app.tenant_id')` (verificado en `pg_policy` y en `lib/module-*/src/infrastructure/repository.ts`). Como el rol bypassa RLS, esas políticas son un "cinturón" inactivo; el "tirante" real es el `WHERE`/`set_config` de la app.

**Tablas sin RLS (H-03):** `idn_identities`, `idn_memberships`, `users` (espejo legacy), `sessions`, `kernel_outbox`, `kernel_dead_letter`, `ntf_email_templates`.
- `idn_identities` es **global por diseño** (una identidad puede pertenecer a varios tenants) — RLS por tenant no aplica directamente; el aislamiento es por membresía (`idn_memberships`). **Clasificación: ACEPTABLE** para `idn_identities` como tabla global, **ALTO** para `idn_memberships`/`users` (contienen el vínculo identidad↔tenant↔rol y el espejo con `tenant`).
- `sessions`: store de express-session; no multitenant por fila. **ACEPTABLE.**
- `kernel_outbox`/`kernel_dead_letter`: sin columna tenant (evento global de plataforma) — su consola ya está restringida a SUPER_ADMIN (DGP-022.1). **MEDIO** (defensa en profundidad).

**Tablas de negocio:** `relrowsecurity=t` pero `relforcerowsecurity=f`. Aunque se corrigiera el rol a uno no-superusuario, sin `FORCE` el **owner** de la tabla también bypassa RLS. Para que RLS sea efectiva se requiere: (a) rol de aplicación **no superusuario y sin BYPASSRLS**, (b) que ese rol **no sea owner** de las tablas o que se aplique `FORCE ROW LEVEL SECURITY`.

**Impacto de habilitar RLS efectiva:** defensa en profundidad real (un bug de la app que omita `set_config`/`WHERE` dejaría de filtrar hoy; con RLS efectiva quedaría contenido). Requiere provisión de rol dedicado y revisión de que todo acceso fije `app.tenant_id` (ya se hace en repos; verificar rutas directas como identidad/consola). **No modificar en esta fase.**

**Clasificación RLS:** H-02 **CRÍTICO** (defensa en profundidad ausente por superusuario); H-03 `idn_memberships`/`users` **ALTO**; `idn_identities`/`sessions` **ACEPTABLE**; outbox **MEDIO**.

## 14. Secrets

- `SESSION_SECRET`: obligatoria, validada `min(1)` (`config.ts:14`) — **no** exige longitud/entropía ni prohíbe el default de `.env.example` en producción (H-13). Usado por express-session **y** como clave HMAC de URLs firmadas (`attachment-serve.ts:39-45`) — reutilización de clave (H-14): rotar el secreto invalida sesiones y URLs firmadas a la vez.
- `DATABASE_URL`: obligatoria; en docker-compose default `deltaops:deltaops` (dev). En producción real la provee el entorno.
- **Graph/M365:** secretos `GRAPH_*` vía entorno; sin fallback silencioso (config inválida en prod ⇒ throw al arrancar, `app.ts:34-36`).
- **Frontend:** sin `VITE_` con secretos; solo `BASE_URL` (público). **OK.**
- **Logs:** pino redacta `authorization`, `cookie`, `set-cookie` (`logger.ts:7-11`). **OK.**
- **OpenAPI/docs/bundle:** sin secretos detectados; `dist` sin source maps.
- `.env.example`: placeholders no secretos; nota "NUNCA commitee valores reales". **OK.**

**No se rotó ni cambió ningún secreto.**

## 15. Logs

- **Estructurados:** pino JSON en producción (`logger.ts`). **YA.**
- **correlationId:** presente en auditoría de identidad (`platform_audit.correlation_id`) y en logs del kernel; **no** en el log HTTP por request (serializer solo `id/method/url`, `app.ts:46-52`).
- **tenantId/identityId/opId en logs HTTP:** **FALTANTE** (H-10). El log de request no permite responder "qué tenant/quién" sin cruzar con auditoría.
- **Auditoría (`platform_audit`):** cubre eventos de identidad/tenancy (login-ok, logout, cambios de rol/estado/config/branding, tenant, módulos) con tenant_id/actor/subject/detail/occurred_at (`audit.ts`). **login-fallido declarado pero nunca escrito** (H-09).
- **Stack traces/datos sensibles:** 5xx redactados en prod; 4xx registran `err.message` (sin PII sensible evidente). **OK.**
- **Retención:** no hay política de retención/rotación documentada para `platform_audit` ni para logs.

**Capacidad de responder:** ¿qué ocurrió con una OT? → parcialmente (Timeline/eventos de módulo + auditoría de identidad). ¿Quién/cuándo/qué tenant/qué operación? → **sí para eventos de identidad**; **parcial para operaciones de módulo** (dependen del Timeline/eventos del kernel, no del log HTTP). ¿Falló o quedó pendiente? → outbox/dead_letter del kernel lo reflejan. **Gap:** correlación uniforme request↔tenant↔identidad en el plano de logs.

## 16. Backups

**GAP declarado (H-07).** No existe estrategia de backup/DR documentada en el repo: sin política de frecuencia, retención, PITR, restauración, backups de VPS/archivos/secrets, ni RPO/RTO. En Replit la BD es Neon (proveedor gestionado, que ofrece PITR/branching, pero **no está documentado ni verificado** como estrategia del programa). **No se crearon backups.** Requiere decisión de Dirección (proveedor, RPO/RTO, procedimiento de restauración probado).

## 17. Deployment

- **Artefactos:** `docker-compose.yml` + `docker/Dockerfile.api` + `docker/Dockerfile.web` (definición portable; nota explícita: "el entorno Replit no ejecuta Docker; allí corre con workflows nativos pnpm + proxy compartido").
- **Migraciones:** SQL versionadas en `lib/db/migrations/deltaops/00xx_*.sql` (hasta 0045+); en compose se montan como `docker-entrypoint-initdb.d`. Orden por numeración.
- **Rollback:** **no documentado** (H-07). No hay procedimiento de "volver a la versión anterior de forma segura" (ni estrategia de migraciones reversibles, ni versionado de releases/health-gated deploy).
- **Health checks:** `docker-compose` define healthcheck de api y db; `/platform/health` y `/platform/ready` (ready valida DB + SESSION_SECRET, `index.ts` de deltaops router). **YA** a nivel de endpoint.
- **Respuesta a "si el deploy rompe, ¿cómo volvemos?":** **no hay respuesta documentada** → decisión de Dirección.

## 18. Infraestructura

Arquitectura de producción **no documentada en repo** (H-15). En Replit: proxy compartido con terminación TLS delante del api-server (`trust proxy 1`, `app.ts:40`), puerto de app 80/8080 respondiendo. Elementos a determinar (Dirección): DNS/Cloudflare, VPS/DigitalOcean vs Replit Deployments, exposición directa del API/PostgreSQL, firewall, SSH, certificados, dominio productivo, monitoreo. **PostgreSQL (Neon) no debe exponerse públicamente** (verificar). **No se modificó infraestructura.**

## 19. Frontend

- **Bundle:** `index-*.js` ≈ **1,399 kB** (gzip 354 kB) + CSS 198 kB (build DGP-022.1). Warning de Vite por chunk >500 kB. **Sin code splitting** por ruta/módulo.
- **Source maps:** `dist/public/assets` **sin `.map`** (no se filtra código fuente). **OK.**
- **VITE_ públicas/secretos:** solo `BASE_URL` (público); sin secretos. **OK.**
- **Rutas internas/debug/consola:** la SPA redirige a `login` en 401 (autoridad backend); `/administracion/saas` deniega correctamente (DGP-022.1).
- **Service worker / PWA:** offline vía `localStorage` (cola por tenant), no service worker persistente detectado.
- **Headers:** dependen del servidor de estáticos (fuera del api-server); recomendables los de §11.

**Clasificación del bundle:** **importante, no crítico.** No bloquea piloto; afecta tiempo de carga inicial (mitigado por gzip). **Estrategia:** code splitting por módulo/ruta (dynamic `import()`), `manualChunks` para vendor, y presupuesto de tamaño. Puede ir en fase de performance (post-seguridad).

## 20. Dependencias

`pnpm audit`: **22 vulnerabilidades (14 high / 5 moderate / 3 low)**. Todas en cadenas **dev/build**: `orval`→`typedoc`/`js-yaml`/`markdown-it`/`linkify-it`/`minimatch`/`fast-uri`; `vite`→`postcss`/`nanoid`. **Ninguna** en dependencias de runtime del api-server (express, cors, express-session, bcryptjs, pino, connect-pg-simple, drizzle, zod). Impacto real: DoS/paths en herramientas de build, no en el servidor en ejecución. **Clasificación: BAJO** (H-12) — remediar por higiene (actualizar toolchain), sin urgencia de seguridad productiva. **No se instaló ni actualizó nada.**

## 21. RBAC

**Situación (H-08):** 6 roles canónicos (`SUPER_ADMIN, TENANT_ADMIN, SUPERVISOR, PLANIFICADOR, TECNICO, CONSULTA`, `rbac.ts:14-21`) se proyectan a 3 roles legacy de módulo (`admin/operador/lector`) vía `CANONICO_A_LEGACY` (`rbac.ts:32-39`): SUPERVISOR/PLANIFICADOR/TECNICO → **`operador`** (idénticos permisos de módulo); SUPER_ADMIN/TENANT_ADMIN → `admin`; CONSULTA → `lector`.

- **Dónde:** en los `principal*`/`contextFor*` de cada módulo (`reference-runtime.ts:46-78` y análogos), que reciben el rol legacy.
- **Módulos afectados:** todos los de negocio (activos, ordenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics, utilizacion, manodeobra, costos, reference).
- **¿Riesgo de escalación?** **No de seguridad cross-privilegio hacia arriba:** los tres se colapsan **hacia abajo** a un único nivel `operador` (mismo conjunto de permisos), no otorgan permisos de admin. Un TECNICO obtiene los mismos permisos de módulo que un SUPERVISOR — es **sobre-autorización lateral dentro de "operador"**, no elevación a admin. La frontera crítica (SUPER_ADMIN vs resto) es correcta y canónica (cerrada en DGP-022.1).
- **Comandos que comparten autorización:** todos los comandos de módulo gobernados por `operador` no distinguen SUPERVISOR/PLANIFICADOR/TECNICO.
- **Superficies que requieren granularidad:** flujos donde TECNICO debería ejecutar solo trabajo asignado y no planificar/aprobar (p.ej. cerrar OT ajena, aprobar cotización) — hoy comparten `operador`.

**Clasificación:** **FUNCIONAL / DEUDA TÉCNICA** (no vulnerabilidad de escalación). **Arquitectura futura:** mover de mapa canónico→legacy a **permisos por capacidad** evaluados con el rol canónico real (los roles ya son datos en `deltaops.idn_roles` por tenant), sustituyendo el colapso a 3 niveles por un conjunto de permisos por rol canónico. Requiere directiva propia (cambia significado de autorización de módulo).

## 22. Multitenancy

Auditoría sistemática (Tenant A → datos Tenant B):

| Vector | Fuente del tenant | Cliente puede influir | Veredicto |
|---|---|---|---|
| Tenant de sesión | membresía sellada al login (`identity.ts:138`) | No | OK |
| Tenant en comandos | `ExecutionContext.metadata.tenantId` derivado de la fila espejo de la sesión (`activos-module.ts:33`) | No | OK |
| Tenant en queries | idem ctx | No | OK |
| RLS | policies `app.tenant_id` **pero bypassadas por superusuario** (H-02) | — | Defensa inactiva |
| set_config por transacción | repos de módulo (`lib/module-*/repository.ts`) | No | OK (app-layer) |
| read models | mismas policies + set_config | No | OK (app-layer) |
| cache | runtime singleton sin cache cross-tenant persistente detectado | — | OK |
| offline (cola) | `localStorage` clave `deltaops:{modulo}:cola:{tenant}` (`cola.ts:25`); sync re-valida tenant server-side | No (backend re-valida) | OK (dato local, ver H-11) |
| opId | generado cliente, idempotencia; ejecución bajo ctx server | No para autorización | OK |
| logs | sin tenant en log HTTP (H-10) | — | Observabilidad, no fuga |
| Timeline/Analytics | tenant vía ctx + set_config | No | OK |
| uploads/storage | referencia-only; adjuntos por URL firmada HMAC ligada a tenant (`attachment-serve.ts:45`) | No (firma) | OK |

**Único camino real de cruce potencial:** un **bug de aplicación** que omita `set_config`/`WHERE` **no quedaría contenido por RLS** por H-02. Y **SGMA legacy (H-01) no tiene tenancy en absoluto** (esquema `public`, sin tenant). No se detectó cross-tenant explotable en las superficies DeltaOps con la lógica actual.

## 23. Offline

- **Cola:** `ColaSync` en `localStorage`, namespaced por tenant y módulo (`cola.ts:25`), con `opId` idempotente (`cola.ts:128-133`).
- **Tenant/identityId/opId:** el sync envía `{opId, comando, input}` (`cola.ts:227`) y el backend ejecuta bajo el ctx de la sesión (tenant/identidad server-side) — un dispositivo no puede sincronizar a un tenant al que la sesión no pertenece.
- **Replay/idempotencia:** `opId` evita duplicados; recibos por opId (`cola.ts:166`).
- **Expiración de sesión / usuario desactivado / cambio de permisos durante offline:** al sincronizar, si la sesión está stale (epoch) o el usuario deshabilitado, el backend responde 401/403 y las ops quedan pendientes (no se aplican). **OK** — fail-closed en el sync.
- **Dispositivo compartido / datos locales sensibles (H-11):** la cola persiste en `localStorage` en claro y **no se observa purga en logout ni en switch-tenant**; en un dispositivo compartido, datos operativos de un usuario/tenant pueden quedar accesibles al siguiente. **MEDIO.** Mitigación futura: purgar colas al logout/switch, cifrar en reposo o usar almacenamiento efímero.
- **Sync tras cambio de tenant:** las colas están separadas por clave de tenant; una cola del tenant A no se envía bajo sesión del tenant B (clave distinta + backend valida). **OK.**

## 24. Privacy

Inventario de datos personales/sensibles y tratamiento:

| Dato | Ubicación | Exposición/logs | Retención | Necesidad técnica |
|---|---|---|---|---|
| Email / nombre de identidad | `idn_identities` | en `SessionResponse` (propio); redactado en logs | sin política | necesario (login/notif) |
| Password (hash) | `idn_identities` | nunca en respuestas; bcrypt | n/a | necesario |
| Tokens recuperación/invitación | `idn_password_resets`/`idn_invitations` | solo hash persistido; claro solo al destinatario | expirable/1-uso | necesario |
| Auditoría (actor/subject/detail) | `platform_audit` | accesible a TENANT_ADMIN (su tenant) / SUPER_ADMIN | **sin política de retención** | necesario (trazabilidad) |
| Datos de trabajadores/recursos (mano de obra) | `mdo_*` | tenant-scoped | sin política | necesario (operación) |
| Documentos/adjuntos | referencia-only (metadatos + hash) | URL firmada HMAC + TTL | referencia | minimizado (no binarios) |
| Info operacional (OT, activos, etc.) | módulos `deltaops.*` | tenant-scoped | sin política | necesario |
| Cola offline | `localStorage` del dispositivo | plano, sin purga (H-11) | hasta sync/limpieza manual | necesario (offline-first) |

**Necesidades técnicas identificadas (no legales):** política de retención/rotación de auditoría y logs; minimización de PII en logs (ya redactada la de auth); purga de datos locales offline; procedimiento técnico de eliminación/exportación por identidad (derecho de acceso/olvido) — hoy inexistente. No se implementan políticas legales.

## 25. Matriz de riesgos

| ID | Hallazgo | Sev. | Prob. | Impacto | Superficie | Evidencia | Recomendación | Dependencias | Prioridad | Bloquea prod |
|---|---|---|---|---|---|---|---|---|---|---|
| H-01 | SGMA legacy sin auth (CRUD anónimo) | **CRÍTICO** | Alta | Lectura/escritura de datos sin autenticación | `/api/work-orders,/api/assets,…` | `curl 200` anónimo; `routes/work-orders.ts` sin sesión | Autenticar o retirar/aislar los routers legacy antes de exponer públicamente | Decisión: mantener o eliminar SGMA | P0 | **SÍ** |
| H-02 | DB como superusuario (BYPASSRLS) | **CRÍTICO** | Media | RLS no aplica; un bug app-layer = cross-tenant | toda la BD | `pg_roles`: `postgres t t` | Rol de app dedicado sin superuser/bypass; `FORCE RLS` | Provisión de rol + revisión set_config | P0 | **SÍ** (defensa en profundidad) |
| H-03 | Identity tables sin RLS | **ALTO** | Media | Sin contención DB en membresías/espejo | `idn_memberships,users` | `pg_class f|f|0` | Definir RLS/estrategia (junto a H-02) | H-02 | P1 | Recomendado |
| H-04 | Sin rate limiting | **ALTO** | Alta | Brute-force login/reset, abuso sync | login/forgot/sync/admin | 12×401 sin 429 | Rate limit por IP/identidad/tenant | H-09 (auditoría) | P1 | **SÍ** para prod |
| H-05 | Sin headers de seguridad | **ALTO** | Alta | XSS/clickjacking/MIME/info leak | todas las respuestas | headers live | helmet por entorno | Confirmar HTTPS (H-15) | P1 | **SÍ** para prod |
| H-07 | Sin backups/DR/rollback | **ALTO** | Media | Pérdida de datos / no recuperable | infra/DB | ausencia de docs | Estrategia backup+PITR, RPO/RTO, rollback | Decisión Dirección | P1 | **SÍ** para prod |
| H-06 | CORS wildcard | **MEDIO** | Media | Abuso sin credenciales (mitigado) | CORS | ACAO `*`, sin creds | Allowlist por entorno | Dominios prod | P2 | No (por sí solo) |
| H-08 | RBAC colapso 6→3 | **MEDIO** | Baja | Sobre-autorización lateral (no escalada) | módulos | `rbac.ts:32-39` | Permisos por rol canónico | Directiva RBAC | P2 | No |
| H-09 | login-fallido no auditado | **MEDIO** | Alta | Sin forensía brute-force | login | `rg` sin uso | Auditar fallos + alertas | — | P2 | No |
| H-10 | Logs sin tenant/identity | **MEDIO** | Alta | Trazabilidad operativa limitada | logs HTTP | serializer `app.ts:46` | Enriquecer log con ctx | — | P2 | No |
| H-11 | Offline localStorage sin purga | **MEDIO** | Media | Fuga en dispositivo compartido | frontend offline | `cola.ts:25` | Purga en logout/switch, cifrado | — | P2 | No |
| H-13 | SESSION_SECRET sin entropía mínima | **MEDIO** | Media | Secreto débil en prod | config | `config.ts:14` | Validar longitud + no-default en prod | — | P2 | Recomendado |
| H-12 | Deps dev/build vulnerables | **BAJO** | Baja | DoS en build, no runtime | toolchain | `pnpm audit` | Actualizar toolchain | — | P3 | No |
| H-14 | SESSION_SECRET reusado como HMAC | **BAJO** | Baja | Acoplamiento rotación sesión↔URLs | adjuntos | `attachment-serve.ts:39` | Clave HMAC dedicada | — | P3 | No |
| H-15 | Infra prod no documentada | **INFORMATIVO** | — | Incertidumbre operativa | infra | ausencia | Documentar topología real | Dirección | P2 | No |
| H-OBS-1 | Cambio de rol no invalida sesión | **MEDIO** | Baja | Downgrade no inmediato | sesiones | §12 | Incrementar epoch en cambio de rol | — | P2 | No |

## 26. Roadmap de hardening (fases pequeñas, sin dependencias circulares)

- **DGP-023.1 — Seguridad HTTP/API perimetral.** Objetivo: cerrar superficie pública insegura y endurecer respuestas. Alcance: H-01 (auth/retiro SGMA legacy), H-05 (helmet/headers + ocultar X-Powered-By), H-06 (CORS por entorno). Dependencias: confirmar HTTPS (parte de H-15). Riesgos: romper la SPA/clients legacy. Aceptación: SGMA legacy 401/eliminado; headers presentes; CORS allowlist; suites verdes.
- **DGP-023.2 — Autenticación/Sesiones/Anti-abuso.** Objetivo: resistir brute-force y mejorar ciclo de sesión. Alcance: H-04 (rate limiting), H-09 (auditar login-fallido), H-13 (validación SESSION_SECRET), H-OBS-1 (epoch en cambio de rol). Dependencias: 023.1 (para no exponer login sin headers). Aceptación: 429 tras N intentos; login-fallido auditado; downgrade de rol efectivo.
- **DGP-023.3 — RLS/Multitenancy (defensa en profundidad).** Objetivo: RLS efectiva. Alcance: H-02 (rol de app no-superuser + FORCE), H-03 (RLS/estrategia identidad). Dependencias: 023.1/023.2 (perímetro estable) y provisión de rol DB. Riesgos: regresiones de acceso si alguna ruta no fija `app.tenant_id`. Aceptación: rol sin bypassrls; pruebas cross-tenant fallan sin `set_config`; suites verdes.
- **DGP-023.4 — Infraestructura/Secrets.** Objetivo: topología productiva segura. Alcance: H-15 (documentar/definir infra, no exponer Postgres, TLS, dominio), H-14 (clave HMAC dedicada), estrategia de secrets prod. Dependencias: decisiones de Dirección. Aceptación: diagrama e inventario de exposición; secrets separados.
- **DGP-023.5 — Backups/DR.** Objetivo: recuperabilidad. Alcance: H-07 (backup+PITR, RPO/RTO, rollback probado). Dependencias: 023.4 (infra definida). Aceptación: restauración probada; rollback documentado y ensayado.
- **DGP-023.6 — Observabilidad.** Objetivo: trazabilidad producción. Alcance: H-10 (tenant/identity/opId/correlationId en logs), retención de auditoría/logs, alertas. Dependencias: 023.2 (eventos de auth). Aceptación: responder qué/quién/cuándo/tenant/operación/estado por consulta.
- **DGP-023.7 — Frontend/Performance/Offline.** Objetivo: bundle y datos locales. Alcance: bundle 1.4 MB (code splitting), H-11 (purga/cifrado offline). Dependencias: ninguna dura (puede ir en paralelo tras 023.1). Aceptación: chunks <presupuesto; purga en logout.
- **DGP-023.8 — Validación final de seguridad.** Objetivo: verificación integral. Alcance: re-test de todas las fases, revisión independiente, pentest ligero. Dependencias: 023.1–023.7. Aceptación: matriz de riesgos sin CRÍTICO/ALTO abiertos que bloqueen prod.

## 27. MVP de producción

- **MUST antes de piloto (controlado):** H-01 (no exponer CRUD anónimo); confirmar HTTPS y cookies Secure activas; SESSION_SECRET fuerte real (H-13, operativo aunque el código no lo valide aún); backup mínimo verificable de la BD (H-07 básico). *(El piloto puede tolerar CORS/headers si el acceso es restringido, pero H-01 no.)*
- **MUST antes de producción:** H-01, H-02, H-04, H-05, H-07 completos; H-03 (RLS identidad) resuelto o aceptado con compensación explícita; CORS allowlist (H-06).
- **SHOULD:** H-09, H-10, H-11, H-13 (validación en código), H-OBS-1, observabilidad (023.6).
- **COULD:** bundle/code splitting (023.7), H-14, remediación deps dev (H-12).
- **V2:** RBAC por permisos canónicos (H-08), políticas de retención/derecho al olvido, monitoreo/alertas avanzado, pentest formal.

Justificación: se separa **bloqueante real** (exposición sin auth, RLS inactiva, sin rate limit/headers/backups) de **mejor práctica** (granularidad RBAC, tamaño de bundle, higiene de toolchain).

## 28. Decisiones de Dirección requeridas

1. **SGMA legacy (H-01):** ¿mantener autenticado, aislar o **eliminar** los routers `public.*`? (bloquea prod).
2. **Rol de base de datos (H-02):** aprobar provisión de un rol de aplicación no superusuario + `FORCE RLS` (impacta despliegue/migraciones).
3. **Política CORS por entorno (H-06):** dominios permitidos de staging/producción.
4. **Rate limiting (H-04):** umbrales y ámbito (IP/identidad/tenant).
5. **Backups/DR (H-07):** proveedor, RPO/RTO, retención, procedimiento de restauración/rollback.
6. **Infraestructura/exposición (H-15):** Replit Deployments vs VPS/Neon; dominio productivo; no exposición de Postgres; TLS/Cloudflare; monitoreo.
7. **Estrategia de secrets (H-13/H-14):** gestor de secretos, longitud mínima, clave HMAC dedicada, rotación.
8. **Nivel de RBAC (H-08):** ¿se acepta el colapso 6→3 para piloto y se planifica granularidad para V2?
9. **Retención/privacidad (§24):** política de retención de auditoría/logs y procedimiento técnico de eliminación por identidad.
10. **Offline (H-11):** purga en logout/cifrado en dispositivos compartidos.

## 29. Criterios de aceptación (de este Discovery)

- [x] No se modificó código. — `git status`: solo el `.txt` de la directiva (untracked).
- [x] No se modificó DB. — solo consultas `SELECT`/catálogo.
- [x] No se modificaron contratos/OpenAPI.
- [x] No se modificó RBAC/RLS.
- [x] Workspace limpio salvo el documento de Discovery.
- [x] Toda afirmación crítica con evidencia (archivo:línea / salida de comando).
- [x] Riesgos clasificados (CRÍTICO..INFORMATIVO).
- [x] MVP definido.
- [x] Roadmap definido (023.1–023.8) sin dependencias circulares.
- [x] Dependencias entre fases identificadas.
- [x] Decisiones de Dirección identificadas.
- [x] Revisión independiente (§30) PASS.
- [ ] Documento commiteado — **pendiente de Dirección** (esta fase NO hace commit de implementación).

## 30. Revisión independiente (R1)

Verificación arquitectónica del propio documento:
- **Evidencia:** cada hallazgo CRÍTICO/ALTO cita archivo:línea o salida de comando reproducible (§5, §8, §13). **PASS.**
- **No se inventan controles:** los controles "YA" (bcrypt, epoch, HttpOnly/Secure/SameSite, regenerate, redacción de logs, DGP-022.1) están referenciados a código. Los ausentes (headers, rate limit, backups) se declaran FALTANTE/GAP, no supuestos. **PASS.**
- **Clasificación de riesgos:** severidades justificadas; se distingue explícitamente H-06 (mitigado por ausencia de Allow-Credentials) y H-08 (deuda funcional, NO escalada) de vulnerabilidades reales; H-01/H-02 correctamente CRÍTICO. **PASS.**
- **Preferencias vs vulnerabilidades:** bundle (H-12/§19) y toolchain se marcan importante/bajo, no vulnerabilidad bloqueante. **PASS.**
- **Roadmap ejecutable / sin ciclos:** 023.1→…→023.8 con dependencias lineales (perímetro → auth → RLS → infra → backups → obs → frontend → validación). **PASS.**
- **Ningún cambio de código:** confirmado por `git status`. **PASS.**

**R1: PASS.**

## 31. Conclusión

El Discovery está completo con evidencia. DeltaOps tiene una base de identidad/tenancy sólida a nivel de aplicación (DGP-017/DGP-022.1: sesión inmutable, epoch, fail-closed, frontera SUPER_ADMIN correcta). Para producción, existen **dos hallazgos CRÍTICOS explotables que requieren decisión de Dirección antes de implementar**:

- **H-01:** routers SGMA legacy exponen **CRUD sin autenticación** en `/api/work-orders`, `/api/assets`, etc. (datos servidos a anónimos, verificado en vivo). *Datos actuales de prototipo/demo (10+9 filas en `public.*`), pero la superficie es explotable.*
- **H-02:** la aplicación conecta a PostgreSQL como **superusuario con BYPASSRLS**, por lo que **la RLS declarada no se aplica**; el aislamiento multitenant depende exclusivamente de la capa de aplicación (sin red de seguridad en DB).

Conforme a la directiva (§ "DETENTE si encuentras algo crítico que requiera decisión de Dirección"), **NO se corrigió ninguno** — se documentan causa, impacto, evidencia, superficie, recomendación y prioridad. Le siguen ALTOS bloqueantes de producción (rate limiting, headers, backups, RLS de identidad). El roadmap propone 8 fases pequeñas; **NO iniciar DGP-023.1** ni implementar hardening hasta aprobación.

---

**DGP-023 DISCOVERY DETENIDO — DECISIÓN DE DIRECCIÓN REQUERIDA** (por H-01 y H-02, CRÍTICOS explotables). A la espera de aprobación para priorizar el roadmap e iniciar fases.
