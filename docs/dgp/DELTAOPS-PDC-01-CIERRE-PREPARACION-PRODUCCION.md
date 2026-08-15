# DELTAOPS · PDC-01 — Cierre de Preparación para Producción Controlada

> **Directiva:** PDC-01 «Preparación y Validación para Producción Controlada»
> (entregable §31). **Fecha:** 2026-08-15.
>
> **Regla dura acatada:** CERO desarrollo de funcionalidades de negocio. En esta
> fase solo hubo **configuración, verificación y documentación** (más una
> corrección de despliegue permitida por §3: el health gate de readiness). No se
> crearon módulos, tablas, roles ni pantallas; no se eliminaron datos ni
> credenciales; **sin commits** en este entregable.
>
> **Documentos hermanos de esta fase (fuentes de detalle):**
> - `docs/dgp/DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` — matriz de variables
>   (§7), auditoría de credenciales/demo (§12), demo vs producción (§14),
>   checklist de carga (§15), observabilidad (§26), backup/rollback (§27/§28).
> - `docs/dgp/DELTAOPS-LITE-11-CIERRE-FINAL.md` — Release Candidate LITE-11.
> - `docs/manual/DELTAOPS-LITE-OPERACION.md` (§3.6, actualizado a «VERIFICADO EN
>   DOCUMENTACIÓN» para el backup del proveedor).
>
> **Convención de estado (directiva §31):** 🟢 VERIFICADO · 🟡 PENDIENTE ·
> 🔴 BLOQUEANTE · ⚪ NO APLICA. «VERIFICADO EN DOCUMENTACIÓN» = confirmado en la
> documentación oficial del proveedor; ensayo real aún pendiente. Cada 🟡 indica
> su **responsable** (Dirección / Infraestructura).
>
> **Secretos:** este documento **solo nombra** variables/secretos; jamás
> contiene valores.

---

## 1. Estado actual — 🟢 VERIFICADO

DeltaOps Lite se encuentra en **Release Candidate LITE-11** (commit `bfd0feb`).
Durante PDC-01 **no se desarrolló funcionalidad nueva**: solo cambios de
configuración/despliegue (health gate → readiness), verificaciones en vivo y
documentación. La filosofía de la fase fue PREPARAR → VERIFICAR → PROTEGER →
DESPLEGAR CONTROLADAMENTE → OBSERVAR, sin ampliar el alcance del producto.

## 2. Infraestructura — 🟡 PENDIENTE (publicación)

- **Plataforma:** Replit.
- **Estado de publicación:** la aplicación **NO está publicada** todavía
  (`getDeploymentInfo`: `isDeployed=false`).
- **Target de despliegue:** **autoscale**.
- **Artefactos:** `api-server` (Node, `dist` compilado) + `deltaops` (frontend
  **estático**). El health gate del servicio de producción se define en
  `artifact.toml` (`services.production.health.startup.path`).
- 🟡 **Responsable — Dirección:** autorizar la publicación (la directiva §30 no
  autoriza el deploy final automático; requiere aprobación explícita).

## 3. Base de datos — 🟡 PENDIENTE (BD de producción)

- **Motor:** PostgreSQL de Replit (Helium), base `heliumdb`.
- **Separación de entornos:** las bases de **DESARROLLO** y **PRODUCCIÓN** son
  **SEPARADAS** por la plataforma. La base de producción se **aprovisiona al
  publicar** y el **esquema se aplica al publicar**.
- 🟡 **Responsable — Dirección/Infraestructura:** la **BD de producción no existe
  aún** hasta que se publique; las verificaciones que la requieren (ensayo de
  restore, rol efectivo en producción, gate del despliegue real) quedan
  condicionadas a la publicación.

## 4. Backup — 🟡 PENDIENTE (ensayo real) / 🟢 mecanismo VERIFICADO EN DOCUMENTACIÓN

- **Mecanismo:** *Point-in-Time Recovery* (PITR) automático del proveedor.
  **VERIFICADO EN DOCUMENTACIÓN** oficial de Replit.
- **Retención:** **7 días** (plan Core) / **28 días** (planes Pro/Teams). La
  retención efectiva del plan contratado 🟡 REQUIERE VERIFICACIÓN (Dirección).
- **Automático:** sí (continuo por timestamp).
- **Restore:** desde el *Database pane → restore settings*, a una **instancia
  SEPARADA**, **sin sobrescribir** producción.
- **RPO:** ≈ ventana de PITR con **granularidad por timestamp** (recuperación a
  un punto en el tiempo, RPO tendiente a segundos/minutos dentro de la ventana).
- **RTO:** **no publicado** por el proveedor → 🟡 (Infraestructura debe medirlo
  en el ensayo).
- 🟡 **Responsable — Infraestructura:** el **ensayo real de restauración** (a una
  instancia aislada, con comparación de empresas/activos/órdenes/preoperacionales/
  combustible/horómetros/históricos/usuarios/relaciones/integridad, conforme a §5
  de la directiva) **está PENDIENTE** y solo es posible con la **BD de producción
  publicada**. Nunca usar producción como laboratorio.

## 5. Restore — 🟡 PENDIENTE (ensayo)

Procedimiento documentado en `DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §27/§28
(restauración a instancia separada, validación, comparación; jamás sobre
producción). 🟡 **Responsable — Infraestructura:** ejecutar el ensayo tras
publicar.

## 6. Secrets — 🟡 PENDIENTE (valores de producción)

- **Matriz completa** en `DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §7 (fail-fast
  verificados en código). Aclaración recogida: **`DATABASE_MIGRATION_URL` NO
  existe**; su equivalente es `DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD`.
- Secretos críticos a definir/rotar en producción: `DELTAOPS_APP_PASSWORD`,
  `DELTAOPS_OWNER_PASSWORD`, `SESSION_SECRET`, `ATTACHMENT_URL_SECRET`
  (recomendado separarlo de `SESSION_SECRET`), `GRAPH_CLIENT_SECRET`,
  `DELTAOPS_ADMIN_PASSWORD` y, solo si se siembra demo en producción, `DEMO_*`.
- 🟡 **Responsable — Dirección:** definir los **valores de producción** en el
  *secret store* (nunca en el repositorio). Retirar del entorno de producción las
  variables legadas `M365_*` (no las usa el runtime).

## 7. CORS — 🟡 PENDIENTE (dominio)

- Allowlist por `CORS_ORIGINS` **implementada y verificada** (sin `*`; en
  producción, sin allowlist queda cerrado a mismo origen — seguro por defecto).
- 🟡 **Responsable — Dirección:** definir `CORS_ORIGINS` de producción, que
  depende del **dominio definitivo** (punto 8).

## 8. HTTPS — 🟡 PENDIENTE DE DIRECCIÓN (dominio)

- La plataforma provee **TLS automático** en `*.replit.app` y en dominios
  personalizados (certificado gestionado por el proveedor); `trust proxy`
  configurado para cookies `Secure` tras la terminación TLS.
- 🟡 **Responsable — Dirección:** el **dominio definitivo** está **PENDIENTE DE
  DIRECCIÓN** (no se inventa dominio). Al fijarlo, verificar DNS, certificado,
  redirección HTTP→HTTPS, cookies `Secure` y `CORS_ORIGINS`.

## 9. Health / Ready — 🟢 VERIFICADO (corregido en esta fase)

- **CORREGIDO EN PDC-01:** el health gate del despliegue
  (`artifact.toml` → `services.production.health.startup.path`) se **reapuntó**
  de `/api/deltaops/platform/health` a **`/api/deltaops/platform/ready`**.
- `/ready` implementa **readiness real**: `SELECT 1` a la BD + verificación de
  `SESSION_SECRET`; responde **200** cuando está listo y **503** cuando una
  dependencia crítica no lo está (**verificado localmente y por código** en esta
  fase; la verificación bajo el despliegue real de autoscale sigue pendiente).
- 🟡 **Responsable — Infraestructura:** confirmar que el **deployment reconoce el
  gate** en la **publicación real** (requiere publicar; punto 2).

## 10. Migraciones — 🟢 VERIFICADO

- Procedimiento con rol **owner** documentado
  (`DELTAOPS_DB_ROLE=owner` + `DELTAOPS_OWNER_PASSWORD`, `drizzle.config.ts`).
- El **runtime NO ejecuta DDL**; las migraciones las corre un proceso
  administrativo con el rol `deltaops_owner`, nunca el servicio de runtime. No se
  ejecutan migraciones destructivas sobre producción.

## 11. Runtime PostgreSQL — 🟢 VERIFICADO EN VIVO

- Verificado **en vivo** en esta fase: los roles `deltaops_app` y
  `deltaops_owner` **no** son `SUPERUSER` ni `BYPASSRLS`.
- **Fail-fast confirmado en vivo:** en producción, sin `DELTAOPS_APP_PASSWORD`
  (y sin rol owner explícito), `resolveRuntimeConnectionString` **LANZA** (no hay
  fallback a superusuario); el mensaje de error **no contiene secretos**.
- Garantía: PRODUCCIÓN → `deltaops_app` → NO SUPERUSER → NO BYPASSRLS.

## 12. RLS — 🟢 VERIFICADO EN VIVO

- Re-verificado en vivo: sin contexto de tenant (`app.tenant_id` no fijado) ⇒
  **0 filas**; consulta cross-tenant ⇒ **0 filas**; **FORCE RLS** activo en las
  tablas del esquema `deltaops`.

## 13. RBAC — 🟢 VERIFICADO

- Spot-check **en vivo**: rol **CONSULTA → 403** en mutación; el **importador
  histórico → 403** para `TECNICO` y **200** para administración de empresa.
- Matriz de autorización completa heredada de LITE-11 (backend authority).

## 14. Datos históricos — 🟢 VERIFICADO (Δ=0)

- **Δ=0 exacto** frente al baseline LITE-09/LITE-11, reconciliado sobre la tabla
  correcta `deltaops.platform_records` (`service='platform.timeline'`,
  `record_type='entry'`, marca histórica `data->>'eventType' LIKE 'historico.%'`
  ≡ `data->'payload'->>'origen'='HISTORICO'`), tenant `delta-demo`:
  - **3736** preoperacionales (`historico.preoperacional`)
  - **1971** jornadas (`historico.jornada`)
  - **109** mantenimientos = **48** `historico.mantenimiento.rutina` + **61**
    `historico.mantenimiento.correctivo`
  - **Total = 5816** entradas `historico.*`.
  - **38** activos; **807** tanqueos (incluye el **+1** conocido de una prueba
    E2E). C11 (equipo de tercero) = **0** mantenimientos internos (regla §20/§21).
- **Aclaración de auditoría documentada:** la cifra **12755** es el **timeline
  TOTAL del tenant** `delta-demo` (5816 históricos + **6939** eventos vivos de la
  demo `modulo.*`), **no** el subconjunto histórico ni el total global. Los
  tenants efímeros de test (`hallazgo-http-*`, `preop-http-*`, `pgabs-*`,
  `t-utl-*`) **no tocan** `delta-demo`; se listan en
  `DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §12 como **candidatos a limpieza por
  Dirección** (nada eliminado en esta fase).
- Los históricos conservan su **fecha operacional real**; no se creó ni modificó
  dato alguno.

## 15. Importador — 🟢 VERIFICADO

- El importador histórico permanece **admin-only**, validado, **idempotente**
  (claves deterministas UUIDv5 con `tenant` en la clave), con preview y reporte
  de omitidos (LITE-11). **Sin cambios** en PDC-01. No expuesto a usuarios
  operativos.

## 16. Demo vs producción — 🟡 PENDIENTE (decisión de Dirección)

- Análisis de las tres opciones (A: `delta-demo`→producción; B: tenant nuevo +
  migrar con el importador; C: conservar `delta-demo` como demo independiente) en
  `DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §14.
- **RECOMENDACIÓN técnica: Opción C** — conservar `delta-demo` como demo y crear
  un **tenant productivo nuevo** poblado por el **importador oficial** (mecánica
  de B). Elimina el riesgo destructivo de A (la seed demo apuntando al tenant
  real) y respeta la prohibición de borrar demo.
- 🟡 **Responsable — Dirección:** decisión explícita. **No borrar `delta-demo`**
  hasta que exista. Condición: confirmar disponibilidad de los archivos fuente
  LITE-09 para poblar el tenant productivo.

## 17. Usuarios — 🟡 PENDIENTE (ejecución de acciones)

- Auditoría en `DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §12 con clasificación
  por sujeto: **CONSERVAR / ROTAR / ELIMINAR / REEMPLAZAR** (usuarios
  `@delta.demo`, `admin@deltaops.dev` → ROTAR, secretos `DEMO_*` /
  `DELTAOPS_ADMIN_PASSWORD`, `M365_*` legado → ELIMINAR del entorno, tenants
  efímeros).
- 🟡 **Responsable — Dirección:** ejecutar las acciones marcadas **antes del
  lanzamiento**, tras decidir el punto 16. Nada eliminado/rotado en esta fase.

## 18. Seguridad — 🟢 VERIFICADO

- Consolidado LITE-11 **PASS** (RLS, FORCE RLS, RBAC, backend authority, tenant
  isolation, sesiones, cookies, CORS, secrets, endpoints, importador) reforzado
  con las **re-verificaciones en vivo** de PDC-01 (puntos 9, 11, 12, 13).

## 19. Pruebas — 🟢 VERIFICADO

- Suites en verde; el **guard de aislamiento de BD de test B1–B4** impide
  ejecutar suites destructivas contra una base que no sea de test (fail-closed).
  E2E LITE-11 **PASS**. En PDC-01 se reforzó la carga del guard vía subpath sin
  efectos (`@workspace/db/test-guard`).

## 20. Piloto — 🟡 PENDIENTE (ejecución con usuarios reales)

- **Estrategia definida** (no es un módulo nuevo, es despliegue): **un centro**,
  **pocos usuarios**, **algunos activos reales**, operación real.
- **Guion de piloto (caso operacional §19 de la directiva) — checklist de 15
  pasos:**
  1. Login. 2. Home. 3. Seleccionar equipo. 4. Registrar horómetro. 5. Revisar
  rutina. 6. Ejecutar preoperacional. 7. Obtener APTO/NO APTO. 8. Si hay
  hallazgo, generar mantenimiento. 9. Ejecutar OT. 10. Registrar mano de obra.
  11. Registrar repuesto/insumo. 12. Registrar combustible cuando aplique.
  13. Validar. 14. Cerrar. 15. Consultar hoja de vida.
- 🟡 **Responsable — Dirección:** ejecutar el piloto con usuarios reales tras la
  publicación controlada.

## 21. Rollback — 🟢 VERIFICADO (documentado) / 🟡 ensayo pendiente

- Plan documentado (`DELTAOPS-PDC-01-PREPARACION-OPERATIVA.md` §28):
  - **Aplicación:** checkpoint + republicar (el rollback in-place del deployment
    ya no está soportado por la plataforma).
  - **Base de datos:** PITR a instancia separada.
  - **Configuración:** reponer valores anteriores (en producción, **nunca**
    quitar `DELTAOPS_APP_PASSWORD` como vía de rollback).
  - **Secrets:** rotar/revertir por el *secret store*.
  - **Regla absoluta:** **jamás «volver a superusuario».**
- 🟡 **Responsable — Infraestructura:** el ensayo de restauración de BD (punto 4)
  valida también la parte de rollback de datos.

## 22. Observabilidad — 🟢 VERIFICADO (app) / 🟡 retención externa

- Logs en el **panel de publicación** de la plataforma; `pino`/`pino-http` con
  **redacción** de `authorization`/`cookie`/`set-cookie` y elisión de query
  string; detección de 5xx, caída de BD, `/ready`, 401/403 de auth y errores de
  importación (detalle en `PREPARACION-OPERATIVA.md` §26). **VERIFICADO EN
  CÓDIGO.**
- ⚪/🟡 Retención/alertas externas y agregación de logs del proveedor:
  🟡 **Responsable — Infraestructura** (confirmar retención/alertas en el panel);
  ⚪ integración con SIEM externo no aplica en esta fase.

## 23. Riesgos — informativo

1. **Ensayo de restauración pendiente** (requiere BD de producción) —
   Infraestructura.
2. **Dominio definitivo y `CORS_ORIGINS` sin definir** — Dirección.
3. **Credenciales demo/admin por rotar** y variables legadas `M365_*` por retirar
   — Dirección.
4. **Granularidad de rol legacy colapsada** en módulos distintos de Órdenes
   (mapeo canónico→legacy admin/operador/lector); documentado, sin impacto de
   seguridad conocido — deuda futura.
5. **Tenants efímeros de test residuales** en la BD de desarrollo compartida
   (no afectan `delta-demo`) — candidatos a limpieza; Dirección/Infraestructura.
6. **RTO no publicado** por el proveedor — medir en el ensayo; Infraestructura.

## 24. Bloqueantes — 🟢 NINGUNO

**No existe ningún bloqueante técnico (🔴 = 0).** Los pendientes son operativos y
dependen de la publicación y de decisiones de Dirección.

## 25. Pendientes (consolidado, con responsable) — 🟡

| # | Pendiente | Responsable |
|---|---|---|
| 1 | Publicar (autorización + deploy) para aprovisionar la BD de producción y aplicar el esquema | Dirección (autoriza) / Infraestructura (ejecuta) |
| 2 | Ensayo real de restauración PITR a instancia separada + medición de RTO | Infraestructura |
| 3 | Definir dominio definitivo (DNS/HTTPS/cookies) y `CORS_ORIGINS` de producción | Dirección |
| 4 | Definir/rotar secretos de producción (`DELTAOPS_*_PASSWORD`, `SESSION_SECRET`, `ATTACHMENT_URL_SECRET`, `GRAPH_CLIENT_SECRET`, `DELTAOPS_ADMIN_PASSWORD`); retirar `M365_*` | Dirección |
| 5 | Decisión demo vs producción (Opción C recomendada) y confirmar fuentes LITE-09 | Dirección |
| 6 | Ejecutar acciones de la auditoría de usuarios/credenciales (§12) | Dirección |
| 7 | Ejecutar el piloto controlado (guion de 15 pasos) con usuarios reales | Dirección |
| 8 | Confirmar el reconocimiento del health gate `/ready` en el despliegue real | Infraestructura |

## 26. Recomendación de Dirección (directiva §33)

### 🟡 PRODUCCIÓN CONTROLADA CONDICIONADA

**No existen bloqueantes técnicos.** La base técnica está verificada: runtime de
mínimo privilegio sin superusuario/bypass (verificado en vivo), RLS/FORCE
RLS/RBAC re-verificados, fail-fast de conexión y de proveedor de correo, health
gate de readiness corregido y probado en vivo, datos históricos íntegros (Δ=0),
importador admin-only e idempotente, backup del proveedor verificado en
documentación, y planes de rollback/observabilidad documentados.

La autorización de **producción controlada** queda **condicionada** a que
Dirección/Infraestructura completen las **tareas operativas** del punto 25 —en
particular: publicar para aprovisionar la BD de producción, **ensayar la
restauración**, fijar **dominio + CORS**, definir/rotar **secretos de
producción**, decidir la **estrategia demo/producción** y ejecutar el **piloto
controlado**.

> **Detención (directiva §34):** finalizada PDC-01, **no** se crean nuevas
> funcionalidades ni se inicia otro ciclo de desarrollo. La decisión de
> despliegue final corresponde a Dirección y requiere aprobación explícita
> (directiva §30).
