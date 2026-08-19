# DELTAOPS LITE · Manual de Operación (§26)

> **Alcance.** Guía operativa para desarrollo, staging y producción de DeltaOps.
> Redactada en español formal. **No contiene secretos reales**: donde se
> menciona un secreto se indica únicamente su **nombre** y su propósito.
> Toda afirmación que no pudo comprobarse de primera mano en este entorno se
> marca explícitamente **NO VERIFICADO** o **REQUIERE VERIFICACIÓN /
> CONFIGURACIÓN**.
>
> Fuentes: código del monorepo (`artifacts/`, `lib/`), `.env.example`,
> `artifacts/api-server/src/{index,app,config}.ts`,
> `artifacts/api-server/src/deltaops/config.ts`, y los cierres
> `docs/dgp/DGP-023.5-CIERRE-RLS-POSTGRES.md`,
> `docs/dgp/DGP-023.6-DESCUBRIMIENTO-INFRA-SECRETS.md` y
> `docs/dgp/DELTAOPS-LITE-11-AISLAMIENTO-BD-TEST.md`.

---

## 1. Arquitectura de despliegue (resumen operativo)

DeltaOps se compone de tres artefactos declarados en `artifact.toml`:

| Artefacto | Tipo | Puerto local | Runtime de producción |
|---|---|---|---|
| `artifacts/api-server` | API (Node.js 24, Express) | 8080 | `node --enable-source-maps dist/index.mjs`, `NODE_ENV=production`, `PORT=8080` |
| `artifacts/deltaops` | Frontend (Vite/React) | 18151 | **servido estático** (`dist/public`), `BASE_PATH=/deltaops/` |
| `artifacts/mockup-sandbox` | Diseño | 8081 | sólo desarrollo/diseño |

- En **producción el frontend es estático** (no ejecuta el dev-server de Vite);
  la API y el frontend comparten origen tras el proxy de la plataforma.
- La API vive bajo el prefijo `/api`; las rutas de plataforma bajo
  `/api/deltaops/*`.
- Estado durable = **PostgreSQL** (datos de negocio, identidad, sesiones en
  `deltaops.sessions`, outbox de eventos). No hay estado local persistente en
  disco (coherente con despliegue *autoscale* efímero).

---

## 2. Entorno de DESARROLLO

### 2.1 Requisitos

- **Node.js 24** y **pnpm** (el `preinstall` de la raíz rechaza npm/yarn).
- **PostgreSQL 16**. En local, `docker-compose.yml` levanta un Postgres de
  desarrollo (`postgres://deltaops:deltaops@localhost:5432/deltaops`); esa
  credencial es **sólo de desarrollo local dockerizado**, nunca de producción.

### 2.2 Instalación

```bash
pnpm install            # instala todo el workspace
cp .env.example .env    # sólo para ejecución local fuera del orquestador
```

En el entorno gestionado (Replit) las variables de base de datos y
`SESSION_SECRET` ya están provisionadas; **no** es necesario crear `.env`.

### 2.3 Ejecución (workflows/servicios)

Los servicios se definen por artefacto (no hay bloques `[[workflows]]`
explícitos). En desarrollo se arrancan con:

```bash
pnpm --filter @workspace/api-server run dev      # API en :8080
pnpm --filter @workspace/deltaops   run dev      # Frontend en :18151
pnpm --filter @workspace/mockup-sandbox run dev  # Sandbox de diseño en :8081 (opcional)
```

> En el entorno gestionado, el arranque/reinicio de estos servicios es
> responsabilidad del orquestador de la plataforma; el operador no debe
> depender de invocaciones manuales salvo para diagnóstico local.

### 2.4 Semilla de datos de demostración

```bash
pnpm --filter @workspace/api-server run seed:demo   # exporta DELTAOPS_DB_ROLE=owner
pnpm --filter @workspace/scripts   run seed:deltaops
```

Los seeds se ejecutan **como rol owner** (`DELTAOPS_DB_ROLE=owner`), nunca como
runtime. En desarrollo/test, las contraseñas de los usuarios demo se derivan de
forma **no secreta** si no se definen (ver `seed-credentials.ts`); en producción
son obligatorias por entorno (el seed falla si faltan).

### 2.5 Tests: unitarios vs. destructivos

Regla **BLOQUEANTE** (LITE-11): ninguna suite automatizada puede tocar datos de
desarrollo/producción. El único destino destructivo permitido es
`DATABASE_TEST_URL`.

**Unitarios / de contrato (por defecto, sin base de datos):**

```bash
cd artifacts/api-server
pnpm test        # = DELTAOPS_DB_ROLE=owner vitest run
```

Sin `DATABASE_TEST_URL` en el entorno, las suites de integración PostgreSQL
(destructivas) se **OMITEN** limpiamente. Resultado esperado documentado en
LITE-11: **17 archivos pasan · 13 omitidos**, 0 fallos.

**Destructivas (integración PostgreSQL) — requieren BD de test aislada:**

1. Provisione una base **efímera/desechable**, distinta de desarrollo/producción.
2. Márquela como base de test de forma inequívoca, por una de dos vías:
   - Marcador de servidor (recomendado, sobrevive a reconexiones):
     ```sql
     ALTER DATABASE <bd_test> SET deltaops.is_test_database = 'true';
     ```
   - Nombre en allowlist (que el nombre contenga `test`, o declararlo):
     ```bash
     export DATABASE_TEST_ALLOWED_NAMES="mi_bd_test,otra_bd_test"
     ```
3. Ejecute:
   ```bash
   export DATABASE_TEST_URL="postgres://usuario:clave@host:puerto/<bd_test>"
   pnpm test
   ```

El guard FAIL-CLOSED (fuente única en `@workspace/db`) aplica cuatro barreras;
si alguna falla, se ABORTA o se OMITE, **nunca** se cae a `DATABASE_URL`:

| ID | Barrera | Efecto si falla |
|---|---|---|
| B1 | `NODE_ENV` no es producción | THROW |
| B2 | `DATABASE_TEST_URL` presente | SKIP limpio |
| B3 | `DATABASE_TEST_URL` ≠ BD de runtime (host+puerto+nombre) | THROW |
| B4 | Marcador en vivo `deltaops.is_test_database='true'` o nombre en allowlist | THROW |

Ningún mensaje de error expone secretos: sólo el nombre de la base y el motivo.

### 2.6 Verificación de tipos y build

```bash
pnpm run typecheck   # typecheck de libs + artefactos
pnpm run build       # typecheck + build recursivo (-r) de todos los artefactos
```

El build del frontend produce `dist/public` (estático); el del API produce
`dist/index.mjs`.

---

## 3. STAGING / PRODUCCIÓN

### 3.1 Variables de entorno

> Los valores nunca deben committearse. En el entorno gestionado se inyectan por
> el *secret store* de la plataforma. `DATABASE_URL`/`PG*` son gestionadas por el
> proveedor (runtime-managed).

**Obligatorias:**

| Variable | Propósito | Notas |
|---|---|---|
| `DATABASE_URL` | Cadena PostgreSQL de desarrollo/test | Runtime-managed en Replit. Es **fallback solo fuera de producción** (ver §3.3). |
| `NEON_DATABASE_URL` | Cadena de runtime productivo Neon | Secreto dedicado. Debe apuntar a `neondb` como `deltaops_app` y exigir TLS (`sslmode=require`, `verify-ca` o `verify-full`). Nunca se imprime ni se commitea. |
| `SESSION_SECRET` | Firma de cookies de sesión | Secreto. Sin auto-generación: el arranque falla si falta. También es *fallback* de la clave HMAC de adjuntos si `ATTACHMENT_URL_SECRET` no se define. |
| `PORT` | Puerto de escucha del API | Obligatoria en runtime; el proceso **lanza** si falta o es inválida. |
| `NODE_ENV=production` | Gobierna cookie `secure`, proveedor de correo fail-fast y logging | Debe fijarse a `production` en prod (el artefacto lo fija). |
| `DELTAOPS_APP_PASSWORD` | Contraseña del rol local de mínimo privilegio `deltaops_app` | Secreto usado para componer la conexión de desarrollo/test cuando existen `PGHOST` y `PGDATABASE`. Producción usa exclusivamente `NEON_DATABASE_URL`. |

**Obligatorias sólo para migración/seed:**

| Variable | Propósito |
|---|---|
| `DELTAOPS_DB_ROLE=owner` | Activa la conexión como `deltaops_owner` (migraciones/seed). Nunca es el runtime por defecto. |
| `DELTAOPS_OWNER_PASSWORD` | Contraseña del rol owner. Secreto. |

**Obligatorias en producción para el seed inicial:**

| Variable | Propósito |
|---|---|
| `DEMO_ADMIN_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`, `DEMO_PLANIFICADOR_PASSWORD`, `DEMO_TECNICO_PASSWORD`, `DEMO_CONSULTA_PASSWORD`, `DELTAOPS_ADMIN_PASSWORD` | Contraseñas de los usuarios sembrados. En producción el seed **falla** si faltan; en dev/test se derivan de forma no secreta. |

**Obligatorias si el proveedor de correo es Microsoft Graph (`m365-graph`):**

| Variable | Propósito |
|---|---|
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER` | OAuth2 *client_credentials* (permiso `Mail.Send`). En producción con config inválida, el arranque **falla** (sin fallback silencioso). |

**Opcionales:**

| Variable | Propósito / default |
|---|---|
| `CORS_ORIGINS` | Lista blanca de orígenes CORS separada por comas. Con valor → sólo esos orígenes con credenciales. Sin valor: en dev/test refleja el origen; **en producción CORS queda cerrado (sólo mismo origen)** — comportamiento seguro por defecto. |
| `ATTACHMENT_URL_SECRET` | Clave HMAC dedicada para URLs firmadas de adjuntos. Si se omite, usa `SESSION_SECRET` (fallback). Permite rotar la clave de adjuntos sin invalidar sesiones. |
| `DELTAOPS_APP_USER` / `DELTAOPS_OWNER_USER` | Usuarios de rol; defaults `deltaops_app` / `deltaops_owner`. |
| `NOTIFICATION_PROVIDER` | `fake` (dev/test) o `m365-graph` (producción). |
| `LOG_LEVEL` | Nivel de pino; default `info`. |
| `BASE_PATH` | Prefijo del frontend; `/deltaops/`. |
| `GRAPH_OAUTH_TOKEN_ENDPOINT`, `GRAPH_OAUTH_SCOPE`, `GRAPH_BASE_URL`, `GRAPH_TIMEOUT_MS`, `GRAPH_MAX_REINTENTOS` | Overrides de Microsoft Graph (soberanía de nube, timeouts, reintentos). |
| `DATABASE_TEST_URL`, `DATABASE_TEST_ALLOWED_NAMES` | Sólo para las suites destructivas; nunca deben apuntar a producción. |

> **NO VERIFICADO:** la existencia de *secret stores* separados por entorno
> (dev/staging/prod). Según DGP-023.6, los secretos de la plataforma gestionada
> viven en un único ámbito compartido; para staging/producción reales se
> **REQUIERE CONFIGURACIÓN** de almacenes de secretos independientes.

### 3.2 Migraciones (rol owner)

Las migraciones y seeds se ejecutan **exclusivamente** como `deltaops_owner`
(nunca como el runtime `deltaops_app`, que no tiene DDL):

```bash
# lib/db define los scripts con DELTAOPS_DB_ROLE=owner + DELTAOPS_OWNER_PASSWORD
pnpm --filter @workspace/db run push          # drizzle-kit push (aplica migraciones)
```

- El resolvedor de conexión (`lib/db/src/index.ts`) compone la URL del owner
  cuando `DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD` están presentes.
- Las migraciones de separación de roles y RLS (`0049`–`0052`) son idempotentes.
- El modelo de roles PostgreSQL (`deltaops_owner` / `deltaops_app_rw` /
  `deltaops_app`) y FORCE ROW LEVEL SECURITY sobre 166 tablas *tenant-scoped*
  están cerrados en DGP-023.5.

### 3.3 Runtime de mínimo privilegio y regla DGP-023.5

- El runtime del API conecta como **`deltaops_app`** (NOSUPERUSER, NOBYPASSRLS,
  sin DDL, no owner) para que la **RLS sea efectiva**.
- En desarrollo/test, la URL de runtime se **compone** desde
  `PGHOST/PGPORT/PGDATABASE` + usuario fijo + `DELTAOPS_APP_PASSWORD`; el fallback
  a `DATABASE_URL` se conserva únicamente para esos entornos.
- En producción, el runtime usa **exclusivamente `NEON_DATABASE_URL`**. El
  resolvedor valida antes de abrir el pool que la URL apunte a `neondb`, use
  `deltaops_app` y exija TLS; si falta o es inválida, el arranque falla sin
  registrar su valor. Nunca cae a `DATABASE_URL` ni a heliumdb.
- Diagnóstico manual no destructivo:
  `pnpm --filter @workspace/api-server neon:diagnostic`. Solo se ejecuta cuando
  existe `NEON_DATABASE_URL`; fuerza `default_transaction_read_only=on`, ejecuta
  exclusivamente SELECT de identidad/catálogo y nunca carga Drizzle Kit, seeds
  ni migraciones.

### 3.4 Deploy y health / ready

- **Producción API:** build → `node --enable-source-maps dist/index.mjs`,
  `NODE_ENV=production`, `PORT=8080`.
- **Frontend:** servido estático (`dist/public`), rewrite `/* → /index.html`.
- **Endpoints operativos** (bajo `/api/deltaops/platform`):
  - `GET …/health` → **liveness**: responde siempre `200 {status:"ok"}` (no
    verifica dependencias).
  - `GET …/ready` → **readiness**: verifica `SELECT 1` contra PostgreSQL y la
    presencia de `SESSION_SECRET`; devuelve `503` si algo falla.
  - `GET …/info` → nombre, versión, entorno, uptime, versión de Node.
  - `GET …/metrics` → métricas en memoria (no persistentes).

> **CORREGIDO EN PDC-01 (hallazgo I-09, DGP-023.6):** el *gate* de salud del
> despliegue (`artifact.toml` → `services.production.health.startup.path`) fue
> **reapuntado a `…/ready`** (readiness real: BD + `SESSION_SECRET`). `…/health`
> se conserva sin cambios como liveness. La verificación local del endpoint está
> hecha (200 con BD disponible, 503 si falla una dependencia crítica); el
> reconocimiento del gate por el despliegue real queda **PENDIENTE** hasta la
> primera publicación controlada (validar allí el comportamiento de reintentos
> del proveedor mientras la BD de producción se aprovisiona).

- **Apagado ordenado (graceful shutdown):** implementado (LITE-10 §27). Ante
  `SIGTERM`/`SIGINT` deja de aceptar conexiones, espera a las en curso, cierra el
  pool de PostgreSQL y fuerza salida tras un timeout de seguridad (10 s).

### 3.5 Rollback (respetando DGP-023.5 — jamás volver a superusuario)

El rollback tiene tres dimensiones; en **ninguna** el runtime debe quedar como
superusuario:

1. **Rollback de aplicación (código):** desplegar el artefacto anterior /
   `git reset --hard <tag>` (p. ej. `pre-dgp-023.5`) y reconstruir. El commit lo
   realiza el responsable del programa.
2. **Rollback de migraciones:**
   - FORCE RLS: `ALTER TABLE deltaops.<tabla> NO FORCE ROW LEVEL SECURITY` (granular).
   - Ownership/roles: `REVOKE …`, `ALTER … OWNER TO <owner>`, `DROP ROLE …` en
     orden inverso — **nunca dejando superusuario como estado final**.
   - Migraciones aditivas `0049`/`0050`: `DROP COLUMN tenant_id` / `DROP FUNCTION …`.
3. **Rollback de configuración (runtime):** **en desarrollo**, eliminar
   `DELTAOPS_APP_PASSWORD` hace que el pool vuelva a `DATABASE_URL` sin cambios de
   código. **En producción esta vía NO es aceptable** (reintroduciría un runtime
   superusuario y anularía la RLS): el rollback de configuración en producción
   debe reponer la credencial de mínimo privilegio, no degradar a admin.

### 3.6 Backup y restauración

**Datos a respaldar (identificados; DGP-023.6 §12):** la base PostgreSQL
completa — datos de negocio multi-tenant, identidad (`idn_*`, con
`password_hash`), `deltaops.sessions`, `kernel_outbox`/`kernel_dead_letter` y las
tablas de auditoría.

**Secretos a conservar fuera del repositorio (su pérdida impide recuperar el
servicio):** `SESSION_SECRET` (su pérdida invalida sesiones **y** URLs firmadas
si no se separó `ATTACHMENT_URL_SECRET`), `DELTAOPS_APP_PASSWORD`,
`DELTAOPS_OWNER_PASSWORD`, `GRAPH_*`, `DEMO_*`/`DELTAOPS_ADMIN_PASSWORD`.

**Procedimiento de restauración (identificado, no ejecutado aquí):**
1. Restaurar PostgreSQL 16 desde el *dump*.
2. Recrear roles (migración `0051`, idempotente) con contraseñas del secret store.
3. Inyectar secretos.
4. Construir y arrancar con `NODE_ENV=production` y credencial `deltaops_app`.
5. Verificar `…/ready` y el inicio de sesión de un SUPER_ADMIN.

> **Actualización PDC-01 (§27/§28) — VERIFICADO EN DOCUMENTACIÓN, ensayo
> pendiente:** los mecanismos de **backup/restauración de la plataforma Replit**
> se han **confirmado en la documentación del proveedor**: *Point-in-Time
> Recovery* (PITR) automático, retención de **7 días** (plan Core) / **28 días**
> (planes Pro/Teams), **restore a una instancia SEPARADA** (sin sobrescribir
> producción) vía *Database pane → restore settings*; las bases de **desarrollo y
> producción son SEPARADAS** y el esquema se aplica **al publicar**. El **ensayo
> real de restauración** (restaurar a instancia aislada y comparar
> empresas/activos/órdenes/preoperacionales/combustible/horómetros/históricos/
> usuarios/relaciones/integridad) **aún está PENDIENTE** y debe ejecutarlo
> Infraestructura antes de autorizar producción. Detalle:
> `docs/dgp/DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` (§27/§28).

### 3.7 Monitoreo por logs y observabilidad

- **Logs estructurados** con `pino`/`pino-http`: cada petición registra
  `id/método/url` (sin query) y `statusCode`. El logger **redacta**
  `authorization`, `cookie` y `set-cookie`.
- **Readiness** (`…/ready`) para chequeo de dependencias; **métricas**
  (`…/metrics`) en memoria (se pierden al reiniciar en *autoscale*).
- **Auditoría/trazabilidad:** *audit trail* + `kernel_outbox` (eventos con
  `tenant_id`). La consola de plataforma es exclusiva de SUPER_ADMIN
  (fail-closed).

> **REQUIERE CONFIGURACIÓN (gaps de DGP-023.6, §13):** no hay exportador de
> métricas a un colector externo (las métricas son in-memory) ni un *worker*
> dedicado de drenado del outbox (hoy es in-process). Para producción se
> recomienda un colector de logs/métricas externo y un drenador programado.
> **NO VERIFICADO** que exista tal infraestructura de monitoreo externa.

---

## 4. Notas de seguridad operativa

- **Nunca** committear un `.env` real ni valores de secretos (hallazgo I-08 de
  DGP-023.6: `.gitignore` **REQUIERE VERIFICACIÓN** de que ignore `.env`).
- La credencial `deltaops:deltaops` de `docker-compose.yml` es sólo de
  desarrollo local; **no** debe usarse en staging/producción.
- CORS: en producción, definir `CORS_ORIGINS` con la allowlist explícita del/los
  frontend(s) si se sirven en un origen distinto de la API. Sin la variable, CORS
  queda cerrado a mismo origen.
