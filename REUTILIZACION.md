# REUTILIZACION.md

> Clasificación pieza por pieza del proyecto **SGMA** de cara a la refactorización hacia una plataforma **EAM modular, multiempresa y multitenant**.
> Categorías: **REUTILIZAR** (tal cual o con cambios mínimos) · **REFACTORIZAR** (conservar la idea, rediseñar la implementación) · **ELIMINAR** (no sirve al nuevo alcance).
> Documento de solo lectura. No se modificó, refactorizó ni eliminó nada.

---

## REUTILIZAR (base sólida, se aprovecha directamente)

### Infraestructura y tooling
- **Monorepo pnpm** (`pnpm-workspace.yaml`, catálogo de versiones): estructura `artifacts/` + `lib/` + `scripts/`.
- **Configuración TypeScript** (`tsconfig.base.json`, project references composite/leaf).
- **Patrón contract-first** (OpenAPI → Orval → hooks React Query + Zod): es el activo más valioso; escala muy bien a nuevos módulos.
- **Logging del servidor** (`pino` + `pino-http`, singleton `logger`, convención sin `console.log`).
- **Build** (esbuild para API, Vite para frontend).

### Frontend — presentación
- **Sistema de componentes UI** (`components/ui/*`, shadcn/Radix): reutilizable casi íntegro.
- **AppShell / layout / navegación** (`app-shell.tsx`): estructura reutilizable (la lista de ítems de menú se ampliará).
- **Sistema de temas** (`theme-provider.tsx`, light/dark/system + `localStorage`).
- **Hooks utilitarios** (`use-mobile`, `use-toast`).
- **Utilidades de formato** (`lib/format.ts`: moneda, fecha, badges; locale es-CO / GMT-5).
- **Stack de datos cliente** (TanStack Query v5, react-hook-form + Zod resolvers).

### Backend — patrones puntuales
- **Generación race-safe de consecutivos** (`OT-NNNNN` con reintento + `UNIQUE`): patrón reutilizable para folios.
- **Transacción atómica movimiento+saldo** (repuestos): patrón correcto para inventario.
- **Validación I/O con Zod generado** (contrato como fuente de verdad).
- **Manejo de fechas** (validar `Invalid Date` → 400; `.toISOString()` en salida).

### Conceptos de dominio (la idea, no necesariamente el esquema)
- Los **módulos funcionales de CMMS** (activos, OT, preventivo, inventario, ubicaciones, centros, personal, proveedores) son correctos como puntos de partida conceptual.

---

## REFACTORIZAR (conservar el propósito, rediseñar la implementación)

### Modelo de datos (cambio profundo)
- **`assets`**: extraer ubicación/centro de la fila; añadir scoping multi-tenant (empresa/operación/proyecto/centro de costo) y una **tabla de asignaciones con vigencia** (`asset_assignments`) para el historial. Hacer `codigo` único por tenant.
- **`work_orders`, `maintenance_plans`, `spare_parts`, `stock_movements`, `locations`, `work_centers`, `technicians`, `suppliers`**: añadir columnas de tenant y **claves foráneas reales**; normalizar `estado`/`tipo`/`prioridad`/`tipo_frecuencia` a enums o catálogos.
- **Introducir integridad referencial** (FKs) e **índices** para escalar.

### Capa de API / servidor
- **Routers → capa de servicios/repositorios**: hoy los handlers mezclan acceso a datos + reglas de negocio + serialización (violan SRP/SOLID). Extraer servicios por dominio.
- **Enriquecimiento de listados (joins de display)**: hoy repetido en cada router → mover a repositorios/vistas compartidas.
- **Normalización de fechas duplicada** (`toDate`/`InvalidDateError` en `work-orders.ts` y `maintenance-plans.ts`) → extraer a `lib/*`.
- **Manejo de errores**: reemplazar los 400/404/500 ad-hoc por un **middleware de error centralizado**.
- **Contrato OpenAPI**: añadir paginación, filtros estándar, versionado (`/api/v1`) y esquemas multi-tenant.
- **Seguridad de transporte**: CORS restringido, `helmet`, rate limiting.

### Frontend — estructura
- **Router (`App.tsx`)**: añadir rutas de autenticación, ajustes y guardas por rol; introducir **selector de contexto activo** (empresa/operación/proyecto).
- **Navegación (`app-shell.tsx`)**: ampliar a los nuevos módulos y condicionar por permisos.
- **Páginas CRUD existentes**: reutilizables como plantilla, pero deben respetar el tenant activo y la paginación.

### Dashboard
- **Endpoints de agregación** (`dashboard.ts`): rediseñar para respetar scoping por tenant y, posiblemente, delegar analítica pesada a Power BI / capa de indicadores dedicada.

### Seed
- **`scripts/src/seed-sgma.ts`**: reescribir para el nuevo modelo multi-tenant.

---

## ELIMINAR (no aporta al nuevo alcance / deuda)

- **`cookie-parser`** en `api-server` (dependencia declarada sin uso). Reevaluar cuando se defina la estrategia de auth gestionada.
- **Modelo de relaciones fijas activo↔ubicación/centro** (columnas `ubicacion_id`/`centro_trabajo_id` como asignación permanente en `assets`): se elimina en favor de la tabla de asignaciones históricas. *(La columna puede migrarse, pero el enfoque se descarta.)*
- **Componentes `ui/*` no utilizados** por ningún módulo (carousel, menubar, input-otp, etc., si tras el rediseño siguen sin uso): depurar para reducir ruido. *(Bajo impacto; hacerlo al final.)*
- **Carpeta `middlewares/` vacía** tal como está (se reemplaza por middlewares reales: auth, tenant scoping, errores).
- **Roles como texto libre en `technicians`**: se elimina ese enfoque en favor de un sistema real de usuarios/roles/permisos.

---

## Resumen por capa

| Capa / pieza | Clasificación |
|---|---|
| Monorepo pnpm + catálogo + TS config | REUTILIZAR |
| Patrón contract-first (OpenAPI/Orval/Zod) | REUTILIZAR |
| Logging pino | REUTILIZAR |
| Componentes UI (shadcn/Radix) | REUTILIZAR |
| AppShell / temas / hooks / format | REUTILIZAR (ampliar) |
| Patrones: folio race-safe, tx atómica, validación fechas | REUTILIZAR |
| Esquema de BD (9 tablas) | REFACTORIZAR (profundo) |
| Routers API (lógica en handlers) | REFACTORIZAR (a servicios) |
| Enriquecimiento y normalización duplicados | REFACTORIZAR (extraer a lib) |
| Contrato OpenAPI (paginación/versionado/tenant) | REFACTORIZAR |
| Seguridad transporte (CORS/helmet/rate limit) | REFACTORIZAR |
| Router y navegación frontend | REFACTORIZAR (auth + contexto) |
| Dashboard / indicadores | REFACTORIZAR |
| Seed | REFACTORIZAR (reescribir) |
| Relaciones fijas activo↔ubicación/centro | ELIMINAR (→ asignaciones históricas) |
| Roles como texto libre | ELIMINAR (→ RBAC real) |
| `cookie-parser` sin uso | ELIMINAR |
| `middlewares/` vacío | ELIMINAR (→ middlewares reales) |
| UI components sin uso | ELIMINAR (depuración final) |

---

## Nota final

La refactorización hacia EAM modular es principalmente un **rediseño de la capa de dominio y datos**, no una reescritura del frontend. La mayor parte del valor de presentación y del andamiaje del monorepo se conserva. El esfuerzo se concentra en: **multi-tenancy, historial de asignaciones, integridad referencial, autenticación/RBAC y los módulos de negocio faltantes** (checklist preoperacional, hoja de vida, combustible, horas hombre, indicadores).
