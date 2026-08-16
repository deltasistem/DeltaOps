# DELTAOPS — AUDITORÍA PRE-DEPLOY

**Fecha:** 15 de agosto de 2026 · **Alcance:** código, PostgreSQL, rutas, UI, informes, exportación, usuarios, seguridad y pruebas.
**Método:** verificación directa (SQL contra la base, curl contra la API en vivo, lectura de código con evidencia archivo:línea, ejecución de suites). Ningún dato fue tomado de la documentación sin contrastar. **No se modificó código ni datos.**

---

## 1. Resumen ejecutivo

La aplicación cumple estructuralmente el alcance (módulos, informes, exportación, RBAC/RLS, multi-tenant). La auditoría encontró, con evidencia directa en PostgreSQL, **tres hallazgos de datos** que deben resolverse antes del despliegue: (a) los read models de utilización están **desincronizados** (faltan 1.033 lecturas y 293 tanqueos reales en lo que muestran informes y UI), (b) el tenant `delta-demo` contiene **datos ficticios mezclados** con los datos reales LITE-09 (10 activos seed, 21 OTs seed, residuos de E2E), y (c) la base de desarrollo contiene **56 tenants efímeros de pruebas** y una tabla legacy `users` con 329 registros. Ninguno es un defecto de código de los informes: reflejan fielmente sus fuentes; el problema es el estado de los datos.

**Veredicto: 🟡 READY AFTER FIXES.**

## 2. Estado general

- Backend: 17 routers de módulos montados tras guard de identidad + entitlements (`artifacts/api-server/src/app.ts:100-164`).
- Frontend: hub y 9 informes operativos, exportación verificada en vivo hoy (CSV 200/20.301 bytes, XLSX 200/15.194 bytes, jobs `completed`).
- Pruebas de informes: **12/12 PASS** ejecutadas hoy contra `deltaops_test` (11,0 s).
- Seguridad: sin hallazgos nuevos; PLATFORM-CONSOLE-ACL (DGP-022) **cerrado** en código.

## 3. Matriz de requisitos

| Requisito | Código | Funciona | UI | Probado | Documentado | Estado |
|---|---|---|---|---|---|---|
| Autenticación y sesión obligatoria | ✔ `identity.ts`, `middleware.ts:25-61` | ✔ (login curl 200; export sin sesión 401 en test) | ✔ | ✔ | ✔ | IMPLEMENTADO |
| RBAC (6 roles) | ✔ membresías selladas en sesión | ✔ | ✔ | ✔ | ✔ | IMPLEMENTADO |
| RLS / aislamiento tenant | ✔ FORCE RLS (DGP-023.5); test de aislamiento A/B | ✔ | n/a | ✔ | ✔ | IMPLEMENTADO |
| Módulos de negocio (activos…costos) | ✔ `app.ts:129-160` | ✔ | ✔ | ✔ suites por módulo | ✔ | IMPLEMENTADO |
| 9 informes | ✔ `informes-datasets.ts` | ✔ | ✔ | ✔ 12/12 | ✔ | IMPLEMENTADO |
| Filtros y paginación de informes | ✔ declarados en catálogo | ✔ | ✔ | ✔ | ✔ | IMPLEMENTADO |
| Exportación CSV/XLSX auditada | ✔ `informes-module.ts:240-278` | ✔ verificado hoy | ✔ | ✔ | ✔ | IMPLEMENTADO |
| Consulta = exportación | ✔ mismo builder/filtros (`:254`) | ✔ | ✔ | ✔ | ✔ | IMPLEMENTADO |
| Dashboard/gráficos de informes | — | — | — | — | ✔ declarado NO incluido | NO IMPLEMENTADO (fuera de alcance cerrado) |
| Gráficos módulo Analytics (DGP-016) | ✔ SVG propio, `WidgetRenderer.tsx` | ✔ datos reales | ✔ `/analytics/dashboards/:id` | ✔ | ✔ | IMPLEMENTADO |
| Datos históricos LITE-09 visibles | ✔ | **PARCIAL** (read models desincronizados) | ⚠ | ✔ | ⚠ cifras del doc = read models | **CONTRADICTORIO** |
| Móvil / tema oscuro | ✔ | ✔ E2E 390px + oscuro | ✔ | ✔ | ✔ | IMPLEMENTADO |
| Administración de usuarios | ✔ invitaciones + `/administracion/usuarios` | ✔ | ✔ | ✔ | ✔ | IMPLEMENTADO |
| MTBF/MTTR/disponibilidad | — | — | — | — | ✔ excluidos deliberadamente | NO IMPLEMENTADO (deliberado) |

## 4–6. Módulos, faltantes y parciales

**Existentes:** identidad, plataforma (salud/consola/adjuntos firmados), referencia, activos (+preoperacional, hallazgo, históricos), órdenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics, utilización, mano de obra, costos, informes. **Faltantes (deliberados, documentados):** dashboard de informes, PDF, MTBF/MTTR/disponibilidad, despliegue. **Parciales:** ninguno funcional; el único «parcial» real es el estado de los datos (§7).

## 7–8. Auditoría de datos — conteos reales en PostgreSQL (tenant `delta-demo`)

| Entidad | Tabla escritura | Total | Read model | Histórico | Demo/seed | Fechas operacionales |
|---|---|---|---|---|---|---|
| Activos | `act_activos` | **38** | 38 | 28 (import, creador `6`) | **10 (`seed-demo`, BORRADOR)** | — |
| OTs vivas | `ord_ordenes` | 23 | 23 | 0 | **21 `seed-demo` + 2 de E2E** | creadas 2026-08-15 |
| Mantenimientos históricos | timeline (`entry`) | 109 | — | 109 | 0 | según import |
| Preoperacionales | `platform_records` | 3.740 | — | **3.736 ✔** (`contexto._origen=HISTORICO`) | 4 vivas (1 de E2E, 19:59Z) | 16:03–19:59Z |
| Lecturas | `utl_lecturas` | **7.597** | **6.564** | 7.588 (creador `6`) | 9 `seed-demo` | 2025-08-05 → 2026-08-13 |
| Tanqueos | `utl_tanqueos` | **1.100** | **807** | 1.096 | 4 `seed-demo` | ídem |
| Sesiones de trabajo | `ord_sesiones` | 1 | 1 | — | E2E | — |
| Valoraciones MDO | `mdo_valoraciones` | 1 | — | — | E2E | — |
| Ledger costos | `cos_hechos` | 1 | — | — | E2E | — |
| Movimientos inventario | `inv_movimientos` | 26 | 26 | — | seed | — |
| Planes / programas | `pln_planes`/`prv_programas` | 8 / 3 | — | — | seed | — |
| Usuarios (identidad) | `idn_memberships` | 5 | — | — | 5 demo (`*@delta.demo`) | — |
| Usuarios legacy | `users` | **189** | — | — | legacy/demo | — |

Fuera de `delta-demo`: **56 tenants efímeros de suites** (`hallazgo-http-*`, `inf-a-*`, `e2e-plat-*`) y 329 filas en `users` legacy — basura de pruebas en la base de desarrollo.

## 9. Discrepancia de los «38 activos» — explicada

- **¿De dónde sale el 38?** No es hardcode, ni COUNT inflado, ni JOIN, ni caché: la UI calcula `total = filas.length` del listado completo sin filtro (`activos-listado.tsx:139-165,204`), que la query pública sirve desde `act_activos_read`. SQL directo: `act_activos` = `act_activos_read` = **38 filas reales** (PK por tenant, sin duplicados).
- **¿Por qué «parecen muchos menos»?** Porque solo **28 son equipos reales** (Baritanque, C1–C11, DISAN #1–2, M1–M13, SEM05–07 — flota LITE-09, estado OPERATIVO, creador `6`). Los otros **10 son ficticios del seed de demostración** (`seed-demo`: CAT 320, Kenworth T880, Toyota 8FGCU25, etc.), en estado BORRADOR, mezclados en el mismo listado.
- **Conclusión:** el conteo es técnicamente correcto; el problema es **contaminación de datos demo** en el tenant que hoy contiene los datos reales.

## 10. Datos demo/ficticios identificados (inventario, sin borrar nada)

| Tabla | Identificador | Origen | Evidencia |
|---|---|---|---|
| `act_activos` | 10 activos `*-001` | `seed-demo` | `created_by='seed-demo'`, estado BORRADOR |
| `ord_ordenes` | 21 OTs | `seed-demo` | `created_by='seed-demo'` |
| `ord_ordenes` | OT-000023 «Hallazgo preoperacional…» + 1 | E2E (usuario 6, 20:00Z) | timeline `entry` 20:00:08Z |
| `utl_lecturas` / `utl_tanqueos` | 9 / 4 + «Lectura 123h», «Tanqueo 60L diesel» | seed + E2E | `created_by='seed-demo'`; entries 20:01Z |
| `platform_records` | 1 preop viva 19:59Z | E2E | timestamp |
| `ord_sesiones`, `mdo_valoraciones`, `cos_hechos` | 1 c/u | E2E FINAL-02/DGP-020 | conteos |
| `ten_tenants` | 56 tenants | suites integración | prefijos `hallazgo-http-`, `inf-a-`, `e2e-plat-` |
| `users` | 329 filas (189 en delta-demo) | legacy SGMA/E2E | tabla legacy, no es la autoridad (la autoridad es `idn_*`) |

## 11. Validación de históricos LITE-09 — **CONTRADICCIÓN ENCONTRADA**

| Cifra doc FINAL-02 | Read model (lo que ven informes) | Modelo de escritura (autoridad) |
|---|---|---|
| 3.736 preoperacionales | 3.736 ✔ | 3.736 ✔ |
| 109 mantenimientos | 109 ✔ | 109 ✔ |
| 6.564 lecturas | 6.564 | **7.597** |
| 807 tanqueos | 807 | **1.100** |

**Causa raíz (evidencia):** hubo dos corridas de importación hoy: 15:00Z (6.462 lecturas, proyectadas) y **19:00Z (1.134 lecturas nuevas, de las cuales 1.033 quedaron SIN proyectar** a `utl_lecturas_read`; ídem 293 tanqueos). Las filas huérfanas son hechos **reales y distintos** (no duplicados de contenido: verificación por `(activo,medidor,valor,fecha)` = 0 coincidencias), estado `vigente`, 11 activos, fechas operacionales 2025-09-05→2026-08-13. El outbox del kernel está vacío (0 pendientes): la proyección de la segunda corrida se interrumpió (coincide con el reinicio del api-server de esa hora) y no hay re-drenaje automático. **Impacto:** informes de horómetros y combustible sub-reportan ~14–27% de los datos reales. Las cifras del documento FINAL-02 describían fielmente los read models, pero no la autoridad. **No se corrigió nada** (pendiente de autorización); la reparación es una **reproyección** (no destructiva).

## 12–13. Auditoría de los 9 informes y exportación

Los 9 informes existen (`informes-datasets.ts`, registro `INFORMES`), consumen exclusivamente queries públicas con el principal de sesión, declaran filtros y paginan (≤500). Verificado hoy en vivo: catálogo, dataset de mantenimiento (132 = 23 vivas + 109 históricos), exportación CSV y XLSX 200 con cadena de auditoría `request→updateProgress→complete` (jobs `completed` en `platform_records`). «Consulta = exportación» garantizado por código (mismo builder, `informes-module.ts:254`) y por test. «—» presente en datos reales (centro de costos nulo). Sin truncamiento silencioso: advertencias de ventana en meta/UI/archivo. **Salvedad:** los informes de horómetros/combustible heredan la desincronización del §11. **Hallazgo menor:** 4 jobs de exportación quedaron en `pending` (progreso 0, 00:47–01:41Z de hoy) — exportaciones que fallaron fail-closed sin entregar archivo; las corridas actuales completan bien; los jobs huérfanos no bloquean pero conviene explicarlos/limpiarlos.

## 14–15. Gráficos, dashboard y comparación Power BI

- **Existe** una familia real de visualizaciones en el módulo Analytics (DGP-016): primitivas SVG/CSS propias (`graficos.tsx:37-194` — barras, línea/área, circular, gauge, heatmap), `WidgetRenderer` con 13 tipos, dashboards declarativos en `/analytics/dashboards/:id`, alimentados por el runtime de evaluación sobre fuentes PostgreSQL reales (`analytics-runtime.ts`). No usan datos ficticios (estados loading/error/empty honestos). Recharts está en package.json pero **no se usa** (candidato a retirar).
- **Único mock:** KPIs literales de la página `/design-system` (demo deliberada del design system).
- **El dashboard de informes FINAL-02 no existe** — decisión de alcance documentada.
- **Viabilidad Power BI (solo con datos confiables hoy):** activos por estado (`act_activos_read`), OTs por estado/tipo/equipo (`ord_ordenes_read`), preoperacionales por veredicto (record store), tanqueos por período/equipo (`utl_tanqueos_read`, volúmenes sí; **dinero no** — GAP-FUEL-MONEY), lecturas/horómetros por equipo (`utl_lecturas_read`), costos netos por equipo/moneda (ledger exacto). **No viables sin inventar:** MTBF/MTTR/disponibilidad, consumo normalizado (requiere horas confiables por período), distribución por proyecto (centro de costos vacío en datos reales). Cualquier gráfico debe esperar la reproyección del §11.

## 16. Usuarios y roles

- Autoridad: `idn_identities` (60), `idn_memberships`, `idn_roles`; creación por **invitaciones** (`/api/deltaops/invitations`) y pantalla `/administracion/usuarios`; TENANT_ADMIN puede crear usuarios **sin necesidad de despliegue** (funciona en el entorno actual).
- Roles: SUPER_ADMIN, TENANT_ADMIN, PLANIFICADOR, SUPERVISOR, TECNICO, CONSULTA. En `delta-demo` existen **solo los 5 usuarios demo** `*@delta.demo` (contraseñas derivadas por entorno, sin credenciales literales). **No hay usuarios reales aún.** La tabla legacy `users` (329) no es autoridad y contiene residuos.

## 17. Seguridad

Verificado por inspección dirigida (evidencias archivo:línea en la exploración):
- Sin endpoints que acepten tenant del cliente, salvo adjuntos firmados por HMAC+TTL (por diseño, `attachment-serve.ts:30-67`).
- Todo `/api` de negocio detrás de `requireIdentityForModules` + entitlements (`app.ts:122-160`); consola de plataforma exige SUPER_ADMIN de membresía sellada (`platform-console.ts:35`) — **PLATFORM-CONSOLE-ACL cerrado**.
- Guards de frontend son solo visuales y tienen autoridad backend equivalente; no se halló ruta protegida solo en frontend.
- RLS forzado con roles de mínimo privilegio (DGP-023.5); aislamiento probado por test A/B.
- Cookies: HttpOnly, SameSite=lax, Secure en producción, 8 h, store PostgreSQL. CORS: allowlist por `CORS_ORIGINS`, cerrado por defecto en producción; **en dev refleja cualquier Origin** (aceptable en dev; exige configurar `CORS_ORIGINS` en DEPLOY-01).
- Pendientes conocidos de infraestructura (DGP-023.6, no regresiones): fallback de conexión, health gate, SESSION_SECRET reutilizado como HMAC — pertenecen a DEPLOY-01.

## 18. Pruebas

- Suite de informes (12 pruebas de integración HTTP+PG): **PASS 12/12** (ejecutada hoy, 11,0 s, contra `deltaops_test`).
- Suites por módulo existentes (activos, órdenes, inventario, costos, identidad, etc.): PASS en sus fases de cierre respectivas; no se re-ejecutó el paquete completo hoy (≈ decenas de minutos) — clasificación: **NO RE-EJECUTADO HOY** (sin cambios de código desde FINAL-02, riesgo bajo).
- E2E navegador (FINAL-02): PASS; **efecto colateral detectado:** el E2E creó datos en `delta-demo` (§10).

## 19. Contradicciones encontradas

1. **Doc FINAL-02 vs base:** «6.564 lecturas / 807 tanqueos históricos» — correcto respecto a read models, **incorrecto** respecto a la autoridad (7.597 / 1.100). Causa: proyección interrumpida (§11).
2. **«38 activos» vs percepción:** el número es real pero incluye 10 activos ficticios de seed.
3. **«Históricos intactos»:** los históricos no fueron modificados, pero conviven con residuos de seed/E2E en el mismo tenant.

## 20. Riesgos para producción

- **R1 (alto):** desplegar con read models desincronizados ⇒ informes oficiales sub-reportando lecturas/tanqueos.
- **R2 (alto):** desplegar `delta-demo` como tenant productivo con datos ficticios mezclados ⇒ informes y KPIs contaminados.
- **R3 (medio):** sin usuarios reales creados; solo cuentas demo con contraseñas derivadas de entorno de desarrollo.
- **R4 (medio):** falta de mecanismo de re-drenaje/reproyección ante interrupciones (lo que causó R1 puede repetirse).
- **R5 (bajo):** basura de pruebas (56 tenants, `users` legacy, jobs `pending`) — no viaja a producción si la base productiva se crea limpia, pero exige decidir la estrategia de datos (Opción C demo-vs-prod, PDC-01).

## 21. Cambios necesarios antes de DEPLOY-01 (requieren autorización)

1. **Reproyectar** utilización de `delta-demo` (no destructivo) y verificar 7.597/1.100 en read models e informes.
2. **Separar datos ficticios de reales**: retirar del tenant real los 10 activos seed, 21 OTs seed y residuos E2E, o (mejor, alineado con PDC-01 Opción C) crear el tenant productivo limpio importando solo LITE-09 y dejar `delta-demo` como demo.
3. **Corregir el documento FINAL-02** (cifras de históricos con nota de causa) o anexar esta auditoría como fe de erratas.
4. **Plan de usuarios reales** (invitaciones + contraseñas propias) — ya ejecutable sin desplegar.

## 22. Cambios que pueden quedar para fase posterior

Limpieza de tenants efímeros y `users` legacy en dev; retiro de Recharts sin uso; limpieza/explicación de jobs `pending`; mecanismo automático de re-drenaje; hardening de infraestructura restante (CORS prod, health gate, secretos) — propio de DEPLOY-01.

## 23. Recomendación final

# 🟡 READY AFTER FIXES

La arquitectura, la seguridad, los informes y las pruebas están en condición de despliegue. **No se debe ejecutar DEPLOY-01** hasta resolver, con autorización de Dirección: (1) la reproyección de utilización, (2) la separación de datos ficticios del tenant real y (3) la corrección documental. Ninguna de las tres es destructiva por naturaleza y las tres son de esfuerzo acotado.
