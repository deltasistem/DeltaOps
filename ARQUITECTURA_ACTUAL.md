# ARQUITECTURA_ACTUAL.md

> Auditoría técnica del sistema **SGMA — Sistema de Gestión de Mantenimiento**
> Fecha de auditoría: 2026-07-30
> Naturaleza: **informe de solo lectura**. No se modificó código, arquitectura, base de datos ni dependencias.

---

## Resumen ejecutivo

SGMA es una aplicación **CMMS** (Computerized Maintenance Management System) funcional, construida como un **monorepo pnpm** con enfoque *contract-first* (OpenAPI como fuente de verdad). Está bien organizada para su alcance actual: código limpio, tipado estricto, generación de clientes/validadores desde el contrato y separación clara entre frontend, API y librerías compartidas.

Sin embargo, el sistema **NO está preparado, en su estado actual, para convertirse en la plataforma EAM modular** descrita en el nuevo requerimiento (multiempresa, multicentro de costo, multioperación, multiproyecto, historial de asignaciones, multiusuario/multirol, PWA/mobile-first). Los obstáculos principales son estructurales y de modelo de datos:

- **No existe multi-tenancy** (ni empresa, ni operación, ni proyecto, ni centro de costo como entidades).
- **No existe autenticación, usuarios, roles ni permisos** (diferido explícitamente en el diseño actual).
- **El modelo de datos asume relaciones fijas** entre activo → ubicación / centro de trabajo. No hay historial de asignaciones. Esto contradice directamente el requerimiento nuevo ("los activos NO pertenecen permanentemente a un centro de costo").
- **No hay integridad referencial** (IDs enteros sueltos, sin claves foráneas).
- **Faltan módulos de negocio clave** del contexto real: checklist preoperacional, hoja de vida, control de combustible, horas hombre, indicadores/Power BI.

Conclusión: la **capa de presentación (frontend), el patrón contract-first y la infraestructura del monorepo son ampliamente reutilizables**; la **capa de dominio/datos requiere un rediseño profundo** para soportar EAM modular y multiempresa.

---

## Tecnologías

### Núcleo
- **Gestor de paquetes / monorepo:** pnpm workspaces (catálogo de versiones centralizado en `pnpm-workspace.yaml`).
- **Lenguaje:** TypeScript 5.9 (modo estricto, `tsconfig.base.json` compartido).
- **Runtime:** Node.js 24.

### Backend (`artifacts/api-server`)
- **Framework:** Express 5.
- **ORM:** Drizzle ORM sobre **PostgreSQL**.
- **Validación:** Zod (`zod/v4`) + `drizzle-zod`, esquemas **generados** desde OpenAPI (`@workspace/api-zod`).
- **Logging:** `pino` + `pino-http` (nunca `console.log` en el servidor).
- **Build:** esbuild (bundle CJS/ESM vía `build.mjs`).
- **CORS:** `cors` abierto (`app.use(cors())`).
- Presente pero **sin uso real:** `cookie-parser` (dependencia declarada, no hay manejo de sesión/cookies).

### Frontend (`artifacts/sgma`)
- **Framework:** React 19 + Vite 7.
- **Routing:** `wouter` (ligero, basado en `base` de `import.meta.env.BASE_URL`).
- **Data fetching / cache:** TanStack Query v5, con **hooks generados por Orval**.
- **UI:** Tailwind CSS v4 + componentes estilo shadcn/ui (Radix UI primitives).
- **Gráficas:** Recharts.
- **Formularios:** react-hook-form + `@hookform/resolvers` (Zod).
- **Iconos:** lucide-react.
- **Temas:** provider propio con persistencia en `localStorage` (light/dark/system).
- **Fechas:** date-fns (locale es-CO, GMT-5).

### Contrato y generación de código
- **OpenAPI** en `lib/api-spec/openapi.yaml` (fuente de verdad).
- **Orval** genera: hooks React Query (`lib/api-client-react`) y esquemas Zod (`lib/api-zod`).

---

## Estructura de carpetas

```text
workspace/
├── artifacts/                       # Aplicaciones desplegables
│   ├── api-server/                  # API Express (servicio /api)
│   │   ├── src/
│   │   │   ├── app.ts               # Configuración Express (cors, json, pino, router)
│   │   │   ├── index.ts             # Bootstrap del servidor
│   │   │   ├── lib/logger.ts        # Singleton pino
│   │   │   ├── middlewares/         # (carpeta presente)
│   │   │   └── routes/              # 1 archivo por recurso + index.ts
│   │   └── build.mjs                # Build esbuild
│   ├── sgma/                        # Frontend React+Vite (servicio /)
│   │   └── src/
│   │       ├── App.tsx              # Router + providers
│   │       ├── components/
│   │       │   ├── app-shell.tsx    # Layout + navegación lateral
│   │       │   ├── empty-state.tsx
│   │       │   ├── theme-provider.tsx
│   │       │   └── ui/              # ~50 componentes shadcn/Radix
│   │       ├── pages/               # 11 páginas (1 por módulo)
│   │       ├── hooks/               # use-mobile, use-toast
│   │       └── lib/                 # format.ts, utils.ts
│   └── mockup-sandbox/              # Canvas de prototipos (design)
├── lib/                             # Librerías compartidas (composite)
│   ├── api-spec/                    # openapi.yaml + orval.config.ts
│   ├── api-client-react/            # Hooks React Query generados
│   ├── api-zod/                     # Esquemas Zod generados
│   └── db/                          # Drizzle: schema/ + cliente
├── scripts/                         # Utilidades (seed-sgma.ts)
├── pnpm-workspace.yaml              # Discovery + catálogo de versiones
├── tsconfig.base.json / tsconfig.json
└── replit.md                        # Documentación de proyecto
```

**Observación positiva:** la separación *artifacts (leaf) / lib (composite)* es correcta y coherente con el patrón del monorepo. Los artifacts no se importan entre sí; comparten a través de `lib/*`.

**Observación de deuda:** existe la carpeta `artifacts/api-server/src/middlewares/` pero está prácticamente vacía; no hay middlewares de negocio (auth, tenant scoping, manejo centralizado de errores).

---

## Flujo de navegación

Routing SPA con `wouter`. Todas las rutas cuelgan de `AppShell` (navegación lateral fija):

| Ruta | Página | Módulo |
|---|---|---|
| `/` | `dashboard.tsx` | Dashboard / KPIs |
| `/activos` | `activos.tsx` | Listado de activos |
| `/activos/:id` | `activo-detalle.tsx` | Detalle de activo + historial de OT |
| `/ordenes` | `ordenes.tsx` | Órdenes de trabajo |
| `/preventivo` | `preventivo.tsx` | Planes de mantenimiento preventivo |
| `/repuestos` | `repuestos.tsx` | Inventario de repuestos + movimientos |
| `/ubicaciones` | `ubicaciones.tsx` | Ubicaciones |
| `/centros` | `centros.tsx` | Centros de trabajo |
| `/personal` | `personal.tsx` | Técnicos / personal |
| `/proveedores` | `proveedores.tsx` | Proveedores |
| `*` | `not-found.tsx` | 404 |

- **No hay rutas de autenticación** (login, registro, recuperación), ni onboarding, ni configuración/ajustes.
- **No hay guardas de ruta** (route guards) ni control de acceso por rol.
- La navegación es plana; no hay concepto de contexto activo (empresa/proyecto/centro seleccionado).

---

## Dependencias

### Fortalezas
- Versiones centralizadas en **catálogo pnpm** → consistencia entre paquetes.
- Stack moderno y mantenido (React 19, Vite 7, Express 5, Drizzle, TanStack Query v5, Zod).
- Separación correcta `dependencies` (runtime servidor) vs `devDependencies` (cliente/tooling).

### Riesgos / observaciones
- `cookie-parser` declarado en el servidor **sin uso** → dependencia muerta (o placeholder de una feature de sesión nunca implementada).
- Amplio set de primitivas Radix incluidas por el scaffold shadcn; muchas **no se usan aún** (peso de mantenimiento bajo, pero ruido).
- No hay dependencias de: autenticación (Clerk/Replit Auth), gestión de estado global de servidor multi-tenant, colas/jobs, almacenamiento de objetos, o PWA (service worker / workbox).
- No hay librería de tests (ni unit ni e2e) declarada.

---

## Base de datos

Motor: **PostgreSQL** vía Drizzle. **9 tablas.** Detalle completo en `MODELO_DATOS_ACTUAL.md`.

- `locations`, `work_centers`, `assets`, `technicians`, `suppliers`, `spare_parts`, `work_orders`, `maintenance_plans`, `stock_movements`.
- **Todas las PK son `serial` (entero autoincremental).**
- **Única restricción no-PK relevante:** `work_orders.numero` es `UNIQUE` (añadida para hacer race-safe la generación de `OT-NNNNN`).
- **No hay claves foráneas.** Las relaciones se expresan con columnas `*_id` enteras sin `REFERENCES`. La integridad referencial está diferida (documentado en `replit.md`).
- Fechas con `timestamp withTimezone`.

---

## Relaciones

Relaciones **lógicas** (no forzadas por la BD):

- `assets.ubicacionId` → `locations.id`
- `assets.centroTrabajoId` → `work_centers.id`
- `work_orders.equipoId` → `assets.id`
- `work_orders.tecnicoId` → `technicians.id`
- `work_orders.centroTrabajoId` → `work_centers.id`
- `maintenance_plans.equipoId` → `assets.id`
- `spare_parts.ubicacionId` → `locations.id`
- `stock_movements.repuestoId` → `spare_parts.id`

**Problema crítico frente al nuevo requerimiento:** la relación activo↔ubicación/centro es **1:1 fija embebida en la fila del activo**. No existe tabla de asignaciones ni historial. El requerimiento nuevo exige que un activo cambie de empresa/operación/centro/proyecto/ubicación a lo largo de su vida útil **con historial** — esto **no es soportable** sin rediseñar el modelo.

---

## APIs

Contrato REST bajo prefijo `/api`, definido en OpenAPI. Enriquecimiento de listados con nombres unidos (join) para display (`equipoNombre`, `ubicacionNombre`, etc.).

Recursos CRUD: `assets`, `work-orders`, `maintenance-plans`, `spare-parts`, `locations`, `work-centers`, `technicians`, `suppliers`.
Endpoints de dashboard (solo lectura): `summary`, `asset-status`, `work-orders-by-type`, `costs-by-month`, `costs-by-asset`, `recent-activity`.
Extra: `assets/:id/history`, `spare-parts/:id/movements` (transacción atómica), `healthz`.

Ver inventario completo de endpoints en `MODULOS_EXISTENTES.md`.

**Buenas prácticas presentes:**
- Validación de entrada y salida con Zod generado.
- `OT-NNNNN` generado en servidor con reintento + `UNIQUE` (race-safe).
- `costoTotal` de OT es **calculado** (no almacenado).
- Movimiento de stock + actualización de saldo en **una sola transacción**.
- Fechas: entrada valida `Invalid Date` → 400; salida `.toISOString()`.

**Carencias:**
- **Sin autenticación ni autorización** en ningún endpoint.
- **Sin scoping por tenant** (cualquier consumidor ve todos los datos).
- **Sin paginación** en los listados (riesgo a escala).
- **Sin rate limiting, sin CSRF/headers de seguridad** (helmet ausente), CORS totalmente abierto.
- **Sin versionado de API** (`/api/v1`).

---

## Estado actual

- **Funcional y verificado**: las 11 pantallas renderizan con datos reales sembrados; CRUD completo operativo; light/dark mode; locale colombiano.
- **Calidad de código alta para el alcance actual**: contract-first, tipado estricto, logging correcto, sin `console.log` en servidor.
- **Madurez de producción baja**: sin auth, sin multi-tenant, sin tests automatizados, sin paginación, sin CI de calidad, sin PWA.
- Es, en resumen, un **CMMS mono-tenant de demostración sólido**, no una plataforma EAM empresarial.

---

## Riesgos

| # | Riesgo | Severidad | Impacto |
|---|---|---|---|
| R1 | Ausencia total de autenticación/autorización | **Crítica** | Cualquiera con acceso a la red lee/escribe todos los datos. |
| R2 | Sin multi-tenancy (empresa/operación/proyecto/centro) | **Crítica** | Bloquea el objetivo central del nuevo requerimiento. |
| R3 | Relaciones fijas activo↔ubicación/centro, sin historial | **Crítica** | Contradice el requerimiento de reasignación con historial. |
| R4 | Sin claves foráneas (integridad referencial) | Alta | Datos huérfanos, inconsistencias silenciosas. |
| R5 | Sin paginación en listados | Alta | Degradación de performance a escala (miles de activos/OT). |
| R6 | Sin headers de seguridad / CORS abierto / sin rate limit | Alta | Superficie de ataque amplia en producción. |
| R7 | Sin tests automatizados | Media | Refactor de alto riesgo sin red de seguridad. |
| R8 | Módulos de negocio reales faltantes (combustible, checklist, hoja de vida, horas hombre, indicadores) | Media | Brecha funcional grande respecto al negocio. |
| R9 | Dependencias muertas / UI sin usar | Baja | Ruido de mantenimiento. |
| R10 | Sin PWA / mobile-first real | Media | No cumple requerimiento de plataforma móvil. |

---

## Oportunidades

1. **Reutilizar el patrón contract-first** (OpenAPI → Orval → hooks/Zod) como columna vertebral del rediseño; escala muy bien a más módulos.
2. **Reutilizar la infraestructura del monorepo** (catálogo, artifacts/lib, tipado estricto, logging pino).
3. **Reutilizar la capa de presentación** (AppShell, sistema de componentes shadcn, temas, formato es-CO) casi tal cual.
4. **Introducir multi-tenancy desde el modelo de datos** con columnas de tenant y tabla de asignaciones históricas (event-sourcing ligero para movimientos de activos).
5. **Adoptar autenticación gestionada** (Clerk o Replit Auth) en vez de rodar auth local; añadir RBAC/ABAC.
6. **Añadir claves foráneas + paginación + índices** como base de escalabilidad.
7. **Modularizar por dominio** (bounded contexts): Activos, Mantenimiento, Inventario, Combustible, HSE/Checklist, Personal/Horas, Indicadores.
8. **Convertir a PWA mobile-first** para operación en campo (checklists preoperacionales).

---

## Deuda técnica

- **Modelo de datos plano y acoplado a un solo tenant**; sin FKs, sin historial, sin catálogos normalizados (tipos/estados como `text` libre en vez de enums o tablas de catálogo).
- **Estados y tipos como strings mágicos** (`estado`, `tipo`, `prioridad`, `tipoFrecuencia`) sin enum centralizado compartido cliente/servidor.
- **Lógica de normalización de fechas duplicada** entre `work-orders.ts` y `maintenance-plans.ts` (mismo patrón `toDate`/`InvalidDateError` copiado).
- **Enriquecimiento (joins de display) repetido** en cada router en vez de una capa de servicio/repositorio compartida.
- **Sin capa de servicios**: los handlers de ruta contienen acceso a datos + reglas de negocio + serialización → violación de responsabilidad única.
- **`middlewares/` vacío**; sin manejo centralizado de errores (cada handler arma su propio 400/404/500).
- **`cookie-parser` sin uso**.
- **Sin tests**.

---

## Recomendaciones (para la fase de refactor — no ejecutadas aquí)

1. **Definir el modelo EAM multi-tenant primero** (empresa → operación → proyecto → centro de costo → ubicación) y una **tabla de asignaciones de activos con vigencia** (`asset_assignments` con `desde/hasta`). Ver `MODELO_DATOS_ACTUAL.md` para el estado de partida.
2. **Incorporar autenticación gestionada + RBAC** antes de exponer más datos.
3. **Introducir capa de servicios/repositorios** por dominio, sacando la lógica de los routers.
4. **Normalizar catálogos** (tipos de activo, estados, prioridades) y usar enums compartidos.
5. **Añadir FKs, índices y paginación** al contrato y a la BD.
6. **Extraer utilidades duplicadas** (fechas, enriquecimiento) a `lib/*`.
7. **Añadir helmet, rate limiting, CORS restringido y versionado `/api/v1`.**
8. **Establecer pruebas** (unit para servicios, e2e para flujos críticos) antes de refactorizar en grande.
9. **Planificar los módulos de negocio faltantes** como paquetes/dominios independientes.

> Clasificación pieza-por-pieza (REUTILIZAR / REFACTORIZAR / ELIMINAR) en `REUTILIZACION.md`.
