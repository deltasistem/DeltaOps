# DELTAOPS LITE — FASE 2 · DISEÑO FUNCIONAL OPERACIONAL, ROLES, CENTROS DE COSTOS Y EXPERIENCIA OBJETIVO

> **Naturaleza:** especificación de **SOLO DISEÑO** (funcional + UX/UI). No se modificó código, DB, migraciones, contratos, RBAC/RLS ni workflows. No se creó el rol OPERADOR. No se implementó nada.
> **Continuidad:** convierte `docs/dgp/DELTAOPS-LITE-01-DISCOVERY.md` (revisado PASS) en especificación concreta.
> **Método:** todo anclado al código real (`artifacts/deltaops`, `artifacts/api-server`, `lib/*`). Cada dimensión/capacidad se audita como **REALIDAD ACTUAL vs DISEÑO PROPUESTO**, clasificando cada delta en: **reutilización directa · composición · GAP con decisión pendiente**.
> **Regla vinculante de Dirección:** modelo de **capacidades configurables por centro de costos/equipo** (no jerarquía rígida); **4 dimensiones independientes del activo** (centro de costos ≠ ubicación ≠ equipo de mantenimiento ≠ responsable); diseño **alrededor del PROCESO**, no de los módulos. Cero credenciales.

---

## 0. Resumen ejecutivo

**Hallazgo estructural más importante:** el core de DeltaOps **ya modela la corrección fundamental de Dirección**; la deuda es de **experiencia/composición**, no de dominio.

- **Dimensiones del activo (§2 directiva):** el aggregate de Activos (`lib/module-activos/src/domain/activo.ts`) ya distingue **centro de costos** (`centroCosto`), **ubicación** (`ubicacion`, con catálogo, coordenadas e historial), **responsable** (`responsable`, con historial) y además `empresa`/`proyecto`/`supervisor`. Ubicación y responsable son **dimensiones independientes** con operaciones y eventos propios (`cambiarUbicacion` → `ubicacion-actualizada`; `asignarResponsable` → `responsable-actualizado`) e **históricos consultables** (`/:id/historial/ubicaciones`, `/:id/historial/responsables`). → **reutilización directa** de 3 de las 4 dimensiones. **GAP:** "equipo/grupo de mantenimiento" **no existe como dimensión del activo**.
- **Modelo de capacidades (§8):** el contrato de sesión (`lib/identidad/tipos.ts`) ya expone `capacidades?: string[]` y `permisos?: string[]` **además** del `rol` canónico. El helper `puedeEscribirModulo` (`capacidades-modulo.ts`) demuestra que los 6 roles se **proyectan** a un patrón trivalente (admin/operador/lector) y que las **capacidades/permisos por sesión pueden overridear** ese default (`<modulo>.write`, `<modulo>.admin`, `gestionar-<x>`, comodines). → El modelo de capacidades de la directiva es una **CAPA de presentación/configuración sobre el RBAC existente**, no una reescritura.
- **Segregación configurable (§9):** el motor de workflow (`lib/workflow-engine/src/aprobaciones.ts`) ya soporta aprobaciones **individual/paralela/secuencial/mayoría/unanimidad/delegada/escalada**, con `permiso` exigido, `aprobadores` (principals o roles) y `rolEscalamiento`. → substrato para configurar segregación por centro **como regla de negocio**, sin imponerla universalmente.
- **Proceso preoperacional → hallazgo → OT (§4–§7):** confirmado LITE-01 — se **compone** con Dynamic Forms (checklist + `hallazgos` por severidad), correctivo (`generar-orden-correctiva`) y órdenes (asignación con identidad canónica, sesiones de trabajo). **GAPs:** entrada preoperacional guiada, veredicto APTO/NO APTO/APTO-CON-OBSERVACIONES a nivel de instancia, ítem "crítico", y el puente automático hallazgo→solicitud.
- **Trazabilidad (§1):** ya garantizada — asignaciones de OT referencian **identidad canónica** (`asignado_identity_id`, migración 0039), bitácora con `cambio-responsable`, eventos de dominio con actor/fecha, históricos de activo. → **reutilización directa**.

**GAPs reales (§17):** G-A equipo de mantenimiento como dimensión; G-B preoperacional guiado + veredicto de instancia; G-C ítem crítico en checklist; G-D puente hallazgo→correctivo automático; G-E rol OPERADOR (decisión de Dirección); G-F configuración de capacidades por centro (UI + persistencia); G-G contexto multicentro (selector) — hoy es **tenant único con multi-módulo**, no multicentro navegable; G-H `<select>` nativos/popup en oscuro.

**Decisiones pendientes de negocio:** **DP-1…DP-9** (§19). Ninguna bloquea el DISEÑO (todas admiten diseño condicionado); las que requieren definición de Dirección antes de implementar se listan como tal. **Marcado DETENERSE-Y-PREGUNTAR:** DP-2 (semántica exacta de "APTO CON OBSERVACIONES" y qué ítems son críticos), DP-5 (ámbito: multicentro dentro del tenant vs multiempresa) — ver resumen final.

**Cero mutaciones:** `git status` limpio salvo este documento y la directiva adjunta (§ cierre).

---

## 1. Arquitectura de experiencia

DeltaOps Lite se organiza en **tres capas de experiencia** sobre el mismo core:

1. **Capa de PROCESO (primer plano):** el usuario piensa en tareas, no en módulos. Hilo único: `EQUIPO → PREOPERACIONAL → CHECKLIST → RESULTADO → HALLAZGO → OT → ASIGNACIÓN → EJECUCIÓN → REVISIÓN → CIERRE → HISTORIAL → INDICADORES`.
2. **Capa de CONTEXTO:** centro de costos activo + perfil/capacidades del usuario. Determina qué ve y qué puede hacer.
3. **Capa de CAPACIDADES INTERNAS (segundo plano):** los módulos actuales (Activos, Órdenes, Inventario, Correctivo, Preventivo, Abastecimiento, Utilización, Costos, Analytics) **siguen intactos** como capacidades; dejan de ser el eje de navegación.

**Principios rectores** (directiva §17, LITE-01 §23): menos complejidad cognitiva; una acción primaria por pantalla; automatización del puente hallazgo→OT; mobile-first para operador/técnico; identidad DELTA y tokens `--do-*`; **nunca duplicar** capacidades existentes (§16).

---

## 2. Navegación propuesta (por proceso, modulada por perfil y capacidades)

**REALIDAD ACTUAL** (`AppShell.tsx` → `Navegacion`): barra plana con un botón por módulo habilitado (hasta 9) + "Consola" + "Utilización", ordenada por `MODULOS_ORDEN`; se compone por **entitlement de módulo**, no por perfil.

**DISEÑO PROPUESTO:** navegación agrupada por proceso, **modulada por capacidades del usuario en el centro activo**. Nada se elimina; lo retirado del nav sigue accesible desde su superficie contextual.

| Grupo Lite | Compone (rutas/capacidades reales) | Visible si… |
|---|---|---|
| **INICIO** | Home por perfil (`/`), Centro operacional (`/centro`) | siempre |
| **MIS EQUIPOS / EQUIPOS** | Activos (`/activos`, ficha 360°, árboles), Utilización | capacidad *consultar* |
| **PREOPERACIONAL** | *(entrada nueva — GAP G-B)* compone Dynamic Forms + activo + correctivo | capacidad *ejecutar* (o *consultar* R) |
| **TRABAJO / MANTENIMIENTO** | Órdenes (mis órdenes, supervisor, planificación), Correctivo, Preventivo, Planes | capacidad *ejecutar/asignar/supervisar* |
| **INVENTARIO** | Inventario (movimientos, transferencias, conteos, bodegas), Abastecimiento | entitlement + capacidad |
| **INDICADORES** | Analytics, Costos | capacidad *consultar/supervisar/administrar* |
| **ADMINISTRACIÓN** | Usuarios, Configuración, Centros, Equipos, Capacidades, Catálogos; SaaS/Plataforma/Motores | capacidad *administrar* (SUPER_ADMIN: superficies globales) |

**Reglas de composición:** las sub-superficies `escanear` (QR) y `sincronizacion` **no** van al nav (se acceden dentro de su módulo, como hoy). El menú de perfil conserva perfil/apariencia/admin. **Extensión sobre `rbac.ts`** (memoria `deltaops-separacion-experiencias-rol.md`): añadir una función de "grupos visibles por capacidades", sin navegación paralela.

> **REALIDAD vs PROPUESTA:** hoy no existe grupo PREOPERACIONAL (sin ruta) → se marca "próximamente" hasta cerrar G-B; no se añade al nav antes de existir.

---

## 3. Mapa de pantallas

Reutiliza rutas existentes (LITE-01 §4) y define superficies nuevas por composición (marcadas **[GAP]**).

**Proceso operacional (primer plano):**
- `Home por perfil` — reutiliza/rediseña `inicio-empresa.tsx` (§12).
- `Mis equipos` / `Equipos` → `/activos` (listado) + ficha 360° `/activos/:id` (tabs: timeline, planes, órdenes, correctivo, preventivo, documentación, relaciones, **históricos ubicaciones/responsables**, inventario).
- `Escanear QR` → `/activos/escanear` (existe).
- **`Preoperacional` [GAP G-B]** → nueva entrada: seleccionar equipo → identificar operador → checklist → resultado.
- `Checklist` → **Dynamic Forms** clase "checklist" (`FormularioDinamico`, `tab-ejecucion.tsx`).
- **`Resultado preoperacional` [GAP G-B]** → APTO / NO APTO / APTO CON OBSERVACIONES.
- `Hallazgo → solicitud` → **Correctivo** `/correctivo/solicitudes/nueva` (+ **[GAP G-D]** prellenado automático).
- `OT` → `/ordenes/:id` (ejecución, dependencias, documentación, activo).
- `Asignación` → `/ordenes/planificacion`, `/ordenes/supervisor`.
- `Ejecución` → `tab-ejecucion.tsx` (checklist, evidencia foto/firma/geo, repuestos, tiempo/sesiones).
- `Historial` → ficha de activo + histórico de OT.
- `Indicadores` → `/analytics`, `/costos`.

**Administración (segundo plano):** `/administracion/usuarios`, `/administracion/configuracion`, **[GAP G-F]** `Centros`, `Equipos de mantenimiento`, `Capacidades por centro`; `/administracion/saas`, `/plataforma`, `/motores` (SUPER_ADMIN).

---

## 4. Experiencia por perfil

Los perfiles se derivan de los **6 roles canónicos** proyectados a **capacidades** (§7). No se crean roles nuevos (salvo OPERADOR como propuesta, §19 DP-3).

### ADMINISTRADOR (`TENANT_ADMIN`; `SUPER_ADMIN` super-conjunto)
- **Home:** resumen del/los centros + accesos de administración (no todo de golpe: primero 4–6 acciones).
- **Capacidades:** administrar + todas las operativas.
- **Ve:** configuración, usuarios, centros, equipos de mantenimiento, capacidades por centro, catálogos, indicadores, auditoría. **Oculta al inicio:** el detalle técnico profundo (motores/SaaS solo SUPER_ADMIN).

### RESPONSABLE / SUPERVISOR (`SUPERVISOR`, `PLANIFICADOR`)
- **Home:** estado de equipos del centro, preoperacionales pendientes, hallazgos, órdenes por asignar/en riesgo (reutiliza `trabajoPorRol` de `inicio-empresa.tsx`).
- **Capacidades típicas:** asignar + supervisar + aprobar/cerrar (+ ejecutar si el centro es compacto).
- **Ve:** `/centro`, órdenes (supervisor/planificación), hallazgos (correctivo), indicadores operativos. **Oculta:** SaaS/plataforma.

### TÉCNICO (`TECNICO`)
- **Home:** "Tu foco ahora" (`FocoTecnico`) mobile-first: orden prioritaria propia (G-1, `ordenAsignadaAIdentidad`), escanear QR, mis órdenes, estado offline primero en DOM.
- **Capacidades:** ejecutar (+ registrar horas/repuestos/evidencia/cerrar su trabajo).
- **Ve:** mis órdenes, mis equipos, ejecutar mantenimiento, preoperacional. **Oculta:** administración, costos, configuración.

### OPERADOR — **PROPUESTA / GAP (DP-3)** — no existe hoy (`tipos.ts` = 6 roles sin OPERADOR)
- **Home conceptual:** "Mis equipos → Iniciar preoperacional → Checklist → Reportar novedad".
- **Capacidades conceptuales:** ejecutar preoperacional + reportar novedad; **sin** administración/costos/configuración.
- **REALIDAD vs PROPUESTA:** hoy sus tareas recaerían en TECNICO/CONSULTA. Introducirlo exige decisión de Dirección + RBAC (fuera de esta fase).

### CONSULTA (`CONSULTA`)
- **Home:** lectura del centro (equipos, órdenes, indicadores).
- **Capacidades:** solo consultar (`puedeEscribir(rol)=false` ya lo bloquea en presentación). **Oculta:** toda CTA de escritura y administración.

---

## 5. Modelo conceptual de capacidades

**Capacidades canónicas (directiva §8):** `ejecutar` · `asignar` · `supervisar` · `aprobar/cerrar` · `administrar` · `consultar`. Una persona puede acumular varias (centro compacto) o segregarse (centro grande). Ambas válidas.

### REALIDAD ACTUAL (evidencia)
- `Sesion` ya trae `rol: Rol`, `capacidades?: string[]`, `permisos?: string[]` (`lib/identidad/tipos.ts`).
- Proyección canónica (`capacidades-modulo.ts` → `aRolLegacy`): `SUPER_ADMIN`/`TENANT_ADMIN` → **admin**; `SUPERVISOR`/`PLANIFICADOR`/`TECNICO` → **operador**; `CONSULTA`/desconocido → **lector**.
- Override por sesión: `<modulo>.write`, `<modulo>.admin`, `gestionar-<sufijo>`, comodines `*` / `<modulo>.*` conceden/deniegan por módulo (trivalente).
- Escritura de presentación gated por `puedeEscribirModulo`; el backend es la autoridad (403), nunca hay bypass.

### DISEÑO PROPUESTO — capa de proyección (sin tocar RBAC)
Mapa **rol canónico → capacidades por defecto** (default; el override por centro modula):

| Rol canónico | ejecutar | asignar | supervisar | aprobar/cerrar | administrar | consultar |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| SUPER_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ (global) | ✓ |
| TENANT_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| SUPERVISOR | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| PLANIFICADOR | ✓ | ✓ | ✓ | — | — | ✓ |
| TECNICO | ✓ | — | — | — | — | ✓ |
| CONSULTA | — | — | — | — | — | ✓ |

- La **configuración por centro** (GAP G-F) puede **restringir** (segregación) o **ampliar** (centro compacto) estas capacidades para un usuario en un centro, expresándose con las señales ya soportadas (`capacidades`/`permisos` de la sesión / membresía). **No se reescribe RBAC**: se añade una capa de configuración que produce esas señales.
- **Trazabilidad (§1):** toda acción registra identidad + fecha/hora + acción + **capacidad con la que actuó** + evidencia. Substrato ya presente: `asignado_identity_id`, bitácora `cambio-responsable`, eventos de dominio con actor. → reutilización directa; el diseño añade el campo "capacidad utilizada" a la traza de acción (composición).

> **DP-4:** ¿la capacidad efectiva se resuelve por **membresía-en-centro** o por **sesión global**? El contrato de sesión ya trae `membresias` con `rol` por tenant; el diseño asume membresía-por-centro cuando exista el concepto de centro navegable (G-G).

---

## 6. Multicentro de costos

**REALIDAD ACTUAL:** DeltaOps es **tenant único (`deltaops`) con multi-módulo**; `centroCosto` existe como **campo del activo** y catálogo `centros-costo`, pero **no** hay un "contexto de centro activo" navegable ni filtro de centro en el listado de Activos (confirmado: `plantillaFiltrosListado` no incluye centro-costo). El selector de "empresa" del `AppShell` cambia de **tenant/membresía**, no de centro de costos.

**DISEÑO PROPUESTO (§10):**
- **Contexto de centro activo** en el header (junto al selector de empresa), mostrando: nombre del centro, nº de equipos, órdenes abiertas, preoperacionales pendientes, equipos fuera de servicio (todos con **fuente real**: read model de Activos filtrado por `centroCosto` + read model de Órdenes).
- **Cambio de contexto claro** para usuarios autorizados en varios centros; **sin duplicar** equipos/datos (un activo pertenece a un `centroCosto`; cambiar de contexto sólo re-filtra).
- Vista "Mi operación" (ejemplo directiva §10) como bloque de home.

> **GAP G-G:** el "centro navegable" como contexto (no como mero campo) requiere: (a) filtro por `centroCosto` en listados (composición, ya hay catálogo), (b) selector de centro (nuevo, presentación), (c) resolución de capacidades por centro (G-F/DP-4).
> **DP-5 (DETENERSE-Y-PREGUNTAR):** ¿el alcance es **multicentro dentro de un tenant** (lo que el modelo ya soporta con `centroCosto`) o **multiempresa** (varios tenants, ya soportado por `membresias`/switch-tenant)? La directiva mezcla ambos; el diseño se hace para multicentro-en-tenant y deja multiempresa como el mecanismo de membresías existente.

---

## 7. Relación centro de costos / ubicación / equipo de mantenimiento / responsable

**Las 4 dimensiones son INDEPENDIENTES** (directiva §2). Estado real por dimensión:

| Dimensión | REALIDAD ACTUAL (evidencia) | Clasificación |
|---|---|---|
| **Centro de costos** | Campo `centroCosto` en el aggregate (`activo.ts:86`); catálogo `centros-costo` (`activos/tipos.ts:46`). Dimensión administrativa/económica. | **reutilización directa** (falta exponer filtro/columna) |
| **Ubicación** | `ubicacion: Ubicacion` (catálogo `ubicaciones` + coordenadas + detalle); operación `cambiarUbicacion` → evento `ubicacion-actualizada`; **historial** `/:id/historial/ubicaciones`. | **reutilización directa** |
| **Equipo/grupo de mantenimiento** | **No existe como dimensión del activo** (`activo.ts` no tiene `equipoMantenimiento`). A nivel de OT sí hay asignación a `grupo`/`cuadrilla`/`contratista` (`TIPOS_ASIGNACION`, operacional.ts). | **GAP (G-A)** — decisión pendiente DP-6 |
| **Responsable** | `responsable` (y `supervisor`) en el aggregate; operación `asignarResponsable` → evento `responsable-actualizado`; **historial** `/:id/historial/responsables`. | **reutilización directa** |

**Diseño:** en la ficha 360° del activo, presentar las 4 dimensiones como **campos separados y editables de forma independiente** (con su historial). Un activo puede **cambiar de ubicación sin cambiar de centro de costos ni de equipo de mantenimiento** — el dominio ya lo permite para ubicación/responsable; para "equipo de mantenimiento" se propone (DP-6):
- **Opción A (composición mínima):** modelar "equipo de mantenimiento" como un **catálogo nuevo + campo del activo** análogo a `centroCosto` (aditivo; requiere contrato/DB → NO en esta fase).
- **Opción B (reutilización):** derivarlo de la **asignación de la OT** (`grupo`/`cuadrilla`) sin campo en el activo. Menos explícito para "quién atiende este equipo por defecto".

> **DP-6:** Dirección decide A vs B. El diseño UX contempla mostrar el equipo de mantenimiento como 4ª dimensión; su origen de dato queda condicionado a DP-6.

---

## 8. Flujo preoperacional (wireframes textuales, mobile-first)

**Entrada (directiva §4):** listado de equipos · QR del activo (`/activos/escanear`) · "Mis equipos" · tarea pendiente (home).

**P1 · Seleccionar equipo**
```
┌─────────────────────────────┐
│  Preoperacional              │
│  [ 📷 Escanear QR del equipo ]│  ← acción primaria (rojo DELTA, ≥48px)
│  ──────── o ────────          │
│  🔎 Buscar equipo             │
│  Recientes / Mis equipos:     │
│   • CAT 320  · Patio BQ  🟢    │
│   • Genset 7 · Taller    🟡    │
└─────────────────────────────┘
```

**P2 · Identificar operador**
```
Operador: Carlos R. (sesión)      [ Cambiar ]   ← identidad de sesión por defecto
Centro de costos: OPERACIONES BQ  (solo lectura, del activo)
Fecha/hora: automática
```

**P3 · Seleccionar checklist aplicable** — resuelto por tipo/categoría del equipo (Dynamic Forms `resolutor.ts`). Si hay uno solo, se salta el paso.

**P4 · Ejecutar checklist** (§9).

**Procedencia registrada** en todo momento: usuario · fecha/hora · equipo · centro de costos · checklist.

**Reutiliza:** QR de activos, catálogo de activos, Dynamic Forms + resolutor, identidad de sesión, cola offline. **GAP G-B:** tipo "preoperacional" + veredicto de instancia + registro/vínculo.

---

## 9. Checklist (mobile-first, extremadamente simple)

**Cada ítem (directiva §5):** `✓ Cumple` / `✕ No cumple` / `⚠ No aplica`. Controles grandes (segmented ≥48px), no un formulario administrativo.

```
Ítem: «Nivel de aceite»
[ ✓ Cumple ] [ ✕ No cumple ] [ ⚠ N.A. ]
   └─ si "No cumple" se despliega:
      Descripción: ____________________
      [ 📷 Foto/evidencia ]
      Observación: ____________________
      Severidad: ( ) Leve ( ) Media ( ) Crítica
```

**REALIDAD ACTUAL:** Dynamic Forms ya soporta clase "checklist", condiciones, evidencias y `hallazgos` por campo con severidad `advertencia | error | bloqueo` — precisión: la severidad vive en el **motor de formularios del frontend** (`lib/forms/motor.ts`; `hayBloqueos`), no en la definición de ítem del checklist de dominio (`lib/dynamic-forms/checklist.ts`, cuyo estado es conforme/no-conforme/na sin severidad); la unificación de ese mapeo es parte de DP-1. El render (`FormularioDinamico`) ya separa hallazgos bloqueantes de advertencias. → **composición**.

**GAP G-C:** metadato **"ítem crítico"** a nivel de definición de checklist (hoy la severidad es por respuesta, no una marca de "este ítem es crítico"). Mapear "No cumple en ítem crítico" → severidad `bloqueo` → veredicto NO APTO.

> **DP-1:** catálogo de severidades del checklist (Leve/Media/Crítica) vs las del motor (advertencia/error/bloqueo) — unificar mapeo.

---

## 10. Resultado del preoperacional

Tres estados (directiva §6), **no dependientes solo del color** (color + icono + etiqueta):

| Resultado | Presentación | Regla | Registro |
|---|---|---|---|
| **APTO** | 🟢 verde · badge `exito` · "EQUIPO APTO PARA OPERAR" | todos los ítems críticos cumplen (`!hayBloqueos`) | usuario, fecha, hora, equipo, checklist, resultado, evidencias |
| **NO APTO** | 🔴 rojo · badge `error` · "EQUIPO NO APTO" | ≥1 condición crítica incumplida (`hayBloqueos`) | igual + genera flujo de hallazgo automáticamente (§12) |
| **APTO CON OBSERVACIONES** | 🟡 amarillo · badge `advertencia` · "APTO CON OBSERVACIONES" | hay advertencias no bloqueantes y la organización lo permite | igual + observaciones trazables |

> **DP-2 (DETENERSE-Y-PREGUNTAR):** la **semántica de "APTO CON OBSERVACIONES"** (¿qué ítems la habilitan? ¿la organización la permite por defecto? ¿qué ítems son "críticos"?) **depende del negocio** y no puede derivarse del código. No se inventa regla de seguridad (directiva §6). Se diseña la UI de los 3 estados; la regla queda pendiente de Dirección.

**Registro/evidencia:** reutiliza captura de foto/firma/geo (`tab-ejecucion.tsx`) y cola offline.

---

## 11. Hallazgo → clasificación → generación de OT

**Flujo (directiva §7):** `CHECKLIST → HALLAZGO → CLASIFICACIÓN → ORDEN DE TRABAJO`.

**REALIDAD ACTUAL (análogo directo, evidencia):** Correctivo ya implementa el puente solicitud→OT:
- `transicionarSolicitud(id, accion, {motivo})` → `POST /solicitudes/:id/transicion`.
- `generarOrden(solicitudId, {titulo, prioridad})` → comando `modulo.correctivo.generar-orden-correctiva`, devuelve `ordenTrabajoId` (idempotente por `opId`).
- OT correctiva navegable en `/ordenes/:id` (`urlOrdenTrabajo`).

**DISEÑO PROPUESTO (composición):**
```
Preoperacional NO APTO (o hallazgo crítico)
  → SOLICITUD correctiva PRELLENADA automáticamente [GAP G-D]:
       Origen: PREOPERACIONAL · Checklist · Ítem · Hallazgo · Activo · Usuario · Fecha
  → clasificación (severidad/prioridad)
  → aprobación según reglas del centro (transicionarSolicitud + workflow §9-directiva)
  → generarOrden → OT correctiva
  → asignación → ejecución → cierre → costo → indicadores
```

**Procedencia en la OT (directiva §7):** la OT debe conservar `Origen: PREOPERACIONAL / Checklist / Ítem / Hallazgo / Activo / Usuario / Fecha`. Substrato: relaciones de OT ya soportan categorías `checklist`/`evidencia`/`activo` (además de `orden`/`formulario`/`recurso`; `CATEGORIAS_RELACION`, operacional.ts). → composición + campo de procedencia.

**GAP G-D:** el prellenado automático desde el preoperacional (hoy la solicitud correctiva se crea manual en `/correctivo/solicitudes/nueva`). Regla de composición, no nuevo motor.

---

## 12. Home / Inicio por perfil (accionable)

**REALIDAD ACTUAL:** `inicio-empresa.tsx` es denso (8–10 secciones apiladas: módulos disponibles, explorar por módulo, etc.) → LITE-01 §7 problema #2.

**DISEÑO PROPUESTO (directiva §12):** home **accionable**, no un tablero de KPIs técnicos.
```
Buenos días, Carlos — OPERACIÓN BARRANQUILLA         [ cambiar centro ▾ ]
¿Qué necesitas hacer?
[ ▶ Iniciar preoperacional ] [ ⚠ Reportar novedad ] [ 🧰 Ver mis órdenes ] [ 🚜 Ver equipos ]

ESTADO OPERACIONAL
🟢 18 operativos   🟡 3 con observaciones   🔴 2 fuera de servicio

PENDIENTES
5 órdenes pendientes · 3 preoperacionales · 2 hallazgos críticos
```
- **Saludo + contexto de centro + acciones primarias + estado operacional + pendientes.** El contenido cambia por perfil (§4).
- **Fuentes reales:** estado por activo (`estado` del read model de Activos filtrado por centro); órdenes pendientes/hallazgos (read model de Órdenes/Correctivo, ya calculado en `resumen.ts`). Preoperacionales pendientes: **fuente condicionada a G-B** (no inventar hasta existir el registro).
- Reutiliza `Saludo`, `AccesosRapidos`, `FocoTecnico`, `trabajoPorRol`, `alertasOperacionales` de `inicio-empresa.tsx`; **retira** de primer plano "Módulos disponibles"/"Explorar por módulo" (pasan a nav/admin).

---

## 13. Asignación · Ejecución · Supervisión · Aprobación/Cierre

Todo se **compone** con Órdenes + workflow existentes; la **segregación es configurable** (§9 directiva), no impuesta.

- **Asignación** (`/ordenes/planificacion`, `/ordenes/supervisor`): a persona (identidad canónica, `asignado_identity_id`), grupo, cuadrilla o contratista (`TIPOS_ASIGNACION`). En centro compacto, quien asigna puede ser quien ejecuta (permitido; trazado).
- **Ejecución** (`tab-ejecucion.tsx`): checklist/formulario asociado, evidencia foto/firma/geo, consumo de repuestos (inventario), registro de tiempo/mano de obra (sesiones `ABIERTA/PAUSADA/CERRADA`), bitácora (`inicio/pausa/reanudacion/finalizacion`).
- **Supervisión:** `/centro`, prioridades por SLA (`estadoSla`), vencidas/en riesgo/sin asignar.
- **Aprobación/Cierre:** motor de workflow con modos configurables (individual/paralela/secuencial/mayoría/unanimidad/delegada/escalada; `aprobaciones.ts`) gated por `permiso`. **Segregación por centro** (directiva §9) se configura aquí como regla de negocio (GAP G-F), sin regla universal "quien ejecuta no aprueba".
- **Trazabilidad:** cada etapa registra identidad + fecha/hora + acción + capacidad utilizada (composición sobre eventos existentes).

> **DP-7:** ¿qué transiciones exigen aprobación por defecto y con qué modo, por centro/tipo de mantenimiento? Depende del negocio.

---

## 14. Historial e indicadores

- **Historial (directiva §16 → Activos/OT):** ficha 360° del activo con timeline, histórico de OT, **histórico de ubicaciones y responsables** (`tab-historicos.tsx`, endpoints existentes), documentación, relaciones. → reutilización directa.
- **Indicadores (directiva §16 → Analytics/Costos):** en la **home** solo los accionables por rol (LITE-01 §15): estado operacional del centro, órdenes pendientes/en riesgo, hallazgos críticos, cumplimiento de preventivo, horómetro/odómetro/combustible del equipo (Utilización), costo del activo (Costos). El **análisis** (MTTR/MTBF/disponibilidad consolidada, rotación, reincidencias, dashboards editables) queda en `/analytics`. **No inventar indicadores sin fuente** — el catálogo de Analytics (`ind.fuente.modulo/dataset`) es la autoridad.

---

## 15. Experiencia móvil

Prioridad mobile-first: **preoperacional, checklist, QR, evidencia fotográfica, órdenes, ejecución, cierre, consulta rápida** (directiva §13).
- Objetivos táctiles ≥48px (ya convención, `botonTactil`).
- Contención de overflow sistémica ya presente (`minmax(min(Npx,100%),1fr)`, `.do-root{overflow-x:clip}`, memoria `deltaops-tema-global.md`).
- Cola offline (`lib/offline`) + estado de sincronización visible (`EstadoOffline`).
- Tablas → tarjetas conmutables en móvil (patrón `activos-listado.tsx`).
- **Evitar:** tablas gigantes, formularios interminables, filtros excesivos (simplificar Activos, LITE-01 §7 #3), menús horizontales largos, info técnica innecesaria.

---

## 16. Propuesta visual · tema claro/oscuro · componentes

Dentro del Design System DGP-005 y tokens `--do-*` (no introducir sistema visual nuevo — directiva §14).

**Mejoras de jerarquía:** una acción primaria por pantalla (rojo DELTA); menos tarjetas/bordes; más aire; estados con color **+** icono **+** etiqueta; feedback inmediato (toasts DS); estados vacíos/loaders/errores del DS.

**Estados APTO / NO APTO / OBSERVACIÓN** (no dependientes solo del color):
- APTO → 🟢 `Badge variant="exito"` + icono check + texto.
- NO APTO → 🔴 `Badge variant="error"` + icono alerta + texto.
- APTO CON OBSERVACIONES → 🟡 `Badge variant="advertencia"` + icono info + texto.

**Componentes a REUTILIZAR (tal cual):** `AppShell`, `Logo` (variante `imagotipo-auto` — logo por tema, legible en claro/oscuro), `Button`/`Badge`/`Card`/`Section`/`KpiCard`/`Alert`/`EmptyState`/`ErrorState`/`Spinner`/`Modal`/`Field`/`Tabs`, `ThemeProvider` (autoridad única en raíz), `FormularioDinamico`, capturas de evidencia/firma.

**Componentes a REDISEÑAR / CORREGIR:**
- **`Select` del DS:** el control cerrado está tokenizado (`.do-select__control { color: var(--do-texto) }`) pero el **popup `<option>` es nativo** sin estilar → **GAP G-H**. Rediseñar: estilar `option`/popup para oscuro o migrar a listbox propio del DS.
- **4 `<select>` nativos crudos** fuera de `.do-select` (`ordenes/tab-dependencias.tsx`, `preventivo-calendario.tsx`, `correctivo-solicitud-ficha.tsx`, `ordenes-planificacion.tsx`) → migrar al componente `Select`.
- **Home** (`inicio-empresa.tsx`): rediseñar a "home accionable" (§12).
- **Navegación** (`AppShell.tsx` → `Navegacion`): de plana a agrupada por proceso/capacidades (§2).
- **Filtros de Activos**: de 7+búsqueda+tabs a búsqueda + ≤3 filtros visibles + "avanzado" plegable; **añadir centro de costos** como filtro/columna (hoy ausente).
- **Item de checklist móvil**: segmented control ✓/✕/⚠ (nuevo patrón sobre DS).

**Tema:** conservar autoridad única (`ThemeProvider` raíz, `localStorage["do-tema"]`); ningún shell/página fija `data-do-theme`; solo 3 literales hex en pages (a tokenizar en `administracion-configuracion.tsx`). Verificar contraste de texto y estados en ambos temas.

---

## 17. Funcionalidades que dejan de ser visibles en la navegación principal (conservadas)

**"Ocultar del nav" ≠ eliminar.** Todo permanece accesible desde su superficie contextual (LITE-01 §18 D):
- `escanear`/`sincronizacion` por módulo → dentro del módulo.
- "Módulos disponibles"/"Explorar por módulo" → desaparecen del home (van a nav agrupada).
- `/design-system`, editor de dashboards (`/analytics/dashboards/*`), `/motores/playground`, `/referencia` → conservados, fuera del nav principal.
- Abastecimiento, Preventivo, Planes, Correctivo, Utilización, Costos → dentro de sus grupos (TRABAJO/INVENTARIO/EQUIPOS/INDICADORES), no como botones sueltos.

## Funcionalidades que NO deben tocarse (directiva §15, LITE-01 §20)
Motores de dominio (`lib/module-*`, `workflow-engine`, `dynamic-forms`, `business-foundation`, `kernel`, `db`, `platform`); contratos (OpenAPI/Zod/hooks); RBAC/RLS (autoridad backend, `/auth/session`, RLS Postgres); sesiones de trabajo, ledger a costos, read models CQRS; autoridad única de tema; identidad DELTA (logos vía `Logo`, colores solo tokens); dispatcher de landing por rol (`inicio.tsx`) y guards. **No crear el rol OPERADOR.**

---

## 18. GAPs reales (con clasificación)

| GAP | Descripción | Reutiliza | Clasificación | DP |
|---|---|---|---|---|
| **G-A** | Equipo/grupo de mantenimiento como **dimensión del activo** | asignación OT `grupo/cuadrilla`; catálogos | GAP (contrato/DB) | DP-6 |
| **G-B** | Entrada **preoperacional** guiada + veredicto de instancia (APTO/NO APTO/OBS) | Dynamic Forms, QR, evidencia, offline | GAP (contrato) | DP-2 |
| **G-C** | Metadato **"ítem crítico"** en checklist | motor de forms (severidad) | GAP menor (plantilla) | DP-1 |
| **G-D** | Puente automático **hallazgo→solicitud correctiva** prellenada | `generar-orden-correctiva`, relaciones OT | composición | — |
| **G-E** | Rol **OPERADOR** | roles canónicos + capacidades | GAP (decisión + RBAC) | DP-3 |
| **G-F** | **Configuración de capacidades por centro** (UI + persistencia + segregación configurable) | `capacidades`/`permisos` de sesión, workflow aprobaciones | GAP (contrato/UI) | DP-4, DP-7 |
| **G-G** | **Contexto multicentro** navegable (selector + filtro por `centroCosto`) | `centroCosto`, catálogo, read models | composición + GAP UI | DP-5 |
| **G-H** | `<select>`/popup de opciones en **tema oscuro** + 4 selects crudos | DS `Select` | rediseño de componente | — |

---

## 19. Decisiones pendientes de negocio (DP)

1. **DP-1** — Mapeo de severidades del checklist (Leve/Media/Crítica) ↔ severidades del motor (advertencia/error/bloqueo). *(diseño, resoluble con Dirección)*
2. **DP-2** — **[DETENERSE-Y-PREGUNTAR]** Semántica de **"APTO CON OBSERVACIONES"** y **qué ítems son "críticos"**. Regla de negocio/seguridad; no derivable del código (directiva §6). Bloquea la implementación del veredicto, no el diseño de la UI.
3. **DP-3** — ¿Se crea el rol **OPERADOR** como rol canónico, o sus tareas se cubren con TECNICO + capacidades? Decisión de Dirección + RBAC.
4. **DP-4** — Resolución de capacidad efectiva: **por membresía-en-centro** o **por sesión global**. Afecta G-F/G-G.
5. **DP-5** — **[DETENERSE-Y-PREGUNTAR]** Ámbito: **multicentro dentro del tenant** (soportado por `centroCosto`) vs **multiempresa** (soportado por `membresias`/switch-tenant). Define G-G.
6. **DP-6** — "Equipo de mantenimiento": **dimensión del activo** (catálogo+campo, aditivo) vs **derivado de la asignación de OT**.
7. **DP-7** — Qué transiciones exigen **aprobación** por defecto, con qué **modo** y por qué **centro/tipo de mantenimiento** (segregación configurable, §9 directiva).
8. **DP-8** — ¿El preoperacional es **obligatorio** por equipo/turno o **opcional**? ¿Frecuencia (diario/por turno)?
9. **DP-9** — ¿Quién puede **registrar preoperacional**: solo OPERADOR (si se crea), TECNICO, o cualquier capacidad *ejecutar*?

---

## 20. Roadmap de implementación posterior (fases, sin ejecutar)

| Fase | Alcance | Depende de | Riesgo | Criterio de aceptación |
|---|---|---|---|---|
| **F1 — Nav Lite + Home accionable** | Nav agrupada por proceso/capacidades; home por perfil; retirar "módulos disponibles" del primer plano | rbac.ts (extender) | Bajo (presentación) | Nav ≤6 grupos por perfil; home con saludo+contexto+acciones+estado+pendientes; cero capacidad perdida |
| **F2 — Correcciones UX/UI** | G-H (selects/popup oscuro + 4 crudos); filtros de Activos simplificados + centro de costos; estados APTO/OBS visuales | DS | Bajo | 0 `<select>` crudos; contraste OK claro/oscuro; ≤3 filtros visibles |
| **F3 — Contexto multicentro** | Selector de centro + filtro por `centroCosto` en listados; vista "Mi operación" | DP-4, DP-5 | Medio | cambiar de centro re-filtra sin duplicar datos; fuentes reales |
| **F4 — Checklist "ítem crítico"** | Metadato crítico en plantillas de Dynamic Forms | DP-1 | Bajo | veredicto derivado de `hayBloqueos` sobre ítems críticos |
| **F5 — Preoperacional guiado + veredicto** | Entrada, registro de instancia, APTO/NO APTO/OBS (contrato nuevo → ciclo DGP formal) | DP-2, DP-8, DP-9, G-B | Alto | procedencia completa; evidencia; offline; trazabilidad |
| **F6 — Puente hallazgo→correctivo** | Prellenado automático de solicitud desde preoperacional | F5, G-D | Medio | OT con Origen: PREOPERACIONAL/Checklist/Ítem/Hallazgo/Activo/Usuario/Fecha |
| **F7 — Capacidades por centro + segregación** | UI/persistencia de capacidades por centro; modos de aprobación configurables | DP-4, DP-7, G-F | Alto | ambos modelos (compacto/segregado) configurables; trazabilidad de capacidad usada |
| **F8 — Equipo de mantenimiento** | Dimensión del activo (si DP-6=A) | DP-6 | Medio | 4ª dimensión independiente con historial |
| **F9 — Rol OPERADOR** | Rol canónico + experiencia | DP-3 | Alto | RBAC/RLS coherentes; experiencia mínima operativa |

**Orden por valor/riesgo:** F1 → F2 → F3 → F4 → F6 → F5 → F7 → F8 → F9.

---

## 21. Revisión independiente (directiva §19)

- ✔ **No se inventó funcionalidad existente:** centro de costos, ubicación (con historial), responsable (con historial), capacidades por sesión, workflow de aprobaciones configurables y correctivo→OT están **anclados a archivo/campo real**.
- ✔ **El flujo propuesto se compone con capacidades actuales:** Dynamic Forms + correctivo + órdenes + evidencia + offline; GAPs marcados sin duplicar módulos (§16 mapeo respetado).
- ✔ **No se asumió un único modelo organizacional:** capacidades acumulables o segregadas; ambos válidos; segregación **configurable**, no universal.
- ✔ **Multicentro verificado:** REALIDAD (tenant único + `centroCosto` como campo) vs PROPUESTA (contexto navegable) explícita; sin duplicar equipos.
- ✔ **Separación conceptual de las 4 dimensiones** documentada, con "equipo de mantenimiento" como GAP (DP-6).
- ✔ **Sin dependencia obligatoria de coordinador:** capacidades por centro; centro compacto permitido con trazabilidad.
- ✔ **Experiencia por rol** definida (5 perfiles + OPERADOR propuesto).
- ✔ **OPERADOR queda como decisión pendiente** (DP-3), no implementado.
- ✔ **Cero cambios de código; git status limpio** salvo este doc y la directiva.
- ✔ **Cero credenciales.**

---

> **Fin del informe.** No implementar (directiva §15, regla final). Esperar aprobación de Dirección. Decisiones que requieren definición antes de implementar: **DP-2** y **DP-5** marcadas **DETENERSE-Y-PREGUNTAR**.
