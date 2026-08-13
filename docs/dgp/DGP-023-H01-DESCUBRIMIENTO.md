# DGP-023-H01 — DISCOVERY DE SUPERFICIE LEGACY SGMA

> **ESTADO: SOLO ANÁLISIS DE DEPENDENCIAS.** No se implementó ningún cambio: no se agregó autenticación, no se eliminaron rutas ni tablas, no se modificó RLS, frontend ni backend. Único entregable: este documento. **NO commit.** Fecha: 2026-08-13.

---

## 0. Contexto

DGP-023 marcó H-01 como **CRÍTICO**: los routers legacy SGMA exponen CRUD **sin autenticación ni tenant** en `/api/*`. La Dirección solicita, **antes de decidir**, un análisis de dependencias exhaustivo para determinar si esa superficie puede eliminarse, aislarse, migrarse o mantenerse protegida. Este Discovery responde a los 12 puntos de la directiva con evidencia `archivo:línea` / salida de comando.

## 1. Rutas legacy involucradas y métodos HTTP (desde el código real)

Todos montados en `app.ts:101` → `app.use("/api", router)`, siendo `router` el de `artifacts/api-server/src/routes/index.ts` (que agrega los 10 sub-routers, `index.ts:14-25`). **Ninguno pasa por `requireIdentityForModules`/`enforceEntitlements`** (esos solo gobiernan `/deltaops/*`, montados antes en `app.ts:87-88`).

| Router (archivo) | Método | Ruta | Línea |
|---|---|---|---|
| health.ts | GET | `/api/healthz` | `health.ts:6` |
| dashboard.ts | GET | `/api/dashboard/summary` | `dashboard.ts:23` |
| dashboard.ts | GET | `/api/dashboard/asset-status` | `dashboard.ts:99` |
| dashboard.ts | GET | `/api/dashboard/work-orders-by-type` | `dashboard.ts:119` |
| dashboard.ts | GET | `/api/dashboard/costs-by-month` | `dashboard.ts:139` |
| dashboard.ts | GET | `/api/dashboard/costs-by-asset` | `dashboard.ts:162` |
| dashboard.ts | GET | `/api/dashboard/recent-activity` | `dashboard.ts:180` |
| assets.ts | GET | `/api/assets` | `assets.ts:42` |
| assets.ts | POST | `/api/assets` | `assets.ts:70` |
| assets.ts | GET | `/api/assets/:id` | `assets.ts:81` |
| assets.ts | PATCH | `/api/assets/:id` | `assets.ts:99` |
| assets.ts | DELETE | `/api/assets/:id` | `assets.ts:123` |
| assets.ts | GET | `/api/assets/:id/history` | `assets.ts:140` |
| work-orders.ts | GET | `/api/work-orders` | `work-orders.ts:82` |
| work-orders.ts | POST | `/api/work-orders` | `work-orders.ts:101` |
| work-orders.ts | GET | `/api/work-orders/:id` | `work-orders.ts:140` |
| work-orders.ts | PATCH | `/api/work-orders/:id` | `work-orders.ts:158` |
| work-orders.ts | DELETE | `/api/work-orders/:id` | `work-orders.ts:192` |
| maintenance-plans.ts | GET | `/api/maintenance-plans` | `maintenance-plans.ts:47` |
| maintenance-plans.ts | POST | `/api/maintenance-plans` | `maintenance-plans.ts:55` |
| maintenance-plans.ts | PATCH | `/api/maintenance-plans/:id` | `maintenance-plans.ts:79` |
| maintenance-plans.ts | DELETE | `/api/maintenance-plans/:id` | `maintenance-plans.ts:113` |
| spare-parts.ts | GET | `/api/spare-parts` | `spare-parts.ts:34` |
| spare-parts.ts | POST | `/api/spare-parts` | `spare-parts.ts:62` |
| spare-parts.ts | PATCH | `/api/spare-parts/:id` | `spare-parts.ts:73` |
| spare-parts.ts | DELETE | `/api/spare-parts/:id` | `spare-parts.ts:97` |
| spare-parts.ts | POST | `/api/spare-parts/:id/movements` | `spare-parts.ts:114` |
| locations.ts | GET | `/api/locations` | `locations.ts:15` |
| locations.ts | POST | `/api/locations` | `locations.ts:32` |
| locations.ts | PATCH | `/api/locations/:id` | `locations.ts:42` |
| locations.ts | DELETE | `/api/locations/:id` | `locations.ts:65` |
| work-centers.ts | GET | `/api/work-centers` | `work-centers.ts:15` |
| work-centers.ts | POST | `/api/work-centers` | `work-centers.ts:23` |
| work-centers.ts | PATCH | `/api/work-centers/:id` | `work-centers.ts:36` |
| work-centers.ts | DELETE | `/api/work-centers/:id` | `work-centers.ts:59` |
| technicians.ts | GET | `/api/technicians` | `technicians.ts:25` |
| technicians.ts | POST | `/api/technicians` | `technicians.ts:33` |
| technicians.ts | PATCH | `/api/technicians/:id` | `technicians.ts:47` |
| technicians.ts | DELETE | `/api/technicians/:id` | `technicians.ts:71` |
| suppliers.ts | GET | `/api/suppliers` | `suppliers.ts:15` |
| suppliers.ts | POST | `/api/suppliers` | `suppliers.ts:23` |
| suppliers.ts | PATCH | `/api/suppliers/:id` | `suppliers.ts:33` |
| suppliers.ts | DELETE | `/api/suppliers/:id` | `suppliers.ts:56` |

Total: **43 rutas** (1 health + 6 dashboard + 36 CRUD). `healthz` es inocuo (no toca datos); las 42 restantes son CRUD/lectura sobre `public.*` sin auth.

## 2. Qué archivos/frontend llaman estas rutas HOY

**Cliente HTTP generado (orval):** `lib/api-client-react/src/generated/api.ts` contiene las URLs literales de TODOS los endpoints legacy (`/api/assets`, `/api/work-orders`, `/api/dashboard/summary`, `/api/spare-parts`, `/api/locations`, `/api/work-centers`, `/api/technicians`, `/api/suppliers`, `/api/maintenance-plans`, incl. `/history` y `/movements`) — verificado por `rg` de literales `/api/...` en el archivo generado. Este cliente se genera desde `lib/api-spec/openapi.yaml` (paths declarados en `openapi.yaml:161-427+`) vía `lib/api-spec/orval.config.ts` (`baseUrl: "/api"`).

**Frontend `artifacts/sgma` (producto separado, workflow `artifacts/sgma: web` en ejecución):** consume los hooks generados en 10 páginas de negocio:

| Página sgma | Hooks generados usados (⇒ endpoint legacy) |
|---|---|
| `src/pages/dashboard.tsx` | `useGetDashboardSummary`, `useGetAssetStatusBreakdown`, `useGetWorkOrdersByType`, `useGetCostsByMonth`, `useGetRecentActivity` ⇒ `/api/dashboard/*` |
| `src/pages/activos.tsx` | `useListAssets`, `useCreate/Update/DeleteAsset`, `useListWorkCenters`, `useListLocations` ⇒ `/api/assets`, `/api/work-centers`, `/api/locations` |
| `src/pages/activo-detalle.tsx` | `useGetAsset`, `useGetAssetHistory` ⇒ `/api/assets/:id`, `/api/assets/:id/history` |
| `src/pages/ordenes.tsx` | `useListWorkOrders`, `useCreate/Update/DeleteWorkOrder`, `useListAssets`, `useListWorkCenters`, `useListTechnicians` ⇒ `/api/work-orders`, `/api/assets`, `/api/work-centers`, `/api/technicians` |
| `src/pages/preventivo.tsx` | `useListMaintenancePlans`, `useCreate/Update/DeleteMaintenancePlan`, `useListAssets` ⇒ `/api/maintenance-plans`, `/api/assets` |
| `src/pages/repuestos.tsx` | `useListSpareParts`, `useCreate/Update/DeleteSparePart`, movimientos ⇒ `/api/spare-parts`, `/api/spare-parts/:id/movements` |
| `src/pages/personal.tsx` | `useListTechnicians`, `useCreate/Update/DeleteTechnician`, `useListWorkCenters` ⇒ `/api/technicians`, `/api/work-centers` |
| `src/pages/centros.tsx` | `useListWorkCenters`, `useCreate/Update/DeleteWorkCenter` ⇒ `/api/work-centers` |
| `src/pages/ubicaciones.tsx` | `useListLocations`, `useCreate/Update/DeleteLocation` ⇒ `/api/locations` |
| `src/pages/proveedores.tsx` | `useListSuppliers`, `useCreate/Update/DeleteSupplier` ⇒ `/api/suppliers` |

(`src/pages/not-found.tsx` no consume API.) `artifacts/sgma/package.json` depende de `@workspace/api-client-react` (`package.json`). Evidencia: `rg` de los `useList*/useGet*/getList*QueryKey` en `artifacts/sgma/src/pages`.

**Frontend `artifacts/deltaops` (producto principal):** **NO llama a ningún endpoint legacy.** `rg` de todos los hooks legacy (`useListAssets|useListWorkOrders|useListTechnicians|useListSpareParts|useListMaintenancePlans|useListWorkCenters|useListLocations|useListSuppliers|useDashboard*|useGetAsset|useCreate*`) en `artifacts/deltaops/src` → **0 coincidencias**. El único símbolo de `@workspace/api-client-react` que DeltaOps importa es `useDeltaopsMe` / `getDeltaopsMeQueryKey` (`/api/deltaops/auth/me`), presente en `console.tsx`, `consola-activos.tsx` y los `Shell.tsx` de cada módulo. DeltaOps consume su propia API `/deltaops/*` mediante `fetch` directo en `src/lib/<modulo>/api.ts`.

## 3. Módulos de DeltaOps que importan o dependen de estos routers

**NINGUNO.** Evidencia:
- Los símbolos de tabla SGMA (`workOrdersTable`, `assetsTable`, `locationsTable`, `maintenancePlansTable`, `stockMovementsTable`, `suppliersTable`, `sparePartsTable`, `workCentersTable`, `techniciansTable`) se importan **solo** en: (a) los 10 routers legacy (`routes/*.ts`) y (b) `scripts/src/seed-sgma.ts`. `rg` de esos símbolos excluyendo `lib/db` y `routes/*.ts` → solo `seed-sgma.ts`.
- Los módulos DeltaOps (`routes/deltaops/*-module.ts`, `*-runtime.ts`, `lib/module-*`) importan de `@workspace/db` **únicamente** `db`, `pool` y `deltaopsUsersTable` — nunca una tabla SGMA. Evidencia: `rg "@workspace/db"` en todo el repo.
- `routes/index.ts` (el router legacy) **no es importado** por ningún archivo `/deltaops/*`; solo por `app.ts:4` (`import router from "./routes"`).

## 4. Jobs, workflows, seeds y scripts que dependen de ellos

- **`scripts/src/seed-sgma.ts`** — único script que puebla las tablas `public.*` SGMA. Registrado como `pnpm --filter @workspace/scripts run seed-sgma` (`scripts/package.json:8`). **Ejecución manual**; NO está referenciado por ningún workflow, `.replit`, artifact.toml ni por `seed:deltaops`. `rg "seed-sgma|seed:sgma"` fuera del propio archivo → solo docs (`replit.md`, `MODULOS_EXISTENTES.md`, `REUTILIZACION.md`, `ARQUITECTURA_ACTUAL.md`).
- **`scripts/src/seed-deltaops.ts`** (seed real de DeltaOps, `seed:deltaops`) importa `deltaopsUsersTable`, **no** tablas SGMA — independiente.
- **Workflow del artefacto sgma:** `artifacts/sgma/.replit-artifact/artifact.toml` define el servicio `web` (kind=`web`, `localPort=19550`): `development.run = pnpm --filter @workspace/sgma run dev`; `production.build = vite build`, `serve = static` desde `dist/public`. Es un artefacto **configurado y desplegable** cuyo runtime depende de que el `api-server` sirva los endpoints legacy.
- **`.replit`:** `deploymentTarget = "autoscale"`, sin workflows nombrados (los servicios los gestiona el sistema de artefactos). No hay job/cron que dependa de las rutas legacy.
- **Tests:** `rg "work_orders|public.assets|workOrdersTable|assetsTable"` en `*.test.ts` → **0 coincidencias**. Ningún test depende de estas rutas/tablas.

## 5. Tablas `public.*` utilizadas (mapeo router → tablas)

Definiciones en `lib/db/src/schema/*.ts` (`pgTable("<nombre>")`), esquema `public`:

| Router | Tablas `public.*` (lectura/escritura) |
|---|---|
| dashboard.ts | `work_orders`, `assets` (agregaciones/joins) |
| assets.ts | `assets` (CRUD) + lecturas `locations`, `work_centers`, `work_orders`, `technicians` (enriquecimiento/history) |
| work-orders.ts | `work_orders` (CRUD) + `assets`, `technicians`, `work_centers` (joins) |
| maintenance-plans.ts | `maintenance_plans` (CRUD) + `assets` (lectura) |
| spare-parts.ts | `spare_parts` (CRUD) + `stock_movements` (movimientos) |
| locations.ts | `locations` (CRUD) + `assets` (integridad) |
| work-centers.ts | `work_centers` (CRUD) |
| technicians.ts | `technicians` (CRUD) + `work_centers` (lectura) |
| suppliers.ts | `suppliers` (CRUD) |

Conjunto total de tablas de la superficie: **9** — `work_orders`, `assets`, `locations`, `maintenance_plans`, `stock_movements`, `suppliers`, `spare_parts`, `work_centers`, `technicians` (todas en esquema `public`, verificado en `information_schema.tables`).

## 6. ¿Datos reales necesarios para DeltaOps o exclusivamente legacy/prototipo?

**Conteo real (`psql`, solo lectura):**

| Tabla | Filas |
|---|---|
| `public.work_orders` | 10 |
| `public.assets` | 9 |
| `public.locations` | 5 |
| `public.maintenance_plans` | 6 |
| `public.stock_movements` | 0 |
| `public.suppliers` | 4 |
| `public.spare_parts` | 9 |
| `public.work_centers` | 4 |
| `public.technicians` | 5 |

**Comparación con el esquema DeltaOps:** el esquema `deltaops` tiene **174 tablas** propias con prefijos por módulo (`act_activos`, `act_ubicaciones_hist`, `inv_items`, `inv_movimientos`, `inv_bodegas`, … verificado en `information_schema.tables`). DeltaOps NO lee ni escribe las tablas `public.*`; opera enteramente sobre `deltaops.*`.

**Conclusión:** los datos `public.*` son **exclusivamente del prototipo/demo SGMA** (volúmenes bajos, típicos de seed de demostración; `stock_movements` vacía). **No hay datos productivos de DeltaOps en `public.*`** ni solapamiento de tablas con `deltaops.*`. (La directiva advierte que "public.* no implica irrelevante": aquí la irrelevancia para DeltaOps se demuestra por el aislamiento total de esquema y la ausencia de importaciones, no por asunción.)

## 7. Referencias textuales a cada endpoint (todo el repo)

`rg` de `/api/{work-orders,assets,dashboard,spare-parts,locations,work-centers,technicians,suppliers,maintenance-plans}` (excluyendo `node_modules`, `generated`, `openapi.yaml` y los propios routers) devuelve únicamente:
- **`lib/api-spec/openapi.yaml`** — spec fuente que declara los paths legacy (`openapi.yaml:161-427+`), junto a los `/deltaops/*`. Es la **única spec compartida** por ambos frontends.
- **`lib/api-client-react/src/generated/api.ts`** y **`lib/api-zod/…/generated`** — artefactos generados desde esa spec.
- **`artifacts/sgma/src/pages/*`** — consumo real (vía hooks).
- **Documentación:** `MODULOS_EXISTENTES.md` (documenta los endpoints SGMA), `docs/dgp/DGP-023-DESCUBRIMIENTO.md` (los reporta como H-01), `ARQUITECTURA_ACTUAL.md`, `REUTILIZACION.md`.
- No aparecen en ningún archivo de `artifacts/deltaops/src`, `lib/module-*`, `routes/deltaops/*`, tests ni workflows.

## 8. Referencias a las tablas utilizadas

`rg` de los símbolos `*Table` y nombres de tabla `public.*`:
- **Definición:** `lib/db/src/schema/*.ts` (9 archivos), reexportadas por `lib/db/src/index.ts` (`export * from "./schema"`).
- **Uso:** los 10 routers legacy (`routes/*.ts`) y `scripts/src/seed-sgma.ts`. **Nada más.**
- **Migraciones:** las tablas `public.*` se crean por migraciones/DDL histórico de SGMA; no se detecta dependencia de código DeltaOps sobre esas migraciones (DeltaOps usa `lib/db/migrations/deltaops/*`).
- **Tests:** 0 referencias.

## 9. ¿Eliminar la superficie SGMA rompería funcionalidad ACTUAL de DeltaOps?

**No rompería DeltaOps.** Demostración:
1. Ningún archivo de `artifacts/deltaops/src` llama a endpoints legacy (§2, `rg` = 0).
2. Ningún módulo/backend DeltaOps importa las tablas ni el router legacy (§3).
3. DeltaOps usa esquema `deltaops.*` (174 tablas), disjunto de `public.*` (§6).
4. Ningún seed/workflow/test de DeltaOps depende de la superficie (§4).

**Pero SÍ rompería el producto `artifacts/sgma`** (workflow `web` en ejecución), que es 100 % dependiente de estos endpoints (§2). Además, eliminar los paths del `openapi.yoml` **compartido** regeneraría `api-client-react`/`api-zod` **sin** los hooks legacy, provocando fallos de compilación en las 10 páginas de sgma que los importan. DeltaOps seguiría compilando (solo usa `useDeltaopsMe`).

**Matiz de aislamiento de esquema/DDL:** eliminar los routers y el cliente es seguro para DeltaOps; eliminar las **tablas** `public.*` requiere confirmar que ninguna FK/vista de `deltaops.*` las referencie (no se detectó en código; verificación DDL definitiva correspondería a la fase de ejecución, no a este Discovery).

## 10. Dependencia real, documentada exactamente

**Existe UNA dependencia real y viva:** el artefacto **`artifacts/sgma`** ⇒ **cliente `@workspace/api-client-react`** (generado de `lib/api-spec/openapi.yaml`) ⇒ **43 endpoints legacy `/api/*`** ⇒ **9 tablas `public.*`**. Cadena completa:

```
artifacts/sgma (workflow web:19550, artifact.toml)
  └─ 10 páginas (dashboard, activos, activo-detalle, ordenes, preventivo,
       repuestos, personal, centros, ubicaciones, proveedores)
     └─ hooks useList*/useGet*/useCreate*/useUpdate*/useDelete*  [api-client-react/generated]
        └─ URLs /api/{assets,work-orders,dashboard,...}          [openapi.yaml → orval]
           └─ routes/*.ts (43 rutas, sin auth)                   [api-server]
              └─ public.{assets,work_orders,...} (9 tablas, ~52 filas demo)
```

Adicional (no runtime, pero acoplamiento de build): el `openapi.yaml` es **compartido** por sgma y DeltaOps; tocar sus paths legacy afecta la generación consumida por ambos (aunque DeltaOps solo usa el hook `me`).

## 11. Ausencia de dependencia DeltaOps ↔ SGMA (evidencia de código)

- `rg "@workspace/db"` : los módulos DeltaOps importan solo `db/pool/deltaopsUsersTable`; nunca tablas SGMA.
- `rg "useListAssets|useListWorkOrders|…"` en `artifacts/deltaops/src` : **0**.
- `rg` de símbolos `*Table` SGMA fuera de `lib/db`/`routes/*.ts` : solo `seed-sgma.ts`.
- Esquemas disjuntos: `public.*` (9 tablas SGMA) vs `deltaops.*` (174 tablas). Sin tablas compartidas.
- 0 tests dependientes.

**Conclusión:** DeltaOps es independiente de la superficie SGMA. La superficie **no es eliminable sin costo** únicamente porque **sgma la usa**; respecto a DeltaOps, es eliminable/aislable sin impacto.

## 12. Opciones propuestas

Nota de la directiva aplicada: "legacy" no implica eliminable, y aquí **sí existe una dependencia real** (sgma). Por tanto **NO se recomienda ELIMINACIÓN TOTAL inmediata**: hacerlo rompería un producto vivo.

### Opción A — ELIMINACIÓN TOTAL (routers + cliente + tablas + artefacto sgma)
- **Impacto:** elimina la superficie insegura por completo; **destruye el producto `artifacts/sgma`**.
- **Archivos afectados:** `routes/index.ts`, `routes/{dashboard,assets,work-orders,maintenance-plans,spare-parts,locations,work-centers,technicians,suppliers}.ts`, `app.ts:4,101`, paths legacy en `lib/api-spec/openapi.yaml` (+ regeneración `api-client-react`/`api-zod`), `lib/db/src/schema/{9 archivos}` + `index.ts`, `scripts/src/seed-sgma.ts` + script, todo `artifacts/sgma`.
- **Tablas afectadas:** DROP de las 9 `public.*` (previa verificación de FKs/vistas).
- **Riesgo:** ALTO (rompe sgma; regeneración del cliente compartido). **Bloqueado por decisión de producto: ¿sgma sigue vivo?**
- **Esfuerzo:** ALTO.
- **Dependencias:** requiere que Dirección confirme el **retiro de sgma**.
- **Recomendación:** solo si Dirección declara `artifacts/sgma` como descontinuado.

### Opción B — AISLAMIENTO TEMPORAL (proteger el perímetro sin eliminar)
- **Impacto:** cierra el CRÍTICO (deja de servir CRUD anónimo) manteniendo la superficie disponible para sgma bajo control (p.ej. auth/allowlist/gating por entorno o red), sin cambiar contratos.
- **Archivos afectados:** `app.ts` (guard delante de `/api` legacy) o cada `routes/*.ts`; sin tocar tablas ni frontend.
- **Tablas afectadas:** ninguna.
- **Riesgo:** MEDIO (si se añade auth, sgma debe autenticarse; su cliente hoy no envía credenciales de sesión DeltaOps).
- **Esfuerzo:** BAJO–MEDIO.
- **Dependencias:** definir mecanismo de protección compatible con el modo de acceso de sgma.
- **Recomendación:** medida puente válida para eliminar el CRÍTICO ya, sin romper sgma, mientras Dirección decide el futuro del producto.

### Opción C — MIGRACIÓN Y POSTERIOR ELIMINACIÓN
- **Impacto:** migrar las capacidades de sgma a la arquitectura DeltaOps (`/deltaops/*` multitenant con auth/RLS) o a un backend propio, y luego retirar la superficie legacy.
- **Archivos afectados:** nuevo backend/módulos DeltaOps para las entidades SGMA, reescritura de sgma sobre esos endpoints, luego todo lo de Opción A.
- **Tablas afectadas:** migración de datos `public.*` → `deltaops.*` (si se conservan) y posterior DROP.
- **Riesgo:** MEDIO–ALTO (esfuerzo de migración; pero elimina la deuda de raíz).
- **Esfuerzo:** ALTO.
- **Dependencias:** roadmap de producto (¿sgma se fusiona con DeltaOps?).
- **Recomendación:** ruta de largo plazo si sgma debe sobrevivir como funcionalidad pero integrada/segura.

### Opción D — MANTENER, PERO PROTEGER CORRECTAMENTE
- **Impacto:** conservar la superficie tal cual pero con auth/tenant/headers/rate-limit adecuados (equivale a "hacerla producción-ready" como servicio legítimo).
- **Archivos afectados:** middleware de auth en `app.ts`/routers; `openapi.yaml` (documentar seguridad); cliente sgma (enviar credenciales).
- **Tablas afectadas:** posiblemente añadir columna/estrategia de tenant si se quiere multitenant.
- **Riesgo:** MEDIO (contrato estable; sgma se adapta a auth).
- **Esfuerzo:** MEDIO.
- **Dependencias:** decidir si SGMA es single-tenant (interno) o debe multitenantizarse.
- **Recomendación:** válida si Dirección considera sgma un producto de primera clase a mantener.

## Recomendación

**Opción B (Aislamiento temporal) como acción inmediata para cerrar el CRÍTICO H-01, seguida de decisión Dirección entre C (migrar) o A (eliminar) según el futuro de `artifacts/sgma`.**

Justificación basada solo en dependencias reales: **NO procede ELIMINACIÓN TOTAL inmediata** porque existe una dependencia viva y demostrada (`artifacts/sgma`, workflow `web` en ejecución, 10 páginas). DeltaOps NO depende de la superficie, por lo que el riesgo de aislarla/eliminarla para DeltaOps es nulo; el único bloqueante es el producto sgma. La Opción B elimina la exposición anónima sin romper sgma y compra tiempo para la decisión estratégica.

## Revisión independiente (R1)

- **Enumeración de rutas:** derivada del código real con `archivo:línea` (§1). **PASS.**
- **Consumo frontend:** sgma confirmado como consumidor (hooks + páginas); DeltaOps confirmado como NO consumidor (`rg` = 0). **PASS.**
- **Sin dependencia DeltaOps:** demostrada por esquema disjunto (9 vs 174 tablas), ausencia de imports y 0 tests. **PASS.**
- **Datos:** conteos reales por `psql`; clasificados como demo/prototipo con evidencia, sin asumir irrelevancia. **PASS.**
- **Advertencias de la directiva respetadas:** no se asumió que "legacy"→eliminable ni "public.*"→irrelevante; la conclusión (NO eliminar aún) se basa en la dependencia real de sgma. **PASS.**
- **Opciones:** las 4 con impacto/archivos/tablas/riesgo/esfuerzo/dependencias/recomendación. **PASS.**
- **Sin cambios de código/DB/contratos:** `git status` = solo el `.txt` de la directiva + este documento. **PASS.**

**R1: PASS.**

## Criterio de cierre

- [x] Código sin cambios.
- [x] DB sin cambios (solo `SELECT`/catálogo).
- [x] Contratos (openapi) sin cambios.
- [x] Documento con evidencia (`archivo:línea` / salida de comando).
- [x] Revisión independiente PASS.
- [x] Git limpio salvo el documento (y el `.txt` de la directiva, entrada untracked).
- [ ] **NO commit** (por instrucción de delegación).
- [x] **NO se inició DGP-023.1.**

---

**DGP-023-H01 DISCOVERY COMPLETADO — DEPENDENCIA REAL ENCONTRADA (artifacts/sgma) — DECISIÓN DE DIRECCIÓN REQUERIDA.** No procede eliminación total inmediata: la superficie legacy es consumida por el producto vivo `artifacts/sgma`. Recomendación: Aislamiento temporal (B) para cerrar el CRÍTICO, luego Migración (C) o Eliminación (A) según decisión de producto sobre sgma. DeltaOps NO depende de la superficie.
