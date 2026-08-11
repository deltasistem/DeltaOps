# DGP-018 · Inventario de contratos / read models (FASE A)

> Relevamiento de los read models y endpoints GET YA existentes (corpus congelado)
> que la experiencia operacional empresarial puede **componer** sin inventar
> contratos. Todo lo que aquí figura como "disponible" se consume a través de los
> clientes/hooks del frontend (`src/lib/**`), que a su vez invocan los routers
> de `api-server` bajo `/api/deltaops/*`. Los **gaps** se documentan explícitamente
> y NO se rellenan con datos inventados: la sección correspondiente se oculta o
> muestra estado vacío.

## Principio

- No se abren endpoints nuevos ni se modifica el backend.
- El contexto de tenant proviene de la sesión canónica (`/auth/session`); RLS es
  la autoridad. El frontend sólo compone y filtra presentación.
- Ninguna métrica se calcula fuera de lo que el read model ya expone; nada de BI,
  tendencias, proyecciones ni valoración financiera.

## Órdenes (`/api/deltaops/ordenes` · `src/lib/ordenes`, `src/lib/ecosistema`)

| Necesidad (mandato §6) | Contrato existente | Cómo se compone | Estado |
|---|---|---|---|
| Órdenes abiertas / en ejecución / pendientes | `GET /ordenes?estado=&limit=` → `{ordenes: OrdenRow[]}` (`useOrdenesGlobal`, `useListado`) | Filtrado por `estado` en cliente sobre el listado global; estados canónicos: `ABIERTA/PLANIFICADA/ASIGNADA/EN_EJECUCION/PAUSADA/EN_VALIDACION` (abiertas = no finales), `EN_EJECUCION`, `ASIGNADA` (pendientes) | ✅ Disponible |
| Prioridades / críticas | `OrdenRow.prioridad`, `severidad` (+ `esCritica`) | `esCritica(orden)` de `ordenes/componentes` | ✅ Disponible |
| Riesgo SLA / vencidas / próximas a vencer | `OrdenRow.datos.sla` (`vencimientoSla`, `estadoSla`, `proximaAVencer`) | `estadoSla(orden, ahora)` de `ecosistema/sla` (PURO, sin analítica) | ✅ Disponible |
| Activos con órdenes abiertas | `OrdenRow.activoPrincipalId` (+ `datos.activoPrincipal.etiqueta`) | Agrupación en cliente de las órdenes abiertas por `activoPrincipalId` | ✅ Disponible |
| Bloqueos / dependencias | `GET /ordenes/:id/dependencias` (`useDependencias`) + `analizarDependencias` (`ecosistema/dependencias`) | Por orden concreta (deep link); en resumen se listan las que declaran dependencias | ✅ Disponible (por OT) |
| Órdenes sin asignación | `OrdenRow.responsable == null` | Filtro en cliente sobre abiertas | ✅ Disponible |
| Mis órdenes (TECNICO) | `GET /ordenes?responsable=` y/o `OrdenRow.responsable != null` | Igual que la bandeja "mis" de `ordenes-operaciones` (filtra `responsable != null`) | ⚠️ Parcial — ver gap G-1 |
| Actividad reciente / timeline (orden) | `GET /ordenes/:id/historial`, `/bitacora` (`useHistorial`, `useBitacora`) | Por OT (deep link) | ✅ Disponible (por OT) |
| Actividad reciente (activo) | `GET /activos/:id/timeline` (`useTimelineActivo`) | Por activo (deep link) | ✅ Disponible (por activo) |
| Agenda / calendario | `GET /ordenes/agenda`, `/ordenes/calendario` (`useAgenda`, `useCalendario`) | Trabajo de hoy / próximas por rango de fechas | ✅ Disponible |

Deep links (reutilizados, `ecosistema/deep-links`): `urlOrden`, `urlOrdenTab`,
`urlNuevaOrden`, `urlOrdenesDeActivo`, `urlActivo`, `urlActivoTab`.

## Activos (`/api/deltaops/activos` · `src/lib/activos`)

| Necesidad | Contrato existente | Estado |
|---|---|---|
| Listado / búsqueda / filtros | `GET /activos?...` (`useListado`) → `ActivoRow[]` | ✅ |
| Estado / criticidad / ubicación | `ActivoRow.estado`, `criticidad`, `ubicacionId` | ✅ |
| Vista 360° (DGP-010) | `GET /activos/:id` (`useDetalle`) + pestañas | ✅ (deep link, NO se duplica la ficha) |
| Activos que requieren atención | Composición: activos referidos por órdenes abiertas críticas / SLA en riesgo | ✅ (derivado de Órdenes, sin inventar) |
| Medidores / órdenes relacionadas / próximos mant. del activo | pestañas de la Vista 360° (deep link) | ✅ (deep link) |

> "Activos que requieren atención" se deriva de las **órdenes** abiertas (activo
> con OT crítica o SLA en riesgo/vencido). No existe un read model dedicado de
> "salud de activo" agregada → ver gap G-2.

## Planes / Preventivo (`/api/deltaops/planes`, `/preventivo` · `src/lib/planes`, `src/lib/preventivo`)

| Necesidad | Contrato existente | Estado |
|---|---|---|
| Planes activos | `GET /planes?estado=` (`usePlanes`) → `PlanRow[]` (`PlanRow.estado`) | ✅ |
| Próxima ocurrencia de un plan | `PlanRow.proximaOcurrencia` | ✅ |
| Próximos mantenimientos (agregado) | `GET /planes/eventos` (`useEventos` → `EventoPlan[]` con `fecha`/`proxima`) | ✅ |
| Programas preventivos | `GET /preventivo/programas` (`useProgramas` → `ProgramaRow[]`) | ✅ |
| Programaciones futuras (preventivo) | `GET /preventivo/programas/:id/programaciones` (`useProgramaciones` → `Programacion[]` con `fecha`) | ✅ (por programa) |
| Calendario / Gantt | `GET /planes/calendarios/:id` (`useCalendario`) / `/ordenes/calendario` | ✅ (deep link a las páginas dedicadas) |

> Para el resumen de "Próximos mantenimientos" en la landing se usa
> `PlanRow.proximaOcurrencia` de los planes VIGENTES (barato, sin N+1). El detalle
> por programa/calendario queda en sus páginas dedicadas (deep link).

## Inventario (`/api/deltaops/inventario` · `src/lib/inventario`)

| Necesidad | Contrato existente | Estado |
|---|---|---|
| Items / existencias | `GET /inventario` (`useItems` → `ItemRow[]`), `GET /inventario/items/:id/existencias` | ✅ |
| Disponible / reservado / en mano (agregado por item) | `ItemRow.disponible`, `reservado`, `enMano` (**si el proyector los expone**) | ⚠️ Condicional — ver gap G-3 |
| Punto de reorden / mínimo (items críticos) | `ItemRow.reposicion.{minimo,puntoReorden}` | ⚠️ Condicional (requiere `disponible`) — ver gap G-3 |
| Reservas | `GET /inventario/reservas` (`useReservas` → `ReservaRow[]`) | ✅ |
| Transferencias pendientes | `GET /inventario/transferencias?estado=` (`useTransferencias`) | ✅ |

> "Items críticos" = `disponible <= (puntoReorden ?? minimo)`. Solo se muestra si
> el read model incluye `disponible` y `reposicion`; de lo contrario la sección se
> OCULTA (no se inventa el conteo). Se muestra únicamente acceso operacional al
> módulo cuando falten los agregados.

## Abastecimiento (`/api/deltaops/abastecimiento` · `src/lib/abastecimiento`)

| Necesidad | Contrato existente | Estado |
|---|---|---|
| Solicitudes | `GET /abastecimiento/solicitudes?estado=&prioridad=` (`useSolicitudes` → `SolicitudRow[]`) | ✅ |
| Artículos / disponibilidad | `GET /abastecimiento/articulos` (`useArticulos`) | ✅ |
| Órdenes de compra | `GET /abastecimiento/ordenes-compra` (`useOrdenesCompra`) | ✅ |

> Solo acceso operacional (solicitudes/necesidades). NO compras/ERP, NO estados
> inventados.

## Offline / sincronización

- `useOffline()` (`src/lib/offline/contexto`) expone `enLinea`, `pendientes`,
  `conflictos`, `cola` (por tenant). Se usa para el estado offline/sincronización
  del TECNICO. No es un contrato de API sino estado local de la cola existente.

## Identidad / capacidades / multitenancy

- Sesión canónica `/auth/session` (`useSesion`, `useSesionActiva`): `rol`,
  `tenant`, `modulos`, `capacidades`, `permisos`, `membresias`.
- Gating de presentación: `capacidadesDe`, `modulosVisibles`, `esAdminEmpresa`,
  `esSuperAdmin` (`identidad/rbac`). El backend es la autoridad (403 real).

---

## GAPS (documentados, NO inventados)

- **G-1 · "Mis órdenes" por identidad del técnico.** El listado permite
  `?responsable=`, pero el valor de `OrdenRow.responsable` no está garantizado que
  coincida con `sesion.identityId`/`email` (puede ser nombre/rol). Para evitar
  mostrar OTs ajenas se usa el mismo criterio conservador que la bandeja "mis" de
  `ordenes-operaciones` (`responsable != null`) y se **deep-linka** a la bandeja
  "Mis órdenes" oficial (`/ordenes`) que ya resuelve la identidad en su contexto.
  No se inventa un filtro por identityId inexistente.
  → **Impacto:** el resumen del TECNICO prioriza el acceso a la bandeja oficial;
  no duplica su lógica. Sin cambios de contrato requeridos.

- **G-2 · "Salud de activo" agregada.** No existe un read model que exponga
  directamente "activos que requieren atención" con un score/estado agregado. Se
  **deriva** de las órdenes abiertas (activo con OT crítica o SLA en riesgo/vencido).
  Es composición legítima de contratos existentes, no un dato inventado. Si en el
  futuro se requiere un indicador propio de salud del activo, sería un contrato
  nuevo a evaluar por Dirección.

- **G-3 · Agregados de existencias en `ItemRow`.** `disponible/reservado/enMano`
  y `reposicion` son **opcionales** en el contrato (`ItemRow`), sujetos a que el
  proyector los exponga. La tarjeta de "items críticos" solo se calcula/mostrará
  cuando esos campos estén presentes; si faltan, la sección se oculta y solo se
  ofrece acceso operacional al módulo de inventario. No se inventa el conteo.

- **G-4 · Alertas operacionales.** No existe un endpoint dedicado de "alertas".
  Las alertas operacionales se **componen** de señales reales ya disponibles: SLA
  vencido, SLA en riesgo, órdenes sin asignar, órdenes críticas. No se crea un
  sistema de alertas nuevo ni notificaciones paralelas (Microsoft Graph queda
  intacto como transporte de correo).

- **G-5 · Actividad reciente global.** El historial/timeline existe por **entidad**
  (orden o activo), no como feed global del tenant. La landing enlaza al timeline
  por entidad (deep link) en lugar de fabricar un feed global inexistente.

Ninguno de estos gaps bloquea la FASE A: cada uno se resuelve por composición
conservadora o mostrando estado vacío/acceso, sin inventar contratos ni datos.

---

# DGP-018 · FASE B — Cierre de construcción

> Esta fase cierra la construcción del **Centro Operacional**: experiencia móvil
> del técnico (§13), integraciones a los módulos (§8-12), pruebas obligatorias
> (§21) y verificación de datos demo (§18). **Pura composición de frontend**; no
> se abren endpoints ni se toca `lib/*` raíz ni `api-server`.

## Archivos de esta fase

- `src/lib/centro/enlaces.ts` **(nuevo, composición pura)** — deep links y rutas
  de integración: `urlBandejaOrdenes(bandeja)` (`/ordenes?bandeja=<id>`),
  `urlEjecutarOrden(id)` (`/ordenes/:id?tab=ejecucion` → pestaña de ejecución con
  checklist/formulario/evidencia/medidor/recursos/firma/cierre), constantes de
  ruta (`RUTA_ESCANEAR_ACTIVO`, `RUTA_INVENTARIO_*`, `RUTA_PLANES_CALENDARIO`,
  `RUTA_PREVENTIVO_*`, `RUTA_ABASTECIMIENTO_SOLICITUDES`) y el registro
  `INTEGRACIONES` (accesos por módulo).
- `src/pages/inicio-empresa.tsx` **(editado, presentación)** — bloque
  `FocoTecnico` (mobile-first: orden prioritaria con "Ejecutar" a la pestaña de
  ejecución, "Escanear QR", "Mis órdenes", "En ejecución"), sección
  `IntegracionesSeccion` ("Explorar por módulo", gated por entitlement), objetivos
  táctiles ≥48px en toda la superficie nueva (`botonTactil`), y grid responsive
  con `minmax(min(Npx,100%),1fr)`.
- `src/pages/ordenes-operaciones.tsx` **(editado, presentación)** — soporte de
  deep link `?bandeja=<id>` (validado contra `BANDEJAS`, por defecto `mis`).
- `src/__tests__/centro-operacional-faseb.test.tsx` **(nuevo, 20 tests)**.
- `src/__tests__/centro-operacional.test.tsx` **(2 asserts ajustados)** — "En
  ejecución" y "Mis órdenes" ahora aparecen también como accesos de
  integración/foco (se usa `getAllBy*`).

## Mapeo de los 16 ítems de prueba (§21)

| # | Ítem §21 | Cobertura unit/componente (jsdom) | Pendiente e2e navegador |
|---|----------|-----------------------------------|-------------------------|
| 1 | Landing de los 6 roles | ✅ `faseb` "landing por los 6 roles" (5 roles → Centro; SUPER_ADMIN → Console) + `identidad-separacion-rol` | — |
| 2 | SUPER_ADMIN mantiene consola global intacta | ✅ `faseb` "SUPER_ADMIN aterriza en la consola global" + `identidad-separacion-rol` | — |
| 3 | Acciones ocultas sin capacidad | ✅ `faseb` "acciones ocultas (CONSULTA)" + `centro-operacional` gated | — |
| 4 | URLs directas protegidas siguen en verde | ✅ `identidad-separacion-rol` (aislamiento por URL, redirecciones) — no regresó | Verificación de guard real de servidor |
| 5 | Responsive: render móvil de bandeja TECNICO | ⚠️ Parcial — DOM order mobile-first verificado (foco primero) + grids `auto-fill min()`; **no hay `matchMedia` en jsdom** | Layout real desktop→tablet→mobile |
| 6 | Estado loading | ✅ `centro-operacional` (spinner del resumen) | — |
| 7 | Estado empty | ✅ `centro-operacional` + `faseb` ("Sin orden prioritaria", "Sin órdenes abiertas") | — |
| 8 | Estado error | ✅ `centro-operacional` (reintentar del resumen) | — |
| 9 | Estado offline visible (TECNICO) | ✅ `faseb` "estado offline" (`navigator.onLine=false` → "Trabajando sin conexión"; online sin pendientes → sin aviso) | Sync real con backend caído |
| 10 | Deep links con base path correcto | ✅ `faseb` "deep links respetan el base path" (`Router base=/deltaops` → href con prefijo) + builders puros | — |
| 11 | Deep link a ejecución de OT | ✅ `faseb` foco TECNICO (`/ordenes/:id?tab=ejecucion`) | Apertura real de la pestaña ejecución |
| 12 | Deep link a bandejas por estado/prioridad | ✅ `faseb` "/ordenes abre la bandeja indicada" (`?bandeja=criticas`/default `mis`) | — |
| 13 | Integraciones por módulo (entitlements) | ✅ `faseb` "accesos de integración por módulo" (muestra/oculta según módulo) | — |
| 14 | Objetivos táctiles ≥48px | ✅ `faseb` "objetivos táctiles ≥48px" (minHeight foco) + revisión de todos los botones nuevos (`botonTactil`) | Medición física en dispositivo |
| 15 | Logout / re-login | ✅ `identidad-separacion-rol` (re-login cambia rol/landing) | Flujo real de sesión |
| 16 | Refresh (recarga) | ✅ `identidad-separacion-rol` (remount conserva rol/landing) | Recarga real del navegador |

**Resumen de cobertura:** 15/16 con prueba unit/componente en jsdom; **1 ítem
(#5 responsive) queda parcialmente para e2e navegador** porque jsdom no evalúa
media queries (`matchMedia`) ni layout real. La estrategia mobile-first por orden
del DOM + grids auto-responsive sí es verificable y está cubierta; el render
pixel-perfecto por breakpoint requiere navegador real.

## Verificación de datos demo (§18)

Verificación **estática** contra el seed real `api-server/src/seed/seed-delta-demo.ts`
(no se pudo ejecutar el API en vivo: sin servidor en el alcance del subagente):

- El tenant `delta-demo` siembra **7 OTs** en los estados BORRADOR, ABIERTA,
  PLANIFICADA, ASIGNADA, EN_EJECUCION, EN_VALIDACION, CERRADA, todas con
  `prioridad: "alta"`. → El **resumen operacional** muestra conteos reales
  (abiertas ≈ 6, en ejecución = 1, críticas ≈ 6 porque `esCritica` incluye
  prioridad "alta"). **No es dato inventado**: proviene del read model de órdenes.
- El seed **no** fija `fecha de inicio/vencimiento` ni SLA en las OTs. → Las
  secciones "Trabajo de hoy" (`ordenesDeHoy`) y "SLA en riesgo/vencido" muestran
  su **estado vacío correcto**, no datos falsos. Esto valida el comportamiento
  "sección sin fuente real → estado vacío" del mandato.
- `responsable` sólo se puebla tras el paso `asignar`; el foco del TECNICO y la
  bandeja "mis" usan el criterio conservador (`responsable != null`) ya
  documentado en G-1.

> **Pendiente para el agente principal / e2e:** confirmación en vivo con login
> demo (`admin@delta.demo` u otro rol) de que el resumen y "trabajo de hoy"
> renderizan estos valores en el navegador. El análisis estático arriba predice
> el comportamiento; la ejecución del servidor está fuera del alcance del subagente.

## GAPS nuevos de FASE B

- **G-6 · Responsive real por breakpoint.** No existe hook `useMediaQuery` ni
  `matchMedia` en jsdom; el DS usa media queries CSS. La adaptación se logra por
  orden del DOM (mobile-first) + grids `repeat(auto-fill, minmax(min(Npx,100%),1fr))`
  y `flex-wrap`, sin JS de breakpoints. La verificación pixel-perfecta desktop→
  tablet→mobile queda para e2e navegador. No se introdujo dependencia nueva.
- **G-7 · Verificación de datos demo en vivo.** Bloqueada en el alcance del
  subagente (sin servidor HTTP). Se verificó estáticamente contra el seed; la
  comprobación en navegador la realiza el agente principal.

## Corrección de regresión — ToastProvider en la ruta real /ordenes

- **Síntoma (e2e):** navegar a `/deltaops/ordenes` lanzaba
  `useToast debe usarse dentro de <ToastProvider>` (stack: `useToast` del DS en
  `overlays.tsx` vía `FilaOrden` en `ordenes-operaciones.tsx`).
- **Causa raíz (pre-existente, DGP-009):** `FilaOrden` usa el `useToast` del
  Design System, pero **ningún Shell ni `App` proveía `ToastProvider` del DS**.
  `ShellOrdenes`/`ShellActivos` sólo aportan `ThemeProvider` + `OfflineProvider`.
  Sólo `App` traía el `Toaster` de shadcn (`@/hooks/use-toast`), que es un sistema
  de toasts **distinto** e incompatible con el `useToast` del DS. Las pruebas
  previas de `ordenes-operaciones` sí envolvían manualmente con `ToastProvider`,
  por eso pasaban sin detectar el crash de la ruta real.
- **Fix de raíz (capa de presentación, sin tocar corpus congelado):** se envuelve
  el árbol de rutas en `App.tsx` con el `ToastProvider` del DS
  (`@workspace/design-system`), a nivel raíz, un único provider para todas las
  rutas. La región de toasts usa `position: fixed` y tokens `--do-*` en `:root`,
  por lo que funciona fuera de cada `do-root` y no requiere duplicar el provider
  en cada Shell. Convive con el `<Toaster />` de shadcn (sistemas independientes).
- **Cobertura:** al colocarse en la raíz, quedan cubiertas TODAS las rutas que
  consumen el `useToast` del DS (órdenes: operaciones/ficha/supervisor/
  planificación/escaneo/paneles; flujo de escaneo bajo activos y órdenes). No se
  detectaron otras rutas con el mismo defecto fuera del árbol raíz.
- **Prueba de regresión añadida:** `centro-operacional-faseb` · describe
  "regresión · ruta real /ordenes": (1) monta la ruta REAL
  (`OrdenesOperacionesPage` → `ShellOrdenes` → `Contenido`) bajo los providers de
  `App` y verifica que renderiza sin crash; (2) sin `ToastProvider` ancestro,
  captura el error con un Error Boundary y comprueba el mensaje `ToastProvider`
  (documenta el contrato de dependencia). Habría atrapado esta regresión.

- **G-8 · Dos sistemas de toast coexistentes.** El proyecto mantiene el `useToast`
  del Design System (páginas de dominio) y el `Toaster`/`use-toast` de shadcn
  (root). No se unificaron (fuera de alcance); ambos quedan provistos a nivel raíz.
