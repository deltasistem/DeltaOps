# DELTAOPS FINAL-02 — Cierre: Informes Operacionales, Exportación y Explotación de Datos

**Directiva:** `attached_assets/Pasted--DIRECTIVA-OFICIAL-DELTAOPS-FINAL-02-Informes-Operacion_1786840643881.txt`
**Fecha de cierre:** 15 de agosto de 2026
**Estado:** COMPLETADO — revisión independiente PASS, 12/12 pruebas de integración, E2E en navegador real PASS.

---

## 1. Discovery

- Fuentes de datos verificadas contra la base real del tenant `delta-demo`: 38 activos, 132 OTs (23 vivas + 109 mantenimientos históricos), 3.740 preoperacionales (3.736 históricos + 4 vivas), 807 tanqueos, 6.564 lecturas (4.048 inconsistentes), sesiones de trabajo con valoración, ledger de costos exactos, motor de rutinas.
- Todos los datos consultables existen ya en módulos autoridad congelados (activos, órdenes, preoperacional, utilización, costos-exactos, rutinas, platform.timeline). Ninguno requirió API nueva: FINAL-02 se implementó como **composición pura de lectura**.
- El marcador de origen histórico de los preoperacionales vive en `contexto._origen === "HISTORICO"` (import LITE-09), no en el nivel superior del registro; los históricos exhaustivos se sirven por `platform.timeline`.

## 2. Arquitectura utilizada

- **Backend:** `artifacts/api-server/src/routes/deltaops/informes-datasets.ts` (9 builders puros de dataset) + `informes-module.ts` (router `/api/deltaops/informes`: catálogo, dataset paginado, exportación). Montado en `app.ts` junto a los demás routers de composición.
- Cada builder consulta **solo queries públicas** de los módulos autoridad con el **principal de la sesión** (RLS/RBAC en backend). Jamás SQL directo a read models ajenos.
- Donde las queries públicas exigen una entidad (duraciones por OT, valoraciones por sesión) o acotan `limit` sin offset, se aplica **fan-out por entidad** (adaptador válido según el patrón DGP-016), con deduplicación por id y pasada global complementaria.
- **Frontend:** `artifacts/deltaops/src/lib/informes/` (cliente y Shell con ThemeProvider raíz) + `src/pages/informes.tsx` (hub) + `informes-detalle.tsx` (detalle **genérico dirigido por la configuración del backend**: columnas y filtros los declara el catálogo). Rutas `/informes` y `/informes/:clave`; ítem de navegación en el grupo INFORMACIÓN para todos los roles con módulo de activos.

## 3. Informes implementados (9)

| Clave | Contenido |
|---|---|
| `mantenimiento` | OTs vivas + mantenimientos históricos, duración efectiva y costo neto por moneda |
| `preoperacionales` | Ejecuciones vivas + históricas con veredicto, operador e incumplimientos |
| `combustible` | Tanqueos con valores de origen, sin agregados monetarios (GAP-FUEL-MONEY) |
| `horometros` | Lecturas de medidores, inconsistentes visibles y marcadas con motivo |
| `rutinas` | Estado del motor de frecuencias por equipo |
| `horas-hombre` | Sesiones de trabajo con horas efectivas y valoración (PENDIENTE, jamás $0 falso) |
| `repuestos` | Ledger CARGO/ABONO de materiales e insumos (string-safe) |
| `costos` | Neto económico por equipo y moneda + contexto de combustible |
| `hoja-de-vida` | Cronología completa de un equipo (timeline de plataforma) |

«El informe no crea datos»: todos los builders componen lecturas; nada se inventa, calcula destructivamente ni persiste.

## 4. Filtros

Declarados por informe en el catálogo y renderizados genéricamente por la UI: `desde`/`hasta` (fecha, hasta-inclusivo), `activoId` (selector cargado del módulo de activos, `limit=200` del contrato), `estado`, `tipo`, `veredicto`, `ordenId`, `centroCosto`. La consulta visual y la exportación usan **el mismo builder con los mismos filtros**.

## 5. Exportaciones

- **CSV**: BOM UTF-8, separador `;`, CRLF; neutralización de inyección de fórmulas (prefijos `=`, `+`, `-`, `@`, TAB, CR → apóstrofo); el marcador «—» no se altera.
- **XLSX**: exceljs, cabecera en negrita, bloque final de nota y advertencias.
- **Sin PDF** (fuera de alcance por directiva).
- Auditoría **fail-closed**: `platform.export.request → updateProgress → complete`; cada transición se verifica y la descarga no se entrega si alguna falla. El job queda `completed` (verificado por prueba).
- Nombre de archivo `deltaops-informe-<clave>-<fecha>.<ext>` vía `Content-Disposition`.

## 6. Rutinas

El informe consume el motor de frecuencias existente por equipo (medidores reales). Equipos sin medidores o sin alcance no se evalúan (conteo en meta); ninguna acción de negocio nueva.

## 7. Hoja de vida

Cronología por equipo desde `platform.timeline` (comandos de plataforma), con filtro de tipo aplicado por composición y fechas operacionales reales.

## 8. Indicadores

Solo conteos y sumas string-safe presentes en los datos. **No** se implementaron MTBF, MTTR ni disponibilidad (insumos inexistentes, según auditoría LITE-06); no existen KPIs ficticios. Dinero: micros BigInt sobre strings del ledger; monedas jamás combinadas.

## 9. Seguridad

- Sesión obligatoria (401 sin sesión); principal reconstruido de la sesión en cada consulta; RLS y RBAC en backend.
- Aislamiento de tenant probado (dataset de A jamás contiene filas de B).
- CONSULTA (solo lectura) puede consultar y exportar; el contexto de auditoría de export no amplía lecturas.
- Inyección CSV mitigada y probada con los cuatro prefijos.
- Sin credenciales en código ni documentación.

## 10. Multicentro

`centroCosto` declarado como filtro en 8 informes, aplicado en backend y expuesto en la UI. En los datos reales el centro de costos de los activos es nulo ⇒ se muestra «—» (jamás valores inventados). Los históricos conservan su centro de costos crudo en el contexto de origen.

## 11. Históricos

Los informes funcionan sobre los históricos LITE-09 sin modificarlos, reimportarlos ni recalcular: 3.736 preoperacionales, 109 mantenimientos, 6.564 lecturas (inconsistentes visibles y marcadas), 807 tanqueos, 38 activos. Se corrigió durante la fase una **doble contabilización** de preoperacionales (record store + timeline) detectando el marcador real `contexto._origen`.

## 12. C11 SIGAR

Sin mantenimientos internos registrados: el informe lo muestra tal cual (sin filas inventadas). Verificado en E2E con datos reales.

## 13. Pruebas

`artifacts/api-server/src/routes/deltaops/__tests__/informes-module.integration.test.ts` — 12 pruebas HTTP reales sobre PostgreSQL (tenants efímeros A/B, gate destructivo B1–B4 con `DATABASE_TEST_URL` → base `deltaops_test`, ejecución `PGDATABASE=deltaops_test DELTAOPS_DB_ROLE=owner vitest run`): 401, catálogo, aislamiento de tenant, filtros con hasta-inclusivo, paginación, inconsistentes visibles, CONSULTA lee y exporta + CSV=dataset + «—», inyección CSV, advertencias de ventana en CSV, job de export `completed`, 404/400. **12/12 PASS.** Typecheck PASS en api-server y deltaops.

## 14. E2E

Navegador real (agente de pruebas): admin, CONSULTA y TÉCNICO; hub con 9 tarjetas; combustible 807 filas con filtro por equipo (MON-001→2, C7→98), paginación real y export habilitado; horómetros con `Inconsistente=SÍ` y motivo; preoperacionales con filtro de veredicto; CONSULTA exporta CSV con descarga verificada; móvil 390×844 en tarjetas sin overflow (scrollWidth 375); tema oscuro correcto (`prefers-color-scheme`). **PASS.**

## 15. Revisión independiente

Subagente arquitecto con diff completo. Primera ronda: 1 CRÍTICO (inyección CSV) y 3 MAYORES (auditoría de export incompleta, ventanas de contrato silenciosas, multicentro no expuesto). Todos corregidos y reverificados. **Veredicto final: PASS.**

## 16. Gaps

- **GAP-FUEL-MONEY** (heredado): el costo de tanqueo es float en su módulo congelado ⇒ el informe de combustible muestra valores individuales de origen y **no** agrega dinero.
- Job de export: la cadena request→running→completed se verifica; los eventos `platform.export.*` no tienen manejadores suscritos (sin efecto — solo bitácora).

## 17. Deuda técnica

- Los contratos congelados de listado (órdenes ≤500, preoperacional ≤200, sin offset) no permiten un corte garantizadamente exhaustivo por equipo con grandes volúmenes; hoy se mitiga con fan-out + **advertencias explícitas de ventana** (meta, UI con `role="alert"` y el propio archivo exportado). Cuando Dirección autorice extender los módulos autoridad, una query paginable/cursor eliminará las advertencias.
- Caso límite de 201/501 registros por equipo cubierto por prueba de serialización + verificación con datos reales (9 ventanas reales advertidas); una siembra barata para el caso extremo de integración queda pendiente de esa misma extensión de contrato.

## 18. Límites deliberados

- **Dashboard opcional NO incluido** (decisión de alcance: la directiva lo declaraba opcional; los 9 informes cubren la explotación de datos requerida).
- Sin PDF, sin KPIs no sustentados, sin acciones de negocio nuevas, sin API nueva en módulos autoridad, sin modificación de históricos, **sin despliegue** (DEPLOY-01 es la fase siguiente).

## 19. Criterios de cierre

- [x] 9 informes operativos sobre datos reales e históricos LITE-09 intactos.
- [x] Exportación Excel + CSV con auditoría fail-closed y consulta = dataset exportado.
- [x] RLS/RBAC/tenant en backend; aislamiento probado.
- [x] «—» para inexistentes; «Sin datos suficientes» en vacíos; inconsistentes visibles.
- [x] 12/12 pruebas de integración; E2E multirol/móvil/oscuro PASS.
- [x] Revisión independiente PASS.
- [x] Sin despliegue; detención antes de DEPLOY-01.
