# DELTAOPS LITE-06 · Auditoría Funcional Integral, Mapa Operacional y Base del Manual de Usuario

> **Naturaleza de este documento.** Informe de AUDITORÍA y DOCUMENTACIÓN (fase DISCOVERY). No se
> modificó código, base de datos, RBAC/RLS, OpenAPI, UI, rutas ni configuración. Toda afirmación se
> verificó contra el código, las rutas montadas, los contratos y la base de datos reales. Cuando algo
> no pudo comprobarse plenamente se marca **NO VERIFICADO**; cuando existe pero está incompleto,
> **FUNCIONALIDAD PARCIAL**; cuando existe y opera, **VERIFICADO**.
>
> **Origen de la evidencia.** Rutas del frontend (`artifacts/deltaops/src/App.tsx`), navegación
> (`lib/identidad/rbac.ts`), routers del backend montados en `artifacts/api-server/src/app.ts`, mapas
> rol→permiso (`identity/rbac.ts`, `*-runtime.ts`), esquema y datos reales de PostgreSQL (schema
> `deltaops`, 174 tablas), y contratos de los módulos (`lib/module-*`). Los informes DGP/LITE se usaron
> sólo como pista y se re-verificaron.

---

## 0. Resumen ejecutivo para Dirección

**¿Qué es DeltaOps hoy?** Un sistema de gestión de mantenimiento (CMMS/EAM) multiempresa (SaaS
multi-tenant) con un núcleo técnico robusto: motor de workflow, formularios dinámicos, store de
eventos con proyecciones (read models), auditoría, idempotencia, aislamiento por empresa con RLS de
PostgreSQL forzado, y capacidad offline en las superficies operativas. Está construido por
**composición de módulos** de dominio.

**Lo que funciona de verdad (verificado):** el ciclo operativo central Activo → Preoperacional
(checklist) → Hallazgo → (Correctivo) → Orden de Trabajo → Asignación → Ejecución → Validación →
Cierre → Historial está implementado extremo a extremo y respaldado por pruebas de integración sobre
PostgreSQL real. La administración de empresa (usuarios, roles, invitaciones, configuración, branding)
y la administración global SaaS (empresas, plataforma, motores) también funcionan.

**Las 5 observaciones más relevantes:**

1. **Sobre-exposición de complejidad (confirma la preocupación de Dirección).** Hay **107 archivos de
   página** y **89 rutas** (incluida la ruta comodín de «no encontrado») en el frontend. La operación real de mantenimiento se concentra en ~20-25
   pantallas; el resto son consolas técnicas, editores avanzados, y superficies de módulos
   satélite (Abastecimiento, Analytics avanzado, Planes) que aportan poco al técnico de campo. Es un
   problema de **presentación**, no de capacidad: la recomendación es **ocultar/segundar**, nunca
   eliminar (§15, §16, §22).

2. **«Multicentro de costos» es hoy sólo estructural, no operativo (GAP mayor, §7).** El dominio de
   Activos y de Órdenes tiene el campo `centroCosto`, pero **en los 36 activos reales el valor está
   vacío**, no existe captura de centro de costos en el alta de activos, y **ni Órdenes ni ninguna
   pantalla segregan/filtran por centro de costos**. La segregación real hoy es por **empresa (tenant)**
   y, parcialmente, por **asignación de responsable**. Para el escenario de Dirección (equipos
   distribuidos, Barranquilla sin coordinador) esto es una brecha a cerrar en una fase futura.

3. **Indicadores BI: el catálogo existe, la fuente de datos es parcial (§11).** Existe un catálogo
   canónico de KPIs (Disponibilidad, Utilización, Confiabilidad, MTBF, MTTR, tiempos de atención/
   ejecución/cierre, conteos de OT) con un motor de cálculo real. **Pero MTTR/MTBF/Disponibilidad
   dependen de `insumosKpi` (tiempos de reparación/entre-fallas/indisponibilidad) que se capturan
   MANUALMENTE por «evento de activo» y están mayormente en `null` en los datos reales.** No se
   derivan automáticamente de las marcas de tiempo de ejecución de la OT. Costo/hora y costo/km sí
   tienen fuente real (utilización + costos). **No se debe afirmar que MTTR/MTBF ya son confiables.**

4. **Deuda de coherencia de rol en el módulo Correctivo (§8, §19).** El router de Correctivo deriva
   el rol del actor de la tabla legacy `deltaops.users.rol` (admin/operador/lector) en lugar del rol
   canónico de la sesión de identidad, y el materializador Hallazgo→OT usa un contexto de servicio
   `"admin"`/`"operador"` fijo. Funciona para el flujo sembrado, pero es una inconsistencia respecto
   a Órdenes/Activos (que ya usan el rol canónico). Documentado, no corregido.

5. **Colapso de 6 roles a 3 buckets de permiso (§8).** Los 6 roles canónicos (SUPER_ADMIN,
   TENANT_ADMIN, SUPERVISOR, PLANIFICADOR, TECNICO, CONSULTA) se mapean a **3 roles legacy de módulo**
   (admin / operador / lector). SUPERVISOR, PLANIFICADOR y TECNICO comparten `operador`; la
   diferenciación fina (p. ej. quién puede validar/cerrar, quién omite la verificación de asignación)
   se reconstruye con matices por capacidades/permisos SÓLO en Órdenes y Utilización. En los demás
   módulos esos tres roles tienen, en la práctica, los mismos permisos de escritura.

**Estado de producción (síntesis, §27.11-12):** El núcleo (auth, sesiones, RBAC, RLS, workflow,
forms, offline, auditoría, idempotencia) está **listo/endurecido** (DGP-022/023 cerrados). Antes de
producción para Delta convendría: (a) resolver el modelo multicentro; (b) cerrar la captura de
insumos KPI para que los indicadores sean confiables; (c) simplificar la navegación por perfil; (d)
homogeneizar la derivación de rol en Correctivo. Ninguna de estas es un defecto de seguridad.

---

## 1. Método y fuentes de verdad

- **Rutas frontend:** `App.tsx` (wouter) — 88 `<Route>`; guardas de presentación en
  `lib/identidad/GuardaRuta.tsx` (`SoloSuperAdmin`) y en `lib/identidad/rbac.ts`.
- **Navegación real:** `gruposNavegacion()` y `landingOperacional()` en `lib/identidad/rbac.ts`
  (agrupación por proceso; visibilidad por entitlement de módulo y capacidad de rol).
- **Backend montado:** `artifacts/api-server/src/app.ts` monta identity, plataforma, attachments,
  platform-console y **13 routers de módulo** tras los guards `requireIdentityForModules` +
  `enforceEntitlements`.
- **Autoridad de seguridad:** backend (Kernel: permisos/capacidades por comando + RLS por tenant).
  Ocultar un botón **no** es seguridad (verificado: las guardas del frontend son de presentación y el
  backend responde 401/403).
- **Datos reales:** PostgreSQL schema `deltaops` (verificado en vivo): 40 tenants, 46 identidades/
  membresías (6 roles canónicos presentes), 36 activos, 24 órdenes, 5 solicitudes correctivas, 13
  ítems de inventario, 11 lecturas y 4 tanqueos de utilización, 31 definiciones de indicador, 9
  snapshots de analytics.

---

## 2. Entregable

Este archivo: `docs/dgp/DELTAOPS-LITE-06-AUDITORIA-FUNCIONAL-MAPA.md`. Único archivo creado.

---

## 3. Inventario completo de pantallas (`artifacts/deltaops/src`)

**Clasificación:** A. Operación principal · B. Consulta/Información · C. Administración ·
D. Configuración · E. Soporte/Técnica · F. Infraestructura/Plataforma · G. Legado o no prioritario ·
H. Auxiliar/Interna.

**Estados:** COMPLETA · FUNCIONAL PARCIAL · SOLO CONSULTA · INFRAESTRUCTURA · NO PRIORITARIA · GAP.

> Nota metodológica: el estado NO se dedujo del nombre del archivo, sino de si la pantalla consume una
> API real montada, si escribe datos y si su fuente de datos existe. Los `*-sincronizacion` son
> superficies de gestión de la cola offline por módulo (revisar/reintentar operaciones encoladas).

### 3.1 Autenticación e identidad (clase A/H)

| Ruta | Nombre | Archivo | Módulo | Rol/capacidad | Estado | Impacto mantenimiento |
|---|---|---|---|---|---|---|
| `/login` | Iniciar sesión | `login.tsx` | identidad | público | COMPLETA | Indirecto (puerta) |
| `/recuperar` | Recuperar contraseña | `recuperar.tsx` | identidad | público | COMPLETA | No |
| `/restablecer` | Restablecer contraseña | `restablecer.tsx` | identidad | token | COMPLETA | No |
| `/invitacion` | Aceptar invitación | `invitacion.tsx` | identidad | token | COMPLETA | No |
| `/perfil`, `/perfil/contrasena` | Mi perfil / cambio de clave | `perfil.tsx` | identidad | autenticado | COMPLETA | No |
| `/` | Inicio (dispatcher por rol) | `inicio.tsx` (+`inicio-empresa.tsx`, `console.tsx`) | identidad | autenticado | COMPLETA | Sí (aterrizaje) |

`inicio.tsx` enruta: SUPER_ADMIN → consola técnica global (`console.tsx`); resto → experiencia
empresarial (`inicio-empresa.tsx` dentro del AppShell). **Verificado.**

### 3.2 Operación principal — mantenimiento (clase A)

| Ruta | Nombre | Archivo | Módulo | Rol | Acciones principales | APIs (prefijo `/api/deltaops`) | Estado |
|---|---|---|---|---|---|---|---|
| `/activos/:id/preoperacional` | Preoperacional/Checklist | `activos-preoperacional.tsx` | preoperacional | operativo | Iniciar, responder, evidencia, finalizar, ver veredicto | `/activos/preoperacional/*`, forms | COMPLETA |
| `/ordenes` | Centro de Operaciones (bandejas) | `ordenes-operaciones.tsx` | ordenes | operativo | Filtrar, abrir OT, acciones rápidas | `/ordenes`, `/ordenes/agenda` | COMPLETA |
| `/ordenes/:id` | Ficha de OT (ejecución/cierre) | `ordenes-ficha.tsx` + `ordenes/tab-*` | ordenes | operativo/validador | Transicionar, sesión trabajo, checklist, evidencia, validar+cerrar | `/ordenes/:id/*` | COMPLETA |
| `/ordenes/nueva` | Crear OT | `ordenes-nueva.tsx` | ordenes | operativo | Crear OT | `POST /ordenes` | COMPLETA |
| `/ordenes/supervisor` | Supervisión / validación | `ordenes-supervisor.tsx` + `ordenes/panel-supervisor.tsx` | ordenes | supervisor+ | Aprobar/devolver cierre, asignar | `/ordenes/:id/aprobar-cierre`, `/asignar` | COMPLETA |
| `/ordenes/planificacion` | Planificación | `ordenes-planificacion.tsx` | ordenes | planificador+ | Planificar, recursos, SLA | `/ordenes/:id/planificar`,`/recursos`,`/sla` | COMPLETA |
| `/ordenes/escanear` | Escanear QR → OT | `ordenes-escanear.tsx` | ordenes | operativo | Escaneo QR | (deep-link) | FUNCIONAL PARCIAL* |
| `/correctivo/solicitudes` | Solicitudes correctivas | `correctivo-solicitudes.tsx` | correctivo | operativo | Listar, crear | `/correctivo/solicitudes` | COMPLETA |
| `/correctivo/solicitudes/nueva` | Nueva solicitud | `correctivo-solicitud-nueva.tsx` | correctivo | operativo | Crear solicitud | `POST /correctivo/solicitudes` | COMPLETA |
| `/correctivo/solicitudes/:id` | Ficha solicitud | `correctivo-solicitud-ficha.tsx` | correctivo | operativo | Transicionar, evidencia, comentario | `/correctivo/solicitudes/:id/*` | COMPLETA |
| `/correctivo/solicitudes/:id/diagnostico` | Diagnóstico | `correctivo-diagnostico.tsx` | correctivo | operativo | Registrar diagnóstico | `/solicitudes/:id/diagnostico` | COMPLETA |
| `/correctivo/intervenciones/:id` | Intervención | `correctivo-intervencion.tsx` | correctivo | operativo | Cuadrillas, reservar/consumir/devolver | `/intervenciones/:id/*` | COMPLETA |

\* `/ordenes/escanear` (y homólogos `activos/escanear`, `inventario/escanear`, etc.): dependen de
cámara/QR del dispositivo. Se marca **FUNCIONAL PARCIAL** porque el flujo de escaneo real de hardware
no pudo ejercitarse en esta auditoría (NO VERIFICADO a nivel de captura de cámara); la lógica de
navegación por código escaneado sí existe.

### 3.3 Equipos / Activos (clase A + B)

| Ruta | Nombre | Archivo | Estado | Notas |
|---|---|---|---|---|
| `/activos` | Listado de activos | `activos-listado.tsx` | COMPLETA | Búsqueda/filtros, entrada al ciclo |
| `/activos/nuevo` | Alta de activo (wizard) | `activos-nuevo.tsx` (+`lib/activos/alta.ts`) | FUNCIONAL PARCIAL | El form NO captura `centroCosto` (ver §6/§7) |
| `/activos/:id` | Ficha del activo | `activos-ficha.tsx` + `ficha/tab-*` (10 pestañas) | COMPLETA | Centro documental del activo |
| `/activos/arboles` | Árboles/jerarquías | `activos-arboles.tsx` | FUNCIONAL PARCIAL | Relaciones; uso operativo bajo |
| `/activos/escanear` | Escanear activo | `activos-escanear.tsx` | FUNCIONAL PARCIAL | Ver nota de escaneo |
| `/activos/sincronizacion` | Cola offline de activos | `activos-sincronizacion.tsx` | INFRAESTRUCTURA | Gestión de cola |

Pestañas de la ficha (`ficha/tab-*.tsx`): timeline, preoperacional, órdenes, correctivo, preventivo,
planes, relaciones, documentación, comentarios, históricos. **Todas SOLO CONSULTA** (agregan read
models de otros módulos por activo), salvo `tab-correctivo` que además permite registrar un evento de
activo (único consumidor real de `registrar-evento-activo`, relevante para §11).

### 3.4 Inventario y Abastecimiento (clase A/B)

| Ruta | Nombre | Archivo | Estado |
|---|---|---|---|
| `/inventario` | Listado ítems | `inventario-listado.tsx` | COMPLETA |
| `/inventario/nuevo` | Nuevo ítem | `inventario-nueva.tsx` | COMPLETA |
| `/inventario/:id` | Ficha ítem | `inventario-ficha.tsx` (+`inventario/tabs-item.tsx`) | COMPLETA |
| `/inventario/movimientos` | Movimientos (entrada/salida/ajuste) | `inventario-movimientos.tsx` | COMPLETA |
| `/inventario/transferencias` | Transferencias entre bodegas | `inventario-transferencias.tsx` | COMPLETA |
| `/inventario/conteos` | Conteos cíclicos | `inventario-conteos.tsx` | COMPLETA |
| `/inventario/bodegas` | Bodegas/ubicaciones | `inventario-bodegas.tsx` | COMPLETA |
| `/inventario/escanear` | Escanear ítem | `inventario-escanear.tsx` | FUNCIONAL PARCIAL |
| `/inventario/sincronizacion` | Cola offline | `inventario-sincronizacion.tsx` | INFRAESTRUCTURA |
| `/abastecimiento/articulos` (+`/:id`,`/nuevo`) | Artículos | `abastecimiento-articulo*.tsx` | COMPLETA |
| `/abastecimiento/proveedores` (+`/:id`,`/nuevo`) | Proveedores | `abastecimiento-proveedor*.tsx` | COMPLETA |
| `/abastecimiento/solicitudes` (+`/:id`,`/nueva`) | Solicitudes de compra | `abastecimiento-solicitud*.tsx` | COMPLETA |
| `/abastecimiento/ordenes-compra` (+`/:id`,`/nueva`) | Órdenes de compra | `abastecimiento-orden*.tsx` | COMPLETA |
| `/abastecimiento/escanear`,`/sincronizacion` | Escaneo/cola | — | FUNCIONAL PARCIAL / INFRAESTRUCTURA |

Inventario y Abastecimiento son **funcionalmente completos pero SECUNDARIOS** para el técnico de
campo de Delta (clase A técnica, prioridad de negocio baja/media; ver §16).

### 3.5 Preventivo y Planes (clase A/B — programación)

| Ruta | Nombre | Archivo | Estado |
|---|---|---|---|
| `/preventivo/programas` (+`/:id`,`/nuevo`,`/:id/actividad`) | Programas preventivos | `preventivo-programa*.tsx`,`preventivo-actividad.tsx` | COMPLETA |
| `/preventivo/calendario` | Calendario preventivo | `preventivo-calendario.tsx` | COMPLETA |
| `/preventivo/escanear`,`/sincronizacion` | Escaneo/cola | `preventivo-*.tsx` | FUNCIONAL PARCIAL / INFRAESTRUCTURA |
| `/planes` (+`/:id`,`/nuevo`,`/calendario`) | Planes de mantenimiento | `planes-*.tsx` | COMPLETA |
| `/planes/sincronizacion` | Cola offline | `planes-sincronizacion.tsx` | INFRAESTRUCTURA |

`preventivo-acciones.tsx` existe en `pages/` pero **no está ruteado en `App.tsx`** → componente
auxiliar/interno (clase H) reutilizado por otras pantallas, no una pantalla navegable por sí misma.

### 3.6 Utilización y Costos (clase B — datos económicos/operativos)

| Ruta | Nombre | Archivo | Estado |
|---|---|---|---|
| `/utilizacion/lecturas` (+`/nueva`) | Lecturas de medidor (horómetro/odómetro) | `utilizacion-lectura*.tsx` | COMPLETA |
| `/utilizacion/tanqueos` (+`/nuevo`) | Tanqueos (combustible) | `utilizacion-tanqueo*.tsx` | COMPLETA |
| `/utilizacion/resumen` | Resumen de utilización | `utilizacion-resumen.tsx` | SOLO CONSULTA |
| `/costos` | Costos de mantenimiento (comparativa/tendencia) | `costos.tsx` | SOLO CONSULTA |

Utilización tiene datos reales (11 lecturas, 4 tanqueos) y **es la fuente real de horómetro/odómetro/
combustible** que alimenta costo/hora y costo/km. `manodeobra` es módulo **backend sin pantalla
propia** (alimenta Costos).

### 3.7 Analytics / BI (clase B)

| Ruta | Nombre | Archivo | Estado |
|---|---|---|---|
| `/analytics` | Home de Analytics (8 dashboards) | `analytics-home.tsx` | SOLO CONSULTA |
| `/analytics/indicadores` (+`/:clave`) | Catálogo/detalle de indicadores | `analytics-indicadores.tsx`,`analytics-indicador.tsx` | SOLO CONSULTA / FUNCIONAL PARCIAL |
| `/analytics/dashboards/nuevo`,`/:id`,`/:id/editar` | Dashboards personalizados + editor | `analytics-dashboard*.tsx` | FUNCIONAL PARCIAL |
| `/analytics/sincronizacion` | Cola offline | `analytics-sincronizacion.tsx` | INFRAESTRUCTURA |

**FUNCIONALIDAD PARCIAL** a nivel de KPI de confiabilidad: la pantalla y el motor existen, pero
MTTR/MTBF/Disponibilidad dependen de insumos capturados manualmente que hoy están en su mayoría
vacíos (ver §11). Los indicadores económicos y los conteos de OT sí tienen fuente real.

### 3.8 Administración de empresa (clase C)

| Ruta | Nombre | Archivo | Rol | Estado |
|---|---|---|---|---|
| `/administracion/usuarios` | Usuarios de la empresa | `administracion-usuarios.tsx` | TENANT_ADMIN+ | COMPLETA |
| `/administracion/configuracion` | Configuración/branding/módulos | `administracion-configuracion.tsx` | TENANT_ADMIN+ | COMPLETA |
| `/administracion/saas` | Administración SaaS (empresas) | `administracion-saas.tsx` | SUPER_ADMIN | COMPLETA |
| `/centro` | Centro de mantenimiento (consola operativa) | `centro-mantenimiento.tsx` | admin/supervisor/consulta | SOLO CONSULTA |

`administracion-usuarios.tsx` es la única superficie donde se **asigna el rol canónico** de un usuario
(POST/PATCH `/users`). El backend exige `requireTenantAdmin` (verificado en `identity.ts`).

### 3.9 Configuración y catálogos (clase D)

- `/referencia` (+`/:id`) — `referencia.tsx`,`referencia-detalle.tsx`: módulo neutro de «Elemento de
  Referencia» (DGP-004), listado/creación/dashboard/consola. **COMPLETA** pero **NO PRIORITARIA** para
  la operación de Delta (es un módulo genérico de plataforma, más demostrativo que de negocio).
- La configuración de catálogos por módulo (orígenes de solicitud, criticidades, tipos) se realiza vía
  endpoints `catalogos/*` de cada módulo, no en una pantalla dedicada de catálogos.

### 3.10 Soporte / Técnica y Plataforma (clase E/F) — SUPER_ADMIN

| Ruta | Nombre | Archivo | Guard | Estado |
|---|---|---|---|---|
| `/plataforma` | Consola técnica de plataforma (salud/servicios/colas/auditoría) | `plataforma.tsx` | `SoloSuperAdmin` | INFRAESTRUCTURA |
| `/motores` | Galería de motores (workflow/forms) | `motores.tsx` | `SoloSuperAdmin` | INFRAESTRUCTURA (documental) |
| `/motores/playground` | Playground de motores | `motores-playground.tsx` | `SoloSuperAdmin` | INFRAESTRUCTURA |
| `/consola-activos` | Consola técnica del módulo Activos (RLS/proyecciones) | `consola-activos.tsx` | `SoloSuperAdmin` | INFRAESTRUCTURA |
| `/design-system` | Galería viva del Design System | `design-system.tsx` | (sin guard de ruta) | E — SOPORTE/TÉCNICA |

`/design-system` está ruteada sin `SoloSuperAdmin` y no aparece en la navegación; es superficie de
soporte/desarrollo (clase E). **Debe ocultarse del usuario operativo** (§15).

### 3.11 Auxiliar / Interna (clase H)

- `not-found.tsx` (404), y componentes-página reutilizados no ruteados como pantalla: `ficha/tab-*`,
  `ordenes/tab-*`, `ordenes/panel-supervisor.tsx`, `inventario/tabs-item.tsx`,
  `abastecimiento/tab-*.tsx`, `preventivo-acciones.tsx`, `inicio-empresa.tsx`, `console.tsx`.

### 3.12 Síntesis por clase

- **A. Operación principal:** Preoperacional, Órdenes (5 pantallas), Correctivo (5), Activos (listado/
  ficha/alta). Núcleo del negocio.
- **B. Consulta/Información:** fichas y pestañas, Utilización, Costos, Analytics, Centro.
- **C. Administración:** usuarios, configuración, SaaS.
- **D. Configuración:** Referencia, catálogos por módulo.
- **E. Soporte/Técnica:** Design System.
- **F. Infraestructura/Plataforma:** Plataforma, Motores (+playground), Consola de Activos, todas las
  `*-sincronizacion`.
- **G. Legado/No prioritario:** Referencia (genérico), Árboles de activos, Abastecimiento completo,
  Analytics avanzado (editor de dashboards) para el perfil operativo de Delta.
- **H. Auxiliar/Interna:** 404 y componentes-página reutilizados.

---

## 4. Mapa de módulos

Módulos de negocio reales (según `identity/entitlements.ts::MODULOS_CONOCIDOS` y routers montados):
`referencia, activos, ordenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics,
utilizacion, manodeobra, costos`. Además: **preoperacional** y **hallazgo** son superficies de
COMPOSICIÓN (runtimes que orquestan Forms + Activos + Correctivo; no son módulos de dominio propios) e
**identidad/plataforma** como base transversal.

| Módulo | Problema que resuelve | Quién lo usa | Necesita | Genera | Alimenta a | Alimentado por | Importancia | Estado |
|---|---|---|---|---|---|---|---|---|
| Identidad/Tenancy | Login, roles, empresas, membresías | Todos / Admins | Credenciales, membresía | Sesión, auditoría | Todos | — | CORE | VERIFICADO |
| Activos | Registro y ficha del equipo (centro del sistema) | Todos | Datos del equipo, ubicación | Activo, historial, relaciones | Preop, Órdenes, Correctivo, Analytics, Costos | Alta manual | CORE | VERIFICADO |
| Preoperacional (comp.) | Checklist previo al uso; veredicto APTO/… | Operador/Técnico | Activo, plantilla de forms | Ejecución sellada, veredicto, incumplimientos | Hallazgo | Forms, Activos | CORE | VERIFICADO |
| Hallazgo (comp.) | Convertir incumplimiento en mantenimiento | Operador/Supervisor | Ejecución preop, ítem | Solicitud correctiva + OT | Correctivo, Órdenes | Preoperacional | CORE | VERIFICADO |
| Correctivo | Ciclo solicitud→triage→diagnóstico→aprobación→OT; intervenciones | Supervisor/Técnico | Solicitud, activo | Solicitud, intervención, evento-activo, OT | Órdenes, Analytics (eventos-activo) | Hallazgo, alta manual | CORE | VERIFICADO |
| Órdenes | Ejecución del mantenimiento (ciclo de vida de la OT) | Planificador/Técnico/Supervisor | OT, asignación, plantilla | Estados, sesiones de trabajo, evidencias, tiempos, cierre | Historial, Costos, Analytics | Correctivo, Preventivo, Planes, alta manual | CORE | VERIFICADO |
| Preventivo | Programas y actividades preventivas | Planificador | Programa, activo, frecuencia | Generaciones/actividades → OT | Órdenes | Activos | IMPORTANTE | VERIFICADO |
| Planes | Planes/calendario de mantenimiento | Planificador | Plan, calendario | Generaciones → OT | Órdenes | Activos | SECUNDARIO | VERIFICADO |
| Inventario | Existencias, movimientos, bodegas, conteos, series/lotes | Técnico/Almacén | Ítems, bodegas | Movimientos, existencias, reservas | Costos (consumos), Órdenes | Abastecimiento (recepción) | IMPORTANTE (técnico) | VERIFICADO |
| Abastecimiento | Compras: artículos, proveedores, solicitudes, OC, recepción | Almacén/Admin | Proveedores, artículos | Solicitudes, OC, recepciones → inventario | Inventario | Inventario | SECUNDARIO | VERIFICADO |
| Utilización | Lecturas de medidor y tanqueos | Operador/Técnico | Activo, medidor | Lecturas horómetro/odómetro, litros | Costos, Analytics | Activos | IMPORTANTE (BI) | VERIFICADO |
| Mano de obra | Recursos, tarifas, valoraciones de trabajo | Backend/Costos | Recursos, tarifas | Valoraciones de mano de obra | Costos | Órdenes (sesiones) | TÉCNICO | VERIFICADO (sin UI propia) |
| Costos | Composición de costo por activo/OT (mano de obra + repuestos + medidores) | Supervisor/Admin | Órdenes, inventario, utilización, mano de obra | Hechos de costo, costo/hora, costo/km | Analytics | Órdenes, Inventario, Utilización, Mano de obra | IMPORTANTE | VERIFICADO (fuente parcial) |
| Analytics | Indicadores/KPIs y dashboards | Supervisor/Admin/Consulta | Datasets de módulos | Definiciones, snapshots, dashboards | Dirección/BI | Todos (datasets) | IMPORTANTE | FUNCIONAL PARCIAL (fuente KPI parcial) |
| Referencia | Módulo neutro de catálogo (demostrativo de plataforma) | Admin | — | Elementos de referencia | — | — | NO PRIORITARIO PARA DELTAOPS LITE | VERIFICADO |
| Plataforma/Consolas | Diagnóstico técnico (salud, motores, RLS) | SUPER_ADMIN | — | — | — | — | TÉCNICO | INFRAESTRUCTURA |

---

## 5. Proceso completo de mantenimiento (reconstruido del código)

Cadena real: **Activo → Preoperacional → Checklist → Veredicto → Hallazgo → Decisión → (Correctivo) →
OT → Asignación → Ejecución → Validación → Cierre → Historial → Indicadores.**

| Etapa | Pantalla que inicia | Usuario | Datos generados | API/Comando | Entidad creada/modificada | Condición para avanzar | Condición que bloquea | Evidencia que queda | Pasa a la siguiente etapa |
|---|---|---|---|---|---|---|---|---|---|
| Equipo | `/activos/nuevo` → `/activos/:id` | Admin/Supervisor | Activo | `POST /activos` (`modulo.activos.crear`) | `act_activos` (+read) | Activo existe y ACTIVO | — | Evento de creación (`act_eventos`) | activoId |
| Preoperacional | `/activos/:id/preoperacional` | Operador/Técnico | Ejecución (borrador→sellada) | `preoperacional/registrar` | `platform_records` (recordType `preoperacional-ejecucion`) | Plantilla ACTIVA resuelta | Sin plantilla / activo inexistente | Respuesta de forms + registro sellado | ejecucionId, respuestas |
| Checklist | (misma pantalla) | Operador/Técnico | Respuestas por ítem + evidencias | Forms `respuesta.*` | respuesta de forms | Responder ítems requeridos | Ítem crítico sin responder | Respuestas + adjuntos | ítems no conformes |
| Veredicto | (servidor, al sellar) | (automático) | APTO / APTO_CON_OBSERVACIONES / NO_APTO | (cálculo server, sellado) | registro de ejecución | Sellado exitoso | — | Veredicto anclado a versión de plantilla | incumplimientos |
| Hallazgo | `/activos/:id/preoperacional` (resultado) | Operador/Supervisor | Hallazgo por ítem no conforme | `hallazgo/estado`,`/resumen` | (derivado; id determinista del par ejecución+ítem) | Ítem con incumplimiento | — | Estado del hallazgo (abierto/convertido/descartado) | hallazgoId, procedencia |
| Decisión | (resultado del preop) | Operador/Supervisor | Generar / Descartar / Reabrir | `POST hallazgo/generar` \| `/descartar` \| `/reabrir` | reserva/estado de conversión | `puedeEscribir` (write) | Hallazgo ya convertido (no descartable) / descartado (no generable) | Registro de descarte o conversión | solicitudId + ordenTrabajoId |
| (Correctivo) | (interno a `generar`) | (servicio) | Solicitud correctiva + cadena de estados | `correctivo.crear-solicitud` + `transicionar` (registro→triage→diagnóstico→validación→aprobada) + `generar-orden-correctiva` | `cor_solicitudes`,`cor_generaciones`,`cor_eventos_activo` | Solicitud aprobada | Falla de validación de catálogo/criticidad | Solicitud + evento-activo + OT | ordenTrabajoId |
| OT (creación) | `/ordenes/nueva` o materializada | Planificador/servicio | Orden de trabajo (BORRADOR→ABIERTA) | `POST /ordenes` (`modulo.ordenes.crear`) | `ord_ordenes` (+read) | Datos válidos + activo | — | Evento de creación | OT en ABIERTA |
| Asignación | `/ordenes/planificacion`, `/ordenes/supervisor`, ficha | Planificador/Supervisor | Asignación de responsable/recursos/SLA | `/:id/asignar`,`/asignar-recurso-humano`,`/recursos`,`/sla`,`/planificar` | `ord_asignaciones`,`ord_recursos`,`ord_sla`,`ord_planificacion` | Transición PLANIFICADA→ASIGNADA | Permiso/estado inválido | Registros de asignación | OT en ASIGNADA |
| Ejecución | `/ordenes/:id` (tab ejecución) | Técnico | Sesión de trabajo, tramos, tiempos, evidencias, checklist | `/:id/transicionar(iniciar)`,`/:id/sesion/*`,`/:id/ejecucion`,`/:id/evidencias`,`/:id/checklist` | `ord_sesiones`,`ord_sesion_tramos`, evidencias/adjuntos | Estar asignado (o excepción supervisor §6) | No asignado sin capacidad → 403 negocio | Sesiones + tramos + evidencias | OT en EN_EJECUCION |
| Validación | `/ordenes/:id` / `/ordenes/supervisor` | Supervisor/Admin (validador) | Solicitud de cierre (gate `validacionCierre`) | `/:id/transicionar(enviarValidacion)` luego `/:id/transicionar(cerrar)` (abre gate) | instancia de workflow | Ejecución completa | — | Aprobación pendiente registrada | OT en EN_VALIDACION |
| Cierre | `/ordenes/:id` / `/ordenes/supervisor` | Validador (≠ solicitante) | Decisión de cierre | `/:id/aprobar-cierre {decision:"aprobar"|"rechazar"}` | estado final CERRADA (o vuelta a ejecución) | Gate abierto + aprobador ≠ solicitante | Auto-aprobación prohibida / gate no abierto (409) | Registro de aprobación | OT CERRADA |
| Historial | ficha del activo / `/ordenes` bandeja cerradas | Todos | — (consulta) | `/ordenes/:id/historial`,`ficha/tab-historicos` | read models/históricos | — | — | Historial consolidado | datos a Analytics |
| Indicadores | `/analytics`,`/costos` | Supervisor/Admin | — (consulta) | datasets de analytics/costos | snapshots | Datos suficientes | Insumos KPI ausentes (MTTR/MTBF) | KPIs presentados | — |

### 5.1 Divergencias reales respecto al modelo ideal (documentadas, no corregidas)

1. **El cierre exige DOS pasos** (`transicionar(cerrar)` que abre el gate `validacionCierre`, luego
   `aprobar-cierre`), no uno. (Corregido a nivel de frontend en LITE-05; el contrato del backend es de
   dos pasos por diseño.)
2. **Preoperacional no vive en tablas dedicadas** sino en el Record Store genérico
   (`platform_records`, recordType `preoperacional-ejecucion`). No hay `pre_*` en la BD (verificado).
3. **Hallazgo no es una entidad materializada propia:** su estado se deriva (id determinista del par
   ejecución+ítem) y su «resumen» está **acotado a 200 ejecuciones inspeccionadas**
   (`RESUMEN_MAX_EJECUCIONES = 200`). Con muchas ejecuciones, el resumen puede no cubrir todo.
4. **El paso por Correctivo es automático dentro de `hallazgo/generar`** con un contexto de servicio de
   rol fijo (`"operador"`/`"admin"`), no con el rol canónico del usuario (ver §8/§19).
5. **El prefill Hallazgo→Correctivo no mapea completamente las evidencias:** las evidencias del ítem
   preoperacional se referencian como fotos genéricas; no hay un mapeo estructurado completo de todos
   los tipos de evidencia (deuda conocida, confirmada por lectura del `generar`).
6. **La materialización de la OT desde Correctivo** usa `contextForOrdenes(actorId,"admin",tenant)`
   (rol de servicio), preservando el actor real pero no su rol canónico.

---

## 6. El activo como centro del sistema

**Fuente de verdad (columnas + `datos` jsonb en `act_activos`, verificado en BD):** `id`,
`codigoEmpresarial`, `nombre`, `estado`, `tipo`, `criticidad`, `ubicacionId`, y dentro de `datos`:
`categoria`, `familia`, `subfamilia`, `descripcion`, `fabricante`, `modelo`, `serie`, `anio`,
`vidaUtil`, `prioridad`, `responsable`, `supervisor`, `proveedor`, `fechaCompra`,
`fechaPuestaServicio`, `garantia`, `observaciones`, `valorAdquisicion`, `valorResidual`, `moneda`,
`horometro`, `odometro`, `identificacion`, `especificaciones`, **`centroCosto`** (presente como clave
en los 36 activos, **pero con valor vacío**), `proyecto` (también vacío), `empresa`.

**Relaciones e historial (fuente de verdad, tablas propias):** `act_relaciones` (jerarquías/vínculos),
`act_ubicaciones_hist` (historial de ubicación), `act_responsables_hist` (historial de responsable),
`act_eventos` (event log), `act_historial`.

**Dato DERIVADO / histórico / de consulta (proyecciones desde otros módulos, agregadas en la ficha):**

| Información | Fuente real | Naturaleza |
|---|---|---|
| Preoperacionales del activo | `platform_records` (preop) | DERIVADO (consulta) |
| Órdenes del activo | `ord_ordenes_read` | DERIVADO |
| Correctivos/eventos del activo | `cor_solicitudes_read`,`cor_eventos_activo_read` | DERIVADO |
| Preventivos del activo | `prv_*_read` | DERIVADO |
| Planes del activo | `pln_*_read` | DERIVADO |
| Evidencias/documentos | adjuntos de plataforma | DERIVADO |
| Utilización (horómetro/odómetro/combustible) | `utl_lecturas_read`,`utl_tanqueos_read` | FUENTE DE VERDAD (de utilización), DERIVADO en la ficha |
| Costos / mano de obra | `cos_hechos`, `mdo_*` | DERIVADO (composición) |
| Timeline | agregación de eventos | DERIVADO |

**Hallazgo de §6:** el activo es correctamente el centro (todo cuelga de `activoId`), pero **campos de
segmentación clave para Delta (`centroCosto`, `proyecto`) existen en el modelo y están vacíos en los
datos, y no se capturan en el alta** (`lib/activos/alta.ts` no incluye `centroCosto`). **FUNCIONALIDAD
PARCIAL.**

---

## 7. Multicentro de costos (condición de Dirección)

**Qué existe hoy (verificado):**

- **Tenant (empresa):** dimensión de aislamiento REAL y robusta. RLS forzado por
  `tenant_id = current_setting('app.tenant_id')` en 166 tablas (DGP-023.5). 40 tenants en BD. La
  segregación por empresa es sólida.
- **Ubicación:** `act_activos.ubicacionId` + `act_ubicaciones_hist` + catálogo de ubicaciones de
  inventario (`inv_ubicaciones`). En los datos actuales hay **una sola ubicación** distinta en activos.
- **Responsable / supervisor del activo:** en `datos` + `act_responsables_hist`. La OT tiene
  asignación de responsable (`ord_asignaciones`), que es hoy el mecanismo más cercano a segregación
  operativa por persona.
- **`centroCosto`:** existe como campo en el dominio de Activos y de Órdenes, **sin valor real, sin
  captura y sin uso en filtros/segregación**.

**Cómo está soportada cada capacidad multicentro:**

| Capacidad | Soporte actual | Estado |
|---|---|---|
| Tenant (empresa) | RLS forzado, membresías por tenant, switch-tenant | VERIFICADO |
| Centro de costos | Campo `centroCosto` en dominio; sin datos/captura/segregación | GAP |
| Ubicación | `ubicacionId` + historial; poco poblado | FUNCIONAL PARCIAL |
| Responsable / equipo de mantenimiento | Responsable/supervisor por activo y asignación por OT; no hay «equipo/grupo» como entidad de primer nivel | FUNCIONAL PARCIAL |
| Asignación | `ord_asignaciones` por OT y por recurso humano | VERIFICADO |
| Aprobación | Gate de workflow por capacidad (`validar-ordenes`), no por centro | VERIFICADO (no segmentado por centro) |
| Ejecución | Sesión de trabajo atribuida a identidad; verificación de asignación (§6) con excepción supervisor/admin | VERIFICADO |
| Validación / Cierre | Gate `validacionCierre`, aprobador ≠ solicitante | VERIFICADO |

**GAP central de §7 (para el escenario de equipos distribuidos y Barranquilla sin coordinador):** hoy
la jerarquía Coordinador→Supervisor→Técnico **no es universal ni obligatoria** (bien: depende de roles/
capacidades), pero **no existe una dimensión operativa de «centro de costos / sede» que filtre bandejas,
asignaciones e indicadores.** La segregación real disponible es empresa + responsable de OT. Cerrar el
multicentro (poblar `centroCosto`, capturarlo, y filtrar por él) es trabajo de una fase futura.

---

## 8. Matriz de roles (6 roles)

**Autoridad real (backend):** dos capas. (1) `enforceEntitlements` + `requireIdentityForModules`
(módulo contratado + sesión válida). (2) Permisos/capacidades por comando del Kernel, derivados por el
mapa rol→permisos de cada módulo. **Colapso importante:** los 6 roles canónicos se mapean a **3 roles
legacy** para los módulos (`identity/rbac.ts`):

| Rol canónico | Rol legacy de módulo | Admin empresa | Consola global |
|---|---|---|---|
| SUPER_ADMIN | admin | Sí | Sí |
| TENANT_ADMIN | admin | Sí | No |
| SUPERVISOR | operador | No | No |
| PLANIFICADOR | operador | No | No |
| TECNICO | operador | No | No |
| CONSULTA | lector | No | No |

Consecuencia: en la mayoría de módulos **SUPERVISOR = PLANIFICADOR = TECNICO** a nivel de permiso de
escritura. Sólo **Órdenes** (y **Utilización**) refinan por rol canónico: en Órdenes,
TENANT_ADMIN/SUPER_ADMIN/SUPERVISOR reciben capacidad `validar-ordenes` (y se presentan como
`rol:"validador"` ante el gate de cierre), mientras PLANIFICADOR/TECNICO operan pero **no** validan ni
omiten la verificación de asignación al abrir sesión (§6). (Verificado en `ordenes-runtime.ts`.)

### 8.1 Matriz por capacidad (backend)

| Capacidad | SUPER_ADMIN | TENANT_ADMIN | SUPERVISOR | PLANIFICADOR | TECNICO | CONSULTA |
|---|---|---|---|---|---|---|
| Consultar (read) | ✓ todo | ✓ | ✓ | ✓ | ✓ | ✓ (solo lectura) |
| Crear (activos/OT/solicitudes/inventario…) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Modificar/editar | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Ejecutar OT (sesión de trabajo) | ✓ | ✓ | ✓ | ✓ (si asignado) | ✓ (si asignado) | ✗ |
| Asignar / planificar | ✓ | ✓ | ✓ | ✓ | ✗* | ✗ |
| Validar / aprobar cierre | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Cerrar OT (aprobar-cierre) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Omitir verificación de asignación (§6) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Administrar empresa (usuarios/config/branding/módulos) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Administrar SaaS (empresas/plataforma) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

\* PLANIFICADOR/TECNICO comparten el bucket `operador`; la distinción «TECNICO no planifica» es de
**presentación** (landing/navegación) y de la excepción §6, no un permiso de módulo diferenciado fuera
de Órdenes. **No confiar en ocultar botones como control de acceso.**

### 8.2 Visibilidad frontend (presentación) vs autorización backend

- **Visibilidad:** `gruposNavegacion()` (por entitlement de módulo + capacidad admin) y
  `landingOperacional()` (aterrizaje por rol). Guardas `SoloSuperAdmin` para superficies de
  infraestructura. Todo esto es **presentación**: evita aterrizajes indebidos, no autoriza.
- **Autorización:** siempre el backend (permisos por comando + RLS). Verificado que las superficies de
  administración devuelven 403 a roles no-admin (documentado en `GuardaRuta.tsx` y `identity.ts`).
- **Riesgo documentado:** como 3 de los 6 roles colapsan a `operador`, **ocultar en la UI** la
  planificación al TECNICO no impide que, por permiso de módulo, un TECNICO ejecute comandos de
  escritura equivalentes a PLANIFICADOR en módulos distintos de Órdenes. Es una brecha de
  **granularidad de permisos**, no de aislamiento entre empresas.

### 8.3 Equivalencias conceptuales (sin crear roles nuevos)

| Concepto de Delta | Rol canónico equivalente | Notas |
|---|---|---|
| Operador (usa el equipo, hace preoperacional) | **TECNICO** (o CONSULTA si solo mira) | El «operador» de planta encaja en TECNICO |
| Técnico (ejecuta el mantenimiento) | **TECNICO** | Ejecuta OT asignadas |
| Supervisor | **SUPERVISOR** | Valida/cierra, asigna, omite verificación §6 |
| Responsable de mantenimiento (coordinador) | **SUPERVISOR** o **TENANT_ADMIN** | En centros sin coordinador, SUPERVISOR asume validación |
| Administrador de empresa | **TENANT_ADMIN** | Usuarios/config/branding/módulos |
| (Administración de la plataforma SaaS) | **SUPER_ADMIN** | No es rol de Delta operativo |

---

## 9. Mapa de botones y acciones (pantallas CORE)

Cada acción indica: qué hace · endpoint (`/api/deltaops`) · registro que crea/modifica · permiso ·
qué pasa si falla · resultado para el usuario. (Rutas verificadas en los `*-module.ts`.)

### 9.1 Activos

| Acción | Endpoint | Registro | Permiso | Si falla | Resultado |
|---|---|---|---|---|---|
| Nuevo activo | `POST /activos` (`modulo.activos.crear`) | `act_activos` | crear (no-lector) | 400 validación / 403 | Activo creado, redirige a ficha |
| Ver / Historial | `GET /activos/:id`, tabs read models | read models | read | 404/empty | Ficha con pestañas |
| Editar | `PUT /activos/:id` | `act_activos` | write | 400/403/409 versión | Activo actualizado |
| Preoperacional | navega a `/activos/:id/preoperacional` | (ver 9.2) | — | — | Abre checklist |
| Escanear | deep-link por código | — | — | NO VERIFICADO (cámara) | Navega al activo |

### 9.2 Preoperacional

| Acción | Endpoint | Registro | Permiso | Si falla | Resultado |
|---|---|---|---|---|---|
| Iniciar / Responder | Forms `respuesta.write` (borrador) | respuesta de forms | write preop | 400/403 | Borrador guardado (offline-capaz) |
| Evidencia | adjuntos de plataforma | adjunto | attachment.write | 400/403 | Foto adjunta |
| Finalizar | `POST /activos/preoperacional/registrar` | `platform_records` (ejecución sellada) | write preop | 400/403 | Veredicto sellado |
| Ver resultado / hallazgo | `GET hallazgo/estado`,`/resumen` | (derivado) | read | empty | Muestra veredicto e incumplimientos |

### 9.3 Hallazgo

| Acción | Endpoint | Registro | Permiso | Si falla | Resultado |
|---|---|---|---|---|---|
| Generar mantenimiento | `POST hallazgo/generar` | solicitud correctiva + OT | write | 409 (ya convertido/descartado) | OT creada; estado «convertido» |
| No requiere mantenimiento (descartar) | `POST hallazgo/descartar` | registro de descarte | write | 409 (ya con OT) | Hallazgo descartado |
| Reabrir | `POST hallazgo/reabrir` | reapertura | write | 400 | Hallazgo reabierto |
| Ver OT | navega a `/ordenes/:id` | — | read | — | Abre la OT |

### 9.4 Órdenes

| Acción | Endpoint | Registro | Permiso | Si falla | Resultado |
|---|---|---|---|---|---|
| Crear | `POST /ordenes` | `ord_ordenes` | operar | 400/403 | OT en BORRADOR/ABIERTA |
| Planificar | `POST /ordenes/:id/planificar` | `ord_planificacion` | operar | 409 estado | OT PLANIFICADA |
| Asignar | `POST /ordenes/:id/asignar`,`/asignar-recurso-humano`,`/recursos` | `ord_asignaciones`,`ord_recursos` | operar | 403/409 | OT ASIGNADA |
| SLA | `POST /ordenes/:id/sla` | `ord_sla` | operar | 400 | SLA fijado |
| Iniciar/Ejecutar | `POST /ordenes/:id/transicionar {iniciar}` + `/sesion/*` | `ord_sesiones`,`ord_sesion_tramos` | operar; asignado o supervisor (§6) | 403 negocio si no asignado | OT EN_EJECUCION, sesión abierta |
| Registrar trabajo/tiempo | `/ordenes/:id/sesion/*` (tramos) | `ord_sesion_tramos` | operar | 400 | Tiempos registrados |
| Registrar evidencia | `POST /ordenes/:id/evidencias`,`/documentacion` | adjuntos | attachment.write | 400 | Evidencia adjunta |
| Checklist/formulario | `POST /ordenes/:id/checklist`,`/formulario`,`/:clase/respuesta` | forms | write forms | 400 | Respuesta anclada |
| Enviar a validación | `POST /ordenes/:id/transicionar {enviarValidacion}` | instancia workflow | operar | 409 estado | OT EN_VALIDACION |
| Validar (abrir gate) | `POST /ordenes/:id/transicionar {cerrar}` | gate `validacionCierre` | validar (SUPERVISOR/ADMIN) | 409 estado | Gate abierto (OT sigue EN_VALIDACION) |
| Cerrar | `POST /ordenes/:id/aprobar-cierre {decision}` | estado CERRADA | validar; aprobador ≠ solicitante | 409 (gate no abierto/auto-aprobación) | OT CERRADA (o devuelta) |

### 9.5 Inventario

| Acción | Endpoint/comando | Registro | Permiso | Resultado |
|---|---|---|---|---|
| Consultar | `GET /inventario`,`/:id` | read models | read | Listado/ficha |
| Movimiento (entrada/salida/ajuste) | `mover`,`ajustar` | `inv_movimientos`,`inv_ajustes`,`inv_existencias` | write | Existencias actualizadas |
| Transferencia | `transferir`,`transicionar-transferencia` | `inv_transferencias` | write | Transferencia entre bodegas |
| Reserva | `reservar`,`liberar-reserva` | `inv_reservas` | write | Stock reservado/liberado |
| Conteo | `iniciar-conteo`,`registrar-conteo`,`cerrar-conteo` | `inv_conteos` | write | Conteo cíclico |
| Series/Lotes/Bodegas/Ubicaciones | `registrar-serie`,`crear-lote`,`crear-bodega`,`crear-ubicacion` | tablas homónimas | write | Entidad creada |

Todas las acciones de Órdenes/Inventario/Preoperacional pasan por la **cola offline** (idempotencia por
`opId`; encolan al fallar la red). Ver §13.

---

## 10. Datos generados por la operación y dónde se almacenan

| Proceso | Dato generado | Almacenamiento (schema `deltaops`) |
|---|---|---|
| Preoperacional | respuestas, veredicto, incumplimientos, evidencias, usuario, fecha, activo | `platform_records` (recordType `preoperacional-ejecucion`) + respuestas de Forms + adjuntos |
| Hallazgo | estado (abierto/convertido/descartado), procedencia, OT vinculada, usuario, fechas | Derivado (id determinista) + `cor_solicitudes` (al convertir) |
| Correctivo | solicitud, síntomas, criticidad, diagnóstico, intervención, consumos, evento-activo | `cor_solicitudes(_read)`,`cor_diagnosticos`,`cor_intervenciones(_read)`,`cor_consumos_read`,`cor_eventos_activo(_read)`,`cor_generaciones` |
| OT | activo, solicitante, asignación, planificación, sesiones/tramos (tiempos), recursos, SLA, evidencias, estado, cierre | `ord_ordenes(_read)`,`ord_asignaciones`,`ord_planificacion`,`ord_sesiones`,`ord_sesion_tramos`,`ord_recursos`,`ord_sla`,`ord_documentacion_read`,`ord_bitacora_read`,`ord_historial_read` |
| Inventario | ítems, existencias, movimientos, reservas, transferencias, conteos, lotes, series, bodegas | `inv_*` (con `_read`) |
| Abastecimiento | artículos, proveedores, solicitudes, OC, cotizaciones, recepciones | `abs_*` (con `_read`) |
| Utilización | lecturas de horómetro/odómetro, tanqueos (litros/combustible) | `utl_lecturas(_read)`,`utl_tanqueos(_read)` |
| Mano de obra | recursos, tarifas, valoraciones | `mdo_recursos`,`mdo_tarifas`,`mdo_valoraciones` |
| Costos | hechos de costo por activo/OT | `cos_hechos`,`cos_eventos`,`cos_pendientes_material` |
| Analytics | definiciones de indicador, snapshots, dashboards | `an_definiciones(_read)`,`an_snapshots(_read)`,`an_dashboards(_read)` |
| Identidad | identidades, membresías, roles, invitaciones, resets | `idn_identities`,`idn_memberships`,`idn_roles`,`idn_invitations`,`idn_password_resets` |
| Auditoría / Idempotencia | eventos de dominio, outbox, recibos por `opId`, auditoría | `*_eventos`,`kernel_outbox`,`kernel_dead_letter`,`*_recibos`,`*_sync_receipts`,`platform_audit` |
| Notificaciones | correos salientes | `ntf_email_outbox`,`ntf_email_templates` |

**Patrón general (verificado):** cada módulo es event-sourced: tabla de agregado + `*_eventos` +
proyección `*_read` (materializada por el outbox). Idempotencia por `opId` en `*_recibos`/
`*_sync_receipts`. Todo es tenant-scoped con RLS.

---

## 11. Información para BI / Analytics

**Catálogo canónico de indicadores (`lib/module-analytics/src/domain/catalogo-indicadores.ts`,
verificado):** `disponibilidad`, `utilizacion`, `confiabilidad`, `mtbf`, `mttr`,
`tiempo-promedio-atencion`, `tiempo-promedio-ejecucion`, `tiempo-promedio-cierre`, `ot-abiertas`,
`ot-vencidas`, `ot-criticas`, y más (31 definiciones en BD). Existe un **motor de expresiones** que los
calcula genéricamente y datasets por módulo (`disponibilidad`, `utilizacion`, `movimientos`,
`indicadores`, `eventos-activo`, `solicitudes`, `ordenes`).

**Clasificación de las fuentes (honesta):**

| Clase | Indicador/dato | Fuente real | Veredicto |
|---|---|---|---|
| **A. Ya existen** | Conteos de OT (abiertas/vencidas/críticas), estados | `ord_ordenes_read` | VERIFICADO |
| **A. Ya existen** | Utilización (horómetro/odómetro), consumo de combustible | `utl_lecturas_read`,`utl_tanqueos_read` | VERIFICADO |
| **A. Ya existen** | Costo/hora, costo/km, costos por activo | `cos_hechos`+utilización+mano de obra | VERIFICADO (con datos) |
| **A. Ya existen** | Movimientos de inventario / repuestos consumidos | `inv_movimientos_read`,`cor_consumos_read` | VERIFICADO |
| **B. Agregables directamente** | Tiempo de ejecución / de cierre de OT | marcas de tiempo de `ord_sesiones`/estados | AGREGABLE (dataset `ordenes` los expone) |
| **B. Agregables directamente** | Nº de preoperacionales, nº de hallazgos, tasa de conformidad | `platform_records` (preop) + estado de hallazgo | AGREGABLE (requiere dataset; hoy resumen acotado a 200) |
| **C. Requieren transformación** | Frecuencia de fallas, reincidencias, confiabilidad | `cor_eventos_activo_read` (tipo `falla`) | PARCIAL: existen eventos pero el marcado de falla depende de captura |
| **D. Todavía no existen (fuente insuficiente)** | **MTTR, MTBF, Disponibilidad, tiempo de parada** | `cor_eventos_activo_read.insumosKpi` | **FUNCIONALIDAD PARCIAL / FUENTE INSUFICIENTE** |

**Hallazgo crítico de §11 (verificado en BD):** los insumos de MTTR/MTBF/Disponibilidad
(`tiempoReparacionMin`, `tiempoEntreFallasMin`, `tiempoIndisponibleMin`) viven en `insumosKpi` de
`cor_eventos_activo` y se capturan **manualmente** vía el comando `registrar-evento-activo` (único
consumidor de UI: `ficha/tab-correctivo.tsx`). En los 7 eventos reales, la mayoría están en `null`
(sólo 3 tienen algún valor puntual). **No se derivan automáticamente** de las marcas de tiempo de la
ejecución/parada de la OT. Por tanto:

- **NO se debe afirmar que DeltaOps ya calcula MTTR/MTBF/Disponibilidad de forma confiable.** El
  catálogo y el motor existen; **la fuente de datos es insuficiente/manual.**
- **Qué existe para calcularlos:** eventos de activo con tipo de falla y campos de insumo; timestamps de
  OT (para tiempo de ejecución/cierre). **Qué falta:** poblar automáticamente tiempo de reparación,
  tiempo entre fallas y tiempo indisponible desde el ciclo de la OT (o forzar su captura).
- **Horas-hombre:** hay tramos de sesión (`ord_sesion_tramos`) y valoraciones de mano de obra
  (`mdo_valoraciones`); AGREGABLE, pero conviene verificar su completitud por OT antes de reportarlo.

---

## 12. Relación con Excel / Forms / Power BI

**Búsqueda exhaustiva en el repositorio (verificado):** no existe evidencia de integración con Excel
(`.xlsx`/`.xls`), Microsoft Forms, Power BI, SharePoint, ni endpoints de importación/exportación de
datos externos. Las únicas coincidencias textuales son: un **comentario** en `SuperficieCostos.tsx`
(«…comparación sencilla, sin Excel») que confirma la decisión de diseño de NO depender de Excel; una
capacidad de analytics `exportar-analytics` que **no tiene endpoint de exportación asociado** (permiso
declarado sin superficie que lo consuma); y falsos positivos de subcadenas (`csv` dentro de nombres de
función). No hay migradores desde archivos externos.

| Pregunta | Respuesta |
|---|---|
| ¿Qué procesos previos de la organización están representados? | **NO VERIFICADO** — no hay evidencia de mapeo desde herramientas previas (Excel/Forms/BI). |
| ¿Qué información aún no está representada? | El multicentro de costos operativo (§7) y la captura automática de insumos KPI (§11). |
| ¿Qué podría migrarse? | Maestros de activos e inventario (hay comandos `crear` idempotentes), catálogos. **No hay migrador construido** (sería trabajo futuro). |
| ¿Qué no debería migrarse? | Datos derivados/calculados (indicadores, snapshots): se recomputan desde los eventos. |

**Conclusión §12:** relación con Excel/Forms/Power BI = **NO VERIFICADO / INEXISTENTE en el código.**
Cualquier integración BI sería vía consumo de los datasets de Analytics (API), no vía archivos.

---

## 13. Offline / Móvil

**Mecanismo (verificado, `lib/offline/cola.ts`, `contexto.tsx`, `tipos.ts`):** cola de sincronización
observable, **persistida en `localStorage` con clave por tenant y por módulo**
(`deltaops:<modulo>:cola:<tenant>`). Cada mutación pasa por `mutarConOffline`: intenta el POST directo;
si `fetch` falla por red, **encola** la operación con su `opId`. Reintentos manuales y automáticos al
volver `online`. Estados por operación: `pendiente · enviando · aplicada · idempotente · conflicto ·
rechazada · reintentable`.

| Aspecto | Comportamiento real |
|---|---|
| Qué se guarda localmente | La operación (comando, input con `opId`, descripción) y borradores (p. ej. alta de activo, respuestas de preop) |
| Qué se sincroniza | Todas las mutaciones de módulos con cola: activos, órdenes, inventario, planes, abastecimiento, preventivo, correctivo, analytics (12 endpoints `/sync`) |
| Idempotencia | Por `opId` (recibos `*_sync_receipts`/`*_recibos`); reenvíos no duplican |
| Conflictos | Estado `conflicto` con snapshot del estado actual del servidor para resolución manual (descartar); las transiciones de workflow rechazan estados inválidos |
| Pérdida de conexión | La operación queda `pendiente`/`reintentable` y se reintenta; no se pierde |
| Acciones que requieren conexión | Consultas/lecturas (read models), resolución de plantillas, adjuntos grandes, y todo lo que necesite datos frescos del servidor |
| Realmente mobile-first | Preoperacional/checklist, ejecución de OT, escaneo (con reservas de hardware) |

**Auditoría por proceso:**

- **Preoperacional / Checklist:** offline-capaz (borradores locales + registro por `opId`). **VERIFICADO.**
- **Hallazgos:** `generar`/`descartar`/`reabrir` van por cola. **VERIFICADO** (con la salvedad de orden:
  si el cierre requiere dos comandos, deben encolarse ordenados — nota de LITE-05).
- **OT / Ejecución:** transiciones, sesiones, evidencias por cola. **VERIFICADO.**
- **Inventario:** movimientos/ajustes/transferencias/conteos por cola. **VERIFICADO.**
- **Móvil:** el layout usa el Design System responsive y `use-mobile`; el escaneo QR/cámara es
  mobile-first pero **NO VERIFICADO** a nivel de captura de hardware en esta auditoría.

---

## 14. Experiencia por perfil (recorridos documentales; sólo capacidades existentes)

**TECNICO** (landing `/ordenes`): Login → Inicio → Mis órdenes (`/ordenes`) → abrir OT (`/ordenes/:id`)
→ iniciar sesión de trabajo → registrar trabajo/tiempo/evidencia/checklist → enviar a validación.
También: `/activos/:id/preoperacional` → resultado → «Generar mantenimiento» (hallazgo).

**PLANIFICADOR** (landing `/ordenes/planificacion`): Login → Planificación → asignar recursos/SLA →
Calendario de planes (`/planes/calendario`) / Preventivo (`/preventivo/programas`). Consulta Costos/
Analytics.

**SUPERVISOR** (landing `/centro`): Login → Centro de mantenimiento (`/centro`) → Supervisión de
órdenes (`/ordenes/supervisor`) → validar/cerrar OT → asignar → Analytics/Costos.

**TENANT_ADMIN** (landing `/centro`): Login → Centro → Administración: Usuarios
(`/administracion/usuarios`), Configuración (`/administracion/configuracion`). Acceso a toda la
operación de su empresa.

**CONSULTA** (landing `/centro` → `/activos`): Login → Centro / Activos → fichas e historial →
Indicadores (`/analytics`, `/costos`). Solo lectura.

**SUPER_ADMIN** (landing consola global): Login → Consola técnica (`/plataforma`) → Administración SaaS
(`/administracion/saas`, empresas) → Motores/Consola de Activos (diagnóstico). No es un rol operativo
de Delta.

---

## 15. Clasificación de navegación (qué debería ver Delta)

> «Ocultar complejidad no es eliminar capacidad.» Ninguna propuesta elimina funcionalidad.

| Superficie | Clasificación propuesta |
|---|---|
| Inicio, Órdenes (bandejas), Activos (listado/ficha), Preoperacional | **MOSTRAR SIEMPRE** |
| Correctivo, Preventivo, Planes, Utilización, Inventario | **MOSTRAR SEGÚN ROL** (planificador/supervisor; técnico según asignación) |
| Analytics, Costos, Centro de mantenimiento | **MOSTRAR SEGÚN ROL** (supervisión/admin/consulta) |
| Abastecimiento, Árboles de activos, Editor de dashboards, Referencia | **MOSTRAR COMO «MÁS»** (accesos secundarios) |
| Usuarios, Configuración | **SOLO ADMINISTRACIÓN** |
| Administración SaaS, Plataforma, Motores, Consola de Activos | **SOLO SOPORTE/TÉCNICO** (SUPER_ADMIN) |
| Design System, Playground de motores | **OCULTAR DEL USUARIO OPERATIVO** |
| Referencia (módulo neutro) | **NO PRIORITARIO** para DeltaOps LITE |
| Todas las `*-sincronizacion` | **MOSTRAR COMO «MÁS»** / secundario (herramienta, no proceso) |

La navegación actual (`gruposNavegacion`) ya agrupa por proceso (Mantenimiento/Equipos/Inventario/
Indicadores/Administración) y oculta por entitlement + capacidad; la simplificación es afinar qué
aparece por rol y mover satélites a «Más».

---

## 16. Complejidad vs valor

| Funcionalidad | Valor operacional | Complejidad usuario | Frecuencia | Cuadrante |
|---|---|---|---|---|
| Preoperacional / Checklist | Alto | Baja | Alta | **ALTO/BAJA** (prioridad máxima) |
| Órdenes (ejecución/cierre) | Alto | Media | Alta | ALTO/MEDIA |
| Hallazgo → generar mantenimiento | Alto | Baja | Media | **ALTO/BAJA** |
| Activos (listado/ficha) | Alto | Baja | Alta | **ALTO/BAJA** |
| Correctivo (solicitud/intervención) | Alto | Alta | Media | ALTO/ALTA |
| Costos / Analytics básicos | Alto | Media | Media | ALTO/MEDIA |
| Preventivo / Planes | Medio | Alta | Baja/Media | BAJO-MEDIO/ALTA |
| Inventario / Abastecimiento | Medio (técnico) | Alta | Baja (para técnico) | **BAJO/ALTA** (candidatas a secundario) |
| Editor de dashboards | Bajo (operativo) | Alta | Muy baja | **BAJO/ALTA** (ocultar/segundar) |
| Árboles de activos, Referencia | Bajo | Media | Muy baja | **BAJO/…** (secundario) |
| Consolas técnicas (Plataforma/Motores/Consola de Activos) | Alto (soporte) | Alta | Muy baja | Solo SUPER_ADMIN |

**Candidatas a quedar ocultas/secundarias (no eliminar):** editor de dashboards, árboles de activos,
Referencia, y —para el perfil de técnico— Abastecimiento e Inventario avanzado.

---

## 17. Estructura del futuro «Manual de Usuario DeltaOps» (mapa capítulo → pantallas)

| Cap. | Título | Pantallas a documentar |
|---|---|---|
| 1 | ¿Qué es DeltaOps? | (conceptual) |
| 2 | Inicio de sesión | `/login`, `/recuperar`, `/restablecer`, `/invitacion` |
| 3 | Mi inicio | `/` (dispatcher), `inicio-empresa`, `/perfil` |
| 4 | Equipos | `/activos`, `/activos/:id` (+pestañas), `/activos/nuevo` |
| 5 | Preoperacional | `/activos/:id/preoperacional` |
| 6 | Checklist | (misma pantalla; forms dinámicos) |
| 7 | Hallazgos | resultado del preoperacional + `hallazgo/*` |
| 8 | Órdenes de mantenimiento | `/ordenes`, `/ordenes/nueva`, `/ordenes/planificacion`, `/ordenes/supervisor` |
| 9 | Ejecución del mantenimiento | `/ordenes/:id` (+tabs ejecución) |
| 10 | Cierre | `/ordenes/:id` (validar+cerrar), `/ordenes/supervisor` |
| 11 | Inventario | `/inventario` (+movimientos/transferencias/conteos/bodegas) |
| 12 | Indicadores | `/analytics`, `/analytics/indicadores`, `/costos`, `/centro` |
| 13 | Administración | `/administracion/usuarios`, `/administracion/configuracion` |
| 14 | Trabajo desde celular | escaneo, layout móvil (mobile-first en preop/ejecución) |
| 15 | Trabajo sin conexión | `*-sincronizacion`, comportamiento de la cola offline |
| 16 | Preguntas frecuentes | (transversal) |
| (anexo) | Correctivo / Preventivo / Planes / Utilización / Abastecimiento | módulos según rol |

---

## 18. Auditoría visual (sin modificar)

Base sólida: **Design System único** (`@workspace/design-system`, tokens `--do-*`) con `ThemeProvider`
y `ToastProvider` a nivel raíz (`App.tsx`), tema claro/oscuro/automático persistido en `localStorage`,
y una galería viva (`/design-system`). Coexiste con componentes shadcn (`components/ui/*`) y su
`Toaster`.

| Aspecto | Clasificación | Nota |
|---|---|---|
| Consistencia visual (tokens/tema) | **CORRECTO** | DS único, tema global coherente |
| Tema claro / oscuro | **CORRECTO** | `data-do-theme` + clase `dark` en `<html>` |
| Botones / formularios / tablas / tarjetas | **CORRECTO** | Componentes DS reutilizados |
| Mensajes / estados (cargando/vacío/error) | **CORRECTO** | Patrón honesto (nunca inventa datos) |
| Móvil | **MEJORABLE** | Responsive presente; densidad y escaneo requieren validación en dispositivo (NO VERIFICADO en hardware) |
| Densidad de información | **MEJORABLE** | Centro/Analytics/ficha con muchas pestañas → carga cognitiva alta |
| Coexistencia DS + shadcn | **MEJORABLE** | Dos sistemas de componentes (DS `Do*` y `components/ui`); riesgo de divergencia futura |
| Iconografía | **CORRECTO** | `lucide-react` consistente |
| Textos | **CORRECTO** | Español formal, terminología operacional |

No hay hallazgos **CRÍTICOS PARA USABILIDAD** que impidan operar; el mayor riesgo es la **densidad** y
la **doble familia de componentes**, a tratar en una fase visual futura.

---

## 19. Funcionalidad real vs aparente (sección clave)

| Caso | Clasificación | Evidencia |
|---|---|---|
| KPIs MTTR/MTBF/Disponibilidad presentes en catálogo/pantalla | **INDICADOR CON FUENTE LIMITADA** | `insumosKpi` mayormente `null`; captura manual (§11) |
| `exportar-analytics` como capacidad | **API/PERMISO SIN CONSUMIDOR** | Permiso declarado sin endpoint de exportación |
| Campo `centroCosto` en activos y órdenes | **CAMPO SIN IMPACTO FUNCIONAL HOY** | Vacío en datos, no capturado, no filtra (§7) |
| Alta de activo sin campo de centro de costos | **FORMULARIO INCOMPLETO** | `lib/activos/alta.ts` no incluye `centroCosto` |
| Resumen de hallazgos | **FUNCIONALIDAD PARCIAL (acotada)** | `RESUMEN_MAX_EJECUCIONES = 200` |
| Prefill Hallazgo → Correctivo | **MAPEO PARCIAL** | Evidencias referenciadas como foto genérica; sin mapeo completo |
| Router de Correctivo usa rol legacy de `users.rol` | **INCONSISTENCIA DE DERIVACIÓN DE ROL** | `correctivo-module.ts` lee `deltaopsUsersTable.rol`; materializador usa rol de servicio fijo |
| Escaneo QR/cámara | **NO VERIFICADO (hardware)** | Lógica presente; captura no ejercitada |
| Referencia (módulo neutro) | **PREPARACIÓN/DEMOSTRATIVO** | Módulo genérico de plataforma, no de negocio Delta |
| Editor de dashboards | **PREPARACIÓN PARA FASE FUTURA** | Capacidad avanzada, uso operativo bajo |
| Pantallas `*-sincronizacion` | **HERRAMIENTA, NO PROCESO** | Gestión de cola, no una capacidad de negocio |
| 3 roles colapsan a `operador` | **GRANULARIDAD DE PERMISO LIMITADA** | `identity/rbac.ts`; refinado sólo en Órdenes/Utilización |

Ningún caso se ocultó ni se intentó corregir (§25).

---

## 20. Mapa de dependencias (textual)

```
                 USUARIOS / IDENTIDAD (tenant, roles, membresías)
                        │  (RLS por tenant en TODO)
                        ▼
ACTIVO ──────────────► (centro del sistema; activoId ancla todo)
  │                         ▲                         ▲
  ▼                         │                         │
PREOPERACIONAL (forms) ──► HALLAZGO ──► CORRECTIVO ──► ORDEN (OT)
  │(evidencias)              │(decisión)   │(solicitud)   │
  ▼                         ▼             ▼              ▼
EVIDENCIAS/ADJUNTOS      (descartar)   INTERVENCIÓN    ASIGNACIÓN ──► EJECUCIÓN
                                          │(consumos)      │(sesión/tramos/tiempos)
                                          ▼                ▼
                                     INVENTARIO ◄──── MANO DE OBRA / REPUESTOS
                                          ▲                │
                                          │                ▼
                                    ABASTECIMIENTO      CIERRE (gate validación)
                                    (compras→recepción)     │
UTILIZACIÓN (horómetro/odómetro/combustible) ──┐            ▼
                                               ▼         HISTORIAL
PREVENTIVO / PLANES ──► generan ──► ORDEN      COSTOS ◄──── (OT + inventario + utilización + mano de obra)
                                               │
                                               ▼
                                           ANALYTICS (datasets → indicadores/snapshots → dashboards)
```

Dependencias transversales: **Centros de costos** (campo en Activo/OT, hoy inerte); **Usuarios**
(identidad/roles, base de toda autorización); **Evidencias** (adjuntos de plataforma, usados por
preop/OT/correctivo). Preventivo y Planes **alimentan** Órdenes (generación); Abastecimiento
**alimenta** Inventario (recepción); Inventario, Utilización y Mano de obra **alimentan** Costos;
Costos y todos los read models **alimentan** Analytics.

---

## 21. Lista de «NO TOCAR» (infraestructura/core protegido)

Componentes que **no** deben modificarse en una simplificación superficial:

- **Autenticación y sesiones** (`identity/auth-flows`, middleware de sesión, epoch de autorización).
- **RBAC** (mapa canónico↔legacy, permisos/capacidades por comando) — cambiarlo altera autorización real.
- **RLS y aislamiento por tenant** (FORCE ROW LEVEL SECURITY, `set_config('app.tenant_id')`, roles
  `deltaops_owner`/`deltaops_app_rw`/`deltaops_app`) — DGP-023.5.
- **Motor de Workflow** (máquinas de estado, gates de aprobación, `validacionCierre`).
- **Dynamic Forms** (plantillas versionadas, respuestas, veredicto sellado).
- **Store genérico / event sourcing / proyecciones** (`platform_records`, `*_eventos`, `*_read`, outbox).
- **Offline / sync** (cola por tenant/módulo, idempotencia por `opId`, recibos).
- **Auditoría** (`platform_audit`, eventos de dominio) e **idempotencia**.
- **Contratos congelados de los módulos** (formas de comando/consulta que consumen los `principal*`).

Modificar cualquiera de estos es cambio de núcleo, no simplificación de UI.

---

## 22. Lista de posibles simplificaciones (sin implementar)

| Propuesta | Beneficio | Riesgo | Dependencias | Impacto usuario | Impacto técnico |
|---|---|---|---|---|---|
| Mover Abastecimiento y Árboles de activos a menú «Más» | Menos ruido para el técnico | Percepción de «se quitó algo» | Navegación (`gruposNavegacion`) | Positivo (foco) | Bajo (solo presentación) |
| Ocultar Editor de dashboards salvo admin | Simplifica Analytics | Usuarios avanzados lo buscan | Guard de presentación | Neutro/positivo | Bajo |
| Consolidar `*-sincronizacion` en un único «Sincronización» | Menos entradas de menú | — | Navegación | Positivo | Medio (unificar UI) |
| Flujo guiado Preop → Hallazgo → OT en una sola secuencia | Menos pasos para el técnico | Acoplar pantallas | Preop/Hallazgo/Órdenes | Muy positivo | Medio |
| Resumir la ficha de activo (pestañas bajo «Más») | Menor densidad | Ocultar info útil | Ficha `tab-*` | Positivo | Bajo |
| «Más filtros» colapsable en bandejas de Órdenes | Bandejas más limpias | — | `ordenes-operaciones` | Positivo | Bajo |
| Landing por rol más específica (TECNICO → «Mis trabajos») | Aterrizaje directo | — | `landingOperacional` | Positivo | Bajo |
| Marcar pantallas mobile-first (preop/ejecución) | Mejor uso en campo | — | Layout/DS | Positivo | Medio |
| Ocultar Referencia y Design System del usuario operativo | Menos superficie irrelevante | — | Rutas/navegación | Positivo | Bajo |

**Todas son de presentación/composición.** Ninguna toca contratos, RBAC/RLS, workflow ni datos.

---

## 23. Criterio de honestidad (autoevaluación)

Se aplicó estrictamente: no se afirmó capacidad por nombre de archivo/botón/pantalla; se distinguió
VERIFICADO / FUNCIONALIDAD PARCIAL / NO VERIFICADO. Los GAPs (multicentro, insumos KPI, granularidad
de roles, coherencia de rol en Correctivo, prefill de evidencias, resumen acotado a 200) se
documentaron sin minimizar. No se convirtió deuda en funcionalidad.

---

## 24. Revisión independiente (PASS/FAIL)

Segunda pasada de verificación cruzada contra el código/BD:

| Ítem | Resultado |
|---|---|
| Inventario de pantallas (107 archivos, 89 rutas) | PASS |
| Rutas (frontend `App.tsx` + routers backend `app.ts`) | PASS |
| Módulos clasificados (14 negocio + composición + plataforma) | PASS |
| 6 roles auditados (canónico↔legacy, backend vs frontend) | PASS |
| Flujo de mantenimiento reconstruido (12 etapas + divergencias) | PASS |
| Activos como fuente de verdad vs derivados | PASS |
| Centros de costos auditados (GAP identificado) | PASS |
| Preoperacional / Hallazgo / OT / Ejecución / Cierre | PASS |
| Inventario auditado | PASS |
| Datos generados y almacenamiento | PASS |
| Fuentes BI (A/B/C/D, MTTR/MTBF limitados) | PASS |
| Excel/Forms/Power BI buscados (inexistente) | PASS |
| Offline y Mobile auditados | PASS |
| UX/UI auditada sin modificar | PASS |
| Funcionalidad real vs aparente | PASS |
| Dependencias documentadas | PASS |
| Simplificaciones identificadas | PASS |
| Manual futuro con estructura | PASS |
| No se modificó el sistema / no se eliminó / no se inventó | PASS (git status = solo este doc) |

**RESULTADO DE LA REVISIÓN INDEPENDIENTE: PASS.**

---

## 25. Restricción absoluta — cumplimiento

Fase de discovery. **No** se tocó código, migraciones, DB, RBAC, RLS, OpenAPI, dependencias,
infraestructura, configuración, UI ni workflows; no se eliminó ni renombró nada. Las únicas acciones
fueron inspección, consultas SQL de **solo lectura** y análisis. El único archivo creado es este
informe. Los problemas encontrados se **documentaron**, no se corrigieron.

---

## 26. Criterio de cierre (24 checks)

✓ Rutas inventariadas · ✓ Módulos clasificados · ✓ 6 roles auditados · ✓ Flujo de mantenimiento
reconstruido · ✓ Activos como fuente de verdad · ✓ Centros de costos auditados · ✓ Preoperacional ·
✓ Hallazgo · ✓ OT · ✓ Ejecución y cierre · ✓ Inventario · ✓ Datos generados identificados · ✓ Fuentes
BI identificadas · ✓ Excel/Forms/Power BI buscados · ✓ Offline auditado · ✓ Mobile auditado · ✓ UX/UI
auditada sin modificar · ✓ Real vs aparente revisado · ✓ Dependencias documentadas · ✓ Simplificaciones
identificadas · ✓ Manual futuro con estructura · ✓ Sistema NO modificado · ✓ Funcionalidades NO
eliminadas · ✓ Datos NO inventados · ✓ Revisión independiente PASS.

---

## 27. Resultado esperado de Dirección (respuestas)

1. **¿Qué tenemos construido?** Un CMMS/EAM multiempresa por composición: ciclo de mantenimiento
   completo + módulos satélite (inventario, abastecimiento, preventivo, planes, utilización, costos,
   analytics) + administración + consolas técnicas.
2. **¿Qué funciona realmente?** Activo→Preop→Hallazgo→(Correctivo)→OT→Asignación→Ejecución→Validación
   →Cierre→Historial; administración de empresa y SaaS. Verificado con integración PG.
3. **¿Flujo completo?** §5 (12 etapas + divergencias).
4. **¿Qué usa cada perfil?** §14 (recorridos por rol).
5. **¿Qué datos generamos?** §10 (mapa dato→tabla).
6. **¿Qué alimenta BI?** §11: conteos de OT, utilización, costos (sí); MTTR/MTBF/Disponibilidad
   (fuente insuficiente/manual — no confiable aún).
7. **¿Qué sobra visualmente pero NO eliminar?** §15/§16/§22: Abastecimiento, editor de dashboards,
   árboles, Referencia, `*-sincronizacion`, Design System (ocultar/segundar).
8. **¿Qué simplificar?** §22 (todo presentación/composición).
9. **¿Qué debe ver el técnico?** Inicio, Mis órdenes, ficha de OT (ejecución), Preoperacional, Activos.
10. **¿Qué ve supervisión/administración?** Centro, supervisión/validación de OT, Analytics/Costos,
    Usuarios/Configuración.
11. **¿Qué está listo para producción?** El núcleo (auth, sesiones, RBAC, RLS, workflow, forms,
    offline, auditoría, idempotencia) — DGP-022/023 cerrados.
12. **¿Qué mejorar antes de producción?** (a) modelo multicentro operativo; (b) captura/derivación de
    insumos KPI para indicadores confiables; (c) simplificación de navegación por perfil; (d)
    homogeneizar derivación de rol en Correctivo; (e) validar escaneo/mobile en hardware.
13. **¿Cómo estructurar el manual?** §17 (16 capítulos + anexos, con mapeo a pantallas).

> **DETENERSE.** No se inicia ninguna fase LITE-07. Se solicita aprobación explícita de Dirección.

---

### Apéndice A · Contexto histórico re-verificado (pistas, no fuente de verdad)

- **Resumen de hallazgos acotado a 200 ejecuciones** — VERIFICADO (`RESUMEN_MAX_EJECUCIONES = 200`).
- **Drift OpenAPI estricto sólo cubre identity** — pista histórica; el alcance del contrato estricto se
  limita a identidad (no re-ejercido aquí; los módulos de negocio usan sus contratos congelados).
- **Prefill hallazgo→correctivo sin mapeo completo de evidencias** — VERIFICADO (§5.1, §19).
- **Router de Correctivo con rol legacy** — VERIFICADO (`correctivo-module.ts` deriva de `users.rol`).
- **Flakiness PG en paralelo** — pista histórica (2 flakes preexistentes en `sesion.pg.test.ts` bajo
  contención); no afecta esta auditoría.
- **DGP-022 (auditoría) y DGP-023 (hardening RLS/roles PG, retiro SGMA, secrets)** — cerrados según los
  informes; DGP-023.5 declara COMPLETADO con pendiente operativo de reinicio del workflow (del agente
  principal). El núcleo de seguridad se considera endurecido.
