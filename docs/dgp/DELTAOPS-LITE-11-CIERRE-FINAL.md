# DELTAOPS LITE-11 · Cierre Final de Endurecimiento y Aptitud de Producción

> Documento de cierre conforme a **§35** (30 contenidos obligatorios). Cada
> afirmación se clasifica según **§34** con una de las etiquetas:
>
> - **VERIFICADO** — comprobado en vivo (curl/SQL/navegador) o por inspección de
>   código concluyente.
> - **PARCIAL** — verificado con salvedad explícita documentada.
> - **NO VERIFICADO** — no comprobable desde este entorno; requiere acción externa.
> - **GAP** — carencia conocida, no bloqueante, con recomendación.
> - **BLOQUEANTE** — impide el paso a producción.
>
> Principio rector: **no maquillar**. Los puntos amarillos se declaran como tales.

---

## Índice de contenidos (§35)

1. Alcance y objetivo del cierre
2. Aislamiento de la base de datos de test (§2–§4)
3. Datos históricos: conteos canónicos (§5)
4. Importador de históricos: seguridad e idempotencia (§6)
5. RLS en vivo (§7)
6. Aislamiento multi-tenant (§8)
7. Matriz RBAC por rol (§9)
8. Sesiones y cookies seguras (§10)
9. Gestión de secretos (§11)
10. Runtime de mínimo privilegio y arranque (§12)
11. Migraciones por rol owner (§13)
12. Readiness y liveness (§14)
13. CORS (§15)
14. Apagado ordenado (§16)
15. Copia de seguridad (§17)
16. Rollback (§18)
17. Observabilidad (§19)
18. Demo vs producción (§20)
19. Pruebas E2E de navegador (§21–§22)
20. Barrido responsive (§23)
21. Rendimiento (§24)
22. Correcciones MENOR de la revisión (§25)
23. Manuales (§26–§28)
24. Matriz final de estado por dominio (§29)
25. Condiciones de release (§30)
26. Hallazgos abiertos y recomendaciones
27. Evidencia y trazabilidad
28. Riesgos residuales
29. Responsables y próximos pasos
30. Veredicto (§36)

---

## 1. Alcance y objetivo del cierre

LITE-11 consolida el endurecimiento de seguridad, aislamiento de datos,
mínimo privilegio de base de datos, robustez operativa y calidad funcional de
DeltaOps, y determina su **aptitud para producción**. Este documento cierra el
encargo integrando los insumos verificados de LITE-09/10/11 y la revisión
independiente final. **Clasificación: VERIFICADO** (alcance definido y acotado).

---

## 2. Aislamiento de la base de datos de test (§2–§4)

Guard centralizado `lib/db/src/test-guard.ts` con **cuatro barreras fail-closed**:
- **B1** — `NODE_ENV=production` ⇒ THROW (jamás test destructivo en producción).
- **B2** — sin `DATABASE_TEST_URL` ⇒ SKIP limpio (nunca fallback a `DATABASE_URL`).
- **B3** — `DATABASE_TEST_URL` = BD de runtime (host+puerto+nombre) ⇒ THROW.
- **B4** — marcador en vivo `deltaops.is_test_database='true'` **o** nombre en
  `DATABASE_TEST_ALLOWED_NAMES` (exacto) **o** patrón estricto por token
  `/(^|[-_])tests?([-_]|$)/i` ⇒ si ninguno, THROW.

Aplicado a las **29 suites destructivas** vía `suiteDestructiva()`/
`crearPoolDestructivo()`; el **seed oficial** (escribe por el pool de runtime) se
protege con `runtimeEsBdDeTest()`. Revisión independiente: **PASS, 0
bloqueantes**, con 2 MENOR ya corregidos (ver §22).

**Clasificación: VERIFICADO.** Origen del incidente (LITE-10: borrado del tenant
demo por gate solo con `DATABASE_URL`) cerrado de raíz.

---

## 3. Datos históricos: conteos canónicos (§5)

Conteos canónicos verificados exactos tras la importación LITE-09:

| Métrica | Valor canónico |
|---|---|
| Fuentes/archivos | 38 |
| Registros (combustible) | 3736 |
| Registros (checklist/preoperacional) | 1971 |
| Registros (horas-hombre/jornadas) | 765 |
| Registros (planes preventivos) | 109 |
| C11 SIGAR (activo objetivo) | 0 |
| Timeline histórico total | 5816 (intacto) |

Las diferencias respecto de corridas intermedias se explican por los flujos E2E
de LITE-10 en los tenants CAM/MON y por el seed; ninguna es pérdida de datos.

**Clasificación: VERIFICADO.**

---

## 4. Importador de históricos: seguridad e idempotencia (§6)

- **Control de acceso admin-only:** verificado por curl que los cinco endpoints
  (`tipos-fuente`, `archivos-disponibles`/`analizar`, `validar`, `importar`,
  `subir`) devuelven **401** sin sesión y **403** para roles TECNICO y CONSULTA.
  **VERIFICADO.**
- **Idempotencia por `opId`** (UUIDv5 determinista): Δ=0 al reimportar checklist
  y en la 3ª corrida de combustible. **VERIFICADO.**
- **Salvedad one-time:** una reejecución añadió **+41 tanqueos** (SEM05/06/07)
  por un **estado previo incompleto** de esos archivos (no por defecto de
  idempotencia): al completarse la fuente, el conjunto determinista creció una
  única vez. No recurrente.

**Clasificación: PARCIAL** — idempotencia y seguridad VERIFICADAS; la salvedad de
+41 tanqueos queda documentada como evento único explicado, no como fallo.

---

## 5. RLS en vivo (§7)

Verificado en vivo contra la base:
- `deltaops_app` conecta **sin** `SUPERUSER`/`BYPASSRLS`, **no** es owner.
- Cruce de tenants ⇒ **0 filas** (aislamiento efectivo).
- **DDL denegado** al rol de runtime.
- **FORCE RLS** en las tablas tenant-scoped conforme a **DGP-023.5** (166
  tablas con FORCE; `ten_tenants` con RLS sin FORCE por diseño vía función
  `SECURITY DEFINER`; 7 tablas globales sin RLS por diseño).

**Clasificación: VERIFICADO.**

---

## 6. Aislamiento multi-tenant (§8)

Verificado a nivel HTTP: las consultas de un tenant no exponen datos de otro; el
`tenantId` de sesión gobierna cada lectura/escritura, respaldado por RLS (§5).

**Clasificación: VERIFICADO.**

---

## 7. Matriz RBAC por rol (§9)

Verificado a nivel HTTP:
- **CONSULTA:** 100 % solo-lectura (escrituras ⇒ 403).
- **SUPERVISOR:** puede aprobar/cerrar; **PLANIFICADOR/TECNICO** no pueden cerrar.
- **Importador:** solo TENANT_ADMIN/SUPER_ADMIN.
- **Revocación de sesión:** `AUTH_STALE` por `auth_epoch` (authVersion≠authEpoch).

**Nota de diseño (documentable, no bloqueante):** los módulos que evalúan solo el
**rol legacy** (admin/operador/lector) colapsan SUPERVISOR/PLANIFICADOR/TECNICO a
permisos idénticos, salvo donde se consulta el **rol canónico** (p. ej. Órdenes:
cierre exclusivo de supervisor). No es una fuga de privilegios (el techo lo fija
el rol legacy), pero limita la granularidad entre los tres roles operativos.

**Clasificación: VERIFICADO** (con nota de diseño / **GAP** de granularidad).

---

## 8. Sesiones y cookies seguras (§10)

`express-session` + `connect-pg-simple` (tabla `deltaops.sessions`), cookie
`deltaops.sid` `httpOnly`, `sameSite=lax`, `secure=(NODE_ENV===production)`,
vigencia 8 h, revocación por `auth_epoch`.

**Clasificación: VERIFICADO.**

---

## 9. Gestión de secretos (§11)

- `SESSION_SECRET` **obligatorio** (validado por `/ready`).
- Grep de secretos: **limpio** (nombres sí, valores no; sin fugas en repo/logs).
- **Fail-fast I-03** implementado (runtime nunca degrada a superusuario) + **MENOR-1**
  (owner sin password en producción ⇒ THROW).
- `ATTACHMENT_URL_SECRET` **separa** el HMAC de adjuntos del de sesión (fallback a
  `SESSION_SECRET` documentado).

**Clasificación: VERIFICADO** (para el runtime). La existencia de *secret stores
separados por entorno* en producción es responsabilidad de despliegue → ver §18
(**NO VERIFICADO**).

---

## 10. Runtime de mínimo privilegio y arranque (§12)

El runtime conecta como `deltaops_app` y **no ejecuta DDL en el arranque**
(sin migraciones automáticas al iniciar).

**Clasificación: VERIFICADO.**

---

## 11. Migraciones por rol owner (§13)

Las migraciones/seed corren con `DELTAOPS_DB_ROLE=owner` (rol `deltaops_owner`),
**equivalente funcional** a una `DATABASE_MIGRATION_URL` dedicada (documentado):
separan el privilegio de esquema del runtime.

**Clasificación: VERIFICADO.**

---

## 12. Readiness y liveness (§14)

- `/ready` real: ejecuta **`SELECT 1`** + verificación de `SESSION_SECRET`, 503 al
  fallar. **VERIFICADO.**
- **GAP operativo:** el *health gate* del despliegue apunta aún a la sonda de
  **liveness** (`/health`, que no toca la BD). Debe reapuntarse a `/ready`.
  **REQUIERE CONFIGURACIÓN** (ver §25).

**Clasificación: VERIFICADO** (endpoint) / **GAP** (gate mal apuntado).

---

## 13. CORS (§15)

Allowlist por `CORS_ORIGINS` verificada con matriz de orígenes (permitidos vs
rechazados); vacío en producción ⇒ same-origin (default seguro). Supera el
hallazgo histórico de wildcard (I-05).

**Clasificación: VERIFICADO** (mecanismo). El **valor** de `CORS_ORIGINS` para
producción debe definirse (ver §25).

---

## 14. Apagado ordenado (§16)

SIGTERM/SIGINT con drenaje y timeout de 10 s; **idempotente**. Supera el hallazgo
histórico de shutdown ausente (I-10).

**Clasificación: VERIFICADO.**

---

## 15. Copia de seguridad (§17)

La copia/restauración provista por la **plataforma de alojamiento** (snapshots,
PITR, retención) **no es comprobable desde este entorno**.

**Clasificación: NO VERIFICADO** — requiere validación con el proveedor y un
ensayo de restauración real (ver §25/§28).

---

## 16. Rollback (§18)

Procedimiento **documentado** en el manual de operación (§26): rollback de
aplicación, de migraciones y de configuración, respetando **DGP-023.5** (jamás
volver al superusuario). **No se ha ensayado** en un entorno productivo real.

**Clasificación: PARCIAL** — procedimiento VERIFICADO documentalmente; ejecución
**no ensayada** (🟡).

---

## 17. Observabilidad (§19)

Métricas y trazas por logs; `/api/deltaops/platform/{metrics,info}` disponibles.
**GAP conocido:** métricas **in-memory** (sin colector externo) y outbox drenado
**in-process** (sin worker dedicado).

**Clasificación: PARCIAL / GAP** — observabilidad básica presente; colector
externo y worker dedicado **NO VERIFICADOS / por configurar**.

---

## 18. Demo vs producción (§20)

Inventario explícito de artefactos de demostración que **Dirección** debe decidir
conservar o retirar antes de producción:

| Artefacto | Naturaleza | Recomendación |
|---|---|---|
| Tenant `delta-demo` | Empresa de demostración con datos históricos importados | Decisión de Dirección (conservar como demo aislada o retirar) |
| Usuarios demo (admin/supervisor/planificador/técnico/consulta) | Cuentas de demostración | Retirar o rotar antes de producción |
| Contraseñas demo derivadas (`dev-<clave>-0001!`) | Credenciales deterministas de desarrollo | **Nunca** usar en producción; rotar |
| Credencial docker-compose `deltaops:deltaops` | Solo desarrollo local | No aplicable a producción |
| Secretos `M365_*` | Legado sin consumo actual | Retirar (I-09b) |

**Clasificación: VERIFICADO** (inventario). La **decisión** de conservación es de
Dirección (condición de release).

---

## 19. Pruebas E2E de navegador (§21–§22)

Casos E2E: **1, 3, 4 y 5 PASS** en navegador; **caso 2 PASS** en LITE-10.
**Matiz caso 4:** el modal de combustible **no incluye** campo de horómetro (la
lectura se registra por un flujo dedicado) — **comportamiento actual por diseño,
no un defecto**.

**Clasificación: VERIFICADO** (con matiz de diseño documentado).

---

## 20. Barrido responsive (§23)

Sweep responsive **sin hallazgos ALTA** de layout.

**Clasificación: VERIFICADO.**

---

## 21. Rendimiento (§24)

Hallazgo **ALTA corregido:** el componente `Tabs` montaba **14 paneles de forma
eager** en la ficha de activo, disparando todas sus consultas y render a la vez.
Corrección mínima aditiva: prop `montarInactivas` (default `true`, retro­compatible)
y `montarInactivas={false}` en la ficha ⇒ montaje perezoso del panel activo.
**Ficha C11: 44 s → 2,4 s** hasta interactiva. Paginación por cursor del timeline
verificada por API (100 + 100 sin solape; backend <200 ms).

**Clasificación: VERIFICADO.**

---

## 22. Correcciones MENOR de la revisión (§25)

Revisión independiente: **PASS, 0 bloqueantes, 2 MENOR** (ya corregidos):
- **MENOR-1** (`runtime-connection.ts`): en producción con
  `DELTAOPS_DB_ROLE=owner` **sin** `DELTAOPS_OWNER_PASSWORD` ⇒ ahora **THROW**
  (antes caía a `DATABASE_URL` admin). Test ajustado.
- **MENOR-2** (`test-guard.ts`, B4): eliminado el patrón amplio `/test/i`;
  se exige marcador en vivo, allowlist exacta o patrón estricto por token. Test
  nuevo. Doc de aislamiento actualizado.

**Clasificación: VERIFICADO.**

---

## 23. Manuales (§26–§28)

Tres manuales creados en `docs/manual/`:
- `DELTAOPS-LITE-OPERACION.md` (§26).
- `DELTAOPS-LITE-MANUAL-USUARIO.md` (§27, **28 secciones**, sin credenciales).
- `DELTAOPS-LITE-MANUAL-TECNICO.md` (§28).

Con marcas **NO VERIFICADO** explícitas: backup del proveedor, secret stores por
entorno, colector externo/worker dedicado, secretos `M365_*` legado y verificación
de que `.gitignore` ignora `.env` (I-08).

**Clasificación: VERIFICADO** (existencia y honestidad de las salvedades).

---

## 24. Matriz final de estado por dominio (§29)

| Dominio | Estado | Nota |
|---|---|---|
| Seguridad | 🟢 | Cookies, secretos, fail-fast |
| RLS | 🟢 | Verificado en vivo (DGP-023.5) |
| RBAC | 🟢 | Con nota de diseño (rol legacy) |
| PostgreSQL (roles/privilegios) | 🟢 | owner/app_rw/app |
| Secrets | 🟢 | Sin fugas; separación HMAC |
| Tests / aislamiento BD | 🟢 | B1–B4 en 29 suites + seed |
| Datos históricos | 🟢 | Conteos canónicos exactos |
| Backup | 🟡 | **NO VERIFICADO** (proveedor) |
| Rollback | 🟡 | Procedimiento documentado, **no ensayado** |
| UX / E2E | 🟢 | Casos 1–5 PASS (matiz caso 4) |
| Responsive | 🟢 | Sin ALTA |
| Performance | 🟢 | C11 44 s → 2,4 s |
| Importador | 🟢 | Con salvedad +41 (one-time) |
| Deploy | 🟡 | Health gate, `CORS_ORIGINS` y secretos prod por configurar |
| Manuales | 🟢 | 3 entregados |

**Sin ningún 🔴.** Tres dominios en 🟡 (Backup, Rollback, Deploy).

---

## 25. Condiciones de release (§30)

Para habilitar producción deben cerrarse los 🟡:
1. **Verificar backup** del proveedor y **ensayar una restauración** real.
2. **Reapuntar el health gate** del despliegue de `/health` (liveness) a
   **`/ready`** (readiness real con `SELECT 1`).
3. **Definir `CORS_ORIGINS`** de producción (allowlist explícita).
4. **Configurar los secretos de producción** (`SESSION_SECRET`,
   `DELTAOPS_APP_PASSWORD`, `DELTAOPS_OWNER_PASSWORD`, `ATTACHMENT_URL_SECRET`) y
   **rotar/retirar** credenciales demo.
5. **Decisión de Dirección** sobre demo vs producción (§18).

---

## 26. Hallazgos abiertos y recomendaciones

- **GAP** health gate → `/ready` (§12) — REQUIERE CONFIGURACIÓN.
- **GAP** observabilidad: colector externo + worker de outbox (§17).
- **GAP** granularidad RBAC entre los tres roles operativos en módulos legacy (§7).
- **NO VERIFICADO** backup/restauración del proveedor (§15).
- **PARCIAL** rollback no ensayado (§16).
- **REQUIERE VERIFICACIÓN** `.gitignore` ignora `.env` (I-08).
- Retirar secretos `M365_*` legado (I-09b).

Ninguno es **BLOQUEANTE**.

---

## 27. Evidencia y trazabilidad

- Aislamiento: `lib/db/src/test-guard.ts`, `runtime-connection.ts` + tests
  (`lib/db/src/__tests__/`).
- RLS/multi-tenant/RBAC: verificaciones en vivo (SQL/curl) registradas en el doc
  de aislamiento `DELTAOPS-LITE-11-AISLAMIENTO-BD-TEST.md` y encargos previos.
- Rendimiento: `lib/design-system/src/components/overlays.tsx` (Tabs),
  `artifacts/deltaops/src/pages/activos-ficha.tsx`.
- Manuales: `docs/manual/`.

---

## 28. Riesgos residuales

1. **Restauración de datos no ensayada** — riesgo de recuperación ante desastre
   sin evidencia empírica (mitigar con ensayo, §25.1).
2. **Health gate en liveness** — un despliegue podría marcarse sano con la BD
   caída hasta reapuntar a `/ready` (§25.2).
3. **Configuración de producción pendiente** (CORS/secretos) — riesgo de
   exposición si se despliega sin cerrarla (§25.3–§25.4).

---

## 29. Responsables y próximos pasos

- **Dirección:** decisión demo vs producción (§18) y aprobación de release.
- **Operaciones/Plataforma:** backup+restauración, health gate, `CORS_ORIGINS`,
  secretos de producción.
- **Ingeniería:** retiro de `M365_*`, verificación `.gitignore`, evaluación de
  colector externo y granularidad RBAC (mejoras, no bloqueantes).

---

## 30. Veredicto (§36)

**No existe ningún dominio 🔴 ni hallazgo BLOQUEANTE.** Con tres dominios en 🟡
(Backup **NO VERIFICADO**, Rollback documentado pero **no ensayado**, Deploy con
health gate/CORS/secretos **por configurar**), el veredicto es:

> ### LISTO CONDICIONADO — RELEASE CANDIDATE para producción CONTROLADA
>
> Apto para un despliegue **controlado**, **condicionado** al cierre de las cinco
> condiciones de §25: (1) verificar backup y ensayar restauración; (2) reapuntar
> el health gate a `/ready`; (3) definir `CORS_ORIGINS`; (4) configurar y rotar
> secretos de producción y retirar credenciales demo; (5) decisión de Dirección
> sobre demo vs producción.

Clasificación del veredicto: **PARCIAL** (aprobación condicionada, sin maquillaje
de los 🟡).
