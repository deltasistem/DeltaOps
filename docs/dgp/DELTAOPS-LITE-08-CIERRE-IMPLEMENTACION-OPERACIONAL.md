# DELTAOPS LITE-08 · Cierre de Implementación Operacional Delta

> **Naturaleza (§1, §32).** Fase de **IMPLEMENTACIÓN** (ETAPAS A–C + ciclo de correcciones E2E).
> La estrategia rectora fue **composición > extensión > estructura nueva**: se expuso y compuso
> capacidad de dominio **ya existente** (Utilización, Planes/Frecuencias, Órdenes, Mano de Obra,
> Activos, Identidad) alrededor del equipo, evitando dominio nuevo, entidades duplicadas y
> reestructuraciones. **Cero migraciones de base de datos.**
>
> **Criterio de honestidad (§39).** Sólo se marca **PASS** lo verificado con evidencia real
> (typecheck autoritativo `tsc --noEmit`, suites de test ejecutadas, E2E en navegador, y SQL de
> solo-lectura contra la BD dev). Lo no verificado se declara explícitamente como tal; los GAPs y la
> deuda técnica se listan sin maquillaje. La sección de **revisión independiente** queda con
> marcador hasta el veredicto del revisor.
>
> **Fuentes de verdad (§2).** Código real (`lib/module-*`, `artifacts/api-server`,
> `artifacts/deltaops`), esquema PostgreSQL `deltaops`, OpenAPI regenerado, LITE-06/07, y evidencia
> de negocio. Regla: **CÓDIGO + evidencia real > documentación antigua**.

---

## 0. Índice de los 27 puntos §38

1. Qué se implementó · 2. Qué se reutilizó · 3. Archivos modificados · 4. APIs modificadas/creadas ·
5. Migraciones (cero) · 6. Rutinas · 7. Lecturas · 8. Combustible · 9. Horas hombre · 10. Consumos ·
11. Hoja de vida · 12. Centros · 13. Roles · 14. Navegación · 15. Home · 16. Indicadores ·
17. Responsive · 18. Tema · 19. Offline · 20. Seguridad · 21. Tests · 22. E2E ·
23. Revisión independiente · 24. GAPs · 25. Deuda técnica · 26. Rollback ·
27. Estado final honesto (§39).

---

## 1. Qué se implementó

LITE-08 aterrizó la operación **alrededor del equipo**, exponiendo por perfil capacidad que ya vivía
en los runtimes pero estaba oculta o presentada como CMMS/EAM genérico. En concreto:

- **Estado operacional de rutinas por activo** (semáforo + «Faltan N h/km», derivación PURA del motor
  de frecuencias): nuevo dominio de **presentación** `estado-rutina` y query `planes.estado-rutinas`.
- **Captura operacional de lecturas y de combustible** desde la experiencia (superficies
  `captura-lectura`, `captura-combustible`) sobre los comandos existentes de Utilización.
- **Hoja de vida del activo** consolidada: timeline **legible** (evento/fecha/actor/resumen) y
  **mano de obra** por activo — incluyendo trabajo **EN CURSO** (sesión abierta) y **PENDIENTE**
  (sesión cerrada sin valoración), nunca «Sin mano de obra» falso.
- **Home operacional por perfil** (§23): «¿Qué necesita tu atención?» — conteos accionables
  priorizados a partir de read models existentes (composición pura, sin BI).
- **Navegación por perfil + preferencia de visibilidad de grupos** por tenant (§21, §22):
  visibilidad ≠ seguridad (fail-open de presentación; el backend sigue siendo la autoridad).
- **Indicadores operacionales** livianos, **responsive** (móvil 390 px), **tema** claro/oscuro.
- **Ciclo de correcciones E2E**: mano de obra `EN_CURSO`, timeline plano legible (ver §6, §11, §22 y
  las Lecciones del ciclo).

## 2. Qué se reutilizó (composición, sin dominio nuevo)

- **Utilización (DGP-019.x)** — lecturas append-only, monotonicidad, corrección auditada
  (`regularizar-medidor`, `anular-lectura`), combustible/consumos. **No se tocó el dominio.**
- **Planes / Motor de frecuencias (DGP-012)** — `evaluarFrecuencia` (meta/actual/faltante/excedente,
  regla disparadora, vencida). El nuevo `estado-rutina` **sólo traduce** su salida a presentación.
- **Órdenes (DGP-020.2)** — sesiones de trabajo como **autoridad del tiempo** (tramos append-only,
  read model `ord_sesion_duraciones_read`). **Nunca se recalcula un tramo.**
- **Mano de Obra (DGP-020.3)** — valoraciones, tarifas vigentes, recursos. La ficha por activo se
  **compone** de estas fuentes; no se materializan hechos nuevos.
- **Activos** — listado, ficha, timeline; se **normalizó** la forma del timeline hacia la UI.
- **Identidad / RBAC / RLS** — roles y permisos existentes; se compuso navegación por rol. **Cero
  RBAC/RLS nuevos, cero reducción de seguridad.**

## 3. Archivos modificados / creados

> Este es el inventario del árbol de trabajo de LITE-08 (ETAPAS A–C + fixes). Se separan los cambios
> de dominio/plataforma de los de experiencia. El revisor debe confirmar el alcance efectivo del
> commit único (§26) al momento de integrar.

**Dominio — Planes (rutinas):**
- `lib/module-planes/src/domain/estado-rutina.ts` *(nuevo)* — derivación pura del estado operacional.
- `lib/module-planes/src/domain/__tests__/estado-rutina.test.ts` *(nuevo, ubicado en `src/__tests__/`)*.
- `lib/module-planes/src/module.ts` — query `estado-rutinas`.
- `lib/module-planes/src/index.ts`, `openapi/spec.ts`, `openapi/planes.openapi.json`,
  `src/__tests__/module.test.ts`.

**Dominio — Órdenes (sesiones):**
- `lib/module-ordenes/src/infrastructure/sesiones.ts` — `duracionesPorActivo` en la interfaz
  `SesionStore`, en `FakeSesionStore` y en la impl PG.
- `lib/module-ordenes/src/module.ts` — `sesion.duraciones` acepta `activoId`.
- `lib/module-ordenes/src/domain/operacional.ts`, `openapi/spec.ts`, `openapi/ordenes.openapi.json`,
  `src/__tests__/cqrs.test.ts`.

**Dominio — Mano de Obra:**
- `lib/module-manodeobra/src/module.ts` — `listadoPorActivo` compone valoraciones + sesiones
  no valoradas (`CERRADA`→`PENDIENTE`, `ABIERTA/PAUSADA`→`EN_CURSO`).
- `lib/module-manodeobra/src/domain/ports.ts` — `duracionesPorActivo` en `OrdenesSesionPort`.
- `lib/module-manodeobra/src/infrastructure/fakes.ts` — fake correspondiente.
- `lib/module-manodeobra/src/openapi/spec.ts`, `openapi/manodeobra.openapi.json` — enum de estado con
  `PENDIENTE` y `EN_CURSO`.
- `lib/module-manodeobra/src/__tests__/aplicacion.test.ts`.

**Dominio — Activos (timeline):**
- `lib/module-activos/src/module.ts` — `normalizarEntradaTimeline` (aplana a contrato legible).
- `lib/module-activos/src/openapi/spec.ts`, `openapi/activos.openapi.json`,
  `src/__tests__/module-082.test.ts`.

**API-server (routers/runtimes):**
- `artifacts/api-server/src/routes/deltaops/manodeobra-runtime.ts` — puerto `ordenesSesionPort` con
  `duracionesPorActivo`.
- `artifacts/api-server/src/routes/deltaops/manodeobra-module.ts` — forward de `activoId`.
- `artifacts/api-server/src/routes/deltaops/ordenes-module.ts` — `/sesiones/duraciones` con `activoId`.
- `artifacts/api-server/src/routes/deltaops/planes-module.ts`, `planes-runtime.ts` — `estado-rutinas`.
- `artifacts/api-server/src/routes/deltaops/visibilidad-module.ts`, `visibilidad-runtime.ts` *(nuevos)*
  — preferencia de visibilidad de navegación.
- `artifacts/api-server/src/app.ts` — montaje del router de visibilidad.
- `artifacts/api-server/src/routes/deltaops/__tests__/visibilidad-runtime.test.ts` *(nuevo)*.
- `artifacts/api-server/src/routes/deltaops/__tests__/manodeobra-valoracion-cableado.integration.test.ts`
  — cableado REAL por activo (EN_CURSO/PENDIENTE) — ver §21, §22.

**Experiencia (deltaops):**
- `src/lib/manodeobra/{tipos,formato}.ts`, `src/lib/manodeobra/ManoDeObraActivo.tsx` — estados
  `PENDIENTE`/`EN_CURSO`.
- `src/lib/centro/atencion.ts` *(nuevo)* — composición «¿Qué necesita tu atención?».
- `src/lib/identidad/visibilidad-nav.tsx` *(nuevo)*, `src/lib/identidad/{AppShell,rbac}.tsx/.ts` —
  navegación por perfil + visibilidad.
- `src/pages/inicio-empresa.tsx` — home operacional + indicadores.
- `src/pages/activos-ficha.tsx`, `src/pages/ordenes/tab-ejecucion.tsx`, `src/lib/utilizacion/PanelOperacional.tsx`.
- `src/__tests__/{home-nav-lite08,captura-lectura,captura-combustible,manodeobra}.test.tsx` — nuevos y
  actualizados.

## 4. APIs modificadas / creadas

**Creadas:**
- `GET/POST /api/deltaops/visibilidad-nav` — lectura para todo usuario del tenant; escritura para
  admin. Contrato: `{ ocultos: string[] }`.
- `modulo.planes.estado-rutinas` (query) — estado operacional de rutinas por activo (semáforo +
  faltante/excedente), expuesto vía el router de planes.

**Modificadas (extensión aditiva, sin ruptura):**
- `modulo.ordenes.sesion.duraciones` — acepta `activoId` (además de `sesionId`/`ordenId`);
  `/sesiones/duraciones` forwardea `activoId`. OpenAPI regenerado.
- `modulo.manodeobra.valoraciones` (path `activoId`) — compone sesiones no valoradas; enum de estado
  amplía a `PENDIENTE` y `EN_CURSO`. OpenAPI regenerado.
- `modulo.activos.timeline` — devuelve entradas **planas** legibles (`tipo`/`ocurridoAt`/`resumen`/
  `actor` + campos canónicos). OpenAPI regenerado.

Todas las modificaciones son **aditivas** (nuevos campos/valores de enum, parámetros opcionales); no
se removió ni renombró contrato existente.

## 5. Migraciones — **CERO** (justificación)

**No hubo migraciones de base de datos.** La estrategia fue composición sobre read models y tablas
ya existentes:

- El estado de rutinas se **deriva** del motor de frecuencias + medidores; no persiste nada nuevo.
- La mano de obra por activo lee `ord_sesion_duraciones_read` y `mdo_valoraciones` **existentes**.
  Se verificó por SQL de solo-lectura que `ord_sesion_duraciones_read.activo_id` **ya existe y está
  poblado** para la sesión de CAM-001/OT-000022 — no hizo falta proyectar columna nueva; la solución
  fue de composición (surtir también sesiones abiertas), **sin recalcular tramos**.
- El timeline **normaliza en lectura** la forma de filas ya almacenadas.
- La visibilidad de navegación se guarda en el mecanismo de preferencias existente (no tabla nueva).

Esto cumple el objetivo §33 de **migraciones apuntando a CERO** y el principio append-only de
Órdenes como autoridad del tiempo.

## 6. Rutinas

- `estado-rutina.ts` traduce `evaluarFrecuencia` a: `meta/actual/faltante/excedente` de la **regla
  disparadora**, semáforo 🟢/🟡/🔴 (siempre con texto), y unidad (h/km/ciclos/días) para «Faltan N h».
- **No calcula dominio nuevo** ni usa reloj interno: si no hay regla medible, devuelve `sin-datos`
  (nunca inventa un faltante). El umbral de proximidad es **política de presentación** declarativa.
- Query `modulo.planes.estado-rutinas` evalúa **sólo planes VIGENTES** por activo con medidores/eventos
  provistos por el llamador.
- **Aislamiento a nivel de activo individual** (no agregado global) — el agregado global es
  `GAP-HOME-RUTINAS` (ver §24).

## 7. Lecturas (horómetro / kilometraje)

- Se **reutiliza** Utilización sin cambios de dominio: hechos append-only, monotonicidad,
  `regularizar-medidor` (motivo) y `anular-lectura` (motivo + actor + fecha).
- Nueva superficie de **captura** operacional (`captura-lectura`) sobre esos comandos.
- **No se inventan lecturas**; una lectura menor no se interpreta como reinicio automático.

## 8. Combustible

- **Reutiliza** la captura/consumo de Utilización. Nueva superficie `captura-combustible`.
- **GAP-TANQUEO** documentado (ver §24): el flujo de tanqueo end-to-end con validaciones específicas
  no se implementó como capacidad nueva en esta fase.

## 9. Horas hombre (mano de obra)

- **Autoridad del tiempo = Órdenes** (tramos append-only). Mano de Obra **valora** ese tiempo con la
  tarifa vigente en `iniciadoAt`; **nunca recalcula tramos**.
- La ficha por activo compone: `VALORADA` (con snapshot), `PENDIENTE` (cerrada sin valoración,
  horas visibles / costo `null`), y **`EN_CURSO`** (sesión abierta/pausada, horas acumuladas /
  costo `null`). Jamás «$0» falso (§15) ni «Sin mano de obra» cuando hay trabajo real.

## 10. Consumos

- Se **exponen** los consumos ya modelados por Utilización en la ficha/panel operacional. Sin dominio
  nuevo. `GAP-COST-14/15` acota lo relativo a costeo de consumos (ver §24).

## 11. Hoja de vida (ficha del activo)

- **Timeline legible** — `normalizarEntradaTimeline` aplana cada fila a `tipo`/`ocurridoAt`/`resumen`/
  `actor` (+ alias canónicos), derivando el resumen cuando el evento auto-proyectado no lo trae. Se
  eliminaron las filas «Evento» y las fechas «Sin datos».
- **Mano de obra** — según §9: `VALORADA`/`PENDIENTE`/`EN_CURSO`, horas siempre visibles.
- Consolidada con lecturas/consumos existentes.

## 12. Centros

- La experiencia respeta el **aislamiento por tenant/centro** ya impuesto por **RLS** en PostgreSQL y
  por el contexto de ejecución (tenant en `metadata`). La composición de home/atención opera **dentro**
  del tenant del usuario.
- **Honestidad (§39):** *no* se añadió un test **E2E multicentro nuevo** en esta fase. El aislamiento
  se apoya en las suites **RLS/tenant existentes** (p. ej. `lib/module-ordenes/src/__tests__/sesion.pg.test.ts`
  con tenants únicos por corrida y aserciones cross-tenant; suites `*.pg`/`*.integration` de RLS del
  repositorio). Ver §24 (deuda) para el E2E multicentro pendiente.

## 13. Roles

- Se **reutilizan** roles/permisos canónicos (admin, supervisor, planificador, técnico, …) sin crear
  RBAC nuevo. La navegación y el home se **componen por rol** en el cliente; la autorización efectiva
  permanece en el backend (comandos/queries con `permissions`). **No se redujo seguridad.**

## 14. Navegación

- Navegación **por perfil** (§22) + **preferencia de visibilidad de grupos** por tenant (§21).
- **Visibilidad ≠ seguridad**: si la lectura de preferencias falla, no se oculta nada (fail-open de
  presentación); el backend sigue siendo la autoridad de acceso.
- Dos botones `aria-haspopup="menu"` conviven (nav «Más» + perfil); el de perfil es el último (nota
  operativa para tests de UI).

## 15. Home

- Home operacional (§23) «¿Qué necesita tu atención?»: conteos **accionables** priorizados
  (mantenimiento vencido → preoperacionales/hallazgos → OT pendientes → sin asignar/críticas →
  equipos fuera de servicio) desde read models existentes. **Sin BI** (sin tendencias ni KPIs
  financieros): estado puntual del tenant.

## 16. Indicadores

- Indicadores operacionales livianos en el home (composición de conteos existentes). La sección se
  identifica por su encabezado «Indicadores» (colisiona con el texto del grupo de nav — usar
  `findByRole("heading", { name: "Indicadores" })` en tests).

## 17. Responsive

- Verificado en **móvil 390 px** en el E2E de navegador (§22): navegación, home y ficha usables.

## 18. Tema

- Tema **claro y oscuro** verificados en el E2E de navegador (ambos modos).

## 19. Offline

- Se conserva la naturaleza **Offline-First** de los comandos existentes (idempotencia por `opId`,
  fechas ISO-8601, `origen: online|offline`). **No se degradó** ninguna garantía offline; no se añadió
  capacidad offline nueva en esta fase.

## 20. Seguridad

- **Cero** entidades RBAC/RLS nuevas; **cero** reducción de seguridad (§restricción vigente).
- Visibilidad de nav es de **presentación**, nunca sustituye la autorización del backend.
- Contratos ampliados de forma **aditiva**; no se expusieron datos cross-tenant (RLS forzado).
- Credenciales/secretos: la verificación en vivo se hizo con sesión demo derivada del entorno; **nunca
  se imprimieron secretos** en reportes.

## 21. Tests (unitarios / de composición)

**typecheck autoritativo `tsc -p tsconfig.json --noEmit` — verde** en: `module-manodeobra`,
`module-ordenes`, `module-activos`, `module-planes`, `api-server`, `deltaops`.

**vitest (suites no-`pg`) — verde y verificado este ciclo:**
- `lib/module-manodeobra` — 37/37 (incluye caso EN_CURSO por activo).
- `lib/module-ordenes` — 110/110.
- `lib/module-activos` — 76/76 (timeline plano).
- `artifacts/deltaops` (`manodeobra.test.tsx`) — 24/24 (incluye EN_CURSO en la ficha).

**Test de cableado REAL (no fake)** — se extendió
`artifacts/api-server/.../manodeobra-valoracion-cableado.integration.test.ts` para ejercitar el camino
de producción (`manodeobraRuntime()` + `ordenesSesionPort` reales) por **activo**: inserta en el read
model real una sesión `ABIERTA` y una `CERRADA` sin valoración (con `activo_id` poblado) y asegura que
la query real compone `EN_CURSO` + `PENDIENTE` (nunca vacío, costo `null`). Es
`*.integration.test.ts` (requiere `DATABASE_URL`) — su ejecución corresponde al agente principal.

**Nota de alcance de subagente:** no se ejecutaron suites `*.pg`/DB-integration ni se reinició la
aplicación (fuera de alcance); esas corridas las realiza el agente principal.

## 22. E2E (navegador)

**PASS (verificado en navegador):** flujo completo del §35 hasta la **hoja de vida** con:
- **Mano de obra `EN_CURSO`** visible (horas del trabajo activo, sin costo falso).
- **Timeline legible** (evento/fecha/actor/resumen; sin «Evento»/«Sin datos»).
- **Tema** claro y oscuro.
- **Móvil 390 px**.
- **Navegación de técnico** por perfil.

**NO cubierto por E2E nuevo (honestidad §39):** **aislamiento multicentro** — no se agregó un E2E
multicentro en navegador; se apoya en suites RLS/tenant existentes (§12). Queda como deuda (§24/§25).

## 23. Revisión independiente

**Veredicto: PASS** (0 hallazgos bloqueantes; 3 observaciones menores). El revisor verificó desde cero
el árbol de trabajo completo sobre HEAD `3844fe4` (52 archivos modificados + 11 nuevos) contra los 8
requisitos de §37: no-duplicación (composición pura, sin módulo/entidad/RBAC/cola paralelos), cero
migraciones confirmado, seguridad DGP-023 intacta (WRITE de visibilidad-nav con doble barrera
backend, visibilidad jamás revela módulos no habilitados, tenant/identidad nunca desde HTTP, opId con
dedupe), dinero string-only sin sumas, contratos OpenAPI aditivos y en sync, calidad sin bugs
bloqueantes, §31/§5/§15 respetados y GAPs razonables.

Observaciones menores del revisor:
- **M-1** — el presente entregable §38 no existía al momento de la revisión; queda cumplido con este
  documento.
- **M-2** — el PUT de visibilidad-nav genera `opId` de reserva en el router si el cliente lo omite;
  tolerable (un registro por tenant, dedupe por contenido), registrado en §25.
- **M-3** — la LECTURA de visibilidad-nav se sirve a todo rol autenticado antes del guard de
  entitlements; correcto por diseño (solo devuelve `ocultos`, no revela nada), documentado aquí.

## 24. GAPs

- **GAP-TANQUEO** — flujo de tanqueo end-to-end (validaciones específicas de carga de combustible) no
  implementado como capacidad nueva; se ofrece la captura de combustible existente.
- **GAP-COST-14/15** — costeo fino de consumos/mano de obra en ciertos bordes (§14/§15): la ficha
  muestra horas sin costo (`PENDIENTE`/`EN_CURSO`) en lugar de forzar un importe; el costeo completo
  depende de que la valoración fail-safe materialice el snapshot.
- **GAP-HOME-RUTINAS** — «rutinas próximas» agregadas a nivel de **todos** los equipos exige un
  agregado read-only nuevo (N×M: activos × planes con medidores server-side). Diferido; el home enlaza
  a las superficies de Equipos/Planes en lugar de forzar un agregado costoso. El estado por activo
  individual sí está disponible (`estado-rutinas`).
- **Re-anclaje por uso** — el re-anclaje de la base de cálculo de frecuencias tras un evento de uso
  (p. ej. cambio de medidor) se apoya en el comportamiento existente del motor; no se añadió una
  política nueva de re-anclaje en esta fase.
- **E2E multicentro** — sin test E2E de navegador multicentro nuevo (§12, §22).

## 25. Deuda técnica

- Añadir **E2E multicentro** en navegador que demuestre aislamiento visual/funcional entre centros.
- Implementar el **agregado read-only** de rutinas próximas globales (cierra GAP-HOME-RUTINAS) con
  cuidado de coste N×M.
- Cerrar **GAP-TANQUEO** y afinar **GAP-COST-14/15** cuando el negocio lo priorice.
- Considerar **materializar** la valoración de sesiones cerradas de forma más agresiva (o proyectar un
  estado derivado) para reducir la dependencia del timing de la orquestación fail-safe — manteniendo
  Órdenes como autoridad del tiempo y sin recalcular tramos.
- Evaluar si conviene **auto-cerrar** (o marcar) sesiones que quedan abiertas al cerrar la OT (ver
  Lecciones): hoy `EN_CURSO` es el mitigante honesto, pero el negocio podría querer una política de
  cierre explícita.
- **M-2 de la revisión:** exigir `opId` estable del cliente en el PUT de visibilidad-nav (o derivarlo
  del contenido) en lugar del valor de reserva generado en el router.

## 26. Rollback

- **Reversión = revertir el commit único de LITE-08.** No hay migraciones que deshacer (§5), por lo
  que el rollback es puramente de código: `git revert <sha-del-commit>` (o retirar el commit antes de
  integrar). Al no haber cambios de esquema ni datos, no se requieren pasos de base de datos.
- Los cambios de OpenAPI son aditivos; revertir el código revierte los specs regenerados de forma
  consistente.
- **Nota:** el agente **no** comitea; el commit lo realiza la persona responsable al cierre.

## 27. Estado final honesto (contra §39)

- **PASS (verificado):** typecheck de todos los paquetes tocados; suites no-`pg` (manodeobra 37/37,
  ordenes 110/110, activos 76/76, deltaops manodeobra 24/24); **E2E §35 en navegador** (hoja de vida
  con mano de obra `EN_CURSO`, timeline legible, tema claro/oscuro, móvil 390 px, navegación técnico);
  verificación por **SQL de solo-lectura** de la causa raíz (sesión ABIERTA de CAM-001/OT-000022 y
  `activo_id` poblado).
- **PASS pendiente de ejecución por el agente principal:** test de **cableado REAL por activo**
  (`*.integration.test.ts`, requiere `DATABASE_URL`).
- **NO verificado (declarado):** **aislamiento multicentro por E2E nuevo** — se apoya en suites
  RLS/tenant existentes, no en un E2E dedicado.
- **Diferido (GAPs §24):** GAP-TANQUEO, GAP-HOME-RUTINAS (agregado global), afinamiento de
  GAP-COST-14/15, política de re-anclaje por uso.
- **Revisión independiente:** **PASS** (0 bloqueantes; 3 observaciones menores documentadas en §23).

No se marca PASS nada que no esté respaldado por evidencia real.

---

## Anexo · Lecciones del ciclo de correcciones

1. **La sesión de una OT queda ABIERTA al cerrar la OT.** Cerrar la orden (`OT-000022` → `CERRADA`)
   **no** cierra la sesión de trabajo; su sesión (`c6d0584f`) permaneció `ABIERTA` en `ord_sesiones`
   y en `ord_sesion_duraciones_read` (verificado por SQL). La primera versión del fix sólo componía
   sesiones **cerradas**, por lo que la ficha seguía diciendo «Sin mano de obra» pese a haber trabajo
   real. **Por eso existe ahora el estado `EN_CURSO`**: la hoja de vida debe reflejar el trabajo en
   curso con sus horas acumuladas (costo `null`, nunca $0).

2. **Timeline plano vs. anidado.** `platform.timeline.query` devuelve filas **crudas anidadas**
   (`{id, data:{eventType, occurredAt, actorId, payload, resumen?}}`), mientras la UI consume una
   forma **plana** (`tipo`/`ocurridoAt`/`resumen`/`actor`). Reenviar sin aplanar producía «Evento» y
   «Sin datos». La corrección normaliza en lectura (`normalizarEntradaTimeline`) y deriva el resumen
   cuando el evento auto-proyectado no lo trae. Lección: **fijar el contrato de forma en la frontera
   de lectura**, no asumir que productor y consumidor comparten shape.

3. **Las libs del workspace se consumen COMPILADAS.** El `api-server` vivo sirve un bundle construido
   (`dist/index.mjs`); los cambios en `lib/module-*` **no** tienen efecto hasta un **rebuild**. Un
   build obsoleto puede explicar un FAIL en vivo aunque el código fuente y los tests estén verdes.
   Lección: al verificar en vivo, **confirmar que el bundle fue reconstruido** antes de concluir.

4. **Los fakes ocultan la forma real de los puertos.** Todas las suites del módulo usaban
   `FakeOrdenesSesionPort` (que siempre trae la fila con `activoId`), lo que dio confianza falsa
   mientras el runtime real fallaba. Lección: para seams cross-módulo, **añadir al menos un test que
   ejercite el cableado REAL** (runtime de producción + puerto real contra la BD), no sólo fakes.
