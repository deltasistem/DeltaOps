# MODULOS_EXISTENTES.md

> **DOCUMENTO HISTÓRICO — SGMA retirado (DGP-023.2, 2026-08-13).** SGMA nunca llegó a producción y fue reemplazado por DeltaOps. Este documento describe el prototipo SGMA ya retirado y se conserva SOLO como referencia histórica; no refleja el estado actual del sistema.

> Inventario completo de módulos del sistema **SGMA** en su estado actual.
> Documento de solo lectura. No se modificó código.

Cada módulo se lista con: página frontend, ruta, router backend, endpoints, tabla(s) de datos y observaciones.

---

## 1. Dashboard / Indicadores

- **Frontend:** `artifacts/sgma/src/pages/dashboard.tsx` — ruta `/`
- **Backend:** `artifacts/api-server/src/routes/dashboard.ts`
- **Endpoints (solo lectura):**
  - `GET /api/dashboard/summary` — KPIs (equipos operativos, OT abiertas, stock bajo, MTTR).
  - `GET /api/dashboard/asset-status` — conteo por estado de activo (donut).
  - `GET /api/dashboard/work-orders-by-type` — OT por tipo.
  - `GET /api/dashboard/costs-by-month` — costos mensuales (barras).
  - `GET /api/dashboard/costs-by-asset` — costos por activo.
  - `GET /api/dashboard/recent-activity` — actividad reciente.
- **Datos:** agregaciones sobre `work_orders`, `assets`, `spare_parts`.
- **Observaciones:** funcional; gráfica de dona requiere `isAnimationActive={false}` para render correcto. Es un tablero interno; el negocio real usa Power BI (no integrado aquí).

## 2. Activos (Equipos)

- **Frontend:** `activos.tsx` (`/activos`), `activo-detalle.tsx` (`/activos/:id`)
- **Backend:** `routes/assets.ts`
- **Endpoints:** `GET /api/assets`, `POST /api/assets`, `GET /api/assets/:id`, `PATCH /api/assets/:id`, `DELETE /api/assets/:id`, `GET /api/assets/:id/history`
- **Tabla:** `assets`
- **Observaciones:** detalle con indicadores (horómetro/kilometraje/vida útil) e historial de OT. Relación fija a ubicación y centro de trabajo (sin historial de asignación). Filtros por tipo/estado. Sin paginación.

## 3. Órdenes de Trabajo (OT)

- **Frontend:** `ordenes.tsx` (`/ordenes`)
- **Backend:** `routes/work-orders.ts`
- **Endpoints:** `GET /api/work-orders`, `POST /api/work-orders`, `GET /api/work-orders/:id`, `PATCH /api/work-orders/:id`, `DELETE /api/work-orders/:id`
- **Tabla:** `work_orders`
- **Observaciones:** `numero` (`OT-NNNNN`) generado en servidor, race-safe con `UNIQUE`. `costoTotal` calculado (`costoManoObra + costoRepuestos`). Campos de análisis de falla (reporte, diagnóstico, causa raíz, solución). Validación de fechas → 400.

## 4. Mantenimiento Preventivo (Planes)

- **Frontend:** `preventivo.tsx` (`/preventivo`)
- **Backend:** `routes/maintenance-plans.ts`
- **Endpoints:** `GET /api/maintenance-plans`, `POST`, `PATCH /:id`, `DELETE /:id`
- **Tabla:** `maintenance_plans`
- **Observaciones:** frecuencia por tiempo u horómetro (`tipoFrecuencia`, `intervalo`, `unidad`, `proximaFecha`, `proximoHorometro`). Toggle activo/inactivo. No genera OT automáticamente (sin scheduler).

## 5. Repuestos / Inventario

- **Frontend:** `repuestos.tsx` (`/repuestos`)
- **Backend:** `routes/spare-parts.ts`
- **Endpoints:** `GET /api/spare-parts`, `POST`, `PATCH /:id`, `DELETE /:id`, `POST /api/spare-parts/:id/movements`
- **Tablas:** `spare_parts`, `stock_movements`
- **Observaciones:** resaltado de stock bajo (`stock < stockMinimo`). Movimiento (entrada/salida) + actualización de saldo en **transacción atómica**. Búsqueda por código/descripción.

## 6. Ubicaciones

- **Frontend:** `ubicaciones.tsx` (`/ubicaciones`)
- **Backend:** `routes/locations.ts`
- **Endpoints:** `GET /api/locations`, `POST`, `PATCH /:id`, `DELETE /:id`
- **Tabla:** `locations`
- **Observaciones:** listados enriquecidos con conteo de equipos. Catálogo simple.

## 7. Centros de Trabajo

- **Frontend:** `centros.tsx` (`/centros`)
- **Backend:** `routes/work-centers.ts`
- **Endpoints:** `GET /api/work-centers`, `POST`, `PATCH /:id`, `DELETE /:id`
- **Tabla:** `work_centers`
- **Observaciones:** catálogo simple. **Nota clave:** en el nuevo modelo EAM, "centro de trabajo" y "centro de costo" no son lo mismo; el modelo actual no distingue empresa/operación/proyecto/centro de costo.

## 8. Personal (Técnicos)

- **Frontend:** `personal.tsx` (`/personal`)
- **Backend:** `routes/technicians.ts`
- **Endpoints:** `GET /api/technicians`, `POST`, `PATCH /:id`, `DELETE /:id`
- **Tabla:** `technicians`
- **Observaciones:** roles como badges (campo de texto libre, no un sistema de roles/permisos). No es un módulo de usuarios/autenticación.

## 9. Proveedores

- **Frontend:** `proveedores.tsx` (`/proveedores`)
- **Backend:** `routes/suppliers.ts`
- **Endpoints:** `GET /api/suppliers`, `POST`, `PATCH /:id`, `DELETE /:id`
- **Tabla:** `suppliers`
- **Observaciones:** calificación por estrellas. Catálogo simple, sin vínculo a órdenes de compra ni a repuestos.

## 10. Salud / Infraestructura

- **Backend:** `routes/health.ts` — `GET /api/healthz`
- **Observaciones:** endpoint de estado. Sin frontend.

---

## Módulos transversales (no son de negocio, pero existen)

- **AppShell / Navegación:** `components/app-shell.tsx` — layout, sidebar, toggle de tema.
- **Sistema de temas:** `components/theme-provider.tsx` — light/dark/system con `localStorage`.
- **Sistema de UI:** `components/ui/*` (~50 componentes shadcn/Radix), `hooks/use-toast`, `hooks/use-mobile`.
- **Utilidades de formato:** `lib/format.ts` (moneda/fecha/badges, locale es-CO).
- **Contrato y codegen:** `lib/api-spec` (OpenAPI), `lib/api-client-react` (hooks), `lib/api-zod` (Zod).
- **Capa de datos:** `lib/db` (Drizzle schema + cliente).
- **Seed:** `scripts/src/seed-sgma.ts`.

---

## Módulos de negocio del contexto real que NO existen todavía

Según el requerimiento, el negocio ya opera estos procesos, pero **no están implementados** en SGMA:

- **Checklist Preoperacional** (inspección diaria de equipos antes de operar).
- **Hoja de Vida del activo** (historial consolidado: intervenciones, costos, componentes, fotos, documentos).
- **Control de Combustible** (tanqueos, consumos, rendimiento por equipo).
- **Horas Hombre** (registro de mano de obra por técnico/OT/turno).
- **Indicadores avanzados / Power BI** (más allá del dashboard interno actual).

Y los requisitos estructurales del nuevo alcance, **ausentes**:

- **Multiempresa / Multioperación / Multiproyecto / Multicentro de costo.**
- **Historial de asignaciones de activos** (cambios de empresa/operación/centro/proyecto/ubicación).
- **Usuarios, Roles y Permisos (autenticación + RBAC).**
- **PWA / Mobile-first para operación en campo.**

---

## Matriz resumen

| Módulo | Frontend | Backend | Tabla(s) | CRUD | Estado |
|---|---|---|---|---|---|
| Dashboard | ✔ | ✔ | (agregados) | solo lectura | Funcional |
| Activos | ✔ | ✔ | assets | completo + history | Funcional |
| Órdenes de Trabajo | ✔ | ✔ | work_orders | completo | Funcional |
| Preventivo | ✔ | ✔ | maintenance_plans | completo | Funcional (sin scheduler) |
| Repuestos | ✔ | ✔ | spare_parts, stock_movements | completo + movimientos | Funcional |
| Ubicaciones | ✔ | ✔ | locations | completo | Funcional |
| Centros de Trabajo | ✔ | ✔ | work_centers | completo | Funcional |
| Personal | ✔ | ✔ | technicians | completo | Funcional |
| Proveedores | ✔ | ✔ | suppliers | completo | Funcional |
| Checklist Preoperacional | ✘ | ✘ | — | — | **No existe** |
| Hoja de Vida | ✘ | ✘ | — | — | **No existe** |
| Control de Combustible | ✘ | ✘ | — | — | **No existe** |
| Horas Hombre | ✘ | ✘ | — | — | **No existe** |
| Autenticación / Roles | ✘ | ✘ | — | — | **No existe** |
| Multiempresa / Multitenant | ✘ | ✘ | — | — | **No existe** |
