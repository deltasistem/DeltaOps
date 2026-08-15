# DELTAOPS LITE-11 · Aislamiento de la base de datos de test (§2 / §3 / §4)

**Requisito BLOQUEANTE de la Directiva LITE-11.** Ninguna suite de test automatizada
puede destruir, truncar, reemplazar ni modificar datos de una base de DESARROLLO o
PRODUCCIÓN. Este documento describe cómo se ejecutan los tests, qué base usan, cuáles
son destructivos y cómo se impide que apunten a desarrollo/producción.

> Antecedente (incidente LITE-10): las suites de integración PostgreSQL, al gatear solo
> por la presencia de `DATABASE_URL` e importar el `pool` de runtime (`@workspace/db`),
> se ejecutaron contra la BD de desarrollo compartida (`heliumdb`) y borraron el tenant
> demo con los datos históricos reales importados en LITE-09. Este documento describe la
> protección FAIL-CLOSED que impide que vuelva a ocurrir.

---

## 1. Modelo de bases de datos

| Entorno | Variable | Contenido | ¿Los tests destructivos pueden tocarla? |
|---|---|---|---|
| **Test** | `DATABASE_TEST_URL` | base efímera/desechable | **SÍ** (único destino permitido) |
| **Desarrollo** | `DATABASE_URL` (`heliumdb`) | datos demo/históricos LITE-09/10 | **NO — nunca** |
| **Producción** | `DATABASE_URL` (prod) | datos reales | **NO — nunca** |

Las suites destructivas se conectan **exclusivamente** a `DATABASE_TEST_URL`, mediante un
pool DEDICADO. Nunca reutilizan el `pool` de runtime de `@workspace/db` (que resuelve a
`DATABASE_URL`).

---

## 2. Cómo ejecutar los tests

### 2.1 Parte unitaria (por defecto, sin BD)

```bash
# En artifacts/api-server
pnpm test         # = DELTAOPS_DB_ROLE=owner vitest run
```

Sin `DATABASE_TEST_URL` en el entorno:

- corren todas las suites **unitarias/de contrato** (sin PostgreSQL);
- las **13 suites destructivas** (integración PG + seed demo) se **OMITEN** limpiamente,
  con el sufijo `[OMITIDA · sin DATABASE_TEST_URL — nunca se usa DATABASE_URL]`.

Resultado esperado LITE-11: **17 archivos pasan · 13 omitidos**, 0 fallos.

### 2.2 Suites destructivas (integración PG) — requieren BD de test

1. Provisione una **base de datos de test AISLADA** (efímera/desechable), distinta de la
   de desarrollo/producción.
2. Márquela como base de test de forma **inequívoca** (una de estas vías, en
   orden de preferencia):
   - **Marcador de servidor** (RECOMENDADO; sobrevive a reconexiones y es
     independiente del nombre):
     ```sql
     ALTER DATABASE <nombre_bd_test> SET deltaops.is_test_database = 'true';
     ```
   - **Allowlist EXPLÍCITA de nombres** (CSV de nombres exactos):
     ```bash
     export DATABASE_TEST_ALLOWED_NAMES="mi_bd_de_test,otra_bd_test"
     ```
   - **Patrón ESTRICTO por defecto del nombre** (LITE-11 MENOR-2): la base se
     acepta solo si «test»/«tests» aparece como **token** delimitado por el
     inicio/fin del nombre o por `-`/`_` — regex `/(^|[-_])tests?([-_]|$)/i`.
     Acepta p. ej. `test`, `deltaops_test`, `deltaops-test`, `deltaops_test_ci`;
     **rechaza** subcadenas arbitrarias como `latest`, `contest`, `attestation`.
     Se **eliminó** el fallback amplio `/test/i` que casaba cualquier subcadena.
3. Exporte la cadena de conexión de test y ejecute:
   ```bash
   export DATABASE_TEST_URL="postgres://usuario:clave@host:puerto/<nombre_bd_test>"
   pnpm test
   ```
   Con `DATABASE_TEST_URL` presente y válida, las suites destructivas se ejecutan contra
   esa base; las unitarias siguen corriendo igual.

> El pool de test se resuelve una vez por proceso y se cierra en el teardown.

---

## 3. Suites destructivas (inventario)

Todas ejecutan `DELETE FROM deltaops.<tabla> WHERE tenant_id = $1` sobre tenants efímeros
por corrida (o siembra idempotente, el caso del seed). Todas fueron migradas al gate
FAIL-CLOSED.

| Suite | Ubicación | Operación destructiva |
|---|---|---|
| costos-orquestador | `routes/deltaops/__tests__/costos-orquestador.integration.test.ts` | DELETE por tenant efímero |
| costos-composicion | `routes/deltaops/__tests__/costos-composicion.integration.test.ts` | DELETE por tenant efímero |
| costos-indicadores | `routes/deltaops/__tests__/costos-indicadores.integration.test.ts` | DELETE por tenant efímero |
| costos-rbac-reprocesar | `routes/deltaops/__tests__/costos-rbac-reprocesar.integration.test.ts` | DELETE `deltaops.users` por tenant |
| utilizacion-idempotencia | `routes/deltaops/__tests__/utilizacion-idempotencia.integration.test.ts` | DELETE por tenant efímero |
| preoperacional-runtime | `routes/deltaops/__tests__/preoperacional-runtime.integration.test.ts` | DELETE `platform_records`/`platform_audit` |
| preoperacional-http-roles | `routes/deltaops/__tests__/preoperacional-http-roles.integration.test.ts` | DELETE por tenant + `users` |
| hallazgo-loop | `routes/deltaops/__tests__/hallazgo-loop.integration.test.ts` | DELETE por tenant + `users` |
| manodeobra-valoracion-cableado | `routes/deltaops/__tests__/manodeobra-valoracion-cableado.integration.test.ts` | DELETE por tenant efímero |
| estado-rutinas-cableado | `routes/deltaops/__tests__/estado-rutinas-cableado.integration.test.ts` | DELETE por tenant efímero |
| identity/flows | `deltaops/identity/__tests__/flows.integration.test.ts` | DELETE por tenant + `idn_identities` |
| identity/http-e2e | `deltaops/identity/__tests__/http-e2e.integration.test.ts` | DELETE por tenant + `idn_identities` |
| **seed-delta-demo** | `seed/__tests__/seed-delta-demo.test.ts` | **`seedDeltaDemo()` escribe vía pool de RUNTIME** |

> **Caso especial — seed-delta-demo:** `seedDeltaDemo()` está hard-wired al `pool`/`db`
> de runtime de `@workspace/db` (no admite pool inyectado sin refactor mayor). Por eso su
> gate exige que la **propia BD de runtime** esté marcada como de test (verificación en
> vivo con `runtimeEsBdDeTest(pool)` en `beforeAll`); si no lo está, **ABORTA sin sembrar**.
> En consecuencia, ejecutar el seed test contra desarrollo/producción es imposible.

### 3.1 Suites destructivas en los paquetes `lib/*` (Encargo #2)

Además de api-server, **16 suites `*.pg.test.ts`** de los paquetes `lib/*` creaban su
propio `new pg.Pool({ connectionString: DATABASE_URL })` y gateaban con
`DATABASE_URL ? describe : describe.skip` — mismo vector LITE-10. Todas fueron migradas
al MISMO guard centralizado de `@workspace/db` (`suiteDestructiva(describe)` +
`crearPoolDestructivo()`), sin copy-paste. Algunas hacen `DELETE ... WHERE tenant_id LIKE
'pgtest-%'`/`'pgact-%'` (prefijo, no solo `= $1`), lo que refuerza la necesidad del guard.

| Paquete | Suite | Operación destructiva |
|---|---|---|
| dynamic-forms | `motor.pg.test.ts` | DELETE por tenant efímero |
| kernel | `kernel.pg.test.ts` | DELETE/limpieza de outbox por tenant |
| module-abastecimiento | `module.pg.test.ts` | DELETE por tenant efímero |
| module-activos | `module.pg.test.ts` | DELETE `act_*`/`platform_*` por prefijo `pgact-%` |
| module-analytics | `module.pg.test.ts` | DELETE por tenant efímero |
| module-correctivo | `module.pg.test.ts` | DELETE por tenant efímero |
| module-costos | `module.pg.test.ts` | DELETE por tenant efímero |
| module-inventario | `module.pg.test.ts` | DELETE por tenant efímero |
| module-manodeobra | `module.pg.test.ts` | DELETE por tenant efímero |
| module-ordenes | `module.pg.test.ts` | DELETE por tenant efímero |
| module-ordenes | `sesion.pg.test.ts` | DELETE por tenant efímero |
| module-planes | `module.pg.test.ts` | DELETE por tenant efímero |
| module-preventivo | `module.pg.test.ts` | DELETE por tenant efímero |
| module-reference | `module.pg.test.ts` | DELETE por tenant efímero |
| platform | `platform.pg.test.ts` | DELETE `platform_records`/`platform_audit` por prefijo |
| workflow-engine | `motor.pg.test.ts` | DELETE por tenant efímero |

> Los scripts `test` de estos paquetes se invocan con `DELTAOPS_DB_ROLE=owner`; el guard
> cubre ese camino igualmente (B1–B4 se aplican con independencia del rol solicitado).

---

## 4. Diseño del guard FAIL-CLOSED

Guard centralizado y reutilizado (no copy-paste), **fuente única en `@workspace/db`**:

- **`lib/db/src/test-guard.ts`** (`@workspace/db`): lógica de barreras + pool de test.
  Expone, además de `resolverPoolDeTest`/`runtimeEsBdDeTest`, dos piezas neutras al
  runner reutilizadas por TODOS los paquetes:
  - `suiteDestructiva(describe)` — gate FAIL-CLOSED del `describe` (recibe el `describe`
    del propio paquete, evitando acoplar `@workspace/db` a vitest; soporta la forma con
    opciones `describe(nombre, { timeout }, fn)`).
  - `crearPoolDestructivo()` — pool DEDICADO a `DATABASE_TEST_URL` con verificación
    perezosa; drop-in de `new pg.Pool({ connectionString: DATABASE_URL })` /
    del `pool` de runtime en los call sites `.connect()`/`.query()`/`.end()`.
- **`artifacts/api-server/src/test-support/pg-destructivo.ts`**: adaptador FINO que
  re-expone `suiteDestructiva()` y `poolDestructivo` para api-server (mismo guard).
- **`lib/*` (16 suites `*.pg.test.ts`)**: importan `suiteDestructiva`/`crearPoolDestructivo`
  directamente desde `@workspace/db` (añadido como `devDependency`).

Barreras (todas deben cumplirse; si no, se ABORTA o se OMITE, **nunca** se cae a
`DATABASE_URL`):

| ID | Barrera | Resultado si falla |
|---|---|---|
| **B1** | `NODE_ENV` **no** es producción | **THROW** (fail-closed; ni se registra la suite) |
| **B2** | `DATABASE_TEST_URL` presente | **SKIP** limpio (aviso claro) |
| **B3** | `DATABASE_TEST_URL` ≠ BD de runtime (host+puerto+nombre) | **THROW** |
| **B4** | Marcador EN VIVO: `deltaops.is_test_database='true'` **o** nombre en `DATABASE_TEST_ALLOWED_NAMES` (exacto) **o** patrón ESTRICTO `/(^|[-_])tests?([-_]|$)/i` (token, no subcadena) | **THROW** |

Ningún secreto se registra ni aparece en los mensajes de error: solo el **nombre** de la
base y el motivo.

---

## 5. Evidencia de verificación (LITE-11)

Baseline del tenant demo antes de las pruebas: **38 activos, 765 tanqueos** (`delta-demo`).

1. **B2 — sin `DATABASE_TEST_URL`:** `pnpm test` ⇒ 17 archivos pasan, **13 omitidos**
   (todas las destructivas), 117 tests unitarios en verde.
2. **B3 — `DATABASE_TEST_URL = DATABASE_URL` (heliumdb):** la suite
   `utilizacion-idempotencia` **ABORTA** con
   *«DATABASE_TEST_URL apunta a la MISMA base que DATABASE_URL (heliumdb)»*.
   Verificación SQL posterior: tenant demo **intacto (38 activos, 765 tanqueos)**; no se
   crearon filas nuevas (las 2 filas `t-utl-%` presentes son leftover del 2026-08-13, de
   una corrida LITE-10 anterior, no de esta prueba).
3. **B1 — `NODE_ENV=production`:** la suite **ABORTA** con
   *«NODE_ENV es producción; las suites destructivas no pueden ejecutarse»*.
4. **Cobertura `lib/*` (Encargo #2):** los 16 paquetes con `*.pg.test.ts` corren en verde
   con sus suites destructivas OMITIDAS sin `DATABASE_TEST_URL`; con
   `DATABASE_TEST_URL=DATABASE_URL` la suite `module-activos` **ABORTA** por B3. `grep`
   confirma que **ninguna** suite destructiva (api-server + lib) conecta ya a `DATABASE_URL`.

---

## 6. Hardening adicional (Encargo #2)

### 6.1 FAIL-FAST del runtime de BD en producción (§11/§12, I-03 / S-1)

`resolveRuntimeConnectionString()` (extraída a `lib/db/src/runtime-connection.ts` como
función PURA y testeable) resuelve la conexión del runtime al rol de mínimo privilegio
`deltaops_app`. **En producción**, si falta `DELTAOPS_APP_PASSWORD` y NO se pidió el rol
owner explícito para migración (`DELTAOPS_DB_ROLE=owner`), **LANZA** con mensaje claro (sin
secretos) en vez de caer silenciosamente a la conexión admin de `DATABASE_URL`
(superusuario) — que anularía la RLS (DGP-023.5). Fuera de producción, el fallback a
`DATABASE_URL` sigue disponible como rollback documentado. Cubierto por
`lib/db/src/__tests__/runtime-connection.test.ts` (7 casos, incl. "el error no expone
secretos").

### 6.2 Clave HMAC dedicada de URLs firmadas de adjuntos (§10, S-2)

Las URLs firmadas de adjuntos usaban `SESSION_SECRET` como clave HMAC. Se introduce
`ATTACHMENT_URL_SECRET` (opcional) con **fallback a `SESSION_SECRET`**, resuelto por
`resolverSecretoAdjuntos()` en `lib/platform/src/services/attachment.ts` y consumido con
la **misma** resolución al firmar (attachment.ts) y al verificar
(`artifacts/api-server/src/routes/deltaops/attachment-serve.ts`). Permite rotar la clave de
adjuntos sin invalidar las sesiones.

### 6.3 Variables de entorno nuevas/documentadas

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_TEST_URL` | solo para suites destructivas | BD de test aislada; su ausencia OMITE las destructivas |
| `DATABASE_TEST_ALLOWED_NAMES` | opcional | CSV de nombres de BD de test permitidos (B4) |
| `DELTAOPS_APP_PASSWORD` | **sí en producción** | contraseña del rol de runtime `deltaops_app` (FAIL-FAST si falta) |
| `DELTAOPS_APP_USER` | opcional | default `deltaops_app` |
| `DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD` | solo migración/mantenimiento | rol owner explícito; nunca es el runtime por defecto |
| `ATTACHMENT_URL_SECRET` | opcional | clave HMAC dedicada de URLs de adjuntos; fallback a `SESSION_SECRET` |

Todas están documentadas en `.env.example`.

---

## 7. Deuda/observaciones relacionadas

- **Leftovers de corridas previas:** existen tenants efímeros huérfanos en `heliumdb`
  (`t-utl-*`, `hallazgo-http-*`, `preop-http-*`) de ejecuciones anteriores a este
  hardening (cuando las suites corrían contra desarrollo). Son datos de test, no
  históricos; su limpieza puntual queda a decisión de Dirección y **no** debe hacerse de
  forma automática por una suite.
- Este hardening **no** modifica RLS (§7), ni datos históricos (§32), ni el alcance
  funcional (§31).
