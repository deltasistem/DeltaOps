# DELTAOPS LITE — FASE 1 · DISCOVERY DE PRODUCTO, SIMPLIFICACIÓN OPERACIONAL Y AUDITORÍA UX/UI

> **Naturaleza:** informe de **SOLO LECTURA**. No se modificó código, base de datos, migraciones, contratos, RBAC/RLS ni workflows. No se eliminó nada. Único archivo escrito en esta fase: este documento.
> **Método:** auditoría por evidencia sobre el código real de `artifacts/deltaops`, `artifacts/api-server` y `lib/*`. Cada afirmación se ancla a archivo/ruta. Toda contradicción entre lo observado y la propuesta se marca explícitamente como **REALIDAD ACTUAL vs PROPUESTA**.
> **Alcance:** Fase de descubrimiento y diseño. NO es implementación (directiva §14, §17).

**Nota sobre documentos históricos:** `ARQUITECTURA_ACTUAL.md`, `MODULOS_EXISTENTES.md` y `REUTILIZACION.md` de la raíz describen el prototipo **SGMA** ya retirado (DGP-023.2) y **no reflejan el sistema actual**. Este discovery se basa exclusivamente en el código vivo de DeltaOps.

---

## 1. Resumen ejecutivo

DeltaOps es una plataforma EAM SaaS multi-tenant, contract-first (OpenAPI → Orval → hooks/Zod), con un **core de dominio robusto y verificado**: activos, órdenes de trabajo (workflow + sesiones de trabajo con mano de obra/tiempo), inventario (movimientos + ledger a costos), planes, preventivo, correctivo (solicitudes → OT), abastecimiento, utilización (horómetro/odómetro/combustible), costos exactos, analytics declarativo, centro operacional y consola SUPER_ADMIN (`/plataforma`). El frontend consume tokens `--do-*` del Design System DGP-005 con **excelente disciplina** (solo 3 literales de color hexadecimal en todas las páginas).

**El problema NO es de capacidad; es de experiencia.** La aplicación expone la arquitectura completa al usuario: navegación superior con **todos los módulos habilitados en fila** (`AppShell.tsx` → `Navegacion`), listados con densidad y filtrado excesivo (Activos con 7 controles de filtro + búsqueda + tabs de estado), y una landing (`inicio-empresa.tsx`) muy densa (8–10 secciones apiladas). El resultado es la "sensación de aplicación administrativa genérica" señalada por Dirección.

**Hallazgos cuantificados:**

- **Problemas UX/UI de la directiva (§5):** de los 9 listados, **6 se CONFIRMAN con evidencia**, **2 se confirman parcialmente/matizan** y **1 se REFUTA** (ver §7).
- **GAP operacional clave:** el flujo **PREOPERACIONAL → CHECKLIST → APTO/NO APTO → HALLAZGO → OT** **NO existe como funcionalidad de primera clase**. Pero **todas las piezas para componerlo ya existen**: Dynamic Forms (con checklists y `hallazgos` por campo), asociación de checklists a OT (`tab-ejecucion.tsx`), captura de evidencia/firma/geo, y el patrón **correctivo `solicitud → generar-orden-correctiva`** que es el análogo directo de "hallazgo → OT". Es una **composición**, no un módulo nuevo (§11).
- **Rol OPERADOR:** **NO existe** en el sistema (`tipos.ts` enumera 6 roles canónicos sin OPERADOR). Se documenta como **PROPUESTA / GAP**.
- **Clasificación A–E (§18):** de ~24 funcionalidades inventariadas → **A:** 5 · **B:** 9 · **C:** 4 · **D:** 4 · **E:** 2.
- **Navegación propuesta:** de ~9 ítems planos por rol a **4–6 grupos operacionales** por rol, sin eliminar ninguna capacidad (todo lo retirado del nav superior permanece accesible desde su superficie contextual).

**Confirmación de cero mutaciones:** `git status` limpio salvo este documento (§26).

---

## 2. Estado actual del producto

- **Monorepo:** pnpm (`pnpm-workspace.yaml`); artifacts leaf + `lib/*` composite.
- **Frontend:** `artifacts/deltaops` — React 19 + Vite, routing `wouter` con `base` = `import.meta.env.BASE_URL` (`App.tsx`), TanStack Query, Design System propio (`@workspace/design-system`).
- **Backend:** `artifacts/api-server` — Express, base `/api/deltaops`, módulos de dominio en `lib/module-*` y `lib/platform`, motor de workflow (`lib/workflow-engine`) y Dynamic Forms (`lib/dynamic-forms`), read models CQRS.
- **Identidad / sesión:** `GET /auth/session` como autoridad de rol; dispatcher de landing en `pages/inicio.tsx` (SUPER_ADMIN → consola técnica `Console`; resto → `InicioEmpresa`). RBAC de **presentación** centralizado en `lib/identidad/rbac.ts` (el backend es la autoridad real; nunca hay bypass).
- **Roles canónicos** (`lib/identidad/tipos.ts`): `SUPER_ADMIN`, `TENANT_ADMIN`, `SUPERVISOR`, `PLANIFICADOR`, `TECNICO`, `CONSULTA`. **No existe OPERADOR.**
- **Design System DGP-005:** `ThemeProvider` como autoridad única montada en la raíz (`App.tsx`, líneas 229–238); tokens `--do-*`; logo por tema vía componente `Logo` (`variant="imagotipo-auto"` en `AppShell.tsx`). Reglas de marca en `.agents/memory/deltaops-design-system-dgp005.md` y `brand/documentation/ANALISIS-BRANDBOOK.md`.
- **Madurez:** alta calidad de código y tipado; disciplina de tokens excelente; la deuda es **de experiencia/composición de UI**, no de arquitectura.

---

## 3. Inventario de módulos

Módulos de negocio con entitlement por tenant (`rbac.ts` → `Modulo`, `MODULOS_META`, `MODULOS_ORDEN`) y su superficie de entrada:

| Módulo | Lib backend/dominio | Entrada frontend (`MODULOS_META`) |
|---|---|---|
| Referencia | `lib/module-reference` | `/referencia` |
| Activos | `lib/module-activos` | `/activos` |
| Órdenes | `lib/module-ordenes` | `/ordenes` |
| Inventario | `lib/module-inventario` | `/inventario` |
| Planes | `lib/module-planes` | `/planes` |
| Abastecimiento | `lib/module-abastecimiento` | `/abastecimiento/solicitudes` |
| Preventivo | `lib/module-preventivo` | `/preventivo/programas` |
| Correctivo | `lib/module-correctivo` | `/correctivo/solicitudes` |
| Analytics | `lib/module-analytics` | `/analytics` |
| Utilización | `lib/module-utilizacion` | `/utilizacion/lecturas` (módulo emergente, guard dedicado `utilizacionVisible`) |
| Manos de obra | `lib/module-manodeobra` | (embebido en Órdenes: sesiones de trabajo) |
| Costos | `lib/module-costos` | `/costos` |

Transversales (no navegables como módulo de negocio): `lib/platform` (consola SUPER_ADMIN), `lib/workflow-engine`, `lib/dynamic-forms`, `lib/kernel`, `lib/business-foundation`, `lib/db`, `lib/api-spec`/`api-zod`/`api-client-react`, `lib/design-system`.

**Observación:** Utilización, Manos de obra y Costos **existen como módulos de dominio pero NO figuran en el enum `Modulo`** ni en la navegación estándar del `AppShell`. Utilización se muestra con un guard de presentación propio; Costos vive solo en `/costos`; Mano de obra es interna a Órdenes (sesiones de trabajo). → **Contradicción documentada en §16.**

---

## 4. Inventario de pantallas

88 páginas de primer nivel en `artifacts/deltaops/src/pages/` (más 17 en las subcarpetas `ordenes/`, `inventario/`, `abastecimiento/`, `ficha/`; 105 archivos en total). Rutas reales según `App.tsx`:

**Acceso / identidad:** `/login`, `/recuperar`, `/restablecer`, `/invitacion`, `/perfil`, `/perfil/contrasena`.
**Raíz / operación:** `/` (dispatcher `inicio.tsx`), `/centro` (Centro de Mantenimiento, `centro-mantenimiento.tsx`).
**Solo SUPER_ADMIN** (`RUTAS_SOLO_SUPER_ADMIN` + `SoloSuperAdmin`): `/plataforma`, `/motores`, `/motores/playground`, `/consola-activos`, `/administracion/saas`.
**Administración empresa:** `/administracion/usuarios`, `/administracion/configuracion`.
**Activos:** `/activos`, `/activos/nuevo`, `/activos/arboles`, `/activos/sincronizacion`, `/activos/escanear`, `/activos/:id` (ficha con tabs: timeline, planes, órdenes, correctivo, preventivo, documentación, relaciones, histórico, inventario).
**Órdenes:** `/ordenes` (operaciones), `/ordenes/nueva`, `/ordenes/supervisor`, `/ordenes/planificacion`, `/ordenes/escanear`, `/ordenes/sincronizacion`, `/ordenes/:id` (ficha con tabs: ejecución, dependencias, documentación, activo).
**Inventario:** `/inventario`, `/inventario/nuevo`, `/inventario/movimientos`, `/inventario/transferencias`, `/inventario/conteos`, `/inventario/bodegas`, `/inventario/escanear`, `/inventario/sincronizacion`, `/inventario/:id`.
**Planes:** `/planes`, `/planes/nuevo`, `/planes/calendario`, `/planes/sincronizacion`, `/planes/:id`.
**Abastecimiento:** artículos, proveedores, solicitudes, órdenes-compra (listado + nueva + ficha cada uno), `/abastecimiento/escanear`, `/abastecimiento/sincronizacion`.
**Preventivo:** `/preventivo/programas` (+ nuevo, ficha, actividad), `/preventivo/calendario`, `/preventivo/escanear`, `/preventivo/sincronizacion`.
**Correctivo:** `/correctivo/solicitudes` (+ nueva, ficha, diagnóstico), `/correctivo/intervenciones/:id`, `/correctivo/escanear`, `/correctivo/sincronizacion`.
**Utilización:** `/utilizacion/lecturas` (+ nueva), `/utilizacion/tanqueos` (+ nuevo), `/utilizacion/resumen`.
**Costos:** `/costos`.
**Analytics:** `/analytics`, `/analytics/indicadores` (+ `/:clave`), `/analytics/sincronizacion`, `/analytics/dashboards/nuevo`, `/:id`, `/:id/editar`.
**Diseño / motores:** `/design-system`, `/referencia`, `/referencia/:id`.
**404:** `not-found`.

Cada módulo repite el patrón de sub-superficies `escanear` (QR) y `sincronizacion` (estado offline).

---

## 5. Inventario de navegación

**Composición real** (`AppShell.tsx` → `Navegacion`, líneas 210–248):

1. Botón fijo **"Consola"** → `/`.
2. **Un botón por cada módulo habilitado** del tenant, en orden canónico `MODULOS_ORDEN`: Activos, Órdenes, Inventario, Planes, Abastecimiento, Preventivo, Correctivo, Analytics, Referencia.
3. Botón **"Utilización"** si `utilizacionVisible(sesion)` (entitlement + capacidad de lectura).
4. **Acciones a la derecha:** badge de estado de empresa, selector de empresa (si >1 membresía), menú de perfil (perfil, contraseña, apariencia, y para admin: configuración/usuarios; para super-admin: SaaS; cerrar sesión).

**Guards de presentación:** `SoloSuperAdmin` envuelve las rutas globales; landing por rol vía `landingOperacional(sesion)` (`rbac.ts`) que respeta entitlements.

**Diagnóstico:** la navegación es **plana, no agrupada, y crece linealmente con los módulos** (hasta 9–10 botones + acciones). Confirma directamente los problemas §5.1 ("navegación superior demasiado extensa") y §5.2 ("exceso de opciones visibles"). La navegación **ya es sensible al rol** solo indirectamente (por entitlements de módulo), **no por perfil de trabajo** → base para la propuesta §16.

---

## 6. Matriz funcionalidad × rol

Roles: **SA** = SUPER_ADMIN · **TA** = TENANT_ADMIN · **SUP** = SUPERVISOR · **PLA** = PLANIFICADOR · **TEC** = TECNICO · **CON** = CONSULTA.
La autorización efectiva es del backend; esta matriz refleja la **composición de presentación** (`rbac.ts`, `inicio-empresa.tsx`, guards). "✔" = superficie ofrecida; "R" = solo lectura; "—" = no ofrecida por presentación.

| Funcionalidad (ruta · evidencia) | SA | TA | SUP | PLA | TEC | CON |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Consola global técnica (`/plataforma`, `SoloSuperAdmin`) | ✔ | — | — | — | — | — |
| Administración SaaS (`/administracion/saas`) | ✔ | — | — | — | — | — |
| Motores / consola-activos (`RUTAS_SOLO_SUPER_ADMIN`) | ✔ | — | — | — | — | — |
| Centro de mantenimiento (`/centro`, `PREFERENCIA_LANDING`) | ✔ | ✔ | ✔ | ✔ | ✔ | R |
| Usuarios de empresa (`/administracion/usuarios`, `esAdminEmpresa`) | ✔ | ✔ | — | — | — | — |
| Configuración de empresa (`/administracion/configuracion`) | ✔ | ✔ | — | — | — | — |
| Activos (`/activos`; `puedeEscribir` gate escritura) | ✔ | ✔ | ✔ | ✔ | R/QR | R |
| Órdenes — ejecución (`tab-ejecucion.tsx`; `ordenAsignadaAIdentidad` G-1) | ✔ | ✔ | ✔ | ✔ | ✔ (propias) | R |
| Órdenes — supervisión (`/ordenes/supervisor`) | ✔ | ✔ | ✔ | ✔ | — | R |
| Órdenes — planificación (`/ordenes/planificacion`) | ✔ | ✔ | ✔ | ✔ | — | R |
| Inventario (`/inventario`) | ✔ | ✔ | ✔ | ✔ | R | R |
| Planes / calendario (`/planes`) | ✔ | ✔ | ✔ | ✔ (landing) | R | R |
| Preventivo (`/preventivo/programas`) | ✔ | ✔ | ✔ | ✔ | R | R |
| Correctivo — solicitudes→OT (`generar-orden-correctiva`) | ✔ | ✔ | ✔ | ✔ | ✔ (reportar) | R |
| Abastecimiento (`/abastecimiento/*`) | ✔ | ✔ | ✔ | ✔ | R | R |
| Utilización (`utilizacionVisible`) | ✔ | ✔ | ✔ | ✔ | ✔ (registrar) | R |
| Costos (`/costos`, solo lectura) | ✔ | ✔ | ✔ | ✔ | — | R |
| Analytics (`capacidadesDe`: admin/operador/lector) | ✔ | ✔ | ✔ | ✔ | R | R |
| Perfil / apariencia (`MenuPerfil`) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

> Notas de evidencia: `puedeEscribir(rol) = rol !== "CONSULTA"` (`inicio-empresa.tsx`). El TÉCNICO solo "ejecuta" OTs asignadas estrictamente a su identidad (gap G-1 documentado en `FocoTecnico`). Gate de escritura y visibilidad de módulo se combinan en `AccesosRapidos`/`IntegracionesSeccion`.

---

## 7. Problemas UX/UI encontrados

Auditoría de los 9 problemas de la directiva §5, **confirmados o refutados con evidencia**:

1. **Navegación superior demasiado extensa — CONFIRMADO.** `Navegacion` renderiza un botón por módulo habilitado (hasta 9) + "Consola" + "Utilización" + acciones, todo en una barra plana sin agrupación (`AppShell.tsx:210-248`).
2. **Exceso de opciones visibles — CONFIRMADO.** La landing `inicio-empresa.tsx` apila 8–10 secciones (Saludo, Punto de partida/Foco, Resumen, Alertas, Trabajo de hoy, Activos que requieren atención, Accesos rápidos, Explorar por módulo, Módulos disponibles, Administración). Alta carga cognitiva simultánea.
3. **Filtros excesivos en Activos — CONFIRMADO.** `plantillaFiltrosListado` (`lib/forms/plantillas.ts`) define **7 filtros** (estado, tipo, categoría, familia, criticidad, ubicación, responsable) + **búsqueda rápida** + **tabs/conteo por estado** en `activos-listado.tsx`. Nueve controles de filtrado en una sola pantalla.
4. **Controles nativos con problemas de contraste en tema oscuro — CONFIRMADO (con matiz).** El componente DS `Select` estiliza el **control cerrado** con tokens (`.do-select__control { color: var(--do-texto); background: transparent }`, `components-forms.css`), pero el **popup de `<option>` es nativo del navegador** y no recibe estilos (no hay reglas `option{}` en el CSS del DS ni en `index.css`). Además hay **4 páginas con `<select>` nativo crudo** sin el wrapper `.do-select`: `ordenes/tab-dependencias.tsx`, `preventivo-calendario.tsx`, `correctivo-solicitud-ficha.tsx`, `ordenes-planificacion.tsx`. En estos el riesgo de contraste en oscuro es real. → §8.
5. **Textos/opciones que pierden legibilidad — PARCIAL.** Ligado al punto 4 (opciones nativas). El texto general usa `--do-texto`/`--do-texto-suave` correctamente; el riesgo se concentra en popups nativos y en densidad, no en tokens de texto.
6. **Inconsistencias entre tema claro y oscuro — MAYORMENTE REFUTADO.** La disciplina de tokens es alta: solo **3 literales hex** en todas las páginas (concentrados en `administracion-configuracion.tsx`) y **0 en componentes** con override de `data-do-theme` (según guardas de test descritas en `.agents/memory/deltaops-tema-global.md`). El logo cambia por tema (`imagotipo-auto`). La inconsistencia residual real es el punto 4 (selects nativos), no un problema sistémico de tokens.
7. **Sensación de aplicación administrativa genérica — CONFIRMADO.** Nav plana de módulos + landing tipo "índice de módulos" (secciones "Módulos disponibles" / "Explorar por módulo") proyectan un ERP genérico en vez de una plataforma operacional guiada por tareas.
8. **Falta de jerarquía operacional clara — CONFIRMADO.** No hay agrupación por proceso (Mantenimiento / Equipos / Preoperacional / Inventario / Indicadores / Administración); todo es un mismo nivel de módulos técnicos.
9. **Demasiada información técnica simultánea — CONFIRMADO.** Fichas con muchos tabs (Activos: 9 tabs; Órdenes: 4 tabs), listados densos y KPIs crudos en la landing sin priorización por tarea.

**Adicionales observados:** repetición del par `escanear`/`sincronizacion` en cada módulo (ruido de nav si se expusiera); ausencia de un patrón único de "acción primaria" por pantalla (mezcla de botones primario/secundario/fantasma en filas de tarjeta, p.ej. `FilaOrden`).

---

## 8. Problemas de tema claro/oscuro

Arquitectura de tema (correcta y **autoridad única**, confirmada):

- `ThemeProvider` del DS montado en la raíz de `App.tsx`; preferencia en `localStorage["do-tema"]`; ningún Shell fija `data-do-theme` (memoria `deltaops-tema-global.md`).
- Aplica `data-do-theme` + clase `dark` sobre `document.documentElement`; shadcn responde a `.dark`; tokens `--do-*` en `:root`.
- Logo legible en ambos temas vía `Logo variant="imagotipo-auto"` (`AppShell.tsx` → `Marca`).

Auditoría por superficie de tokens (directiva §6):

| Elemento | Estado | Evidencia |
|---|---|---|
| Fondos / texto / bordes | ✔ tokenizado | `--do-bg`, `--do-texto`, `--do-texto-suave` usados de forma consistente |
| Inputs / control de `Select` (cerrado) | ✔ tokenizado | `.do-select__control` usa `--do-texto` y hereda foco/hover del wrapper |
| **`<option>` del popup de select** | ✘ **GAP** | Sin reglas `option{}` → popup nativo, contraste dependiente del SO en oscuro |
| **`<select>` nativos crudos (4 páginas)** | ✘ **GAP** | Fuera de `.do-select`; sin garantía de contraste/foco DS |
| Botones / badges / estados | ✔ tokenizado | variantes DS (`primario/secundario/fantasma`, `Badge`) |
| Focus / hover | ✔ | `.do-select:focus-within`, foco DS |
| Estados no dependientes solo del color | ⚠ revisar | Badges combinan color + etiqueta de texto (bien); verificar iconografía de SLA |
| Logo por tema | ✔ | `imagotipo-auto` |
| Literales hex fuera de tokens | ⚠ mínimo | 3 en `pages/` (concentrados en `administracion-configuracion.tsx`); 0 en componentes de página propios (los únicos hex en `components/` están en la primitiva vendorizada `ui/chart.tsx`, sin override de tema) |

**Conclusión:** el sistema de temas es **sólido y de autoridad única**. Los dos GAPs concretos a resolver en implementación son: (a) estilar `<option>`/popup para oscuro (o migrar a un `Select` con listbox propio del DS), y (b) migrar los 4 `<select>` crudos al componente `Select` del DS. Ninguno requiere cambiar la arquitectura de tema.

---

## 9. Flujo operacional actual

Estado real del flujo de la directiva §3, pieza por pieza:

| Etapa del flujo | ¿Existe hoy? | Evidencia |
|---|---|---|
| PREOPERACIONAL (iniciar sobre un equipo) | **NO como tal** | No hay ruta/comando "preoperacional"; hay QR de activo (`/activos/escanear`) |
| CHECKLIST | **SÍ (genérico)** | Dynamic Forms clase "checklist"; asociable a OT (`tab-ejecucion.tsx`, `asociarChecklist`) |
| CUMPLE / NO CUMPLE (APTO/NO APTO) | **PARCIAL** | `FormularioDinamico` calcula `hallazgos` por campo con severidad `error/bloqueo/advertencia` (`lib/forms/motor.ts`, `hayBloqueos`); no hay veredicto APTO/NO APTO de equipo |
| HALLAZGO | **SÍ (concepto)** | `HallazgoCampo` (campo, mensaje, severidad) en el motor de formularios |
| REPORTE / NOVEDAD → OT | **SÍ (vía correctivo)** | Correctivo: `solicitud → transicionar → generar-orden-correctiva` (`lib/correctivo/mutaciones.ts`) |
| ASIGNACIÓN | **SÍ** | Órdenes: responsable, `/ordenes/planificacion`, `/ordenes/supervisor` |
| EJECUCIÓN | **SÍ** | `tab-ejecucion.tsx`: checklist/formulario, evidencia (foto/firma/geo) |
| REPUESTOS / MANO DE OBRA / TIEMPO | **SÍ** | Sesiones de trabajo (`EstadoSesion ABIERTA/PAUSADA/CERRADA`, `lib/ordenes/tipos.ts`); consumo de inventario; `lib/module-manodeobra` |
| CIERRE | **SÍ** | Ciclo de OT (workflow-engine + read model de Órdenes) |
| COSTO | **SÍ** | Ledger de inventario a costos; `/costos` (`SuperficieCostos`) |
| INDICADORES | **SÍ** | Analytics declarativo (`lib/module-analytics`; catálogo de indicadores read-only) |

**Síntesis:** el flujo está **completo del "HALLAZGO → OT" en adelante**. Lo ausente es la **entrada preoperacional guiada** (seleccionar equipo → checklist diario → veredicto APTO/NO APTO → generar novedad automática). Es un GAP de **composición/entrada**, no de motor.

---

## 10. Flujo operacional objetivo (DeltaOps Lite)

Un único hilo operacional guiado por tarea, reutilizando el motor existente:

```
[OPERADOR/TÉCNICO] Escanear QR o elegir equipo
        ↓  (reutiliza /activos/escanear + activo)
INICIAR PREOPERACIONAL (checklist diario del equipo)
        ↓  (reutiliza Dynamic Forms clase "checklist")
RESPONDER CONDICIONES  →  hallazgos por campo (motor de forms)
        ↓
VEREDICTO  →  APTO  → equipo disponible para operar (registro)
           →  NO APTO (condición crítica falla)
                     ↓  (reutiliza patrón correctivo)
              NOVEDAD / SOLICITUD CORRECTIVA (auto-prellenada: equipo, operador, fecha/hora, checklist, hallazgo)
                     ↓  generar-orden-correctiva
              ORDEN DE TRABAJO → asignación → ejecución
                     ↓
              repuestos / mano de obra / tiempo (sesiones)
                     ↓  cierre → costo → indicadores
```

Principio (directiva §11): **no se crea un segundo módulo de Órdenes/Activos/Inventario**; el preoperacional es una **superficie de entrada** que compone Dynamic Forms + patrón correctivo + read models existentes.

---

## 11. Diseño conceptual del preoperacional

**Objetivo:** superficie mobile-first de inspección diaria previa a operar, orientada a operador/técnico de campo.

**Flujo funcional (sin implementar):**

1. **Seleccionar equipo** — por QR (`/activos/escanear`, ya existe) o búsqueda simple. Reutiliza catálogo de activos.
2. **Iniciar preoperacional** — resuelve el checklist vigente del tipo/categoría del equipo (Dynamic Forms; resolutor de plantillas `lib/dynamic-forms/resolutor.ts`).
3. **Mostrar checklist** — render con `FormularioDinamico` (ya soporta condiciones, evidencias, `hallazgos`).
4. **Responder condiciones** — controles grandes (sí/no/N.A.), captura de foto/observación por ítem crítico (patrón de evidencia de `tab-ejecucion.tsx`).
5. **Evidenciar incumplimiento** — foto + observación como EVIDENCIA (reutiliza `CapturaFoto`/`CapturaFirma`).
6. **Veredicto APTO / NO APTO** — derivado de `hayBloqueos(hallazgos)`: si hay severidad `error/bloqueo` en ítem crítico → **NO APTO**; si no → **APTO**.
7. **Asociación automática** al registro: equipo, operador (identidad de sesión), fecha/hora, checklist (referencia de plantilla), hallazgos.

**Capacidades reutilizables (§11):** Dynamic Forms (checklist + condiciones + evidencias + hallazgos), resolutor de plantillas, QR de activos, captura de evidencia/firma/geo, cola offline (`lib/offline`), sesión/identidad.

**GAP a diseñar (no implementar):** (a) tipo de documento "preoperacional" con veredicto APTO/NO APTO a nivel de instancia (hoy el veredicto es por-campo, no de equipo); (b) endpoint/comando de registro del preoperacional y su vínculo con el activo/read model; (c) regla "condición crítica → generar novedad automática".

---

## 12. Diseño conceptual de checklist

- **Motor:** Dynamic Forms ya soporta clase **"checklist"** (distinta de "formulario"): `plantillaAsociarPlantilla("checklist")`, `useChecklists`, `asociarChecklist` (`tab-ejecucion.tsx`, `lib/ordenes/hooks.ts`).
- **Definición declarativa:** nodos contenedor/campo con tipos (`select`, `texto`, `numero`, `fecha`, etc.), `obligatorio`, `restricciones` y **condiciones** (`lib/dynamic-forms/condiciones.ts`).
- **Severidad de hallazgo:** `HallazgoCampo { campo, mensaje, severidad: "advertencia" | "error" | "bloqueo" }` (`lib/forms/motor.ts`). `hayBloqueos()` decide si el envío/veredicto se bloquea.
- **Ítems críticos → NO APTO:** conceptualmente, marcar ciertos ítems como "críticos" y mapear su incumplimiento a severidad `bloqueo`. El motor ya distingue advertencia vs bloqueo; falta el **metadato "crítico"** a nivel de definición de checklist (GAP menor de plantilla, no de motor).
- **Evidencia por ítem:** foto/observación asociada al hallazgo (patrón ya presente en ejecución de OT).

**Conclusión:** el checklist preoperacional es una **plantilla de Dynamic Forms** + convención de "ítem crítico", no un desarrollo nuevo de motor.

---

## 13. Flujo hallazgo → OT

**Análogo directo YA existente: Correctivo.** `lib/correctivo/mutaciones.ts`:

- `transicionarSolicitud(id, accion, {motivo})` → `POST /solicitudes/:id/transicion` (aprobar/rechazar).
- `generarOrden(solicitudId, {titulo, prioridad})` → comando `modulo.correctivo.generar-orden-correctiva`, `POST /generar`, devuelve `ordenTrabajoId` (idempotente por `opId`).
- `crearIntervencion(...)` para correctivo mayor (cuadrillas).
- Deep link `urlOrdenTrabajo(ordenId)` = `/ordenes/:id` (`lib/correctivo/deep-links.ts`).

**Diseño objetivo (composición, no duplicación):**

```
Preoperacional NO APTO (hallazgo crítico)
   → crea SOLICITUD correctiva prellenada (equipo, hallazgo, evidencia, operador, fecha)
   → aprobación según reglas (transicionarSolicitud)
   → generarOrden → OT correctiva
   → /ordenes/:id (asignación, ejecución, cierre, costo)
```

**GAP:** el "puente" automático **preoperacional → solicitud correctiva** no existe (hoy la solicitud correctiva se crea manualmente en `/correctivo/solicitudes/nueva`). Es una **regla de composición**, no un nuevo flujo de OT.

---

## 14. Indicadores disponibles actualmente

Fuentes **reales** (read models / módulos), sin inventar:

- **Analytics declarativo** (`lib/module-analytics`; catálogo de indicadores con `clave`, `unidad`, `fuente.modulo/dataset` — visto en `analytics-indicadores.tsx`). 8 dashboards de sistema (`DASHBOARDS_SISTEMA`): ejecutivo, operativo, inventario, activos, órdenes, correctivo, preventivo, compras. Dimensiones de filtro canónicas: activo, ubicación, bodega, categoría, tipo, estado, prioridad, responsable, cuadrilla, fecha.
- **Órdenes (read model, `useOrdenesGlobal`):** abiertas, en ejecución, pendientes, SLA vencido/en riesgo, sin asignar (`lib/centro/resumen.ts`, calculado en `inicio-empresa.tsx`). Tiempos de ciclo de OT.
- **Utilización (`lib/module-utilizacion`):** horómetro, odómetro (lecturas), combustible (tanqueos), `deltaHorometro`, resumen de lecturas/tanqueos (`utilizacion-resumen.tsx`).
- **Costos (`lib/module-costos`):** costo por activo, tendencia de costo/horas/km por período, por moneda (`SuperficieCostos`). Alimentado por el ledger de inventario y mano de obra.
- **Inventario:** movimientos, consumo, rotación (dashboard "inventario").
- **Correctivo:** fallas, reincidencias, tiempos de atención (dashboard "correctivo").
- **Preventivo:** cumplimiento/adherencia (dashboard "preventivo").
- **Mano de obra:** horas hombre por sesión de trabajo (`lib/module-manodeobra`).

**Sin fuente real / NO inventar:** MTTR/MTBF explícitos, disponibilidad como % consolidado y "equipos fuera de servicio" **como indicador de primera clase** no se confirmaron como campos publicados directos; el catálogo de Analytics es la autoridad. Cualquier KPI a destacar debe existir en `ind.fuente` antes de mostrarse.

---

## 15. Indicadores recomendados para la experiencia principal

**Máximo 4–6 por perfil**, todos con fuente confirmada; el resto queda en Analytics.

**Home operacional (SUPERVISOR/TA):**
- OTs abiertas · en ejecución · SLA vencido · SLA en riesgo · sin asignar (fuente: read model Órdenes — ya calculado).
- Alertas operacionales (fuente: `alertasOperacionales`).

**Home PLANIFICADOR:**
- Pendientes de planificar · cumplimiento de preventivo (dashboard preventivo) · calendario de planes.

**Home TÉCNICO/OPERADOR:**
- Mi trabajo de hoy / orden prioritaria (no un KPI: una lista). Estado offline/sincronización.

**Equipos (ficha de activo):**
- Horómetro/odómetro actual, último tanqueo/consumo (Utilización); costo acumulado del activo (Costos).

**Quedan en Analytics (no en la home):** MTTR/MTBF/disponibilidad consolidada, rotación de inventario, reincidencias, comparativos y dashboards editables — son análisis, no acción diaria (directiva §10).

---

## 16. Propuesta de navegación DeltaOps Lite

**Principio:** de una barra plana de ~9 módulos a **grupos operacionales por proceso**, diferenciados por rol. **Nada se elimina**: lo retirado del nav superior sigue accesible desde su superficie contextual (fichas, sub-tabs, menú de perfil, o dentro del grupo).

Estructura propuesta (adaptada del referente §7, **no adoptada literalmente**, validada contra código y roles reales):

| Grupo Lite | Agrupa (rutas reales existentes) |
|---|---|
| **INICIO** | `/` (home operacional por rol) · `/centro` |
| **MANTENIMIENTO** | Órdenes (`/ordenes`, supervisor, planificación) · Correctivo · Preventivo · Planes |
| **EQUIPOS** | Activos (`/activos`, árboles, ficha 360°) · Utilización (lecturas/tanqueos/resumen) |
| **PREOPERACIONAL** | *(nuevo punto de entrada; compone Dynamic Forms + correctivo)* — **GAP §19** |
| **INVENTARIO** | Inventario (movimientos, transferencias, conteos, bodegas) · Abastecimiento |
| **INDICADORES** | Analytics · Costos |
| **ADMINISTRACIÓN** | Usuarios · Configuración *(solo admin)* · SaaS/Plataforma/Motores *(solo SUPER_ADMIN)* |

**REALIDAD ACTUAL vs PROPUESTA (contradicciones explícitas):**

- **REALIDAD:** nav plana, un botón por módulo del enum `Modulo`; Utilización con guard aparte; Costos y Mano de obra **fuera del nav estándar**. **PROPUESTA:** agrupar por proceso; incorporar Utilización y Costos a grupos ("Equipos", "Indicadores") de forma explícita.
- **REALIDAD:** la nav se compone por **entitlement de módulo**, no por perfil de trabajo. **PROPUESTA:** componer por **rol/perfil** (un TÉCNICO no ve "Administración"; un OPERADOR no ve configuración técnica), sobre la misma capa `rbac.ts` (extender `PREFERENCIA_LANDING`/grupos, sin navegación paralela — memoria `deltaops-separacion-experiencias-rol.md`).
- **REALIDAD:** grupo "PREOPERACIONAL" **no tiene ruta**. **PROPUESTA:** entrada nueva por composición → depende del GAP §19; hasta entonces, marcado como "próximamente" y **no** añadido al nav.
- **REALIDAD:** OPERADOR no existe como rol. **PROPUESTA:** ver §17 (GAP).

**Regla de agrupación:** las sub-superficies `escanear`/`sincronizacion` **no van al nav**; se acceden desde dentro de su módulo (ya es así). El menú de perfil conserva apariencia/perfil/admin.

---

## 17. Experiencia por rol

Para cada perfil: pantalla inicial · acciones principales · nav visible · info necesaria · info a ocultar · acciones críticas/secundarias.

### 1. OPERADOR — **PROPUESTA / GAP** (no existe hoy; `tipos.ts` no lo enumera)
- **Pantalla inicial:** Preoperacional (escanear equipo → checklist del día).
- **Acciones principales:** iniciar preoperacional · reportar novedad (NO APTO) · registrar lectura (horómetro/combustible).
- **Nav visible:** INICIO, PREOPERACIONAL, EQUIPOS (solo lectura/registro). **Ocultar:** Administración, Inventario avanzado, Analytics, Configuración.
- **Críticas:** veredicto APTO/NO APTO, evidencia de hallazgo. **Secundarias:** ver mis reportes.
- **REALIDAD ACTUAL vs PROPUESTA:** hoy no hay rol OPERADOR; sus tareas recaerían en TECNICO/CONSULTA. Introducirlo exige decisión de Dirección + cambio de RBAC (fuera de esta fase).

### 2. TÉCNICO (`TECNICO`)
- **Pantalla inicial:** "Tu foco ahora" (`FocoTecnico`, `inicio-empresa.tsx`) — orden prioritaria propia, escanear QR, mis órdenes; mobile-first, estado offline primero.
- **Acciones principales:** ejecutar OT asignada (checklist/evidencia/firma), consumir repuestos, registrar tiempo/mano de obra.
- **Nav visible:** INICIO, MANTENIMIENTO (mis órdenes), EQUIPOS (lectura/QR), PREOPERACIONAL. **Ocultar:** Administración, Analytics avanzado, Abastecimiento compras, Costos.
- **Info necesaria:** OT propias, SLA, checklist. **Ocultar:** OTs de otros (respeta G-1), config técnica.
- **Críticas:** ejecutar/cerrar OT. **Secundarias:** ver activo.

### 3. SUPERVISOR / PLANIFICADOR (`SUPERVISOR`, `PLANIFICADOR`)
- **Pantalla inicial:** `/centro` (Centro de mantenimiento) — SUPERVISOR: "Prioridades de supervisión" (vencidas/en riesgo/sin asignar); PLANIFICADOR: "Pendiente de planificar" (`trabajoPorRol`).
- **Acciones principales:** asignar/planificar OT, aprobar solicitudes correctivas, programar preventivo, priorizar por SLA.
- **Nav visible:** INICIO, MANTENIMIENTO (completo), EQUIPOS, INVENTARIO, INDICADORES. **Ocultar:** SaaS/Plataforma/Motores.
- **Críticas:** asignación, generación de OT desde correctivo, cierre supervisado. **Secundarias:** indicadores.

### 4. ADMINISTRADOR (`TENANT_ADMIN`; `SUPER_ADMIN` como super-conjunto)
- **Pantalla inicial:** TA → `/centro`; SA → consola global técnica (`Console`, `inicio.tsx`).
- **Acciones principales:** usuarios, configuración/branding, entitlements; SA: administración SaaS, motores, plataforma.
- **Nav visible:** conjunto completo + ADMINISTRACIÓN. **Ocultar (TA):** superficies solo-SUPER_ADMIN (`RUTAS_SOLO_SUPER_ADMIN`).
- **Críticas:** gestión de usuarios/roles, configuración empresa.

### 5. CONSULTA (`CONSULTA`)
- **Pantalla inicial:** `/centro` o `/activos` (solo lectura; `PREFERENCIA_LANDING`).
- **Acciones principales:** ninguna de escritura (`puedeEscribir` = false lo bloquea en presentación).
- **Nav visible:** INICIO, MANTENIMIENTO (R), EQUIPOS (R), INDICADORES (R). **Ocultar:** todo botón de creación/edición, Administración.
- **Críticas:** ninguna. **Secundarias:** navegar y leer.

---

## 18. Funcionalidades A/B/C/D/E

Clasificación (directiva §12). "E" **no** significa borrar; solo que Dirección decidirá después.

**A — MOSTRAR EN NAVEGACIÓN PRINCIPAL** (5)
- Inicio operacional (`/`) · Centro de mantenimiento (`/centro`).
- Órdenes de trabajo (`/ordenes`).
- Activos (`/activos`).
- Preoperacional *(propuesto; A cuando exista — hoy §19)*.

**B — MOSTRAR DENTRO DE OTRA FUNCIONALIDAD** (9)
- Correctivo (dentro de Mantenimiento) · Preventivo (dentro de Mantenimiento) · Planes/Calendario (dentro de Mantenimiento).
- Utilización — lecturas/tanqueos/resumen (dentro de Equipos/ficha de activo).
- Costos (dentro de Indicadores).
- Sesiones de trabajo / mano de obra (dentro de la ejecución de OT).
- Abastecimiento (dentro de Inventario).
- QR "escanear" y "sincronización" (dentro de cada módulo).
- Fichas y sub-tabs (activo 360°, OT ejecución).

**C — DISPONIBLE SOLO PARA ADMINISTRACIÓN** (4)
- Usuarios (`/administracion/usuarios`).
- Configuración de empresa (`/administracion/configuracion`).
- Administración SaaS (`/administracion/saas`, SUPER_ADMIN).
- Plataforma / Motores / Consola-activos (`RUTAS_SOLO_SUPER_ADMIN`).

**D — OCULTA PERO CONSERVADA** (4)
- `/design-system` (galería viva; herramienta interna).
- Editor de dashboards de Analytics (`/analytics/dashboards/*`) — potente pero avanzado.
- `/motores/playground` (diagnóstico).
- `/referencia`, `/referencia/:id` (según entitlement; conservar).

**E — CANDIDATA A FUTURA DEPURACIÓN** (2, decisión de Dirección)
- Duplicidad conceptual de "Consola" (botón nav `/`) vs `/centro`: evaluar unificar la entrada operacional.
- Módulo "Referencia" en el nav principal (`MODULOS_ORDEN` lo incluye): evaluar si es una superficie de usuario final o de configuración.

---

## 19. GAPs reales

Marcados sin inventar; cada uno indica qué se reutiliza (§11).

- **G1 — Entrada PREOPERACIONAL guiada:** no existe ruta/comando de preoperacional ni veredicto APTO/NO APTO a nivel de equipo. **Reutiliza:** Dynamic Forms (checklist + hallazgos), QR de activo, evidencia. **Falta:** tipo "preoperacional", veredicto de instancia, registro/vínculo con activo.
- **G2 — Metadato "ítem crítico" en checklist:** el motor distingue severidad `advertencia/error/bloqueo`, pero la definición de checklist no marca ítems como críticos. **Reutiliza:** `lib/forms/motor.ts`. **Falta:** metadato en plantilla.
- **G3 — Puente automático hallazgo crítico → solicitud correctiva:** hoy la solicitud correctiva se crea manualmente. **Reutiliza:** `generar-orden-correctiva` y transiciones de correctivo. **Falta:** regla de auto-prellenado (equipo, operador, fecha/hora, checklist, hallazgo) y creación de la solicitud desde el preoperacional.
- **G4 — Rol OPERADOR:** no existe (`tipos.ts`). **Decisión de Dirección + RBAC** (fuera de esta fase).
- **G5 — `<option>`/popup de `Select` en tema oscuro y 4 `<select>` crudos:** GAP de contraste. **Reutiliza:** DS `Select`. **Falta:** estilar popup o listbox propio + migrar los 4 crudos.
- **G6 — Navegación por perfil (no solo por entitlement) y agrupación por proceso:** hoy plana. **Reutiliza:** `rbac.ts`. **Falta:** capa de grupos por rol.
- **G7 — G-1 asignación estricta al técnico:** documentado en `FocoTecnico`; el "ejecutar" solo aparece con match estricto de identidad; la atribución de trabajo depende de datos de responsable consistentes.

---

## 20. Funcionalidades que NO deben tocarse

- **Motores de dominio:** `lib/module-*`, `lib/workflow-engine`, `lib/dynamic-forms`, `lib/business-foundation`, `lib/kernel`, `lib/db`, `lib/platform`.
- **Contratos:** OpenAPI (`lib/api-spec`), Zod generado, hooks generados. **No modificar** (§14).
- **RBAC/RLS:** autoridad del backend (`GET /auth/session`, RLS Postgres DGP-023.5). El RBAC de presentación (`rbac.ts`) solo compone UI.
- **Sesiones de trabajo, ledger a costos, read models CQRS.**
- **Autoridad única de tema:** `ThemeProvider` raíz (`App.tsx`) — no crear un segundo sistema de tema ni fijar `data-do-theme` en shells/páginas.
- **Identidad visual DELTA:** logos solo vía componente `Logo`; colores solo tokens `--do-*` (DGP-005, Brandbook). **No inventar identidad nueva.**
- **Dispatcher de landing por rol** (`inicio.tsx`) y guards `SoloSuperAdmin` — extender por `rbac.ts`, sin navegación paralela.

---

## 21. Propuesta visual

Dentro de la identidad DELTA existente (DGP-005), sin diseño experimental:

- **Lenguaje:** corporativo, industrial, limpio, profesional; mobile-first para operación de campo.
- **Base:** tokens `--do-*` (colores de marca permitidos: #FFFFFF, #D2002B, #BA0C2F, #080A16, #000000 + rojo alfa; tipografías Montserrat/Roboto).
- **Jerarquía:** una **acción primaria clara por pantalla** (rojo DELTA), secundarias en `secundario/fantasma`. Menos tarjetas y bordes; más aire.
- **Evitar (§13):** exceso de tarjetas/bordes, dashboards saturados, sombras/gradientes decorativos, colores fuera de token, look de ERP genérico.
- **Priorizar:** estados visibles (color **+** etiqueta/icono, nunca solo color), feedback inmediato (toasts DS ya existen), botones táctiles ≥48px (ya usado, `botonTactil`/`minHeight:48`), formularios simples por pasos (Dynamic Forms wizard ya existe).
- **Home por tarea, no por módulo:** reemplazar "Módulos disponibles"/"Explorar por módulo" por bloques de acción priorizados por rol.
- **Selects:** resolver popup en oscuro (G5) manteniendo el control tokenizado.

---

## 22. Recomendaciones mobile

- **Preoperacional y ejecución de OT** como superficies mobile-first prioritarias (operador/técnico en campo).
- Reutilizar la **contención de overflow sistémica** ya presente (`minmax(min(Npx,100%),1fr)`, `.do-root{max-width:100%;overflow-x:clip}`, memoria `deltaops-tema-global.md`).
- Objetivos táctiles ≥48px (ya convención en la landing).
- Cola **offline** (`lib/offline`) para captura sin conexión + estado de sincronización visible (ya existe `EstadoOffline`).
- QR como entrada principal en móvil (`/*/escanear` ya existen).
- Menos columnas en tablas → tarjetas conmutables en móvil (patrón ya en `activos-listado.tsx`).
- Firma/foto/geolocalización táctiles (ya en `tab-ejecucion.tsx`).

---

## 23. Principios UX

1. **Menos cosas visibles**: nav agrupada por proceso; home por tarea.
2. **Menos decisiones para el usuario**: veredicto APTO/NO APTO derivado, no manual; una acción primaria por pantalla.
3. **Más automatización**: hallazgo crítico → solicitud/OT prellenada.
4. **Más claridad**: jerarquía operacional; estados por color + texto/icono.
5. **Mejor experiencia visual**: identidad DELTA, tokens, mobile-first, feedback inmediato.
6. **Misma capacidad empresarial detrás**: el core no se toca; solo cambia la composición de la UI.
7. **No duplicar** (§11): reutilizar Órdenes/Activos/Inventario/Correctivo/Dynamic Forms; nunca crear versiones paralelas.
8. **El usuario no necesita conocer la arquitectura** para usar DeltaOps.

---

## 24. Roadmap de implementación (fases, sin ejecutar aún)

- **Fase A — Navegación Lite y home por tarea:** agrupar nav por proceso y por rol (extender `rbac.ts`), rediseñar landing por tarea. Riesgo bajo (composición pura). *Requiere aprobación de Dirección.*
- **Fase B — UX/UI fixes puntuales:** simplificar filtros de Activos (búsqueda + 2–3 filtros clave, resto en "avanzado"), resolver G5 (popup select oscuro + migrar 4 `<select>` crudos), unificar patrón de acción primaria.
- **Fase C — Checklist con "ítem crítico" (G2):** metadato en plantillas de Dynamic Forms.
- **Fase D — Preoperacional (G1):** superficie de entrada + veredicto APTO/NO APTO + registro (nuevo comando/endpoint → **implica contrato**; requiere ciclo DGP formal, fuera de esta fase de solo-lectura).
- **Fase E — Puente automático hallazgo → correctivo (G3):** regla de auto-prellenado sobre `generar-orden-correctiva`.
- **Fase F — Rol OPERADOR (G4):** decisión de Dirección + RBAC/RLS.

Orden por valor/riesgo: A → B → C → E → D → F.

---

## 25. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | Añadir "preoperacional" duplicando Órdenes/Activos | Alta | Componer sobre Dynamic Forms + correctivo (§11); prohibido módulo paralelo |
| R2 | Tocar contratos/RBAC/RLS al implementar G1/G4 | Alta | Ciclo DGP formal; esta fase NO implementa |
| R3 | Romper autoridad única de tema al arreglar selects | Media | No fijar `data-do-theme`; estilar vía tokens en DS |
| R4 | Ocultar de nav = percepción de "función perdida" | Media | "Ocultar" ≠ eliminar; toda capacidad accesible desde su contexto |
| R5 | Navegación por rol mal calibrada bloquea trabajo real | Media | Backend sigue siendo autoridad; presentación conservadora |
| R6 | Introducir OPERADOR sin RBAC coherente | Alta | Diferir a decisión de Dirección + diseño RBAC |
| R7 | Simplificar filtros de Activos ocultando un filtro crítico | Baja | Conservar todos en "filtros avanzados" plegables |

---

## 26. Criterios de aceptación

**De esta fase (Discovery):**
1. Documento único creado en `docs/dgp/DELTAOPS-LITE-01-DISCOVERY.md` con las 26 secciones (§15). ✔
2. **Cero mutaciones de código/DB/migraciones/contratos/RBAC/RLS/workflows.** `git status`: solo este `.md` nuevo (+ el `.txt` adjunto de la directiva, no generado por esta fase). ✔
3. Cada problema UX de la directiva confirmado o refutado **con evidencia (archivo/ruta)**. ✔ (§7)
4. GAPs reales del flujo operacional identificados sin inventar, con capacidades reutilizables señaladas. ✔ (§9, §19)
5. Clasificación A–E de cada funcionalidad. ✔ (§18)
6. Toda contradicción REALIDAD ACTUAL vs PROPUESTA explícita. ✔ (§16, §17)
7. Cero credenciales (ni demo) en el documento. ✔

**Para las fases de implementación (futuras, requieren aprobación de Dirección):**
- Nav superior ≤ 6 grupos por rol; TÉCNICO/OPERADOR sin superficies administrativas.
- Activos: pantalla inicial con búsqueda + ≤3 filtros visibles; resto en "avanzado".
- Selects usables y con contraste suficiente en tema oscuro; 0 `<select>` nativos crudos.
- Home por tarea (no índice de módulos) sin perder ninguna capacidad existente.
- Preoperacional operativo por composición (Dynamic Forms + correctivo), sin duplicar módulos.
- Ninguna funcionalidad existente eliminada.

---

> **Fin del informe.** DETENERSE aquí (directiva §17). No iniciar implementación sin aprobación explícita de Dirección.
