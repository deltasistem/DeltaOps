# DeltaOps — Configuración y diagnóstico Neon

**Fecha:** 2026-08-19  
**Alcance:** configuración, diagnóstico y prueba de conectividad de solo lectura  
**Resultado:** **CONFIGURACIÓN PASS / CONECTIVIDAD PASS**

## A. Archivos modificados

- `lib/db/src/runtime-connection.ts`
- `lib/db/src/index.ts`
- `lib/db/src/neon-readonly-diagnostic.ts`
- `lib/db/src/__tests__/runtime-connection.test.ts`
- `lib/db/package.json`
- `artifacts/api-server/src/deltaops/config.ts`
- `artifacts/api-server/src/deltaops/__tests__/platform.test.ts`
- `artifacts/api-server/scripts/neon-readonly-diagnostic.ts`
- `artifacts/api-server/package.json`
- `docs/manual/DELTAOPS-LITE-OPERACION.md`
- `docs/manual/DELTAOPS-LITE-MANUAL-TECNICO.md`
- `docs/dgp/DELTAOPS-NEON-CONEXION-DIAGNOSTICO.md`

## B. Variables de entorno y secrets utilizados

- `NODE_ENV`
- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `DELTAOPS_APP_PASSWORD`
- `DELTAOPS_DB_ROLE`
- `DELTAOPS_OWNER_PASSWORD`
- `NEON_DATABASE_URL`

No se imprimió, registró ni versionó ningún valor secreto o cadena de conexión.

## C. Selección desarrollo vs. producción

- **Desarrollo/test:** conserva heliumdb mediante `DATABASE_URL`. No reutiliza
  `DELTAOPS_APP_PASSWORD`, que contiene la credencial del rol productivo Neon.
- **Producción:** el runtime normal exige `NEON_DATABASE_URL` y
  `DELTAOPS_APP_PASSWORD`. No puede caer a `DATABASE_URL`, `PG*` ni heliumdb.
  Antes de abrir el pool valida protocolo PostgreSQL, base `neondb`, usuario
  `deltaops_app` y TLS. Los modos TLS aceptados se normalizan a
  `sslmode=verify-full`; la contraseña efectiva siempre se toma de
  `DELTAOPS_APP_PASSWORD`, evitando una duplicación con el segmento de
  contraseña de la URL.
- **Owner:** el camino `DELTAOPS_DB_ROLE=owner` existente permanece separado
  para tareas administrativas explícitas. No fue invocado en este diagnóstico.

La continuidad de desarrollo se verificó reiniciando el API con
`NODE_ENV=development`: `/api/deltaops/platform/ready` respondió HTTP 200 y el
check de base de datos quedó `ok`.

## D. Usuario de producción

`deltaops_app` — obligatorio y validado localmente antes de cualquier intento de
red. Se rechazan URLs de owner o admin.

## E. Resultado de la prueba de conexión a Neon

**PASS.**

La URL superó las guardas locales de formato, base, usuario y TLS. La conexión
real de solo lectura a Neon se completó correctamente con la contraseña efectiva
de `DELTAOPS_APP_PASSWORD`.

Durante la preparación se detectaron y corrigieron, sin revelar valores, una URL
copiada como comando `psql`, una URL de rol distinto, una contraseña
desincronizada y una incompatibilidad del parámetro de inicio `options` con el
endpoint. La garantía de solo lectura quedó implementada mediante `BEGIN READ
ONLY` + `ROLLBACK`. No se rotaron contraseñas desde el código ni se ejecutó
`ALTER ROLE`.

## F. `current_database`

**`neondb`** — confirmado por el servidor mediante `current_database()`.

## G. `current_user`

**`deltaops_app`** — confirmado por el servidor mediante `current_user`.

## H. Existencia del schema `deltaops`

**NO EXISTE.** Neon está conectado correctamente, pero el schema `deltaops`
todavía no ha sido desplegado. `current_schema()` devolvió `public`.

## I. Cantidad de tablas en `deltaops`

**0 tablas.** El conteo es cero porque el schema `deltaops` todavía no existe.

La instancia reportó PostgreSQL **18.4**, 64-bit.

## J. Confirmación de no destructividad

Se confirma expresamente:

- **NO** se ejecutaron migraciones ni Drizzle Kit.
- **NO** se ejecutaron `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, `UPDATE`
  ni `DELETE` en Neon.
- **NO** se creó el schema `deltaops`.
- **NO** se crearon tablas.
- **NO** se modificaron migraciones existentes ni el schema Drizzle.
- **NO** se modificó la estructura ni los datos de heliumdb.
- **NO** se cambió Docker, VPS, DNS ni configuración de despliegue.
- **NO** se realizó deploy.

El comando `neon:diagnostic` creó un pool temporal y envolvió los `SELECT`
autorizados en `BEGIN READ ONLY` + `ROLLBACK`; siempre cerró el pool.

## Acción necesaria

La conectividad y la identidad ya están confirmadas. El despliegue del schema
`deltaops` y sus tablas debe realizarse únicamente en la tarea posterior y
separada de migración; **no** forma parte de este diagnóstico.