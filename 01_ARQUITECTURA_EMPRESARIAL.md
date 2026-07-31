# 01_ARQUITECTURA_EMPRESARIAL.md

> **SGMA — ETS-002 · Enterprise Architecture Design · v1.0**
> Diseño de la arquitectura funcional de la plataforma **EAM (Enterprise Asset Management)** para una empresa logística e industrial.
> Documento de diseño. **No contiene código, tablas ni migraciones.**
> Entradas: `ARQUITECTURA_ACTUAL.md`, `MODELO_DATOS_ACTUAL.md`, `MODULOS_EXISTENTES.md`, `REUTILIZACION.md`.

---

## 1. Filosofía del sistema

SGMA deja de ser un CMMS centrado en el activo para convertirse en una **plataforma empresarial EAM centrada en la ORGANIZACIÓN**.

> El activo no es el centro del universo: es un recurso que la organización asigna, mueve, mantiene, opera y cuesta a lo largo del tiempo.

Principios filosóficos:

1. **Todo pertenece a una organización.** Ninguna información existe fuera del contexto organizacional (empresa → sede → operación → proyecto → centro de costo).
2. **Todo cambia y todo se recuerda.** Activos, operaciones, proyectos, centros de costo y responsables cambian durante su vida; el sistema conserva **historial completo** de cada cambio.
3. **Nada es permanente, todo es una asignación con vigencia.** Las relaciones no son fijas: son vínculos temporales con fecha de inicio y fin.
4. **Un solo modelo, muchos tipos.** No hay módulos por tipo de activo; hay **una arquitectura única y parametrizable** que soporta cualquier tipo (actual o futuro) mediante catálogos y atributos dinámicos.
5. **Auditable por diseño.** Toda operación queda registrada: quién, qué, cuándo, desde qué contexto.
6. **Preparado para crecer.** Multimoneda y multiidioma se contemplan desde el modelo, aunque se activen después.

---

## 2. Objetivos

| # | Objetivo | Descripción |
|---|---|---|
| O1 | Plataforma multi-tenant | Aislar y organizar datos por empresa, sede, operación, proyecto y centro de costo. |
| O2 | Trazabilidad total del activo | Historial de asignaciones, intervenciones, costos, combustible, horas y responsables. |
| O3 | Modelo de activos universal | Soportar los 17+ tipos sin crear módulos nuevos. |
| O4 | Gobierno y seguridad | Autenticación, roles y permisos granulares (RBAC/ABAC) por contexto. |
| O5 | Operación en campo | Mobile-first / PWA para checklist preoperacional, combustible y reportes. |
| O6 | Inteligencia operativa | Indicadores, KPIs, predicción y asistencia por IA. |
| O7 | Escalabilidad | Crecer en volumen de activos, usuarios y transacciones sin rediseño. |
| O8 | Internacionalización | Multimoneda y multiidioma preparados. |

---

## 3. Principios de diseño

- **Organization-first:** toda entidad transaccional lleva el contexto organizacional (tenant scoping obligatorio).
- **Asignaciones con vigencia, no relaciones fijas:** todo vínculo activo↔contexto/responsable se modela como asignación temporal (`desde`, `hasta`).
- **Event-sourcing ligero para movimientos:** cada cambio relevante es un evento inmutable; el "estado actual" es una proyección del último evento vigente.
- **Independencia del tipo de activo:** ningún módulo, pantalla o regla depende del `tipo`. El tipo es un dato de catálogo con atributos dinámicos.
- **Catálogos parametrizables:** estados, tipos, prioridades, combustibles, unidades y monedas viven en catálogos, no como strings mágicos.
- **Contract-first:** OpenAPI como fuente de verdad (se reutiliza el patrón actual → Orval → hooks + Zod).
- **Separación por dominios (bounded contexts):** cada dominio encapsula sus reglas; se comunican por contratos, no por acceso directo a datos.
- **Seguridad transversal:** auth, scoping, auditoría y permisos son middlewares, no lógica dispersa.
- **API versionada y paginada:** `/api/v1`, paginación y filtros estándar en todos los listados.
- **Auditoría universal:** toda escritura genera registro de auditoría.

---

## 4. Arquitectura por dominios (bounded contexts)

La plataforma se organiza en **dominios de negocio**, no en pantallas. Cada dominio agrupa entidades, reglas y servicios cohesivos.

```text
┌─────────────────────────────────────────────────────────────────┐
│  D0 · ORGANIZACIÓN (núcleo estructural)                          │
│  Empresa · Sede · Operación · Proyecto · Centro de costo ·       │
│  Ubicación · Estructura jerárquica y vigencias                   │
└─────────────────────────────────────────────────────────────────┘
        ▲            ▲             ▲              ▲
        │            │             │              │
┌───────┴───┐ ┌──────┴─────┐ ┌─────┴──────┐ ┌─────┴───────┐
│ D1 ACTIVOS│ │D2 MANTEN.  │ │D3 INVENT.  │ │D4 OPERACIÓN │
│ Ficha,    │ │Correctivo, │ │Repuestos,  │ │Combustible, │
│ asignac., │ │preventivo, │ │almacenes,  │ │horas hombre,│
│ hoja vida │ │planes, OT  │ │movimientos │ │checklist    │
└───────────┘ └────────────┘ └────────────┘ └─────────────┘
        ▲            ▲             ▲              ▲
        └────────────┴─────┬───────┴──────────────┘
                           │
┌──────────────┐ ┌─────────┴────────┐ ┌──────────────────┐
│ D5 PERSONAS  │ │ D6 COMPRAS/      │ │ D7 SEGURIDAD/    │
│ Usuarios,    │ │ PROVEEDORES      │ │ ACCESO           │
│ roles,       │ │ Proveedores,     │ │ Auth, RBAC/ABAC, │
│ técnicos,    │ │ órdenes compra   │ │ permisos, tenant │
│ competencias │ │ (preparado)      │ │ context          │
└──────────────┘ └──────────────────┘ └──────────────────┘
        ▲            ▲             ▲              ▲
        └────────────┴─────┬───────┴──────────────┘
                           │
┌──────────────────┐ ┌─────┴──────────┐ ┌──────────────────┐
│ D8 ANALÍTICA/KPI │ │ D9 AUDITORÍA/  │ │ D10 IA/ASISTENCIA│
│ Indicadores,     │ │ HISTORIAL      │ │ Predicción,      │
│ tableros, BI     │ │ Log inmutable  │ │ recomendaciones  │
└──────────────────┘ └────────────────┘ └──────────────────┘
```

### D0 · Organización (dominio raíz)
Modela la estructura empresarial y es el **ancla de scoping** de todo lo demás:
Empresa → Sede → Operación → Proyecto → Centro de costo → Ubicación. Todas las jerarquías con vigencia.

### D1 · Activos
Ficha universal del activo (independiente del tipo), atributos dinámicos por tipo, **asignaciones con vigencia** (a empresa/operación/proyecto/centro/ubicación/responsable) y **hoja de vida** consolidada.

### D2 · Mantenimiento
Correctivo y preventivo: planes, generación de OT, ejecución, diagnóstico, causa raíz, costos. Independiente del tipo de activo.

### D3 · Inventario / Almacenes
Repuestos, almacenes multiubicación, movimientos con transacción atómica, mínimos/máximos, valorización (multimoneda preparada).

### D4 · Operación
Combustible (multicombustible), horas hombre/horómetro, **checklist preoperacional** (mobile-first). Alimenta indicadores y mantenimiento.

### D5 · Personas
Usuarios, roles, técnicos, competencias/certificaciones. Base de responsables asignables (con historial).

### D6 · Compras / Proveedores
Proveedores y (preparado) órdenes de compra vinculadas a repuestos/servicios.

### D7 · Seguridad / Acceso
Autenticación gestionada, RBAC/ABAC por contexto organizacional, tenant scoping, gestión de permisos.

### D8 · Analítica / KPI
Indicadores (MTTR, MTBF, disponibilidad, costos, consumo), tableros y puente a BI (Power BI).

### D9 · Auditoría / Historial
Log inmutable de eventos y cambios; proyecciones de "estado actual" a partir del historial.

### D10 · IA / Asistencia
Mantenimiento predictivo, recomendaciones, asistente conversacional, detección de anomalías.

---

## 5. Arquitectura modular

- **Núcleo (Core):** Organización, Seguridad/Acceso, Auditoría. Son prerequisito de todo lo demás.
- **Módulos operativos:** Activos, Mantenimiento, Inventario, Operación (combustible/horas/checklist).
- **Módulos administrativos:** Personas, Compras/Proveedores, Catálogos, Configuración.
- **Módulos transversales:** Notificaciones, Documentos/Adjuntos, Historial, Búsqueda, Preferencias (idioma/moneda).
- **Módulos analíticos:** Indicadores, Tableros, Reportería, BI.
- **Módulos de IA:** Predicción, Recomendaciones, Asistente.

Cada módulo se implementa como paquete/dominio con su contrato OpenAPI, servicios y repositorio. La UI consume hooks generados; el backend valida con Zod generado. (Reutiliza el patrón contract-first actual descrito en `ARQUITECTURA_ACTUAL.md`.)

Detalle completo en `02_MAPA_MODULOS.md`.

---

## 6. Relaciones entre módulos

- **Organización (D0)** es referenciada por todos: aporta el contexto (tenant) obligatorio.
- **Seguridad (D7)** intercepta toda petición: autentica, resuelve contexto activo y autoriza.
- **Activos (D1)** consume Organización (asignaciones) y Personas (responsables); es consumido por Mantenimiento, Operación e Inventario.
- **Mantenimiento (D2)** consume Activos, Personas, Inventario (repuestos) y Catálogos.
- **Operación (D4)** consume Activos y Personas; alimenta Analítica y dispara Mantenimiento (p. ej. checklist con falla → OT).
- **Inventario (D3)** consume Organización (almacenes/ubicaciones) y Compras.
- **Auditoría (D9)** recibe eventos de todos los módulos (unidireccional, solo escritura desde ellos).
- **Analítica (D8)** e **IA (D10)** consumen datos de todos (solo lectura / proyecciones).

Regla de acoplamiento: los módulos **no acceden a las tablas de otros**; se comunican por servicios/contratos.

---

## 7. Flujo de información

```text
Usuario (web / PWA móvil)
   │  autenticación + selección de contexto (empresa/operación/proyecto)
   ▼
Capa Seguridad (D7)  ──► resuelve tenant + permisos
   │
   ▼
API v1 (contract-first, paginada, versionada)
   │
   ▼
Capa de Servicios por dominio (reglas de negocio)
   │        │                         │
   ▼        ▼                         ▼
Repositorios ──► Base de datos    Emisor de eventos ──► Auditoría (D9)
   │                                    │
   ▼                                    ▼
Proyecciones / lecturas          Analítica (D8) / IA (D10)
```

- **Entrada:** siempre validada (Zod) y contextualizada (tenant + usuario).
- **Escritura:** genera evento de auditoría; los cambios de asignación crean registros históricos, no sobrescriben.
- **Lectura:** filtrada por contexto y permisos; paginada.
- **Analítica/IA:** consumen proyecciones e historial, sin bloquear la operación.

---

## 8. Dependencias

| Módulo | Depende de |
|---|---|
| Organización (D0) | — (raíz) |
| Seguridad (D7) | Organización, Personas |
| Personas (D5) | Organización, Seguridad |
| Activos (D1) | Organización, Personas |
| Mantenimiento (D2) | Activos, Personas, Inventario, Catálogos |
| Inventario (D3) | Organización, Compras |
| Operación (D4) | Activos, Personas, Catálogos |
| Compras/Proveedores (D6) | Organización, Inventario |
| Auditoría (D9) | (recibe de todos, no depende funcionalmente) |
| Analítica (D8) | Todos (solo lectura) |
| IA (D10) | Analítica, Auditoría, Activos, Operación |

**Reglas de dependencia:** las flechas apuntan hacia el Core; ningún módulo del Core depende de módulos operativos. Sin dependencias circulares.

---

## 9. Escalabilidad

- **Multi-tenant por diseño:** particionamiento lógico por organización; índices por tenant.
- **Paginación y filtros estándar** en todos los listados (elimina el riesgo actual de listados sin paginar).
- **Atributos dinámicos** para tipos de activo → crecer en tipos sin cambiar el esquema.
- **Event-sourcing ligero** → el historial crece sin degradar la operación; las proyecciones aceleran la lectura.
- **Separación por dominios** → cada dominio puede evolucionar y, si hace falta, extraerse a servicio independiente.
- **Analítica/IA desacopladas** → cargas pesadas no afectan la transacción.
- **Preparado para multimoneda/multiidioma** → sin rediseño posterior.
- **Contract-first** → nuevos módulos se integran de forma predecible.

---

## 10. Reglas arquitectónicas (resumen)

1. Toda entidad transaccional pertenece a una organización (scoping obligatorio).
2. Ninguna relación activo↔contexto/responsable es permanente: siempre asignación con vigencia.
3. Ningún módulo depende del tipo de activo.
4. Todo cambio relevante genera historial inmutable.
5. Toda operación es auditable (quién, qué, cuándo, contexto).
6. Los catálogos son parametrizables; no strings mágicos.
7. El contrato (OpenAPI) es la fuente de verdad.
8. Los módulos se comunican por contratos, nunca por acceso cruzado a datos.
9. Toda API es versionada, paginada y protegida por auth + permisos.
10. Multimoneda y multiidioma se contemplan desde el modelo.

> El conjunto completo y detallado de reglas está en `04_PRINCIPIOS_SGMA.md`.
