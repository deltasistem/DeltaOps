# DELTAOPS DEPLOY-01 — DISCOVERY Y DISEÑO DE INFRAESTRUCTURA PARA PRODUCCIÓN

**Directiva:** `attached_assets/Pasted--DIRECTIVA-OFICIAL-DELTAOPS-DEPLOY-01-Discovery-y-Dise-_1787061674912.txt`
**Fecha:** 18 de agosto de 2026 · **Fase:** solo discovery — cero mutaciones ejecutadas
**Veredicto:** **DELTAOPS DEPLOY-01 — PASS** (detalle en §26–§28)

Convención de estados: ✅ VERIFICADO (evidencia archivo:línea o catálogo SQL) · 🟨 PARCIAL · ⬜ NO VERIFICADO — requiere implementación o entorno real.

---

## 1. Resumen ejecutivo

DeltaOps Lite es un monorepo pnpm con **frontend React/Vite compilado a estáticos** y un **backend Express 5 sobre Node 24** que ya posee build productivo real (bundle esbuild → `node dist/index.mjs`), health/readiness diferenciados, apagado ordenado, CORS por allowlist y una base PostgreSQL 16 con separación de roles y FORCE RLS efectiva (DGP-023.5). **Los cuatro hallazgos de infraestructura de DGP-023.6 (I-03, I-05, I-09, I-10) están corregidos en el código actual.** No se encontró ninguna dependencia de runtime hacia APIs propietarias de Replit: las dependencias reales de producción son PostgreSQL, Microsoft Graph (correo), un dominio con HTTPS y los secretos. Quedan **cero bloqueantes de arquitectura**; los pendientes son de configuración/infraestructura (secretos de producción, dominio/CORS, backups, headers de seguridad y el manejo del import de Excel sin filesystem persistente), todos asignados a fases DEPLOY-02…08.

## 2. Estado actual

- Fases funcionales LITE-01…LITE-09 + informes/exportación (FINAL-02) + correcciones pre-deploy cerradas; último commit `3fbdc33`.
- Datos: BD dev `heliumdb`, esquema `deltaops`, 295 MB; tenants `deltaops` (plataforma), `delta-demo` (demo), `delta` (productivo limpio, 28 activos reales).
- Dirección anunció (FINAL-01) una arquitectura objetivo GitHub → servidor de aplicación (p. ej. DigitalOcean) → PostgreSQL gestionado (p. ej. Neon); esta fase **no la da por confirmada**: se documenta qué exige la aplicación de cualquier proveedor (§23).

## 3. Inventario de arquitectura actual

| Componente | Detalle | Estado |
|---|---|---|
| Monorepo | pnpm workspaces: `artifacts/*`, `lib/*`, `scripts` (`pnpm-workspace.yaml:1-5`) | ✅ |
| Frontend | React 19.1 + Vite 7.3.3, SPA bajo `BASE_PATH=/deltaops/` (`artifacts/deltaops/vite.config.ts:8-31`) | ✅ |
| Backend | Express 5.2.1 (`artifacts/api-server/src/app.ts:1,36`), API bajo `/api/deltaops/*` | ✅ |
| Runtime | Node 24 (`.replit:1`, módulo `nodejs-24`); sin `engines` fijado en package.json (deuda menor) | ✅ |
| Package manager | pnpm (guard `package.json:6`); versión no fijada (deuda menor) | ✅ |
| Build backend | `node ./build.mjs` (esbuild) → `dist/index.mjs`; start `node --enable-source-maps ./dist/index.mjs` (`artifacts/api-server/package.json:6-14`) | ✅ |
| Build frontend | `vite build` → `dist/public`; exige env `PORT` y `BASE_PATH` (`vite.config.ts:8-28`) | ✅ |
| Servidor HTTP dev | workflows Replit (dev); prod actual: config `artifact.toml` (API run node dist; frontend estático con rewrite SPA) | ✅ |
| Libs internas | `lib/db, kernel, platform, workflow-engine, dynamic-forms, business-foundation, design-system, api-zod/api-spec/api-client-react, module-*` (12 módulos de dominio); consumidas desde `src` vía TS project references — el bundle esbuild del API las embebe | ✅ |
| Librerías críticas | drizzle-orm 0.45.2, zod 3.25.76, exceljs 4.4.0, pg, express-session + connect-pg-simple, pino (`pnpm-lock.yaml`, `artifacts/api-server/package.json:34-59`) | ✅ |
| Autenticación | Propia (Identity DGP-017): sesiones server-side en PG, RBAC por membresías; sin IdP externo | ✅ |
| Sesiones | `express-session` + `connect-pg-simple`, tabla `deltaops.sessions` (`src/deltaops/session.ts:18-36`) | ✅ |
| PostgreSQL | 16.10, esquema `deltaops` (§4) | ✅ |
| Correo | Microsoft Graph client-credentials (`m365-graph-email.ts`) + outbox `ntf_email_outbox` | ✅ |
| QR | Códigos opacos resueltos por API (`lib/platform/src/services/qr.ts:35-121`); sin imágenes ni URLs absolutas | ✅ |
| Storage binario | No hay: adjuntos referencia-only; exportes en memoria (§8) | ✅ |
| Otros servicios externos | Ninguno adicional detectado en runtime | ✅ |

## 4. PostgreSQL — arquitectura actual (catálogo SQL, solo lectura)

- Proveedor actual: PostgreSQL gestionado por Replit (Helium). Motor: **PostgreSQL 16.10**. BD `heliumdb`, esquema `deltaops`, **174 tablas**, todas con owner `deltaops_owner`; 1 secuencia; extensiones: solo `plpgsql`; tamaño 295 MB. ✅
- Conexión runtime: URL compuesta desde `PGHOST/PGPORT/PGDATABASE` + `deltaops_app`/`DELTAOPS_APP_PASSWORD` (`lib/db/src/runtime-connection.ts:41-73`). ✅
- Dependencias específicas del proveedor: ninguna en SQL (sin extensiones exóticas, sin features Helium); la dependencia es operativa (backups/PITR del panel Replit). ✅

## 5. Roles y RLS (confirmación DGP-023.5)

| Rol | super | bypassrls | createrole | createdb | replication | login | owner de objetos |
|---|---|---|---|---|---|---|---|
| `deltaops_owner` | f | f | f | f | f | t | sí (174/174) |
| `deltaops_app_rw` | f | f | f | f | f | f | no |
| `deltaops_app` | f | f | f | f | f | t | **no (0 objetos)** |

✅ Confirmado por `pg_roles`/`pg_tables`. RLS: **167/174 tablas con RLS**, **166 con FORCE** (única excepción deliberada: `ten_tenants`, requerida por la función SECURITY DEFINER de N-1). Las 7 tablas globales sin RLS por diseño: `users` (legacy), `sessions`, `kernel_outbox`, `kernel_dead_letter`, `ntf_email_templates`, `idn_memberships`, `idn_identities`. Funciones SECURITY DEFINER: exactamente 1 (`tenants_para_super_admin`). Rol de migraciones **objetivo**: `deltaops_owner` — drizzle.config compone su URL con `DELTAOPS_OWNER_PASSWORD` **solo si existen owner password/host/BD; si faltan, cae a `DATABASE_URL`** (`lib/db/drizzle.config.ts:15-25`). El rol efectivo en un entorno concreto depende por tanto de sus variables (⬜ NO VERIFICABLE sin el entorno de producción; ver riesgo R-6).

## 6. Variables de entorno y secrets (sin valores)

| Nombre | Origen | Oblig. | Entorno | Componente | Riesgo si falta |
|---|---|---|---|---|---|
| `DATABASE_URL` | secret | Sí | todos | config API + fallback dev de pool (`lib/db/src/index.ts:8-12`) | no arranca |
| `PGHOST`/`PGDATABASE`/`PGPORT` | proveedor PG | Sí (PGPORT opc., def. 5432) | todos | composición URL runtime (`runtime-connection.ts:28-42`) | prod no arranca (fail-fast) |
| `DELTAOPS_APP_PASSWORD` | secret | **Sí en prod** | prod | pool runtime mínimo privilegio | **prod no arranca (deliberado)** |
| `DELTAOPS_APP_USER` | env | No (def. `deltaops_app`) | todos | pool runtime | — |
| `DELTAOPS_OWNER_PASSWORD` (+`_USER`, `DELTAOPS_DB_ROLE`) | secret | Solo migraciones/mantenimiento | ops | drizzle + conexión admin | migraciones caen a `DATABASE_URL` (ver riesgo R-6) |
| `SESSION_SECRET` | secret | Sí | todos | sesiones (`config.ts:14`) + fallback HMAC adjuntos | no arranca (fail-fast en config; el check de `/ready` es defensivo, inalcanzable si el arranque ya falló) |
| `ATTACHMENT_URL_SECRET` | secret | No (fallback `SESSION_SECRET`) | prod rec. | URLs firmadas adjuntos (`lib/platform/src/services/attachment.ts:23-33`) | rotar SESSION_SECRET invalida URLs (I-02) |
| `PORT` | plataforma | Sí (sin default) | todos | arranque HTTP (`src/index.ts:5-17`) | no arranca |
| `BASE_PATH` | build | Sí (build frontend) | build | `vite.config.ts:8-28` | build falla |
| `NODE_ENV` | plataforma | No (def. development) | todos | cookies Secure, errores, fail-fast pool, seeds | **prod sin `production` = modo dev inseguro** |
| `CORS_ORIGINS` | config | No | prod si hay orígenes cruzados | allowlist CORS (`app.ts:77-95`) | prod queda same-origin-only (seguro por defecto) |
| `LOG_LEVEL` | config | No (def. info) | todos | pino | — |
| `NOTIFICATION_PROVIDER` | config | **Sí en prod** (`m365-graph`) | prod | proveedor correo (`notification-provider.ts:57-130`) | prod falla (fake prohibido en prod) |
| `GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`GRAPH_CLIENT_SECRET`/`GRAPH_SENDER` | secrets | Sí si Graph activo | prod | correo Graph (`m365-graph-email.ts:65-78`) | correo inoperante |
| `GRAPH_OAUTH_TOKEN_ENDPOINT`/`GRAPH_BASE_URL`/`GRAPH_OAUTH_SCOPE`/`GRAPH_TIMEOUT_MS`/`GRAPH_MAX_REINTENTOS` | config | No (defaults) | prod | correo Graph | — |
| `DELTAOPS_ADMIN_PASSWORD` + `DEMO_*_PASSWORD` (5) | secrets | **Sí en prod** si se ejecuta seed | seed | credenciales seed (`seed-credentials.ts:17-54`) | seed falla en prod (deliberado) |
| `M365_CLIENT_ID`/`M365_CLIENT_SECRET`/`M365_TENANT_ID`/`M365_MAIL_FROM` | secrets existentes | — | — | **sin consumo en código (legado, I-09b)** | ninguno — no migrar a prod |
| `DATABASE_MIGRATION_URL` | — | — | — | **no existe ni se consume** | n/a |

**Hallazgo I-03 — CORREGIDO ✅:** en producción, si falta `DELTAOPS_APP_PASSWORD` el pool **lanza error y no cae a `DATABASE_URL`** (`lib/db/src/runtime-connection.ts:75-83`, mensaje explícito «No se permite el fallback a la conexión admin»); el fallback a `DATABASE_URL` solo existe fuera de producción (`:86-87`). Residuo: el fallback análogo de `drizzle.config.ts:20-25` para **migraciones** sí persiste (riesgo R-6, medio: las migraciones son operación de owner de todos modos).

## 7. Configuración de producción (auditoría, sin cambios)

| Aspecto | Estado actual | Evidencia |
|---|---|---|
| NODE_ENV | fail-fast/derivaciones correctas por entorno | `config.ts:10-12` |
| CORS (**I-05 CORREGIDO ✅**) | allowlist `CORS_ORIGINS` con `credentials:true`; en prod sin allowlist queda cerrado (same-origin/sin Origin); dev permisivo | `app.ts:74-95` |
| Cookies | `deltaops.sid`, httpOnly, SameSite=Lax, **Secure solo con NODE_ENV=production**, maxAge 8 h | `session.ts:20-36` |
| trust proxy | `app.set("trust proxy", 1)` — 1 salto confiable | `app.ts:45-47` |
| Headers/CSP | **No hay helmet ni CSP** — acción DEPLOY-04 (requiere cambio de código o cabeceras en el proxy) | `app.ts` (ausencia) |
| Sesiones | server-side en PG (`connect-pg-simple`), sin auto-create de tabla | `session.ts:18-27` |
| Errores | handler central: 5xx en prod → mensaje genérico, sin stack | `errors.ts:33-37` |
| Excepción | rutas de históricos devuelven `e.message` en 500 (posible fuga de mensajes internos) — R-7 | `historicos-module.ts:117-120,198-269` |
| Logs | pino JSON en prod, redacta Authorization/Cookie/Set-Cookie; stdout | `lib/logger.ts:5-19` |
| Graceful shutdown (**I-10 CORREGIDO ✅**) | SIGTERM/SIGINT → server.close + espera + pool.end + timeout 10 s | `src/index.ts:37-71` |
| Health gate (**I-09 CORREGIDO ✅**) | deployment del API usa `/api/deltaops/platform/ready` como startup health | `artifacts/api-server/.replit-artifact/artifact.toml:31-34` |
| Timeouts | Graph 15 s configurable; sin timeout HTTP global explícito de Express (por defecto de Node) — revisar en DEPLOY-04 | `m365-graph-email.ts:86` |

Resumen DGP-023.6: **I-03 ✅ corregido (código) · I-05 ✅ corregido (código+config) · I-09 ✅ corregido (config) · I-10 ✅ corregido (código)**. Pendientes heredados: I-02 (clave HMAC separada — solo config: definir `ATTACHMENT_URL_SECRET`), I-08 (`.gitignore` sin `.env` — cambio trivial de archivo, diferido), headers/CSP (código o proxy).

## 8. Health check y readiness

- `/api/deltaops/platform/health`: responde siempre `ok` + timestamp; no toca PG ni secrets → **liveness** ✅ (`routes/deltaops/index.ts:18-25`).
- `/api/deltaops/platform/ready`: `SELECT 1` a PostgreSQL + presencia de `SESSION_SECRET`; 200/503 → **readiness y deployment gate** ✅ (`routes/deltaops/index.ts:27-69`).
- Recomendación producción: liveness=`/health`, readiness y gate de despliegue=`/ready` (ya es así en la config actual). Mejora opcional (DEPLOY-04): que `/ready` verifique también `NOTIFICATION_PROVIDER` productivo.

## 9. Build y arranque productivo

```
Build backend:   pnpm --filter @workspace/api-server run build        # node ./build.mjs (esbuild → dist/index.mjs)
Start backend:   node --enable-source-maps ./dist/index.mjs           # requiere PORT, NODE_ENV=production, secrets §6
Build frontend:  PORT=<n> BASE_PATH=/deltaops/ pnpm --filter @workspace/deltaops run build   # → dist/public (estáticos)
Servir frontend: cualquier servidor estático con rewrite SPA a /deltaops/index.html
Health:          /api/deltaops/platform/health
Ready:           /api/deltaops/platform/ready
```
✅ Verificado (`package.json` de ambos artifacts, `vite.config.ts:8-31`, artifact.toml de ambos). Proceso: 1 proceso Node único, sin workers/cluster (adecuado al tamaño; escalar vertical primero). El frontend NO necesita Node en producción: es estático. La config de despliegue existente es específica de Replit (`artifact.toml`); para otro proveedor se replican estos mismos comandos.

## 10. Almacenamiento de archivos

| Contenido | Clasificación | Evidencia |
|---|---|---|
| Adjuntos/evidencias/imágenes/PDF | **REFERENCIA-ONLY** (solo metadatos/hash en BD; el endpoint firmado HMAC devuelve metadatos, no binarios — no se almacena ni sirve archivo alguno) | `attachment.ts:18-33,53-108`, `attachment-serve.ts:77-87` |
| Exportes CSV/XLSX de informes | **EN MEMORIA** (se generan y transmiten; no tocan disco) | FINAL-02; `exceljs` en API |
| Excel históricos — archivos de servidor | **LOCAL** (`attached_assets/`, solo dev) | `historicos-module.ts:32-39,130-143` |
| Excel históricos — subida de usuario | **LOCAL EFÍMERO** (`os.tmpdir()/deltaops-historicos-subidas`, límite 25 MB, + variante base64 en memoria) | `historicos-module.ts:35-39,97-114,151-178,243-266` |
| QR | **NO ALMACENADO** (código opaco resuelto por API) | `qr.ts:35-121` |
| Reportes/documentos generados | NO IMPLEMENTADO (no existen) | — |

Confirmado el hallazgo DGP-023.6: la aplicación **no requiere filesystem persistente**. Única salvedad (R-3): el import de Excel por subida usa tmp efímero; es válido si análisis→confirmación→importación ocurren en la misma sesión de proceso, pero un reinicio entre pasos lo invalida. Para producción: importar en una sola operación o usar la variante base64/en memoria; no depender de tmp entre despliegues.

## 11. Correo y Microsoft Graph

- Usos de correo: invitaciones de usuarios, recuperación de contraseña (identity), plantillas en `ntf_email_templates`, outbox `ntf_email_outbox`; tipo `ot-por-vencer` declarado pero **futuro** (`email.ts:31-35`). ✅
- Autenticación: OAuth2 client-credentials contra el tenant M365 (`GRAPH_*`, §6); permisos de aplicación de envío (Mail.Send del remitente `GRAPH_SENDER`). ✅ (permiso exacto en Azure: ⬜ NO VERIFICADO desde el código — validar en DEPLOY-03.)
- ¿Arranca sin Graph? Sí en dev/test (provider `fake`); **en producción `NOTIFICATION_PROVIDER` inválido o `fake` provoca error** (`notification-provider.ts:103-130`) → Graph es requisito de producción para flujos de invitación/recuperación. Si Graph está caído en runtime, el envío falla y queda el registro en outbox; la app no cae. ✅

## 12. Dominio y HTTPS

Lo que la aplicación exige del dominio (sin elegir ninguno):
- Frontend y API pueden convivir bajo **un mismo origen** (SPA en `/deltaops/`, API en `/api/`): es el escenario recomendado — sin CORS cruzado, cookies first-party SameSite=Lax. Candidatos citados por Dirección: `deltaops.deltalogistica.com.co` o `mantenimiento.deltalogistica.com.co` (no se elige aquí).
- HTTPS obligatorio: cookie `Secure` activa con NODE_ENV=production; `trust proxy=1` espera exactamente un proxy de confianza delante (revisar si hay dos saltos — Cloudflare + proxy local — en DEPLOY-05).
- No hay URLs absolutas horneadas: navegación por `import.meta.env.BASE_URL`, QR sin URL, correos usan plantillas (la URL pública de invitación/recuperación se configura por entorno — validar variable/plantilla en DEPLOY-03 ⬜).
- `CORS_ORIGINS` solo será necesaria si el frontend se sirve desde un origen distinto al API.

## 13. Cloudflare (configuración eventual, no ejecutada)

- DNS: registro A/CNAME del subdominio elegido → servidor de aplicación; proxy naranja opcional.
- SSL/TLS: modo **Full (strict)** (el origen debe tener certificado válido — Let's Encrypt/Caddy/certbot).
- Cache: NO cachear `/api/*` (regla de bypass); estáticos del SPA cacheables salvo `index.html` (revalidar).
- WAF: reglas gestionadas estándar; excluir de challenge las rutas `/api/deltaops/*` usadas por la app autenticada.
- Límites de subida: la aplicación exige aceptar cuerpos de hasta 25 MB (import de Excel). Verificar el límite del plan Cloudflare contratado (⬜ NO VERIFICADO — no se asume plan alguno); los límites usuales de los planes básicos (≈100 MB) serían suficientes.
- WebSockets: **no existen** en la aplicación (Express puro, sin ws) — nada que configurar.
- Headers: puede añadir HSTS/security headers si no se hace en el origen (complemento de §7).

## 14. Servidor — requisitos reales

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB (proceso Node único + margen) | 2 GB (holgura para import Excel/exportes grandes) |
| Disco | 10 GB (app + logs; BD externa) | 25 GB |
| SO | Linux x86_64 (Ubuntu LTS o equivalente) | ídem |
| Runtime | Node 24 + pnpm | ídem, versiones fijadas |
| PostgreSQL | externo/gestionado (recomendado) | gestionado con PITR |
| Proxy/SSL | Caddy o Nginx+certbot (a decidir en DEPLOY-04) | Caddy (TLS automático) |
| Proceso | systemd o PM2 (a decidir en DEPLOY-04) | systemd |
| Logs | stdout → journald/rotación | + retención 30 d |
| Monitorización | curl a `/ready` (cron/uptime externo) | uptime externo + alerta correo |

Base del dimensionamiento: BD actual 295 MB con todo el histórico; decenas de usuarios concurrentes como techo realista; sin workers ni jobs pesados residentes. No se recomienda Docker ni Kubernetes: sobredimensionados para esta escala.

## 15. Backups y recuperación (diseño conceptual)

- **PostgreSQL:** si es gestionado, PITR del proveedor (retención ≥7 días) + `pg_dump` lógico diario retenido 30 días fuera del servidor de BD. Si es autogestionado: `pg_dump` diario + verificación de restauración mensual a instancia separada.
- **Antes de cada migración de esquema y de cada importación histórica:** dump manual etiquetado (la importación es idempotente y re-ejecutable desde fuentes, pero el dump da rollback inmediato).
- **Rollback de aplicación:** git tag por release + redeploy del tag anterior (el backend es un bundle autocontenido; el frontend, estáticos versionados).
- **Rollback de datos:** restaurar dump/PITR a instancia separada y promover; nunca sobre-escribir producción sin copia.
- Estado actual (dev): PITR de Replit 7/28 días (PDC-01). Ensayo real de restore: ⬜ NO VERIFICADO — programado para DEPLOY-02.

## 16. Seguridad (confirmaciones)

- Autoridad de seguridad = **backend**: RBAC por sesión servidor + RLS/FORCE RLS en BD (defensa en profundidad, dos capas independientes). Ocultar módulos en frontend es solo UX (principio ya establecido en LITE-06: ocultar ≠ eliminar). ✅
- PostgreSQL: mínimo privilegio verificado (§5); login por tablas sin RLS por diseño + 1 función SECURITY DEFINER controlada. ✅
- Secrets: gestor de la plataforma; cero credenciales literales en repo (auditorías DGP-022/023). ✅
- Sesiones/cookies/CORS/errores/logs: §7. Uploads: límite 25 MB y parser en memoria; Excel se procesa con exceljs (sin macros ejecutables); CSV de exportación con protección anti-fórmulas (FINAL-02). ✅
- Nota DGP-022 (PLATFORM-CONSOLE-ACL, crítico entonces): las rutas `/platform/*` de consola quedaron bajo el cierre RLS/roles de DGP-023.5 y la auditoría pre-deploy no lo reprodujo; aun así se ordena **reprueba explícita por rol vía API directa en DEPLOY-07** (⬜ NO VERIFICADA en esta fase — solo lectura no concluyente sin ejercitar cada ruta).

## 17. Dependencias de producción

| Dependencia | Uso | Obligatoria | Proveedor | Riesgo | Acción |
|---|---|---|---|---|---|
| PostgreSQL 16 | datos, sesiones, outbox | Sí | por decidir (gestionado rec.) | pérdida datos; migración delicada | DEPLOY-02 + backups §15 |
| Node 24 + pnpm | runtime/build | Sí | servidor propio | drift de versiones | fijar engines en DEPLOY-04 |
| Microsoft Graph | correo (invitación/recuperación) | Sí (prod) | Microsoft 365 propio | correo caído → no onboarding | DEPLOY-03 (secrets+permisos) |
| Dominio + DNS | acceso | Sí | registrador actual | — | DEPLOY-05 |
| HTTPS/TLS | cookies Secure | Sí | Cloudflare/Let's Encrypt | mal config → sesiones rotas | DEPLOY-05 |
| Cloudflare | DNS/WAF/cache | Opcional (recomendado) | Cloudflare | bypass cache API | DEPLOY-05 |
| Storage externo | — | **No requerido** | — | — | — |
| Replit | solo desarrollo | No (prod) | — | ninguna API de runtime usada | mantener como entorno dev |

Clasificación de dependencias del entorno actual (§3 de la directiva): Replit workflows/artifact.toml/plugins vite = **C (solo desarrollo)** o **B (reemplazable)**; PostgreSQL Helium = **B (reemplazable con validación)**; secrets Replit = **B**; `M365_*` = **D (legado)**; filesystem local = solo import Excel (**B**, §10). Ninguna **A** exclusiva del proveedor actual.
**Validación requerida para migrar PostgreSQL** (no asumir trivial): volcado/restauración completa de esquema + roles (`deltaops_owner/app_rw/app` deben recrearse manualmente: `pg_dump` no exporta roles), políticas RLS/FORCE (verificar con catálogo tras restore), `search_path`, colación/encoding (es_CO/UTF-8), versión ≥16, y re-ejecución de la suite de aislamiento como `deltaops_app`.

## 18. Estrategia de migración (conceptual)

DESARROLLO → STAGING → PRODUCCIÓN
- **Se recrea** (nunca se copia de dev): esquema vía migraciones SQL versionadas, roles PG (con contraseñas nuevas), secrets (todos rotados: los valores de dev se consideran quemados), tenant productivo, usuarios reales por invitación.
- **Se copia**: nada de datos de dev. `delta-demo`, tenants `e2e-plat-*` y tabla legacy `users` **no viajan** a producción.
- **Se migra por re-importación**: los históricos se cargan desde los Excel fuente con el importador oficial (procedimiento validado en pre-deploy: crear tenant → sembrar catálogos base → importar → drenar outbox), no por copia de filas.
- **Se valida** en staging: `/ready`, login, RBAC por rol, aislamiento multi-tenant como `deltaops_app`, cadena informes/export, correo real de invitación.
- **Se respalda**: dump antes de cada migración e importación (§15).
- **Cuándo importar históricos**: tras estabilizar esquema+secrets+dominio (DEPLOY-06), antes de las pruebas de aceptación.

## 19. Datos históricos (implicaciones, sin ejecutar)

El importador existente ya cumple los requisitos de la directiva, verificado en las fases LITE-09/pre-deploy: preserva fechas reales de los Excel; sella la fecha/lote de importación y el marcador `_origen` histórico en contexto; trazabilidad por lote/archivo en observaciones; **no fabrica OTs retroactivas** (los mantenimientos históricos son registros de historia, no OTs vivas), no fabrica imágenes ni inventa datos (exclusiones explícitas y filas inválidas reportadas); distingue histórico de dato vivo. Implicaciones conocidas: identidad de operador ausente (Forms anónimo), 62 % de lecturas marcadas inconsistentes por retrocesos reales de horómetro (se preservan y marcan), fechas en formatos mixtos normalizadas en la frontera, unidades al canónico. Repuestos/técnicos/rutinas: los Excel fuente no traen maestros — no se inventan.

## 20. Producción multi-centro

Soporte existente (✅ verificado): multiempresa por **tenant** (frontera dura de datos); activos llevan `centroCosto`, `ubicacionId/ubicacionEtiqueta`, `responsable`, `codigoEmpresarial` en su contrato dinámico (`plantillas.ts:40-97`) y las OTs los heredan (`correctivo-runtime.ts:85-115`); usuarios sin campo de centro (correcto: la asignación es por activo/OT, no por usuario). **No existe ni se impone un coordinador por centro**: los roles son por tenant y las capacidades Lite por rol canónico. Conclusión: la operación multi-centro real de Delta se modela con los campos de activo existentes; no se requiere estructura organizacional nueva y no debe inventarse.

## 21. Planes y rutinas

Confirmado ✅: el flujo productivo es RUTINAS → medidores (horómetro/km) → **consulta de estado/semáforo** (`planes-module.ts:108-133`, consulta pura, comentario explícito «no genera OT», fail-closed sin medidores) → **generación explícita de mantenimiento** por comando (`preventivo-module.ts:149-153`, `POST /preventivo/generar`, con vínculo generación→OT). **No existe** «rutina vencida → OT automática», conforme a la regla definida. La notificación de vencimiento (`ot-por-vencer`) está declarada pero no implementada (futuro, no bloqueante).

## 22. Inventario

Confirmado ✅: el inventario **no** es dependencia obligatoria del mantenimiento — el **cierre de sesión de trabajo** no valida existencias ni consumos (`ordenes-module.ts:326-345`), y reserva/consumo/devolución son operaciones separadas y opcionales (`correctivo-module.ts:170`). Para la transición de cierre de la OT rige la misma composición del motor de órdenes sin puerto de inventario; esto se reafirmó funcionalmente en LITE-07 («inventario no bloquea cierre de OT») y se re-verificará en las pruebas de aceptación (DEPLOY-07). El **proveedor es dato transaccional snapshot** (texto en históricos `historicos-runtime.ts:584-592`; valoraciones inmutables en costos), sin exigir maestro complejo por compra.

## 23. Matriz de riesgos

| # | Riesgo | Sev. | Evidencia | ¿Bloquea? | Acción |
|---|---|---|---|---|---|
| R-1 | Secretos de producción inexistentes (Graph, DB, SESSION_SECRET nuevos; los de dev quemados) | 🟠 ALTO | §6 | Sí, para desplegar (no para esta fase) | DEPLOY-03: crear/rotar todos |
| R-2 | Sin headers de seguridad/CSP en API ni frontend | 🟡 MEDIO | §7 | No | DEPLOY-04: helmet o headers en proxy |
| R-3 | Import Excel por subida usa tmp efímero entre análisis e importación | 🟡 MEDIO | §10 | No | DEPLOY-06: importar en una operación / base64 |
| R-4 | `trust proxy=1` con posible doble salto (Cloudflare+proxy local) | 🟡 MEDIO | `app.ts:45-47` | No | DEPLOY-05: ajustar según topología real |
| R-5 | I-02: HMAC de adjuntos cae a `SESSION_SECRET` | 🟡 MEDIO | `attachment.ts:29-33` | No | DEPLOY-03: definir `ATTACHMENT_URL_SECRET` |
| R-6 | drizzle.config puede caer a `DATABASE_URL` para migraciones | 🟡 MEDIO | `drizzle.config.ts:20-25` | No | DEPLOY-02: exigir owner explícito en prod |
| R-7 | Rutas de históricos devuelven `e.message` en 500 | 🟢 BAJO | `historicos-module.ts:117-269` | No | DEPLOY-04 (cambio de código menor) |
| R-8 | Versiones Node/pnpm no fijadas (engines) | 🟢 BAJO | §3 | No | DEPLOY-04 |
| R-9 | Reprueba PLATFORM-CONSOLE-ACL post-RLS pendiente | 🟡 MEDIO | §16 | No (mitigado por RLS) | DEPLOY-07: API directa por rol |
| R-10 | Ensayo de restore de backup jamás ejecutado | 🟠 ALTO | §15 | Sí, antes de cutover | DEPLOY-02 |
| R-11 | `.gitignore` sin `.env` (I-08) | ⚪ DEUDA | DGP-023.6 | No | DEPLOY-03 |
| R-12 | Sin monitorización/alertas | 🟡 MEDIO | §14 | No | DEPLOY-04 |

Sin riesgos 🔴 BLOQUEANTES de discovery. R-1 y R-10 son bloqueantes *del cutover*, no de continuar las fases.

## 24. Checklist pre-producción

**A. Aplicación:** build backend real ✅ VERIFICADO · build frontend estático ✅ · start productivo documentado ✅ · headers/CSP ⬜ REQUIERE CAMBIO · engines fijados ⬜ REQUIERE CAMBIO · fuga e.message históricos ⬜ REQUIERE CAMBIO.
**B. PostgreSQL:** roles mínimos ✅ · FORCE RLS ✅ · migraciones versionadas ✅ · proveedor prod elegido ⬜ NO VERIFICADO · restore ensayado ⬜ NO VERIFICADO · migración validada como `deltaops_app` ⬜ NO VERIFICADO.
**C. Secrets:** inventario completo ✅ · valores de producción creados/rotados ⬜ NO VERIFICADO · `ATTACHMENT_URL_SECRET` definido ⬜ REQUIERE CAMBIO (solo config) · limpieza `M365_*` ⬜ REQUIERE CAMBIO.
**D. Seguridad:** RBAC+RLS doble capa ✅ · errores sin stack en prod ✅ · CORS allowlist ✅ · cookies Secure/Lax/httpOnly ✅ · reprueba ACL consola ⬜ NO VERIFICADO.
**E. Servidor:** requisitos definidos ✅ · aprovisionado ⬜ NO VERIFICADO · proxy/SSL ⬜ NO VERIFICADO · systemd/PM2 ⬜ NO VERIFICADO.
**F. Dominio:** requisitos definidos ✅ · subdominio elegido ⬜ NO VERIFICADO · URL pública en plantillas de correo validada ⬜ NO VERIFICADO.
**G. Cloudflare:** requisitos definidos ✅ · configurado ⬜ NO VERIFICADO · bypass cache `/api/*` ⬜ NO VERIFICADO.
**H. Backups:** diseño ✅ · política implantada ⬜ NO VERIFICADO · restore ensayado ⬜ NO VERIFICADO.
**I. Datos históricos:** importador validado ✅ · procedimiento tenant limpio validado ✅ · importación en prod ⬜ NO VERIFICADO.
**J. Usuarios:** flujo invitación validado ✅ · usuarios reales creados ⬜ NO VERIFICADO · credenciales demo fuera de prod ⬜ NO VERIFICADO.
**K. Pruebas:** suites PG ✅ · E2E navegador/móvil ✅ (dev) · aceptación en staging/prod ⬜ NO VERIFICADO.
**L. Rollback:** app por tag+redeploy ✅ (diseño) · datos por dump/PITR ⬜ NO VERIFICADO (ensayo).

## 25. Arquitectura objetivo y roadmap

**ACTUAL:** Replit dev (workflows) → Vite dev + tsx → PG Helium (heliumdb/deltaops).
**CAMBIOS NECESARIOS:** código: headers de seguridad, engines, R-7 (menores) · configuración: secrets nuevos §6, `NOTIFICATION_PROVIDER=m365-graph`, `CORS_ORIGINS` si aplica, NODE_ENV=production · infraestructura: servidor + proxy TLS + PG gestionado · datos: migraciones + re-importación histórica al tenant productivo · DNS: subdominio + Cloudflare · secrets: rotación total.
**OBJETIVO:** Usuario → HTTPS (dominio Delta) → Cloudflare → proxy TLS del servidor → [estáticos SPA `/deltaops/` + API Node `/api/`] → PostgreSQL 16 gestionado (roles owner/app_rw/app + FORCE RLS) · correo saliente vía Microsoft Graph.

**Orden de fases recomendado (sin fusiones):**
1. **DEPLOY-02 PostgreSQL** — elegir proveedor, recrear esquema/roles/RLS, validar aislamiento como `deltaops_app`, ensayar restore (cierra R-6, R-10).
2. **DEPLOY-03 Secrets/configuración** — crear/rotar todos los secretos, `ATTACHMENT_URL_SECRET`, permisos Graph, limpieza `M365_*` (cierra R-1, R-5, R-11).
3. **DEPLOY-04 Servidor/aplicación** — aprovisionar, systemd, proxy, headers, engines, R-7, monitorización (cierra R-2, R-7, R-8, R-12).
4. **DEPLOY-05 Dominio/Cloudflare/HTTPS** — DNS, TLS full-strict, bypass `/api/*`, trust proxy según topología (cierra R-4).
5. **DEPLOY-06 Datos históricos** — tenant productivo + catálogos + importación única + drenaje + reproyección (cierra R-3).
6. **DEPLOY-07 Pruebas de aceptación** — staging completo: RBAC/aislamiento/ACL por API directa, informes/export, correo real, piloto (cierra R-9).
7. **DEPLOY-08 Cutover** — dump previo, publicación, verificación `/ready`, usuarios reales, apagón controlado del acceso dev.

No se fusionan fases: cada una tiene un rollback y un responsable de decisión distintos (proveedor BD, secretos, infraestructura, DNS); la evidencia no muestra ahorro real que justifique acoplarlas.

## 26. Criterios de aceptación (§25 de la directiva)

1–14: arquitectura real ✅ · dependencias ✅ · estrategia PostgreSQL ✅ · secrets sin valores ✅ · cambios necesarios ✅ · requisitos de servidor ✅ · dominio/HTTPS ✅ · Cloudflare ✅ · backups ✅ · migración de datos ✅ · riesgos ✅ · checklist ✅ · orden de ejecución ✅ · bloqueantes ocultos: no se detectaron (los ⬜ están enumerados y asignados a fases).

## 27. Revisión independiente

Se ejecutó una revisión independiente del propio discovery (agente revisor separado) contrastando arquitectura, PostgreSQL, roles, RLS, secrets, build/runtime, health, storage, dominio, seguridad, backups y migración contra el código y el catálogo SQL. Las contradicciones detectadas se corrigieron **en este documento** (no en código), conforme a la directiva; el detalle queda en el registro de la sesión.

## 28. Conclusión ejecutiva

**DELTAOPS DEPLOY-01 — PASS.** La aplicación está arquitectónicamente lista para producción: build productivo real, seguridad en dos capas verificada, sin dependencias propietarias de runtime y con los cuatro hallazgos de infraestructura de DGP-023.6 corregidos. No existen bloqueantes de discovery. Los bloqueantes del *cutover* son operativos y están asignados: secretos de producción (DEPLOY-03) y ensayo de restore (DEPLOY-02). **Fase siguiente recomendada: DEPLOY-02 (PostgreSQL de producción).** Nada fue modificado en código, base de datos, secrets, DNS ni configuración durante esta fase.
