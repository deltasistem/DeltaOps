# DGP-022 — DESCUBRIMIENTO · Product Maturation & Operational Integration

> Auditoría integral de DeltaOps hasta DGP-021.4. **Fase 100 % de descubrimiento: sin cambios de código, migraciones, contratos, RBAC/RLS ni frontend.** Toda afirmación se verifica contra el código actual (archivo:línea), contratos, tests, build y pruebas negativas HTTP/SQL de solo lectura ejecutadas el 2026-08-13 contra el servidor vivo (`:8080`) sobre el tenant `delta-demo`.

Leyenda de estado por capacidad: 🟢 COMPLETA · 🟡 FUNCIONAL CON DEUDA · 🟠 INCOMPLETA · 🔴 BLOQUEANTE · ⚪ V2/FUTURO.
Clasificación de hallazgos: **CRÍTICO · MAYOR · IMPORTANTE · MENOR · OPORTUNIDAD · V2**.

---

## 1. Resumen ejecutivo

DeltaOps es una plataforma de gestión de mantenimiento **multitenant, modular y madura a nivel de dominio**. Los 11 módulos de negocio (Referencia, Activos, Órdenes, Inventario, Abastecimiento, Planes, Preventivo, Correctivo, Utilización, Mano de obra, Costos) están construidos sobre una arquitectura CQRS + Kernel + read models con **fronteras de bounded-context estrictas** (cada módulo consulta SOLO su propio prefijo de tablas; la composición cross-módulo se hace exclusivamente por contratos públicos en el orquestador de `api-server`). La seguridad de fondo es sólida: RLS activo en 167/174 tablas, sesión Enterprise con epoch de autorización, entitlements de módulo con fallo cerrado, y **backend como única autoridad de autorización** (verificado con pruebas negativas: CONSULTA no puede mutar; anónimo recibe 401; IDOR responde 404 sin filtrado).

**Evidencia cuantitativa de salud (2026-08-13):**
- Tests: api-server 210/210 ✓; deltaops 898/898 ✓; módulos 906 tests (activos 106, ordenes 128, inventario 97, planes 87, preventivo 95, correctivo 91, abastecimiento 84, utilización 28, manodeobra 42, costos 45, analytics 113, reference 28). **Total ≈ 2 014 tests.**
- Typecheck: api-server 0 errores, deltaops 0 errores.
- Build deltaops: OK (con advertencia de chunk, ver §14).

**El producto es un MVP funcional, pero se identificó UN hallazgo CRÍTICO de seguridad que condiciona incluso el piloto.** ⛔ **`PLATFORM-CONSOLE-ACL` — broken access control cross-tenant:** cualquier **TENANT_ADMIN** accede a la consola de plataforma `/api/deltaops/platform/*` (logs de auditoría, colas, jobs, storage) porque el guard acepta el rol legacy `admin` (al que `rbac.ts:34` mapea TENANT_ADMIN) además de `platform_admin`. **Verificado en vivo (2026-08-13):** un TENANT_ADMIN de `delta-demo` obtiene HTTP 200 y ve auditoría del tenant ajeno `deltaops` y agregados de 35–55 tenants (§12). **Debe corregirse antes de cualquier onboarding** (fix mínimo propuesto en §12/§23, pendiente de aprobación de Dirección; NO ejecutado en esta fase).

Fuera de ese CRÍTICO, los diferenciales entre piloto y producción son de **operabilidad/hardening**, no de dominio: CORS abierto, ausencia de rate-limiting y cabeceras de seguridad, empaquetado frontend monolítico (chunk 1,4 MB), ausencia de backups/monitoreo declarados en repo, granularidad de RBAC colapsada a 3 roles efectivos a nivel de comando, y varios GAP de datos declarados (combustible→dinero/OT, cantidad de inventario en float). La authz de **datos de negocio** (módulos, sesiones, IDOR de activos/OT/adjuntos, aislamiento por tenant) sí es sólida y verificada.

---

## 2. Estado real de la plataforma

| Dimensión | Estado | Evidencia |
|---|---|---|
| Dominio / módulos | 🟢 Maduro | 11 módulos, ≈2 014 tests verdes; fronteras limpias (§16) |
| **Seguridad — consola de plataforma** | 🔴 **CRÍTICO** | `PLATFORM-CONSOLE-ACL`: TENANT_ADMIN accede a `/platform/*` cross-tenant (§12, verificado en vivo) |
| Seguridad — authz de datos de negocio | 🟢 Sólida | Pruebas negativas §13 (401/403/404); RLS 167/174 |
| Integración cross-módulo | 🟢 Real (no solo navegación) | orquestadores por contratos (§11) |
| Frontend / UX | 🟡 Funcional con deuda | 89 páginas, DS único; monolito de 1,4 MB (§10, §14) |
| Offline | 🟡 Real en 10 módulos | cola localStorage por tenant, opId (§13-offline) |
| RBAC granular | 🟡 Colapsado a 3 roles efectivos | `rbac.ts:32-39` (§7) |
| Producción / operabilidad | 🟠 Incompleta | CORS/rate-limit/headers/backups (§17) |
| Datos y calidad | 🟡 Correcta con GAP declarados | SIN_DATOS≠CERO respetado; GAP-FUEL/INV (§12) |

Conclusión de estado: **"funciona en desarrollo" con base empresarial seria, PERO con un CRÍTICO de seguridad (`PLATFORM-CONSOLE-ACL`) que debe corregirse antes del onboarding; y NO "listo para producción" sin una fase de hardening.**

---

## 3. Inventario funcional (capacidades)

Formato compacto por capacidad. Fuente de datos = read model del módulo salvo indicación. Roles = quién la usa en UI (autoridad real = backend). Responsive/tema = Design System único aplica a todas (§8, §9). Offline sólo donde hay `mutarConOffline`.

| Módulo | Capacidad | Ruta | Endpoint/contrato | Roles UI | Estado | Tests | E2E | Offline | GAP/Riesgo |
|---|---|---|---|---|---|---|---|---|---|
| Activos | CRUD, ficha 360°, QR, árbol, sincronización | `/activos*` | `activos-module.ts` → `modulo.activos.*` | admin/oper (write), lector (read) | 🟢 | 106 | sí (pg) | sí (`activos/mutaciones.ts`) | — |
| Órdenes | crear/planificar/asignar/ejecutar/sesiones/pausas/cierre/aprobación/evidencias | `/ordenes*` | `ordenes-module.ts` → `modulo.ordenes.*` | oper (write), lector (read) | 🟢 | 128 (2 flaky PG) | sí | sí (`ordenes/mutaciones.ts`, sesión optimista) | supervisor/responsable por texto |
| Inventario | artículos/bodegas/movimientos/transferencias/conteos/existencias | `/inventario*` | `inventario-module.ts` | oper/lector | 🟢 | 97 | sí | sí | cantidad float (GAP-INV-CANT) |
| Abastecimiento | proveedores/solicitudes/OC/recepción/costo ponderado | `/abastecimiento/*` | `abastecimiento-module.ts` | oper/lector | 🟢 | 84 | sí | sí | — |
| Planes | planes/periodicidad/calendario/generación | `/planes*` | `planes-module.ts` | oper/lector | 🟢 | 87 | sí | sí | — |
| Preventivo | programas/actividad/calendario/generación de OT | `/preventivo/*` | `preventivo-module.ts` | oper/lector | 🟢 | 95 | sí | sí | — |
| Correctivo | solicitud/diagnóstico/intervención/cierre | `/correctivo/*` | `correctivo-module.ts` | oper/lector | 🟢 | 91 | sí | sí | — |
| Utilización | horómetro/odómetro/lecturas/tanqueos/reinicios/resumen | `/utilizacion/*` | `utilizacion-module.ts` | oper/lector | 🟢 | 28 | sí (pg) | sí | consumo combustible sin $ (GAP-FUEL-MONEY) |
| Mano de obra | categorías/tarifas/vigencias/valoración/snapshot | (composición) | `manodeobra-module.ts` → `modulo.manodeobra.*` | oper/lector | 🟢 | 42 | sí | n/a (server orquesta al cerrar sesión) | GAP-MO-PERIODO (filtro por valoradoAt) |
| Costos | hechos económicos, composición OT/activo, costo/hora, costo/km, comparativa, tendencia | `/costos` | `costos-module.ts`, `costos-indicadores.ts`, `costos-composicion.ts` | oper/lector (solo lectura de UI) | 🟢 | 45 | sí (pg) | no (read-only) | combustible NO_APLICA a OT (GAP-FUEL-OT) |
| Analytics | fuentes/datasets/indicadores(31)/dashboards/snapshots | `/analytics*` | `analytics-module.ts` | oper/lector | 🟢 | 113 | sí | sí (banner) | — |
| Referencia | catálogos/tipos/estados/unidades/búsqueda | `/referencia*` | `reference-module.ts` | admin/oper | 🟢 | 28 | — | no | — |
| Identidad/Tenancy | login/sesión/switch-tenant/usuarios/roles/invitaciones/branding/módulos | `/administracion/*`, `/perfil` | `identity.ts` | admin/super-admin | 🟢 | rbac/entitlements/flows/e2e | sí (http-e2e) | no | — |
| Centro Operacional | consola operativa de OT/SLA/críticos | `/centro`, `/` (landing empresa) | composición de `modulo.ordenes.*` | todos (contexto por rol) | 🟡 | — | — | no | agrupación por técnico usa `responsable` texto |

---

## 4. Matriz por módulo (§5)

### Referencia 🟢
Catálogos/tipos/estados/unidades/parámetros configurables por tenant con búsqueda; 28 tests. Consistencia: los módulos consumen catálogos vía sus propios contratos (`catalogo.opciones`). Sin deuda relevante.

### Activos 🟢
Creación/edición/estado/ubicación/clasificación/documentos(referencia-only)/relaciones/QR(`platform.qr`)/horómetro-odómetro (vía Utilización)/utilización/combustible(contextual)/mantenimiento(OT)/costos(indicadores 021.4)/historial/ficha 360° por tabs. Ficha verificada componiendo indicadores reales (§11 Flujo 6). Sin deuda propia; hereda GAP de combustible.

### Órdenes 🟢 (con 2 tests PG flaky)
Ciclo completo: crear→planificar→asignar(identidad canónica)→ejecutar→sesiones(abrir/pausar/reanudar/cerrar, device-time, idempotente por opId)→recursos/repuestos→cierre→aprobación→evidencias→historial/costos. Asignación por **identidad canónica** (DGP-020.1). IDOR en adjuntos verificado (`ordenes-module.ts:101-108`, la firma de URL sólo se emite si el adjunto pertenece a la OT). **Deuda:** `responsable` es texto libre en el read model (Centro agrupa por ese texto, `centro-mantenimiento.tsx:57`).
*Flaky:* `sesion.pg.test.ts` (2/14) falla bajo carga PG paralela (conflicto de versión / drenaje de outbox); **pasa aislado (14/14)**. Es flakiness de infraestructura de test concurrente, ya documentado en memoria (DGP-015), no defecto de producto.

### Inventario 🟢
Artículos/bodegas/entradas/salidas/movimientos/existencias/consumo/devoluciones(naturaleza CARGO/ABONO)/trazabilidad/relación con OT/costos. **Deuda de fondo:** la CANTIDAD se lleva como float (GAP-INV-CANT, declarado en `costos-orquestador.ts:32-36`), lo que acota la exactitud del importe de material aguas abajo (costos convierte a string antes de entrar, pero la cantidad de origen es float).

### Abastecimiento 🟢
Solicitudes/recepción/costos/proveedores/trazabilidad/**costo promedio ponderado** (contrato `costos-exactos` string 18,6)/integración con Inventario. Recepción → movimiento de inventario → materialización de costo vía orquestador por contratos (§11 Flujo 3). Sin deuda propia.

### Planes/Preventivo 🟢
Planes, periodicidad, disparo por horómetro/odómetro, próxima ocurrencia, **generación de OT atómica con vínculo idempotente** (`preventivo/domain/generacion.ts:174-189`, `ports.ts:229` `vincular`), historial, cumplimiento. Integración real, no navegación.

### Correctivo 🟢
Registro/diagnóstico/ejecución/cierre/relación con OT/evidencias. 91 tests.

### Utilización 🟢
Horómetro/odómetro/historial/inconsistencias/reinicios/tanqueos/consumo/offline/sincronización. Lecturas con `valorExacto` (string) y paginación por offset del contrato `modulo.utilizacion.lecturas`. **Deuda:** dinero de tanqueo es float en el módulo (GAP-FUEL-MONEY).

### Mano de obra 🟢
Categorías/recursos/tarifas/vigencias/sesiones/valoración/**snapshots**/costo/histórico. Cross-módulo por **orquestación fail-safe** al cerrar sesión de OT (`ordenes-module.ts:340-346`, `valorarSesionFailSafe`), idempotente por (tenant, sesión). **Deuda:** GAP-MO-PERIODO — la query pública de valoraciones no acepta rango; se filtra por `valoradoAt` en la capa de composición (`costos-composicion.ts:206`).

### Costos 🟢
Hechos económicos (numeric 18,6, string-only, jamás float sobre dinero), materiales/mano de obra/combustible(NO_APLICA a OT)/otros, composición OT y activo, **costo/hora y costo/km reales** (DGP-021.4), monedas, períodos, comparativa por moneda (jamás ranking cross-moneda), tendencias mensuales (huecos = null, jamás 0). Verificado en vivo: GEN-001 costo/hora COMPLETO (Δ 300 h, 148 CLP/h), costo/km NO_APLICA. Read-only (sin /sync ni OfflineProvider — coherente).

### Analytics 🟢
Fuentes/datasets/indicadores(**31**, incluye `cobertura-indicadores-costo`)/cobertura/trazabilidad/filtros/permisos/ausencia de datos. Evaluación pura sobre fuentes read-only. Dataset de costos visible (evaluación en vivo devolvió valor=1). 113 tests.

---

## 5. Matriz por rol (§7)

Roles canónicos: SUPER_ADMIN, TENANT_ADMIN, SUPERVISOR, PLANIFICADOR, TECNICO, CONSULTA (`rbac.ts:14-21`). **Hallazgo estructural (MAYOR):** a nivel de comando de módulo, los 6 roles se colapsan a **3 roles legacy** (`admin`/`operador`/`lector`, `rbac.ts:32-39`). Consecuencia: SUPERVISOR, PLANIFICADOR y TECNICO tienen **idéntica** capacidad de escritura en todos los módulos (`operador→write`); la única distinción canónica preservada es la excepción §6 de apertura de sesión sin asignación en Órdenes (`ordenes-module.ts:40-47`). CONSULTA = solo lectura (verificado 403 en mutaciones).

| Rol | Ve al iniciar | Punto de partida | Consulta | Crea | Modifica | Ejecuta | NO debería ver | Navegación |
|---|---|---|---|---|---|---|---|---|
| SUPER_ADMIN | Consola global técnica (`Console`) — en navegador: más "qué pasa" de plataforma que "qué hacer" (MENOR, `ADMIN-LANDING`) | `/administracion/saas` | todo (SaaS) | tenants/usuarios/módulos | todo | — | — | coherente (dispatcher `inicio.tsx:45`) |
| TENANT_ADMIN | Centro Operacional empresa | `/centro` → usuarios | todo del tenant | usuarios/config/branding + negocio | todo del tenant | sí | consola global SaaS | coherente |
| SUPERVISOR | Landing accionable (centro + colas + CTAs) — confirmado en navegador | `/centro` / `/ordenes/supervisor` | todo del tenant | negocio (operador) | negocio | sesiones sin asignación (excepción §6) | admin SaaS | coherente ✅ |
| PLANIFICADOR | Landing accionable (centro + colas + CTAs) — confirmado en navegador | `/ordenes/planificacion` / `/planes/calendario` | todo | negocio (operador) | negocio | abrir sesión sin asignación (rechazo negocio) | admin | coherente ✅ |
| TECNICO | Mis órdenes + Escanear QR — landing clara y acciones de OT visibles en móvil (navegador) | `/ordenes` | todo (no restringido a "mías") | negocio (operador) | negocio | abrir sesión sin asignación | admin | **ver riesgo abajo** |
| CONSULTA | Centro Operacional — sin señales de escritura visibles (navegador) | `/centro` / `/activos` | todo (lectura) | nada (403) | nada (403) | — | mutaciones (ocultas + backend) | coherente |

**Las 9 preguntas §7 (foco TECNICO):**
1. **¿Qué ve al iniciar?** `/ordenes` ("Mis órdenes", `rbac.ts:171`) dentro del AppShell empresarial.
2. **Punto de partida:** listado de órdenes; el flujo QR está disponible (`/ordenes/escanear`, `/activos/escanear`).
3. **Consulta:** todos los módulos habilitados; **no** hay filtrado UI a "solo mis OT" — el listado es global del tenant (la atribución "mis OT" existe sólo en la landing empresarial, no restringe el listado). 🟡
4. **Crea:** como `operador`, puede crear en todos los módulos habilitados (mismo poder que SUPERVISOR/PLANIFICADOR). 🟡
5. **Modifica:** ídem.
6. **Ejecuta:** sesiones de trabajo (abrir/pausar/reanudar/cerrar) sólo si está asignado a la OT (fallo cerrado sin bypass; verificado por `sesion.pg.test.ts` §6/§27).
7. **NO debería ver:** admin/SaaS — correctamente oculto y rechazado por backend.
8. **¿Navegación con sentido?** Parcial: hay ruta QR→activo→OT, pero el técnico ve la misma superficie densa que un supervisor.
9. **¿Completa sus tareas sin módulos innecesarios?** Sí para el ciclo de ejecución; pero la UI no está **priorizada mobile-first para el técnico** (misma AppShell para todos).

**Flujo ideal TECNICO QR→cierre:** técnicamente soportado extremo a extremo — escanear (`/ordenes/escanear`, `flujo-escaneo.tsx`) → activo → OT (`/ordenes/:id`) → abrir sesión (`/:id/sesion/abrir`, identityId del contexto, jamás del body) → ejecutar/registrar medición (Utilización) → registrar repuesto (`/:id/recursos`) → pausar/reanudar → finalizar sesión (`/:id/sesion/cerrar` dispara valoración de mano de obra) → cerrar OT (`transicionar` + `aprobar-cierre`). Todos idempotentes por opId y despachables por `/sync` offline. **Deuda de experiencia:** el flujo funciona pero no tiene un "modo técnico" simplificado/mobile-first dedicado (§8, §10).

**Verificación en navegador real por rol (auditoría E2E de navegador 2026-08-13, con capturas):**
- **admin (SUPER_ADMIN):** aterriza en la **consola técnica global**; observada más como "qué está pasando" de plataforma (salud/infraestructura) que como "qué debo hacer ahora" operativo. **Hallazgo MENOR** (`ADMIN-LANDING`): la landing del admin es técnica, no accionable-operativa. Confirma el dispatcher (`inicio.tsx:45`).
- **supervisor y planificador:** aterrizan en una **landing accionable** (centro de mantenimiento recomendado, colas de trabajo y CTAs visibles) — **positivo**, coherente con `landingOperacional`.
- **técnico (móvil):** landing clara con "Mis órdenes" y "Escanear QR"; en la ficha de OT se observaron acciones de ejecución visibles ("Iniciar trabajo", bitácora, pausar, "enviar a validación") — **positivo**; el ciclo de ejecución es alcanzable desde móvil.
- **consulta:** **sin señales de escritura visibles** en la UI — confirma en navegador el gating de presentación (además del 403 de backend en §13).

*Matiz:* la verificación en navegador **no invalida** los hallazgos estructurales (RBAC granular colapsado a 3 roles y ausencia de filtrado "solo mis OT" en el listado del técnico): la UI del técnico muestra acciones adecuadas, pero el *poder de escritura* subyacente sigue siendo idéntico al de supervisor/planificador y el listado sigue sin restringirse a "mías".

---

## 6. Centro Operacional (§6)

`centro-mantenimiento.tsx` (305 líneas) compone EXCLUSIVAMENTE el read model de Órdenes (`useOrdenesGlobal({limit:200})`) + deep links. Responde razonablemente "¿qué pasa y qué hago ahora?":
- ✅ Resumen (abiertas/críticas/vencidas/en riesgo), SLA (`estadoSla`), órdenes por técnico, accesos rápidos a módulos, "Nueva orden".
- ✅ La landing empresarial (`inicio-empresa.tsx`) SÍ **varía por rol** (`landingOperacional`, `resumenOperacional`) y respeta entitlements/capacidades; oculta secciones sin fuente real (correcto: no inventa métricas).
- 🟡 **Deuda 1:** el `/centro` en sí NO se contextualiza por rol — es una superficie única compartida; la contextualización por rol vive en `/` (landing empresa), no en el Centro.
- 🟡 **Deuda 2:** "trabajo del día por técnico" agrupa por `o.responsable` (texto libre, `centro-mantenimiento.tsx:57`), no por identidad canónica → agrupaciones frágiles si el texto no coincide con la identidad asignada.
- ✅ No es un dashboard ejecutivo (cumple la directiva): es operativo, basado en OT reales, con límite de 200 (ver §14 sobre ausencia de paginación).

**Verificación en navegador real (auditoría E2E de navegador 2026-08-13, con capturas):**
- ✅ El Centro **responde "qué está pasando"**: KPIs operativos, **cola de 20 OTs**, filtros por riesgo y deep links funcionales. **NO es un menú de módulos** — cumple el objetivo §6.
- 🟡 **HALLAZGO MENOR nuevo (`HYDRATION-ANCHOR`):** en `centro-mantenimiento.tsx` se observaron **warnings de hidratación por anidación inválida de `<a>` dentro de `<a>`** (enlace anidado dentro de un enlace). La UI es usable, pero la consola del navegador emite errores de hidratación de React → limpiar la anidación de anclas (probable `Link` envolviendo otro `Link`/`<a>`). Deuda MENOR, no bloquea piloto.

---

## 7. Experiencia móvil (§8)

- **Autoridad visual única:** todo pasa por Design System (`@workspace/design-system`) con tokens `--do-*`; hay tests de consistencia de tema/superficies y de contención de overflow móvil (`consistencia-tema-superficies.test.ts`, memoria `deltaops-tema-global.md`: `min()`/`min-width:0`).
- **Cobertura:** navegación/tablas/formularios/botones/modales/QR/ejecución de OT/sesiones/lecturas/tanqueos parten del DS responsive. QR y escáner tienen rutas dedicadas por módulo.
- 🟡 **Hallazgo (IMPORTANTE):** **no existe una experiencia mobile-first dedicada para el TECNICO**. La AppShell empresarial es la misma para todos los roles; el técnico en 390 px navega la misma densidad de supervisor. La directiva pide "priorizar mobile-first para técnicos" — hoy es *responsive*, no *mobile-first para el rol operativo*.
- 🟡 **Desktop-only de facto:** superficies de administración (`/administracion/saas`, consola SUPER_ADMIN, editor de dashboards de Analytics, árboles de activos) son densas y pensadas para escritorio; funcionales pero no optimizadas para móvil. No bloquean piloto.
- ✅ **Verificación en navegador real a 390 px (auditoría E2E de navegador 2026-08-13, con capturas):** en la vista de técnico móvil los **controles táctiles se apilan correctamente y no se observó overflow horizontal evidente**; el DS contiene el layout. La landing técnica ("Mis órdenes"/"Escanear QR") y la ficha de OT con acciones de ejecución son legibles y accionables en móvil.
- 🟡 **MENOR (confirmado en navegador, `DENSIDAD-MOVIL`):** la **UI es densa** en móvil (barra de navegación y tabs anchos, pensados para escritorio) — usable pero no óptima para el técnico; refuerza el hallazgo UX-TECNICO.
- *Pendiente:* el **teclado móvil no fue probado** (foco/scroll de formularios con teclado virtual); auditoría visual pixel-perfect a 768/1280 px no exhaustiva. Se recomienda completar el pase de formularios con teclado antes de piloto.

---

## 8. UX/UI (§10)

- ✅ **Jerarquía/consistencia/lenguaje:** DS único, lenguaje operacional en español, `PageHeader`/`Card`/`Tabs`/`Badge`/`EmptyState`/`ErrorState`/`Spinner`/`Alert`/`KpiCard` reutilizados. Estados vacíos, loading y error están presentes de forma sistemática (verificado en Centro y Costos).
- ✅ **Feedback:** ToastProvider del DS a nivel raíz (`App.tsx`) + `<Toaster/>` shadcn coexistiendo (dualidad de toasts documentada como deuda menor, §20).
- 🟡 **"¿Ayuda a trabajar o es colección de CRUDs?":** **Mayormente sistema, con zonas de CRUD.** El Centro Operacional, la ficha 360° de activos, la ejecución de OT con sesiones, y los indicadores de costos SÍ orientan al trabajo. Pero varias superficies (referencia, catálogos, listados de abastecimiento/inventario) son CRUD clásicos. El eslabón débil es la **experiencia del técnico**, que no tiene un flujo guiado dedicado.
- ✅ Accesibilidad: DS con tests a11y (`design-system/__tests__/a11y.test.tsx`), navegación con foco/ARIA en Shells.
- ✅ **Verificación en navegador real (auditoría E2E de navegador 2026-08-13, con capturas):** las superficies operativas clave (Centro con KPIs/cola/filtros, landing accionable de supervisor/planificador, ficha de OT del técnico con acciones de ejecución) **orientan al trabajo**, no son menús de módulos. 🟡 **Deuda de calidad de UI (MENOR):** warnings de hidratación `<a>`-en-`<a>` en el Centro (ver §6, `HYDRATION-ANCHOR`) — la consola del navegador emite errores aunque la UI funcione.

Veredicto §10: **se siente como plataforma empresarial en las superficies operativas clave; aún hay CRUDs "planos" y falta el modo técnico guiado.** No bloquea piloto.

---

## 9. Tema y branding (§9)

- ✅ **Autoridad única de tema:** `ThemeProvider` del DS montado a nivel raíz en `App.tsx` — aplica `data-do-theme` + clase `dark` sobre `document.documentElement`; persiste en `localStorage["do-tema"]` (`design-system/.../advanced.tsx:277,288,319`). Claro/oscuro/automático. **No hay ThemeProviders paralelos** (los Shells comparten el mismo `<html>` y almacenamiento). Tests: `consistencia-tema.test.tsx`, `consistencia-tema-superficies.test.ts`.
- ✅ **Logos por tema efectivo** en login/AppShell/módulos/consola SUPER_ADMIN (memoria DGP-021.3); activos de marca (`logo-color-negro`, `logo-full-color-blanco`, `isotipo-color`) presentes en el build.
- 🟠 **Deuda (MEDIA):** **no hay persistencia server-side del tema** — la preferencia vive sólo en `localStorage`, por lo que no viaja entre dispositivos ni se restaura tras limpiar el navegador. Declarado en directiva y memoria `deltaops-tema-global.md`.

---

## 10. Integraciones (§11) — real vs solo navegación

| Flujo | Estado | Evidencia |
|---|---|---|
| 1. Activo→OT→ejecución→sesión→mano de obra→costo | 🟢 **Integración real** | cierre de sesión dispara `valorarSesionFailSafe` (`ordenes-module.ts:340-346`); composición de costos consume `modulo.manodeobra.valoraciones` (`costos-composicion.ts:203`) |
| 2. Activo→OT→repuesto→Inventario→costo | 🟢 **Real** | orquestador materializa material desde `modulo.inventario.movimientos` + `abastecimiento.costos-exactos` (`costos-orquestador.ts:6-19`) |
| 3. Abastecimiento→recepción→costo→Inventario→consumo→costo mant. | 🟢 **Real** | recepción→`modulo.inventario.mover`→`modulo.costos.hecho.materializar-material` por contratos (`costos-orquestador.ts:8-19`) |
| 4. Activo→horómetro→plan preventivo→próxima ocurrencia→OT | 🟢 **Real** | generación con vínculo atómico idempotente (`preventivo/domain/generacion.ts:174`, `ports.ts:229`) |
| 5. Activo→tanqueo→utilización→consumo | 🟡 **Real en volumen, GAP en dinero** | utilización registra tanqueo/consumo; **el importe no se propaga a costos** (GAP-FUEL-MONEY) |
| 6. Activo→costos→costo/hora→Analytics | 🟢 **Real** | ficha de activo compone indicadores (`costos-module.ts:144`); Analytics expone `cobertura-indicadores-costo` (evaluación en vivo = 1) |

**Verificación en navegador real (auditoría E2E de navegador 2026-08-13, con capturas):**
- ✅ **Deep links reales con contexto:** desde la **ficha de activo** los botones "Crear orden" / "Ver órdenes" navegan con **UUID y etiqueta en la URL**, y la ficha expone el **tab Costos** — confirma que la integración lleva contexto real (no navegación vacía).
- ⚠️ **NO verificado en navegador (marcado como pendiente E2E-UI):** el *round-trip* **OT → pestaña Activo** y el flujo **Inventario → OT consumidora** no se ejercitaron extremo a extremo en la UI. La evidencia de código respalda ambos: la composición material OT↔Inventario existe por contratos (`costos-orquestador.ts:6-19`, Flujo 2/3) y la OT referencia su activo en el read model; **falta la confirmación visual del round-trip en navegador**.

**Conclusión §11:** 4 flujos de integración real completa (por contratos/código), 1 real con GAP de dinero (combustible), y Analytics conectado. En navegador se confirmaron deep links con contexto real (activo→OT/Costos); quedan **2 round-trips por confirmar en UI** (OT→Activo, Inventario→OT). La plataforma NO es "islas con navegación": la composición cross-módulo por contratos es un diferencial arquitectónico real.

---

## 11. Calidad de datos (§12)

- ✅ **SIN DATOS ≠ CERO respetado sistemáticamente en Costos:** estados `COMPLETO/PARCIAL/SIN_DATOS_SUFICIENTES/NO_APLICA` (`costos-composicion.ts:41-43`); ausencia nunca se representa como $0 (`derivarEstado` líneas 415-435; `$0 real (neto cero con hechos) NO es SIN_DATOS`). Verificado en vivo: activo inexistente → indicadores `SIN_DATOS_SUFICIENTES` con `porMoneda:[]` (no 0). GEN-001 sin odómetro → costo/km `NO_APLICA` (no 0).
- ✅ **Dinero string-exacto** (numeric 18,6), promedio ponderado, HALF-UP; frontend sólo formatea con Intl sobre cadena (memoria DGP-021.0/.4).
- ✅ **Comparativa siempre por moneda**, jamás ranking cross-moneda; tendencia con huecos = null.
- ✅ **Anulaciones/inconsistencias** excluidas del denominador (test costos (12b)); snapshots de tarifa en mano de obra.
- ✅ **Tenant isolation** verificado (§13). Timestamps: sesiones sellan hora de servidor + device-time aditivo (GAP-CLOCK histórico, mitigado en DGP-020.2).
- 🟡 **Violaciones/limitaciones de exactitud (no de la regla SIN_DATOS):**
  - GAP-INV-CANT: cantidad de inventario en float (acota exactitud del importe de material).
  - GAP-FUEL-MONEY: dinero de tanqueo float en Utilización, no propagado a costos como exacto.
- ✅ **Datos demo realistas e idempotentes:** 13 activos, 21 OT, 5 usuarios de negocio por rol (`seed-delta-demo.ts`), con lecturas de horómetro/odómetro y valoraciones que ejercitan los indicadores.

**No se detectó ningún punto donde ausencia de datos se muestre como CERO.**

---

## 12. Seguridad (§13) — con pruebas negativas

> ⛔ **CRÍTICO · `PLATFORM-CONSOLE-ACL` — Broken Access Control cross-tenant en la Consola de Plataforma.**
>
> **Defecto:** el guard de la consola técnica autoriza con **rol legacy** `platform_admin` **O** `admin` (`platform-console.ts:29`). Pero `rbac.ts:34` mapea el rol canónico **`TENANT_ADMIN → 'admin'`** en el espejo legacy `deltaops.users.rol`. En consecuencia, **cualquier TENANT_ADMIN de un tenant cualquiera pasa el guard de plataforma** y accede a superficies globales sin scope de tenant:
> - `/deltaops/platform/logs` → auditoría de **TODOS los tenants** con `tenant_id`, `actor_id`, `subject_id`, `correlation_id` (query **sin filtro de tenant**, `platform-console.ts:102-112`).
> - `/deltaops/platform/storage` → agregados `count(DISTINCT tenant_id)` (número de tenants de la plataforma, líneas 122-128).
> - `/deltaops/platform/queues`, `/jobs` → estado global de outbox/dead-letter/jobs de la plataforma.
> - `/services`, `/capabilities`, `/dependencies`, `/knowledge-graph`, `/services/health`, `/config-defaults` → metadatos técnicos globales de la plataforma.
>
> **Verificación negativa en vivo (2026-08-13, `:8080`, solo lectura, sin modificar nada):**
>
> | Actor (rol) | `/platform/logs` | `/platform/storage` | `/platform/queues` + resto | ¿Datos de otros tenants? |
> |---|---|---|---|---|
> | **TENANT_ADMIN** `admin@delta.demo` (tenant `delta-demo`) | **HTTP 200** | **HTTP 200** | **HTTP 200** (los 10 endpoints) | **SÍ** |
> | SUPERVISOR `supervisor@delta.demo` (control) | 403 | 403 | 403 | — |
> | CONSULTA `consulta@delta.demo` (control) | 403 | 403 | 403 | — |
> | anónimo (control) | 401 | 401 | — | — |
>
> **Evidencia de fuga cross-tenant real:** logueado como TENANT_ADMIN de `delta-demo`, `/platform/logs?limit=200` devolvió filas de auditoría de un tenant AJENO — **`tenant_id":"deltaops"`** (2 filas) además de `delta-demo` (198), con **11 `actor_id` distintos**; `/platform/storage` devolvió agregados sobre **35–55 tenants** (`tenants:35`, `tenants:55`, `tenants:2`). El TENANT_ADMIN de `delta-demo` sólo pertenece a `delta-demo`.
>
> **Impacto:** violación de aislamiento multitenant (confidencialidad) — un administrador de empresa puede enumerar la existencia de otros tenants, ver su actividad de auditoría (quién hizo qué y cuándo) y métricas operativas globales de la plataforma. Es un fallo de **broken access control** (OWASP A01), no un simple hardening.
>
> **Distinción importante (UI vs API):** la ruta **de UI** `/deltaops/administracion/saas` **sí** deniega limpiamente a roles no-SUPER_ADMIN (verificado en navegador, ver tabla de pruebas). El defecto está en la **superficie API** `/api/deltaops/platform/*`, que usa su propio guard legacy y **no** exige rol canónico SUPER_ADMIN. La protección de la UI **no** protege la API.
>
> **Ya señalado en memoria** (`.agents/memory/deltaops-identity-dgp017.md`) y **omitido** en la versión previa de este documento (corregido en revisión independiente).
>
> **Fix mínimo propuesto (requiere aprobación de Dirección, §23 — NO ejecutado):** cambiar el guard de `platform-console.ts:29` para **exigir rol de plataforma REAL** (`platform_admin`, es decir, canónico `SUPER_ADMIN`) y **eliminar la aceptación de `admin` legacy**; alternativamente/además, aplicar **scope de tenant** a las queries que hoy son globales o devolver **403** a no-plataforma. Comportamiento esperado tras el fix: TENANT_ADMIN → **403** en todo `/platform/*`; sólo SUPER_ADMIN → 200. **Este documento SOLICITA aprobación de Dirección para aplicar `PLATFORM-CONSOLE-ACL-FIX` antes de cualquier onboarding.**

Infraestructura (código): sesión Enterprise con **epoch de autorización** (`middleware.ts:41` — sesión obsoleta ⇒ 401 `AUTH_STALE`), verificación de identidad ACTIVA + membresía ACTIVA + tenant OPERATIVO, **guard estricto de módulos sin camino permisivo** (`requireIdentityForModules`), re-pin del espejo por sesión (evita fuga entre sesiones concurrentes de la misma identidad), y **enforcement de entitlements** con fallo cerrado (`enforceEntitlements`, 403 `MODULE_NOT_ENTITLED`). Autorización de comando en el Kernel vía `principal` derivado del rol.

**Pruebas negativas ejecutadas (2026-08-13, `:8080`, tenant `delta-demo`):**

| Prueba | Esperado | Resultado |
|---|---|---|
| GET módulos sin sesión (activos/ordenes/costos/inventario) | 401 | ✅ 401 en los 4 |
| POST mutación sin sesión (activos) | 401/403 | ✅ 401 |
| Health público | 200 | ✅ 200 |
| Login CONSULTA | 200 + SessionResponse | ✅ 200 |
| CONSULTA GET activos/ordenes | 200 | ✅ 200 (lectura permitida) |
| **CONSULTA POST activos/ordenes/inventario** | **403** | ✅ 403 `KRN-AUTH-002 Permiso denegado: modulo.X.write` |
| IDOR: GET activo con UUID fabricado | 404 sin filtrado | ✅ 404 `KRN-NF-001` |
| IDOR: costos/indicadores con activoId fabricado | sin fuga cross-tenant | ✅ 200 con `SIN_DATOS_SUFICIENTES`/`porMoneda:[]` (tenant-scoped, no filtra dato ajeno) |
| Cross-técnico: `ordenes/sesiones?identityId=<ajeno>` | sin fuga | ✅ `{"sesiones":[]}` (query tenant-scoped) |
| IDOR adjuntos de OT (código) | firma sólo si pertenece a la OT | ✅ `attachmentPerteneceAOrden` (`ordenes-module.ts:101-108,411`) |
| **UI · CONSULTA navega a `/deltaops/administracion/saas`** (auditoría E2E de navegador 2026-08-13) | denegación limpia sin fuga | ✅ **denegación limpia sin fuga** de datos administrativos (gating de ruta correcto en navegador) |
| ⛔ **API · TENANT_ADMIN → `/api/deltaops/platform/logs` (y /storage, /queues, /jobs, /services…)** | **403** (superficie de plataforma) | 🔴 **200 con fuga cross-tenant** — ver bloque CRÍTICO `PLATFORM-CONSOLE-ACL` arriba (auditoría 2026-08-13) |
| API · SUPERVISOR/CONSULTA → `/platform/logs\|storage\|queues` (control) | 403 | ✅ 403 en los 3 (el guard sí bloquea `operador`/`lector`) |
| API · anónimo → `/platform/logs\|storage` (control) | 401 | ✅ 401 |

**RLS (SQL read-only):** 167/174 tablas `deltaops` con RLS activo. Las 7 sin RLS son **globales por diseño**: `idn_identities`, `idn_memberships` (registro de identidad global), `kernel_outbox`, `kernel_dead_letter` (cola), `ntf_email_templates`, `sessions`, `users` (espejo legacy).

- 🟡 **Hallazgo (IMPORTANTE, defensa en profundidad):** `idn_identities`, `idn_memberships` y `users` NO tienen RLS; su aislamiento por tenant depende **enteramente del scoping en la capa de aplicación**. No se observó fuga en las pruebas HTTP (el aislamiento por tenant funciona en runtime), pero un bug de scoping en esas tablas no tendría red de seguridad de RLS. Recomendado como hardening.
- ✅ **Manipulación de identityId/tenantId/activoId/OT desde el cliente:** neutralizada — el identityId/tenant provienen del contexto de sesión (jamás del body en sesiones de trabajo, `ordenes-module.ts:321-323`), y las consultas se acotan por tenant de sesión.

**Corrección respecto a la versión previa:** SÍ existe **un hallazgo CRÍTICO de seguridad** — `PLATFORM-CONSOLE-ACL` (broken access control cross-tenant, verificado en vivo) — que **activa la excepción §23**: se documenta y se solicita aprobación de Dirección para la corrección mínima, **sin tocar código**. El resto de authz de negocio (módulos, sesiones, IDOR de activos/OT/adjuntos, aislamiento por tenant en datos de negocio) permanece sólido y verificado (401/403/404 correctos). Los demás puntos son de hardening (§17) y granularidad de rol (§7).

---

## 13. Offline (§14)

- ✅ **Estrategia única y coherente:** una sola cola (`lib/offline/cola.ts`) **persistida en localStorage por TENANT**, con máquina de estados (pendiente/enviando/aplicada/idempotente/conflicto/reintentable), **idempotencia por opId** reusable entre reintentos, reintento automático al evento `online`, y drenaje al montar (`contexto.tsx:59-81`). No hay segunda cola.
- ✅ **Módulos con offline REAL (mutaciones encoladas):** activos, ordenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics, utilización (9 `mutaciones.ts` con `mutarConOffline`) + sesión optimista en ordenes (`sesion-optimista.ts`).
- ✅ **Idempotencia y recuperación:** el `opId` viaja en el input y en la operación; los endpoints `/sync` de cada módulo son orquestaciones idempotentes; sesiones optimistas reflejan estado desde la cola. Tests: `offline-cola.test.ts`, `ordenes-offline.test.ts`, `ordenes-sesion-offline-conectado.test.tsx`, y un test de offline por cada módulo.
- 🟡 **Operaciones que aparentan offline pero NO lo son (por diseño correcto):** **Costos** monta Shell sin OfflineProvider (read-only, sin /sync) — correcto. **Analytics** monta OfflineProvider (banner de estado) pero es agregación de lectura; su `/sync` cubre catálogos/dashboards, no datos analíticos. Es coherente, pero conviene documentar que "offline de Analytics" no significa cómputo offline de indicadores.
- ⚠️ **Limitación de fondo:** la cola es localStorage (no IndexedDB) — límite de ~5 MB y sin binarios; adjuntos/evidencias offline dependen del patrón referencia-only. Aceptable para piloto.
- ✅ `ocurridoAt`/device-time presente en sesiones; conflictos expuestos en el contexto (`conflictos`).

---

## 14. Rendimiento (§15) — solo identificación

- 🟠 **Chunk >500 kB (MAYOR para producción):** el build genera `index-*.js` de **1 399,34 kB** (gzip 354 kB) en un único chunk; Vite emite la advertencia de >500 kB. **No hay `manualChunks` ni code-splitting por ruta** (las páginas se importan estáticas en `App.tsx`). Impacto: primer render lento, especialmente en móvil/red pobre (contrario al objetivo mobile-first para técnicos).
- 🟡 **Ausencia de paginación por cursor:** las consultas de lista usan `limit` (p.ej. Centro `limit:200`, `ordenes.listar` acepta `limit`) pero **no hay offset/cursor en la capa de aplicación de los módulos** (0 usos de offset en `module-*/src/application`). Con volúmenes grandes, listados y el Centro cargarán tope fijo sin paginar. Escalabilidad limitada.
- ✅ **Paginación donde importa para exactitud:** `serieLecturas` de costos SÍ pagina por offset y **falla cerrado** ante truncamiento (DGP-021.4).
- 🟡 **Polling:** 4 usos de `refetchInterval` en el frontend — acotado, no masivo. Revisar que no sean sobre superficies pesadas.
- ✅ **N+1 / SQL:** no se observó N+1 evidente; cada módulo consulta sus read models. La composición de costos hace fan-out por contratos (varias queries por activo) — aceptable en lecturas puntuales, a vigilar en comparativas de muchos activos.

*No optimizar en esta fase (directiva). Solo identificado.*

---

## 15. Arquitectura (§16)

- ✅ **Bounded contexts limpios:** cada módulo consulta SOLO su prefijo de tablas (`act_/ord_/inv_/pln_/prv_/cor_/abs_/utl_/mdo_/cos_/an_`) + `platform_/kernel_`. **Cero SQL cross-module** (verificado por escaneo de `FROM/JOIN deltaops.*` en `lib/module-*/src`).
- ✅ **CQRS + read models + Kernel + UoW/outbox** (memoria `kernel-uow-outbox.md`); ports/adapters; workflow engine neutro; identidad canónica; RLS; eventos/outbox at-least-once con handlers idempotentes.
- ✅ **Orquestación cross-módulo SOLO en api-server** por contratos públicos (costos-orquestador, valoración de mano de obra al cerrar sesión), nunca handlers sobre eventos ajenos ni SQL cruzado.
- ✅ **Design System único**; OfflineProvider único.
- 🟡 **Fuente de verdad de dinero potencialmente múltiple (declarada como GAP):** el dinero exacto vive en costos/abastecimiento (string 18,6), pero **Utilización mantiene su propio dinero de tanqueo en float** (GAP-FUEL-MONEY) e Inventario su cantidad en float (GAP-INV-CANT). No es duplicación de dominio, sino exactitud heterogénea entre módulos congelados.
- 🟡 **Espejo legacy `deltaops.users`** convive con `idn_identities` — doble representación de usuario (canónica + espejo) reconciliada por `proyectarUsuario`. Funciona y está testeado, pero es superficie de complejidad histórica.
- ❌ **No** se halló lógica de negocio de dominio en React (las agregaciones del Centro son de presentación sobre read models); **no** hay autorización sólo-frontend (backend siempre enforces, verificado).

---

## 16. Dependencias externas (§17)

| Dependencia | Función | Criticidad | Riesgo | Alternativa | Costo (por configuración) |
|---|---|---|---|---|---|
| **Neon / PostgreSQL** (`DATABASE_URL`) | BD única (dominio, read models, sesiones, outbox) | CRÍTICA | punto único de fallo; sin backup declarado en repo | cualquier Postgres gestionado | según plan del proveedor (no en repo) |
| **DigitalOcean / host** | Ejecución de api-server + estáticos | ALTA | despliegue/rollback no automatizado en repo | cualquier PaaS Node | no en repo |
| **Microsoft Graph / M365** (`GRAPH_*`) | Correo transaccional (invitaciones/recuperación) | ALTA (si NOTIFICATION_PROVIDER=m365) | fail-fast al arrancar si config inválida (correcto); depende de App Registration | SMTP/otro proveedor | licencia M365 (no en repo) |
| **connect-pg-simple / express-session** | Sesiones en Postgres | ALTA | tabla `sessions` sin RLS (global) | store Redis | — |
| **npm (prod api-server):** express, cors, bcryptjs, drizzle-orm, pino/pino-http, zod, cookie-parser | Runtime backend | ALTA | mantenimiento/CVE | — | OSS |
| **Vite / React / wouter / TanStack Query / recharts / lucide** (frontend) | SPA | ALTA | tamaño de bundle (§14) | — | OSS |
| **GitHub / Cloudflare** | (no evidenciados en config del repo) | — | no verificable desde el corpus | — | no inventariar sin evidencia |

*No se inventan precios. Solo se listan servicios evidenciados por configuración (`.env.example`, `package.json`, `session.ts`, notificaciones M365).*

---

## 17. Producción (§18) — "funciona en dev" vs "listo para producción"

| Aspecto | Estado | Evidencia / Nota |
|---|---|---|
| Variables de entorno / fail-fast | ✅ | `config.ts` valida con Zod y lanza al arrancar; `.env.example` documentado |
| Secretos | ✅ (parcial) | SESSION_SECRET obligatorio; contraseñas demo obligatorias en prod (`seed-credentials.ts`); GRAPH_* por secret manager. **Sin gestor de secretos formal en repo** |
| Sesiones | ✅ | PG store, cookie HttpOnly + Secure(prod) + sameSite lax + 8 h + `trust proxy` |
| HTTPS/dominio | ⚠️ | terminación TLS asumida en proxy (`trust proxy:1`); no gestionado por la app |
| **CORS** | 🟠 **MAYOR** | `app.use(cors())` **sin allowlist de origen** (`app.ts:61`) — abierto a cualquier origen |
| **Rate limiting** | 🔴/🟠 **MAYOR** | **ausente** (sin express-rate-limit); login y todos los endpoints sin throttling → riesgo de fuerza bruta/abuso |
| **Cabeceras de seguridad** | 🟠 **MAYOR** | **helmet ausente** (sin CSP/HSTS/X-Frame-Options) |
| Health checks | ✅ | `/platform/health|ready|info|metrics` |
| Logs | ✅ | pino/pino-http estructurado |
| Monitoreo/alertas | 🟠 | métricas expuestas pero **sin integración de monitoreo declarada** |
| Migraciones | 🟡 | esquema aplicado (167 tablas RLS); drizzle push requiere TTY para constraints (memoria) — aplicar DDL por SQL |
| **Backups/recuperación** | 🟠 | **no declarados en el repo** — dependen del proveedor de BD |
| Rollback/despliegue | 🟠 | no automatizado en el corpus |
| Seed/datos demo | ✅ | `seed:demo` idempotente; separa demo de producción; contraseñas por env en prod |
| Correo | ✅ | M365 Graph con fail-fast; fake en dev |
| Almacenamiento de archivos | ✅ (referencia-only) | attachments por metadatos+hash+URL firmada HMAC; binario no sale de plataforma |

**Veredicto §18:** **funciona en desarrollo; NO listo para producción general.** Bloqueantes de operabilidad (no de dominio): CORS abierto, rate-limiting ausente, cabeceras de seguridad ausentes, backups/monitoreo no declarados.

---

## 18. Costos operativos (§19)

Identificables **solo por configuración** (sin inventar precios):
- **Base de datos PostgreSQL gestionada** (Neon o equivalente): costo principal recurrente (una instancia, más si se separa réplica/backup).
- **Hosting del api-server Node + estáticos** (DigitalOcean/PaaS): una unidad de cómputo.
- **Licencia Microsoft 365 / App Registration** si se usa correo Graph en producción.
- **Almacenamiento de adjuntos** (plataforma; volumen dependiente de evidencias).
- **Herramientas de desarrollo:** OSS (sin licencia).

**Costo operativo mínimo aproximado del producto actual:** 1 BD gestionada + 1 host de app + (opcional) M365. No hay servicios de terceros de pago adicionales evidenciados. *No se recomiendan migraciones en esta fase.*

---

## 19. Deuda técnica consolidada (§20)

Sin duplicados, clasificada CRÍTICA/ALTA/MEDIA/BAJA/V2.

| ID | Descripción | Clase | Evidencia |
|---|---|---|---|
| **PLATFORM-CONSOLE-ACL** | **Broken access control cross-tenant: TENANT_ADMIN accede a `/api/deltaops/platform/*` (logs/storage/queues/jobs) por mapeo `TENANT_ADMIN→'admin'` legacy; fuga de auditoría y métricas de otros tenants** | **🔴 CRÍTICA** | `platform-console.ts:29,102-112,122-128`; `rbac.ts:34`; verificación en vivo 2026-08-13 (200 + `tenant_id:"deltaops"` ajeno) |
| SEC-CORS | CORS sin allowlist de origen | **ALTA** | `app.ts:61` |
| SEC-RATELIMIT | Sin rate limiting (login/endpoints) | **ALTA** | ausencia (grep) |
| SEC-HEADERS | Sin helmet/CSP/HSTS | **ALTA** | ausencia (grep) |
| SEC-RLS-IDENTITY | `idn_identities`/`idn_memberships`/`users` sin RLS (aislamiento solo app-layer) | **ALTA** | SQL pg_tables |
| PERF-CHUNK | Bundle único 1,4 MB, sin code-splitting | **ALTA** | build; `App.tsx` imports estáticos |
| RBAC-GRANULAR | 6 roles canónicos → 3 legacy; SUPERVISOR/PLANIFICADOR/TECNICO indistinguibles a nivel comando | **ALTA** | `rbac.ts:32-39` |
| GAP-FUEL-MONEY | Dinero de tanqueo float en Utilización, no propagado exacto a costos | **MEDIA** | `costos-composicion.ts:320,400` |
| GAP-FUEL-OT | Sin contrato de atribución combustible→OT (combustible NO_APLICA a OT) | **MEDIA** | `costos-composicion.ts:475-476` |
| GAP-MO-PERIODO | Query de valoraciones de MO sin rango; filtro por `valoradoAt` en composición | **MEDIA** | `costos-composicion.ts:206` |
| GAP-INV-CANT | Cantidad de inventario en float (acota exactitud de importe material) | **MEDIA** | `costos-orquestador.ts:32-36` |
| UX-TECNICO | Sin experiencia mobile-first dedicada para TECNICO | **MEDIA** | §7, §8 |
| RESP-TECNICO | Listado de OT no filtra "mis OT" para técnico | **MEDIA** | `rbac.ts:171`; listado global |
| SUP-TEXTO | `responsable`/supervisor por texto en read model de OT | **MEDIA** | `centro-mantenimiento.tsx:57` |
| THEME-SERVER | Persistencia de tema solo en localStorage (no server-side) | **MEDIA** | `advanced.tsx:277-319` |
| PROD-BACKUP | Backups/recuperación/monitoreo/rollback no declarados en repo | **MEDIA** | §17 |
| HYDRATION-ANCHOR | Warnings de hidratación por anidación `<a>` dentro de `<a>` en el Centro (UI usable, consola con errores) | **BAJA (MENOR)** | auditoría E2E de navegador 2026-08-13; `centro-mantenimiento.tsx` |
| ADMIN-LANDING | Landing del admin (consola técnica global) es más "qué pasa" que "qué hacer" operativo | **BAJA (MENOR)** | auditoría E2E de navegador 2026-08-13; `inicio.tsx:45` |
| DENSIDAD-MOVIL | UI densa en móvil 390 px (nav/tabs anchos); táctil OK, sin overflow evidente | **BAJA (MENOR)** | auditoría E2E de navegador 2026-08-13 |
| E2E-UI-ROUNDTRIP | Round-trips OT→Activo e Inventario→OT no verificados en navegador (sí por código) | **BAJA** | auditoría E2E de navegador 2026-08-13; `costos-orquestador.ts:6-19` |
| TEST-FLAKY-PG | `sesion.pg.test.ts` 2/14 flaky bajo carga PG paralela (pasa aislado) | **BAJA** | re-run aislado 14/14 |
| TOAST-DUAL | Dos sistemas de toast coexistiendo (DS + shadcn Toaster) | **BAJA** | `App.tsx` |
| DEAD-ARTIFACTS | `artifacts/sgma` y `artifacts/mockup-sandbox` sin referencia del producto | **BAJA** | grep sin referencias |
| USERS-MIRROR | Espejo legacy `deltaops.users` + identidad canónica (complejidad histórica) | **BAJA** | `middleware.ts:108`, seed |
| LOGIN-E2E | E2E de login vía app completa presente y verde; históricamente sensible a estado | **BAJA** | `http-e2e.integration.test.ts` |
| GAP-CLOCK | Duración de OT sella hora servidor + device-time aditivo (mitigado) | **BAJA/V2** | memoria DGP-020 |
| OFFLINE-STORAGE | Cola en localStorage (~5 MB, sin binarios) | **V2** | `cola.ts` |
| PERF-PAGINACION | Sin paginación por cursor en listados de módulo | **V2** (piloto) / MEDIA (producción) | 0 offset en application |

---

## 20. GAPs (consolidado)

GAPs de dominio **declarados en código y respetados** (no ocultan datos, cumplen SIN_DATOS≠CERO): **GAP-FUEL-MONEY**, **GAP-FUEL-OT**, **GAP-MO-PERIODO**, **GAP-INV-CANT**, **GAP-CLOCK**. Ninguno bloquea el piloto (los importes afectados degradan a `SIN_DATOS_SUFICIENTES`/`NO_APLICA`/contextual, jamás a $0 falso). Para producción con reporting financiero estricto de combustible/material, GAP-FUEL-* y GAP-INV-CANT deben resolverse.

---

## 21. MVP piloto (§21) — MUST / SHOULD / COULD / V2

**MUST HAVE (bloquean piloto — deben estar sí o sí):**
- ✅ Autenticación + sesión + multitenancy + RBAC backend (presente y verificado).
- ✅ Activos + Órdenes + ejecución con sesiones + cierre + costos (presente).
- ✅ Inventario + consumo en OT + Abastecimiento con costo ponderado (presente).
- ✅ Preventivo/Planes con generación de OT (presente).
- ✅ Utilización (horómetro/odómetro) + costos/hora-km (presente).
- ✅ Aislamiento por tenant + entitlements en datos de negocio (verificado).
- 🔴 **Corregir `PLATFORM-CONSOLE-ACL` (CRÍTICO):** cerrar el acceso de TENANT_ADMIN a `/api/deltaops/platform/*` (broken access control cross-tenant, §12). **Bloquea el piloto hasta corregirse.** Fix mínimo propuesto (requiere aprobación de Dirección, §23): exigir rol de plataforma real (`platform_admin`/SUPER_ADMIN), no `admin` legacy, y/o 403 + scope de tenant.
- 🟡 **Pase visual mobile:** **390 px verificado en navegador** (auditoría E2E 2026-08-13: táctil apilado, sin overflow evidente, densidad alta MENOR). **Pendiente:** teclado móvil en formularios y pase 768/1280 px exhaustivo antes del piloto.

**SHOULD HAVE (muy recomendable antes del piloto, no estrictamente bloqueante):**
- RBAC granular real para diferenciar TECNICO/PLANIFICADOR/SUPERVISOR (RBAC-GRANULAR).
- Rate limiting en login + CORS con allowlist (mitiga abuso desde el día 1).
- Experiencia técnica simplificada / "mis OT" (UX-TECNICO, RESP-TECNICO).

**COULD HAVE (mejora piloto, diferible):**
- Persistencia server-side del tema; unificación de toasts; code-splitting del bundle.
- Paginación por cursor en listados.

**V2 / FUTURO:**
- GAP-FUEL-MONEY/OT y GAP-INV-CANT (exactitud financiera de combustible/material).
- Offline con IndexedDB + binarios; monitoreo/observabilidad avanzada; limpieza del espejo legacy `users`.

---

## 22. V2 (§ separada)

Ver "V2/FUTURO" en §21. Núcleo de V2: **exactitud financiera end-to-end** (combustible/material), **observabilidad de producción**, **offline robusto (IndexedDB)** y **modo técnico mobile-first dedicado**.

---

## 23. Recomendación de Dirección (§22 — criterio de producción)

**Matriz capacidad → estado → ¿bloquea producción? → ¿V2? → riesgo → recomendación** (resumen de las capacidades decisivas):

| Capacidad | Estado | ¿Bloquea prod.? | ¿V2? | Riesgo | Recomendación |
|---|---|---|---|---|---|
| **Aislamiento consola de plataforma (`PLATFORM-CONSOLE-ACL`)** | 🔴 | **Sí (piloto Y prod)** | No | **CRÍTICO** | **Corregir ANTES de cualquier onboarding** (fix mínimo §12) |
| Dominio de mantenimiento (11 módulos) | 🟢 | No | No | Bajo | Mantener |
| Authz backend / tenant isolation (datos de negocio) | 🟢 | No | No | Bajo | Mantener; añadir RLS a identity (hardening) |
| CORS/rate-limit/headers | 🟠 | **Sí (prod)** | No | Medio-Alto | **Hardening antes de producción** |
| Bundle 1,4 MB | 🟠 | No (piloto) / Sí (prod móvil) | Parcial | Medio | Code-splitting |
| RBAC granular | 🟡 | No (piloto) / Recomendado (prod) | No | Medio | Diferenciar roles a nivel comando |
| Backups/monitoreo | 🟠 | **Sí (prod)** | No | Alto | Definir en infra antes de producción |
| GAP-FUEL/INV | 🟡 | No (piloto) / Sí (reporting financiero estricto) | Sí | Medio | Resolver en V2 |
| Mobile-first técnico | 🟡 | No (piloto) / Recomendado | Sí | Medio | Modo técnico |

**Veredictos explícitos (§22):**
- **¿Listo para PILOTO?** → **SÍ, CONDICIONADO a corregir `PLATFORM-CONSOLE-ACL` (CRÍTICO) ANTES del onboarding.** El defecto de broken access control cross-tenant (§12) es un bloqueante de seguridad incluso en piloto controlado, porque expone auditoría y métricas de otros tenants a cualquier TENANT_ADMIN. **Con ese fix aplicado y aprobado**, el resto del piloto controlado (1 empresa, usuarios acotados, red confiable, sin reporting financiero estricto de combustible/material, completando el pase de teclado móvil + 768/1280 px —390 px ya verificado) está soportado por: dominio maduro (≈2 014 tests verdes), integraciones reales (§11), verificación E2E en navegador por rol (§5), authz de negocio verificada con pruebas negativas (§13) y datos correctos (§12). **Sin el fix: NO iniciar piloto.**
- **¿Listo para PRODUCCIÓN GENERAL?** → **NO.** Bloqueante de seguridad `PLATFORM-CONSOLE-ACL` (obligatorio corregir) + hardening de operabilidad (CORS, rate-limiting, cabeceras, backups, monitoreo) + escalabilidad (bundle, paginación).
- **¿Necesita fase de HARDENING?** → **SÍ, imprescindible** entre piloto y producción general.

---

## 24. Próximas fases sugeridas

Estimación: **3–4 DGP adicionales** para cerrar el producto (no más funcionalidades por inercia):
0. **PRIORIDAD 0 · Corrección de `PLATFORM-CONSOLE-ACL` (CRÍTICO)** — fix mínimo del guard de `platform-console.ts` (exigir rol de plataforma real, no `admin` legacy; y/o scope de tenant + 403). **Previo a cualquier onboarding**, incluso el piloto. Requiere aprobación de Dirección (§23); NO ejecutado en esta fase de descubrimiento.
1. **DGP-023 · Hardening de producción** (incluye la corrección anterior si no se atendió como hotfix: SEC-CORS, SEC-RATELIMIT, SEC-HEADERS, SEC-RLS-IDENTITY, PROD-BACKUP/monitoreo, PERF-CHUNK). *Máxima prioridad, previo a producción.*
2. **DGP-024 · RBAC granular + experiencia del TECNICO** (RBAC-GRANULAR, RESP-TECNICO, UX-TECNICO mobile-first, THEME-SERVER, TOAST-DUAL).
3. **DGP-025 · Exactitud financiera end-to-end** (GAP-FUEL-MONEY/OT, GAP-INV-CANT) — solo si el piloto exige reporting financiero estricto.
4. **DGP-026 (opcional) · Escalabilidad** (paginación por cursor, offline IndexedDB, limpieza de artefactos muertos y espejo legacy).

---

## 25. Riesgos

- **Económico/técnico:** dependencia crítica de una sola BD sin backups declarados → riesgo de pérdida de datos en producción (ALTO hasta hardening).
- **Seguridad — aislamiento multitenant (CRÍTICO):** `PLATFORM-CONSOLE-ACL` — **fuga cross-tenant verificada en vivo**: cualquier TENANT_ADMIN lee auditoría y métricas globales de otros tenants vía `/api/deltaops/platform/*`. Riesgo de confidencialidad ALTO; **bloqueante de onboarding** hasta corregir.
- **Seguridad operativa (perimetral):** ausencia de rate-limiting y CORS abierto → superficie de abuso desde el día 1 en producción (MEDIO-ALTO). Sin fuga de datos de negocio verificada, pero falta de defensas perimetrales.
- **Producto:** experiencia del técnico no diferenciada → adopción tibia del rol más operativo (MEDIO).
- **Financiero-datos:** GAP-FUEL/INV pueden generar informes de costo incompletos para combustible/material si se venden como "costeo total" (MEDIO) — mitigado hoy por estados honestos SIN_DATOS/NO_APLICA.
- **Test/infra:** flakiness de tests PG concurrentes puede enmascarar regresiones en CI (BAJO) — recomendado serializar o aislar la BD por worker.

---

## 26. Conclusión

DeltaOps **ya resuelve el problema empresarial de gestión de mantenimiento en su núcleo**: modela activos, órdenes, ejecución con sesiones y tiempos, inventario, abastecimiento, preventivo/correctivo, utilización, mano de obra y costos exactos, con integraciones reales entre módulos (no navegación vacía), aislamiento multitenant de **datos de negocio** verificado y autorización impuesta por el backend. La calidad de datos respeta la regla absoluta SIN DATOS ≠ CERO.

**Sin embargo, la revisión independiente identificó UN defecto CRÍTICO de seguridad:** `PLATFORM-CONSOLE-ACL` — broken access control cross-tenant en la consola de plataforma (`/api/deltaops/platform/*`), por el que cualquier TENANT_ADMIN accede a auditoría y métricas de otros tenants (verificado en vivo, §12). No afecta a los datos de negocio de los módulos, pero rompe el aislamiento multitenant en la superficie técnica de plataforma.

**Respuesta a la pregunta central ("¿puede una empresa usar DeltaOps para gestionar su mantenimiento de forma confiable?"):**
- **Para un PILOTO controlado: SÍ, CONDICIONADO** a corregir `PLATFORM-CONSOLE-ACL` antes del onboarding, más el pase visual móvil restante. Sin ese fix, **no iniciar piloto**.
- **Para PRODUCCIÓN general: TODAVÍA NO** — requiere el fix CRÍTICO + una fase de hardening (seguridad perimetral, backups/monitoreo, empaquetado) y, según el alcance financiero, cerrar los GAP de combustible/material.

La diferencia piloto↔producción es mayormente **de operabilidad y hardening**, pero **existe un defecto CRÍTICO de seguridad que debe corregirse primero**. Conforme al §23, este documento **solicita aprobación de Dirección para la corrección mínima** de `PLATFORM-CONSOLE-ACL` (descrita en §12/§23), sin haber tocado código. La recomendación es **detener nuevas funcionalidades, aplicar el fix CRÍTICO y pasar a hardening/producción** (DGP-023), con RBAC/experiencia técnica y exactitud financiera como fases subsiguientes acotadas.

---

### Anexo · Preguntas de §27 (respuestas explícitas)

1. **¿Qué tan terminada está DeltaOps?** Dominio ~90 % (11 módulos maduros, ≈2 014 tests verdes); operabilidad de producción ~55 %.
2. **Módulos realmente completos:** Referencia, Activos, Inventario, Abastecimiento, Planes, Preventivo, Correctivo, Utilización, Mano de obra, Costos, Analytics (🟢). Órdenes 🟢 con 2 tests PG flaky y deuda de `responsable` texto.
3. **Módulos con deuda:** Utilización (GAP-FUEL-MONEY), Inventario (GAP-INV-CANT), Mano de obra (GAP-MO-PERIODO), Costos (GAP-FUEL-OT), Centro Operacional (supervisor por texto). Todos funcionales.
4. **Bloquean piloto:** **`PLATFORM-CONSOLE-ACL` (CRÍTICO) — bloqueante duro hasta corregirse**; además, el pase visual móvil restante (teclado móvil + 768/1280 px; 390 px ya verificado). *Trabajo de calidad recomendado pre-piloto (no bloqueante):* limpiar el warning de hidratación `<a>`-en-`<a>` (MENOR).
5. **Bloquean producción general:** `PLATFORM-CONSOLE-ACL` (CRÍTICO), CORS abierto, rate-limiting ausente, cabeceras de seguridad ausentes, backups/monitoreo no declarados, RLS ausente en tablas de identidad, bundle 1,4 MB.
6. **Se puede dejar para V2:** GAP-FUEL/INV, offline IndexedDB, tema server-side, paginación por cursor, limpieza de artefactos muertos.
7. **Qué falta de verdad:** corregir el CRÍTICO `PLATFORM-CONSOLE-ACL`, hardening de producción, experiencia técnica mobile-first + RBAC granular. No faltan módulos de dominio.
8. **Mínimo trabajo adicional:** **corregir `PLATFORM-CONSOLE-ACL`** (imprescindible para piloto Y producción) + DGP-023 (hardening, mínimo para producción); para piloto, además el pase visual móvil.
9. **Cuántos DGP adicionales:** **3–4** (023 hardening, 024 RBAC/UX técnico, 025 exactitud financiera, 026 opcional escalabilidad).
10. **Ruta recomendada:** Aprobación de Dirección + fix mínimo del CRÍTICO `PLATFORM-CONSOLE-ACL` → **verificación negativa de TENANT_ADMIN contra CADA endpoint `/api/deltaops/platform/*`** (confirmar 403) → piloto controlado → DGP-023 hardening → producción general → DGP-024/025 según convenga.
11. **Riesgos económicos/técnicos:** **fuga cross-tenant `PLATFORM-CONSOLE-ACL` (CRÍTICO, confidencialidad)**; BD única sin backup declarado (alto); ausencia de defensas perimetrales (medio-alto); costeo financiero incompleto de combustible/material (medio).
12. **¿Detener funcionalidades y pasar a hardening/producción?** → **SÍ.** El producto tiene suficiente dominio; el valor marginal ahora está en madurar, endurecer y pilotar, no en añadir módulos.

> **Nota de fase:** este documento es el único entregable de DGP-022. No se modificó código, migraciones, contratos, RBAC/RLS ni frontend. Conforme al §23, ante el defecto CRÍTICO de seguridad `PLATFORM-CONSOLE-ACL` se **documentó y NO se corrigió**; se **solicita aprobación explícita de Dirección** para aplicar la corrección mínima descrita en §12/§23 antes de cualquier onboarding. No se inició ninguna fase posterior.
