# DELTAOPS — VALIDACIÓN POST-CORRECCIONES

**Directiva:** `attached_assets/Pasted-DELTAOPS-AUTORIZACI-N-DE-CORRECCIONES-PRE-DEPLOY-Autori_1786847088733.txt`
**Fecha:** 16 de agosto de 2026
**Antecedente:** `docs/dgp/DELTAOPS-AUDITORIA-PRE-DEPLOY.md` (veredicto 🟡 READY AFTER FIXES)

---

## 1. Resumen ejecutivo

Las cuatro correcciones autorizadas fueron ejecutadas y verificadas. No se eliminó ni modificó ningún dato real. El hallazgo mayor (read models de utilización desincronizados) quedó corregido y, además, la investigación de fondo **reclasificó** su causa: los registros «extra» de la autoridad demo no eran hechos nuevos sino residuos de una generación anterior del parser de importación. Se creó el **tenant productivo limpio `delta`** con exclusivamente los datos reales LITE-09, sin tocar `delta-demo`.

**Veredicto: 🟢 READY FOR DEPLOY** (sin hallazgos abiertos de esta fase; persisten las condiciones operativas de PDC-01/FINAL-01 propias del despliegue, fuera del alcance aquí).

## 2. Corrección 1 — Reproyección de utilización (`delta-demo`)

- Ejecutado `POST /api/deltaops/utilizacion/reproyectar` (comando oficial `utilizacion.reproyectar`, replay no destructivo de `utl_eventos`): **8.697 eventos, 8.697 aplicados** (38 s).
- Cadena completa verificada con conteos exactos:

| Eslabón | Lecturas | Tanqueos |
|---|---|---|
| Autoridad (`utl_lecturas` / `utl_tanqueos`) | 7.597 | 1.100 |
| Read model (`*_read`) | 7.597 | 1.100 |
| Diferencia autoridad→read model | 0 | 0 |
| API informes (`total`) | 7.597 | 1.100 |
| CSV exportado (filas de datos) | 7.597 | 1.100 |
| XLSX exportado | HTTP 200 (322.950 bytes) | — |
| UI (E2E navegador) | «Resultados (7597)» | «Resultados (1100)» |

- Inconsistentes marcadas en read model: 4.361 (visibles y con motivo, como diseña el módulo).

## 3. Hallazgo de fondo: los «extra» de la demo eran doble generación de parser

Comparación por clave natural (equipo, fecha-hora, valor) entre la autoridad de `delta-demo` (sin seed) y una importación limpia de los 6 XLSX originales:

- **Todo** lo que produce el import vigente está contenido en la demo (0 hechos faltantes en sentido delta→demo).
- Los 1.135 lecturas y 336 tanqueos presentes solo en la demo provienen íntegramente de la corrida de las 19:51Z del 15-ago y son de una generación anterior del parser (p. ej. lecturas de horómetro con valor 0 derivadas del archivo de combustible, filas que el parser actual excluye).
- Conclusión: el **dataset canónico real** es el que produce el import vigente: **6.453 lecturas y 760 tanqueos**, además de 3.736 preoperacionales, 109 mantenimientos y 28 equipos. `delta-demo` conserva ambas generaciones en su autoridad (no se borró nada) y sus read models reflejan fielmente esa autoridad (7.597/1.100).

## 4. Corrección 2 — Separación demo / productivo (opción preferida: tenant limpio)

Se ejecutó la opción preferida por la Dirección **sin tocar `delta-demo`**:

1. Tenant **`delta`** («Delta Logística & Equipos S.A.S.», América/Bogotá, COP) creado por consola SUPER_ADMIN (`POST /admin/tenants`), roles sembrados, 12 módulos habilitados.
2. TENANT_ADMIN provisional creado por el flujo real de invitación (invitación → correo saliente → aceptación con token). Cuenta de validación: `admin@delta.example` (no es un usuario real; reemplazable/revocable cuando la Dirección cree los usuarios definitivos).
3. Catálogos base de activos sembrados por API (monedas, tipos, familias, criticidades, unidades — un tenant nuevo nace sin catálogos).
4. Importación LITE-09 completa desde los 6 XLSX de `attached_assets` con el flujo oficial de históricos (analizar/validar/importar): 28 equipos, 109 mantenimientos (75+34), 1.084 filas válidas de combustible, 1.952 de horas hombre, 679+1.818 checklists; exclusiones idénticas a las conocidas (CAMIONETA ALVARO, Serpomar, 950-0x…).
5. Outbox drenado a **cero** (17.884 eventos) y reproyecciones ejecutadas; el drenaje incluyó la bitácora canónica (11.932 entradas de timeline).

Estado final verificado del tenant `delta` (autoridad = read model, diferencia 0 en todos):

| Dato | Conteo |
|---|---|
| Activos | 28 (0 de demostración) |
| Lecturas | 6.453 |
| Tanqueos | 760 |
| Preoperacionales históricos | 3.736 |
| Mantenimientos | 109 |
| OTs vivas / datos E2E / seed | 0 |

`delta-demo` queda como tenant de demostración con todos sus datos intactos (demo, E2E y las dos generaciones históricas).

## 5. Corrección 3 — Usuarios

- **No** se crearon usuarios reales. La capacidad de invitar de TENANT_ADMIN quedó confirmada de la manera más fuerte posible: el flujo completo de invitación/aceptación se ejerció de extremo a extremo al provisionar el tenant `delta`.
- Clasificación de la tabla legacy `users` (330 filas al cierre de esta fase; la auditoría contó 329 — la fila adicional es el espejo interno `mirror.…delta@deltaops.internal` creado automáticamente por el aprovisionamiento del tenant `delta` el 16-ago 02:29Z; **no es autoridad**, la autoridad de identidad es `idn_*`; no se eliminó ninguna):
  - 189 en `delta-demo` (roles legacy: 101 operador, 54 admin, 34 lector) — remanente de fases previas a Identity (DGP-017).
  - 4 en `deltaops` (tenant plataforma).
  - ~137 en tenants efímeros `e2e-plat-*` (3 por tenant, residuos de suites).

## 6. Corrección 4 — Gráficos y datos simulados

- Analytics verificado en ambos tenants por API y navegador: sirve datos reales del tenant de la sesión (catálogo de indicadores cargó sin errores; en `delta` responde con su propio contexto). Sin mocks en superficies operativas (respaldo: auditoría pre-deploy).
- Los KPIs de muestra de la galería `/design-system` quedaron **excluidos de producción**: la ruta ahora solo se registra en desarrollo (`import.meta.env.DEV`, `artifacts/deltaops/src/App.tsx`).

## 7. Corrección 5 — Fe de erratas FINAL-02

Añadida al inicio de `docs/dgp/DELTAOPS-FINAL-02-CIERRE-INFORMES-EXPORTACION.md`, con trazabilidad: los 6.564/807 eran estado de read models al cierre; tras la reproyección los conteos verificados de `delta-demo` son 7.597/1.100. No se reescribió el histórico del documento.

## 8. Pruebas ejecutadas (§6 de la directiva)

| Prueba | Resultado |
|---|---|
| Suite de informes (integración PG, aislamiento multi-tenant, RBAC, export CSV/XLSX, filtros, paginación) | 12/12 PASS |
| Suites utilización-idempotencia + preoperacional-http-roles (RBAC/idempotencia) | 9/9 PASS |
| Cadena autoridad→read model→API→CSV/XLSX (lecturas y tanqueos, ambos tenants) | Exacta (tabla §2 y §4) |
| E2E navegador `delta-demo`: totales 7.597/1.100, filtro por equipo + paginación, export CSV 200, Analytics, design-system (dev) | PASS (5/5) |
| E2E navegador `delta`: 28 activos sin demo, totales 6.453/760/3.736/109, export CSV 200 | PASS (3/3) |
| E2E móvil 390×844 (hub informes y detalle combustible, ambos sin overflow; scrollWidth 375) | PASS |

## 9. Qué NO se hizo (fuera de alcance o prohibido)

- No se ejecutó DEPLOY-01 ni se tocó DNS/DigitalOcean/configuración de producción.
- No se eliminó ningún dato (ni seed, ni E2E, ni legacy `users`, ni las generaciones históricas de la demo).
- No se crearon usuarios reales ni dashboards nuevos.

## 10. Incidencias operativas registradas (para la memoria técnica)

- El drenaje masivo del outbox por HTTP es inviable (50 eventos/petición); se drenó con un bucle directo de `processPending` sobre el runtime real. Un intento abortado dejó una transacción zombi que bloqueaba los claims (resuelta con `pg_terminate_backend`).
- Un tenant recién creado no tiene catálogos: sembrarlos por API es prerrequisito de la importación histórica.
