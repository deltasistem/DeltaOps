# DELTAOPS LITE-10 — CIERRE «Afinamiento final, UX/UI, operación real y preparación para producción»

**Documento de cierre exigido por §31 de la Directiva Oficial DELTAOPS LITE-10.**
**Fecha de cierre:** 2026-08-15
**Estado global de la fase:** COMPLETADA — sin bloqueantes 🔴. Pendientes clasificados como 🟡 REQUIERE CONFIGURACIÓN o como deuda técnica no bloqueante.

## Convención de clasificación (§31)

Cada afirmación material se etiqueta con una de estas categorías, sin maquillaje:

- **VERIFICADO** — comprobado por prueba automatizada, ejecución o inspección directa reproducible.
- **PARCIAL** — comprobado en parte; queda un margen no cubierto que se detalla.
- **NO VERIFICADO** — afirmación plausible pero sin evidencia ejecutada en esta fase.
- **GAP** — carencia identificada respecto a la directiva o a la operación real.
- **BLOQUEANTE** — impediría salir a producción o cerrar la fase.

Alcance de las pruebas de esta fase: `typecheck` raíz, `build` de producción de deltaops, suite unitaria de deltaops (970/970), suite del Design System (82/82), un recorrido E2E manual del flujo operacional (§28) y una verificación visual multi-viewport y multi-tema (§29). Las suites de integración PostgreSQL contra la base compartida NO forman parte del criterio de cierre y presentan incidencias que se documentan en Riesgos y Deuda técnica.

---

## 1. Qué se encontró

Auditoría inicial (§35 modo de ejecución, insumo §35-1) contra la directiva:

- **SEVERO-1 — Punto de entrada de «Lecturas de horómetro» perdido en la navegación.** La entrada a `/utilizacion/lecturas` quedaba supeditada a un flag de visibilidad de «Utilización» y no aparecía como acceso explícito en el grupo de proceso, rompiendo el flujo natural Equipo → Lectura de horómetro (§3, §8). **VERIFICADO** (inspección de `rbac.ts` y ausencia en el read model de navegación).
- **SEVERO-2 — Barra móvil del AppShell (≤767px) con desbordamiento horizontal.** A 360px, con textos largos, la composición logo 132px + hamburguesa 44px + acciones (selector de centro, selector de empresa, perfil) forzaba una sola fila `nowrap` que se salía del viewport (§4, §5). **VERIFICADO** (inspección de composición y CSS).
- **MENOR-1 — `ResumenCabecera` montado dos veces.** El resumen operacional aparecía en la cabecera de la ficha y de nuevo dentro de la pestaña de línea de tiempo («Información actual»), duplicando consultas y nodos (§11, §19). **VERIFICADO** (dos montajes en el árbol).
- **MENOR-2 — Ausencia de regresión de navegación por rol/capacidad** que asegure que, con «Utilización» visible, sean accesibles simultáneamente Lecturas y Combustible/tanqueos. **VERIFICADO** (no existía tal aserción).
- **Defecto pre-existente — «Diagnóstico inválido».** Se detectó un fallo pre-existente en el flujo de diagnóstico/ejecución de OT ajeno al alcance nominal de LITE-10 pero que impedía completar el recorrido E2E. **VERIFICADO** (reproducido en el recorrido §28 antes del fix).
- **Preparación a producción (§27).** Estado mayormente 🟢 con dos puntos 🟡 (ver §25). **VERIFICADO** por inspección de configuración.

No se encontraron bloqueantes 🔴 de arquitectura, seguridad ni datos.

---

## 2. Qué se corrigió

Cambios agrupados A–F de la sesión, más los fixes posteriores a la revisión independiente:

- **A/B — Navegación orientada a proceso (§8).** Se añadió el ítem «Lecturas de horómetro» al grupo **OPERACIÓN**, junto al flujo Equipo → Preoperacional, con ruta `/utilizacion/lecturas`, gobernado por la capacidad `utilizacionVisible`. Combustible/tanqueos permanece en **INFORMACIÓN**. Archivo: `artifacts/deltaops/src/lib/identidad/rbac.ts`. **VERIFICADO** (test de navegación por rol).
- **C — AppShell móvil compactado (§4, §5).** Se extrajo el componente `AccionesContexto` (estado de empresa + selector de centro + selector de empresa + menú de perfil) con **instancia única** en la barra (sin duplicar DOM, para no romper queries singulares de los tests de shell). A ≤767px la barra se compacta a UNA fila: logo acotado a 104px, gap reducido a `--do-sp-2`, ocultación de etiquetas textuales redundantes dejando el icono como ancla, `<select>` de centro con `max-width:44vw` y botones con `max-width:40vw`, todo con `min-width:0` + elipsis (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`). Solo tokens `--do-*`. Archivos: `artifacts/deltaops/src/lib/identidad/AppShell.tsx`, `lib/design-system/src/styles/components-data.css`. **VERIFICADO** (typecheck, tests de shell, verificación visual 360/390/1280).
- **D — `ResumenCabecera` único (§11, §19).** El resumen operacional queda exclusivamente en la cabecera de la ficha (`activos-ficha.tsx` → `DatosGenerales`). Se retiró de la pestaña de línea de tiempo, dejando allí solo Centro de costos / Ubicación / Responsable, y se eliminó el import huérfano. Archivo: `artifacts/deltaops/src/pages/ficha/tab-timeline.tsx`. **VERIFICADO** (typecheck y una sola instancia de las consultas).
- **E — Fix «Diagnóstico inválido» (defecto pre-existente).** Se corrigió el defecto que impedía completar la ejecución/diagnóstico de la OT en el recorrido E2E. Archivos implicados: `artifacts/deltaops/src/lib/ordenes/mutaciones.ts`, `artifacts/deltaops/src/pages/ordenes/tab-ejecucion.tsx`. **VERIFICADO** (recorrido §28 completo PASS tras el fix).
- **F — Regresión de navegación por rol/capacidad (MENOR-2).** Nueva batería en `home-nav-lite08.test.ts` que, para cada rol (`SUPER_ADMIN`, `TENANT_ADMIN`, `SUPERVISOR`, `PLANIFICADOR`, `TECNICO`, `CONSULTA`), exige que con `utilizacionVisible` sean accesibles simultáneamente Lecturas (`/utilizacion/lecturas`, OPERACIÓN) y Combustible (`/utilizacion/tanqueos`, INFORMACIÓN), más un caso negativo donde sin la capacidad no aparece Lecturas. **VERIFICADO** (tests en verde).

Otros archivos tocados en la fase (ajustes de composición/UX y preparación a producción): `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/deltaops/config.ts`, `artifacts/api-server/src/index.ts`, `artifacts/deltaops/src/pages/activos-ficha.tsx`, `artifacts/deltaops/src/pages/administracion-historicos.tsx`, `artifacts/deltaops/src/lib/analytics/WidgetRenderer.tsx`, `lib/design-system/src/styles/components-overlays.css`, `artifacts/deltaops/src/__tests__/analytics-widgets.test.tsx`, `artifacts/deltaops/src/__tests__/identidad-appshell.test.tsx`. **VERIFICADO** (presentes en el árbol de cambios; sin commit).

---

## 3. Qué se decidió NO modificar (§30 / §32)

Aplicando §30 («no modificar por estética lo que funciona») y §32 (decisiones vigentes de Dirección LITE-04→LITE-09):

- **RLS / RBAC / aislamiento de tenant / fail-closed (§26).** No se tocó la arquitectura de seguridad. **VERIFICADO** (sin cambios en el modelo RLS).
- **Contratos y modelos de datos.** No se alteraron contratos ni esquemas: los ajustes UX se resolvieron por composición y CSS. **VERIFICADO**.
- **Migraciones.** No se crearon migraciones nuevas (§30). **VERIFICADO**.
- **Coordinador de mantenimiento obligatorio.** No se introdujo; las capacidades siguen determinando las acciones (§9, §32). **VERIFICADO**.
- **Generación automática de OT por rutina.** Se mantiene la acción explícita [GENERAR MANTENIMIENTO] (§13, §32). **VERIFICADO**.
- **Maestro de proveedores / módulo de inventario ERP.** No se crearon; proveedor sigue siendo dato transaccional y el inventario no bloquea el cierre de OT (§16, §17, §32). **VERIFICADO**.
- **Equipos de terceros (C11 / C11 SIGAR).** Mismo equipo; no se fabricaron mantenimientos internos ficticios (§21, §32). **VERIFICADO**.
- **Datos históricos reales.** No se regeneraron ni sustituyeron por decisión de diseño; su afectación por la incidencia de integración se trata en Riesgos (§21 de este doc). **VERIFICADO** (política) / ver Riesgos.
- **Segundo sistema visual / rediseño artístico.** No se creó; se reutilizó el Design System y sus tokens (§6, §7). **VERIFICADO**.
- **Anti auto-aprobación por segunda identidad.** No se relajó el control de segregación al validar/cerrar OT (§9 trazabilidad). **VERIFICADO** (comprobado en E2E).

---

## 4. Pantallas afectadas

- **AppShell / barra y menú móvil** — recomposición responsive (§5). **VERIFICADO**.
- **Ficha del activo / pestaña «Información actual» (línea de tiempo)** — `ResumenCabecera` único (§11, §19). **VERIFICADO**.
- **Navegación global (grupos de proceso)** — nuevo acceso «Lecturas» en OPERACIÓN (§8). **VERIFICADO**.
- **Ejecución de OT / diagnóstico** — fix «Diagnóstico inválido» (§15, §18). **VERIFICADO**.
- Pantallas restantes de §29 (Home, Activos/listado, Preoperacional, Resultado, Hallazgo, OT, Hoja de vida, Combustible, Lectura de horómetro) — revisadas en la verificación visual sin cambios estructurales adicionales requeridos. **PARCIAL** (revisión visual; no todas cuentan con test de regresión visual automatizado).

---

## 5. Responsive (§5, §29)

- Composición móvil de la barra a 360/390/1280 sin overflow horizontal, textos con elipsis y objetivos táctiles conservados; menú hamburguesa usable. **VERIFICADO** (verificación visual + tests de shell).
- 430/768/1024/1440 px: no se ejecutó una verificación visual dedicada punto por punto en esta fase. **PARCIAL** — recomendado ampliar la matriz en LITE-11.
- Cambio real de composición en móvil (no mero reescalado) aplicado en la barra del AppShell. **VERIFICADO**. Tablas/formularios/modales de las demás pantallas: adaptación heredada del Design System sin regresión observada. **PARCIAL**.

---

## 6. Tema claro / oscuro (§6)

- Logo visible en ambos temas; estados APTO / OBSERVACIÓN / NO APTO distinguibles por texto además de color; controles legibles. **VERIFICADO** (verificación visual claro/oscuro).
- Uso exclusivo de tokens `--do-*`; sin segundo sistema visual ni colores atados a un solo tema. **VERIFICADO** (inspección de CSS).
- Auditoría exhaustiva de contraste WCAG por componente: **NO VERIFICADO** (no se ejecutó medición formal de contraste).

---

## 7. Identidad Delta (§7)

Se mantuvo la identidad existente (logo, encabezado, tipografía, espaciado, iconografía, estados) reutilizando el Design System; no se inventó identidad nueva ni rediseño artístico. **VERIFICADO** (inspección; cambios limitados a compactación y tokens).

---

## 8. Navegación (§8)

- Grupos orientados a proceso: OPERACIÓN (incl. Inicio y ahora «Lecturas»), INFORMACIÓN (Hoja de vida, Combustible, Indicadores), APOYO, ADMINISTRACIÓN (solo autorizados). **VERIFICADO** (test por rol).
- Visibilidad ≠ seguridad: el backend/RBAC/RLS sigue siendo la autoridad; ocultar no autoriza. **VERIFICADO** (política intacta; §26).
- Menú móvil contiene solo navegación; las acciones de contexto/cuenta viven en la barra compactada. **VERIFICADO**.

---

## 9. Roles (§9, §32)

- No se codificó jerarquía universal ni coordinador obligatorio; las capacidades determinan las acciones. **VERIFICADO**.
- Navegación accesible y usable para administrador y técnico en móvil (ítems ≥44px, scroll del cajón intacto). **VERIFICADO** (verificación visual por rol).
- Anti auto-aprobación: validación/cierre de OT exige segunda identidad distinta del ejecutor. **VERIFICADO** (E2E §28).
- CONSULTA en solo lectura. **VERIFICADO** (E2E §28, pasos 19–20).

---

## 10. Multicentro (§10)

- Separación empresa/tenant · centro de costos · ubicación · responsable · equipo conservada; activo único no duplicado por centro. **VERIFICADO** (composición de ficha y selector de centro).
- Centro de costos proviene de la fuente de verdad del activo; sin dato arbitrario de frontend; «Sin centro de costos configurado» cuando falta. **VERIFICADO** (política intacta; §32).

---

## 11. Activos (§11)

- Ficha compone nombre, código, tipo, estado, centro, ubicación, responsable, horómetro, próxima rutina, estado preoperacional, órdenes, mantenimientos, combustible, historial. **VERIFICADO** (montaje único de `ResumenCabecera` + bloques de la ficha).
- Hoja de vida como composición de información existente, sin segunda base histórica. **VERIFICADO** (§19).

---

## 12. Horómetro (§12)

- Comportamiento existente conservado (última lectura, fecha, usuario, actual, inconsistencias, próxima rutina, horas restantes/vencidas); regularización auditada intacta; lecturas menores no se sobrescriben en silencio. **VERIFICADO** (sin cambios de contrato; acceso «Lecturas» restaurado en navegación).
- Recorrido «Registrar lectura» validado en E2E. **VERIFICADO** (§28 paso 4).

---

## 13. Rutinas (§13, §32)

- Lógica rutina → horómetro → aviso conservada; no se crea OT automáticamente por vencimiento; [GENERAR MANTENIMIENTO] permanece explícita. **VERIFICADO** (política intacta; E2E §28).

---

## 14. Preoperacional (§14)

- Flujo Equipo → Iniciar → Checklist → Resultado con estados 🟢/🟡/🔴 acompañados de texto; hallazgos con equipo, ítem, respuesta, observación, evidencia, severidad, usuario, fecha, origen. **VERIFICADO** (E2E §28 pasos 6–8, resultado NO APTO).

---

## 15. Hallazgos (§15)

- Hallazgo con [GENERAR MANTENIMIENTO] llevando información a la OT; anti-duplicación y decisión «No requiere mantenimiento» auditable/reversible. **VERIFICADO** (E2E §28 paso 8→9). El fix «Diagnóstico inválido» habilitó el tramo posterior. **VERIFICADO**.

---

## 16. OT (§15, §18)

- Flujo generar → asignar → ejecutar → mano de obra → repuesto → combustible → validación → cierre completo. **VERIFICADO** (E2E §28 pasos 9–16, con anti auto-aprobación por segunda identidad). El inventario no bloquea el cierre. **VERIFICADO** (§17, §32).

---

## 17. Combustible (§16)

- Combustible asociado al activo; proveedor como dato transaccional (sin maestro obligatorio); registro validado en el recorrido. **VERIFICADO** (E2E §28 paso 14).

---

## 18. Mano de obra (§18)

- Captura simple (técnico, OT, inicio/fin/duración, observaciones, estado de valoración) conservada; sin sistema de nómina. **VERIFICADO** (E2E §28 paso 12).

---

## 19. Repuestos / insumos (§17)

- Captura de repuesto/insumo, descripción, cantidad, unidad, costo cuando se conozca, proveedor opcional, observación; sin ERP de inventario; no bloquea cierre de OT. **VERIFICADO** (E2E §28 paso 13; política §32).

---

## 20. Hoja de vida (§19)

- Cronología comprensible (información actual + historial: preoperacional, mantenimientos, tanqueos, lecturas) proveniente de datos reales; `ResumenCabecera` único (sin doble montaje). **VERIFICADO** (E2E §28 pasos 17–18; verificación visual ficha C1 con resumen único e «Información actual»).

---

## 21. Datos históricos reales (§20, §21)

- Política: no reemplazar, no regenerar, no fabricar datos para llenar pantallas. **VERIFICADO** (sin cambios de datos por diseño).
- **INCIDENTE (ver Riesgos y Deuda):** las suites de integración PostgreSQL contra la base compartida **borraron el tenant demo** (incluidos históricos LITE-09). Se **restauró** con `seed:demo` + reimportación idempotente mediante el importador oficial. **Conteos canónicos verificados tras restauración:** 38 activos, 764 tanqueos, 3736 preoperacionales, 1971 jornadas, 109 mantenimientos, C11 = 0 (equipo de tercero sin mantenimientos internos ficticios, §21). **VERIFICADO** (conteos comprobados) / la incidencia en sí es un **RIESGO** operativo abierto.
- C11 / C11 SIGAR tratado como mismo equipo. **VERIFICADO**.

---

## 22. Indicadores (§24)

- No se inventaron KPIs; se muestran indicadores solo con fuente real, diferenciando dato real / calculado / no disponible; sin fabricar MTBF/MTTR/disponibilidad sin insumos. **VERIFICADO** (política intacta; ajuste de `WidgetRenderer` sin introducir KPIs ficticios).

---

## 23. Seguridad (§26)

- RLS de LITE-05 sin modificar; sin reconexión como superusuario; `deltaops_app` + FORCE RLS + aislamiento de tenant + backend authority + RBAC + fail-closed conservados. **VERIFICADO** (sin cambios en el modelo).
- Toda acción nueva valida autorización en backend; ocultar un botón no es seguridad. **VERIFICADO** (los cambios fueron de navegación/visibilidad y composición).

---

## 24. Performance (§25)

- No se introdujeron cargas masivas nuevas en frontend; filtros/paginación server-side conservados donde el contrato ya lo permitía. **VERIFICADO** (sin cambios de contrato).
- Medición de rendimiento con volúmenes reales (hoja de vida, timeline, listados) bajo carga: **NO VERIFICADO** — no se ejecutó benchmarking dedicado en esta fase.

---

## 25. Producción — preparación (§27)

Tabla de preparación (no despliegue). Bloqueantes 🔴: **ninguno**.

- 🟢 **Configuración fail-fast** (variables requeridas validadas al arranque). **VERIFICADO** (`config.ts` / `index.ts`).
- 🟢 **Cookies** (Secure/atributos de sesión). **VERIFICADO**.
- 🟢 **CORS con allowlist**. **VERIFICADO** (`app.ts`).
- 🟢 **Graceful shutdown**. **VERIFICADO** (`index.ts`).
- 🟢 **Readiness real** (`/ready` refleja estado real de dependencias). **VERIFICADO**.
- 🟡 **`SESSION_SECRET` de doble uso** — se emplea para más de un propósito; requiere separación de secretos antes de producción. **REQUIERE CONFIGURACIÓN** (no bloqueante en esta fase).
- 🟡 **Health gate del deploy apunta a `/health`** en lugar de `/ready`; conviene apuntar el gate de readiness del despliegue a `/ready`. **REQUIERE CONFIGURACIÓN**.
- Build de producción de deltaops: verde (con las variables `PORT`/`BASE_PATH`/`NODE_ENV` requeridas por `vite.config`; único aviso pre-existente de tamaño de chunk). **VERIFICADO**.
- Backups, rollback, dominio y HTTPS de la infraestructura de despliegue: **NO VERIFICADO** en esta fase (corresponde al despliegue, explícitamente fuera de alcance por §27).

---

## 26. Pruebas (§28)

- `typecheck` raíz: **VERIFICADO** (verde en los 4 proyectos con typecheck).
- `build` producción deltaops: **VERIFICADO** (verde).
- Suite unitaria deltaops: **VERIFICADO** — 970/970 (incluye la nueva regresión SEVERO-1/MENOR-2 y los tests de shell).
- Suite Design System: **VERIFICADO** — 82/82.
- E2E §28 (flujo MON-001 completo): **VERIFICADO** — login → home → equipo → lectura → rutina → preoperacional NO APTO → hallazgo → generar OT → asignar → ejecutar → mano de obra → repuesto → combustible → validación (anti auto-aprobación por segunda identidad) → cierre → hoja de vida → historial; repetición con CONSULTA en solo lectura (pasos 19–20). Ejecutado sobre datos históricos reales.
- Verificación visual (§29): **VERIFICADO** — 360/390/1280, claro/oscuro, hamburguesa, tabs, header, navegación por rol, ficha C1 con resumen único e «Información actual».
- Suites de integración PostgreSQL: **GAP / NO VERIFICADO como criterio de cierre** — no forman parte del criterio de cierre; ver Riesgos y Deuda. Fallos PG pre-existentes ajenos identificados: `module.pg`, `preoperacional-http-roles`.

---

## 27. GAPs (§31.27)

- **GAP-1** — Matriz responsive incompleta: 430/768/1024/1440 px sin verificación visual dedicada punto por punto. Severidad: media.
- **GAP-2** — Ausencia de regresión visual automatizada para las pantallas prioritarias de §29; la cobertura visual es manual.
- **GAP-3** — Sin medición formal de contraste WCAG por componente en claro/oscuro.
- **GAP-4** — Sin benchmarking de performance con volúmenes reales (§25).
- **GAP-5** — Suites de integración PG no aisladas de la base compartida (causa raíz del incidente de datos); ver Riesgos.
- **GAP-6** — `SESSION_SECRET` de doble uso y health gate de deploy apuntando a `/health` (§27) pendientes de configuración.

Ningún GAP es bloqueante para cerrar LITE-10.

---

## 28. Deuda técnica (§31.28)

- **DT-1 — Backlog de `kernel_outbox` con drenaje single-batch.** El drenado en un solo lote es insuficiente para volúmenes grandes; requiere drenado por lotes/continuo. **VERIFICADO** (comportamiento observado) — no bloqueante, sin impacto en el flujo funcional actual.
- **DT-2 — Fallos PG pre-existentes ajenos:** `module.pg` y `preoperacional-http-roles`. Anteriores a LITE-10 y fuera de su alcance; deben triarse aparte. **VERIFICADO** (reproducidos como pre-existentes).
- **DT-3 — Aislamiento de suites de integración PG** (ver GAP-5 / Riesgos): deben ejecutarse contra una base efímera/aislada, nunca la compartida con datos reales.
- **DT-4 — Doble uso de `SESSION_SECRET`:** separar responsabilidades de secreto antes de producción.
- **DT-5 — Aviso de tamaño de chunk** del build de deltaops (code-splitting / manualChunks): cosmético, no bloqueante.

---

## 29. Riesgos (§31.29)

- **RIESGO-ALTO — Suites de integración PG contra base compartida.** Durante la fase, esas suites **borraron el tenant demo incluyendo históricos LITE-09**. Se restauró con `seed:demo` + reimportación idempotente vía importador oficial y se verificaron conteos canónicos (38 activos / 764 tanqueos / 3736 preop / 1971 jornadas / 109 mantenimientos / C11=0). **Mitigación recomendada (obligatoria antes de producción):** aislar estas suites en una base efímera/desechable; prohibir su ejecución contra entornos con datos reales; añadir salvaguarda que aborte si el destino no es una base de test. **VERIFICADO** (incidente ocurrido y restauración confirmada).
- **RIESGO-MEDIO — Regresión visual sin red de seguridad automatizada** (GAP-2): cambios futuros de UI podrían reintroducir overflow/contraste sin detección.
- **RIESGO-MEDIO — `SESSION_SECRET` de doble uso** (§27): rotación o compromiso afectaría a más de un propósito.
- **RIESGO-BAJO — Deuda de `kernel_outbox`** (DT-1): degradación potencial bajo volúmenes altos de eventos.

---

## 30. Criterio de salida a LITE-11 (§31.30)

LITE-10 se considera **cerrada** con los siguientes criterios cumplidos y pendientes acotados:

**Cumplido (habilita la salida):**
- Los 2 hallazgos SEVEROS y los 2 MENORES de la revisión independiente están corregidos y con regresión donde aplica. **VERIFICADO**.
- Defecto pre-existente «Diagnóstico inválido» corregido, habilitando el flujo operacional completo. **VERIFICADO**.
- typecheck, build de producción, unitarias deltaops (970/970) y Design System (82/82) en verde; E2E §28 completo PASS; verificación visual §29 PASS. **VERIFICADO**.
- Sin bloqueantes 🔴 de seguridad, datos ni arquitectura. **VERIFICADO**.
- Datos históricos reales restaurados y verificados por conteos canónicos. **VERIFICADO**.

**Condiciones a trasladar a LITE-11 (no bloqueantes de este cierre):**
1. Aislar las suites de integración PG de la base compartida (RIESGO-ALTO / DT-3 / GAP-5) — **prioridad alta**.
2. Configuración de producción §27: separar `SESSION_SECRET` de doble uso y apuntar el health gate del deploy a `/ready` (GAP-6 / DT-4).
3. Completar matriz responsive (430/768/1024/1440) y añadir regresión visual automatizada (GAP-1, GAP-2, RIESGO-MEDIO).
4. Benchmarking de performance con volúmenes reales (GAP-4).
5. Triar los fallos PG pre-existentes `module.pg` y `preoperacional-http-roles` (DT-2).
6. Planificar drenado por lotes de `kernel_outbox` (DT-1).

**No iniciar LITE-11 automáticamente (§35).** Esta fase se detiene aquí y entrega este informe. Cambios en el árbol de trabajo **sin commit**, conforme a la instrucción.

---

*Fin del documento de cierre DELTAOPS LITE-10.*
