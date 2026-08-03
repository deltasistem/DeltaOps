# DeltaOps — Checklist de validación de la plataforma (DGP-001)

Marque cada punto tras una instalación limpia:

## Infraestructura
- [ ] `pnpm install` termina sin errores
- [ ] `pnpm run typecheck` en verde (monorepo completo)
- [ ] Migración `0001_deltaops_init.sql` aplicada (esquema `deltaops` con `users` y `sessions`)
- [ ] Seed ejecutado: existe `admin@deltaops.dev`

## Backend
- [ ] `GET /api/deltaops/platform/health` → 200 `{"status":"ok"}`
- [ ] `GET /api/deltaops/platform/ready` → 200 `ready` con chequeo `database: ok`
- [ ] `GET /api/deltaops/platform/info` → nombre, versión `0.1.0-dgp001`, entorno, uptime
- [ ] `GET /api/deltaops/platform/metrics` → contadores de solicitudes/errores/latencia
- [ ] `POST /api/deltaops/auth/login` con credenciales seed → 200 + cookie `deltaops.sid`
- [ ] `POST /api/deltaops/auth/login` con credenciales inválidas → 401 (sin filtrar detalles)
- [ ] `GET /api/deltaops/auth/me` con sesión → 200; sin sesión → 401
- [ ] `POST /api/deltaops/auth/logout` → 204 y la sesión queda invalidada
- [ ] Logs estructurados (pino) visibles en la consola del API Server

## Frontend
- [ ] `/deltaops/` sin sesión redirige a login
- [ ] Login con seed entra a la consola de plataforma
- [ ] La consola muestra salud, readiness (con chequeos), info y métricas en vivo
- [ ] Cerrar sesión regresa al login y `me` vuelve a 401

## Calidad
- [ ] `pnpm --filter @workspace/api-server run test` → todas las pruebas en verde
- [ ] Pipeline CI definido en `.github/workflows/ci.yml`
- [ ] Generador funciona: `pnpm --filter @workspace/scripts run generate:module -- demo` (borrar artefactos tras probar)

## Portabilidad
- [ ] `docker compose config` válido (en un host con Docker)
- [ ] `.env.example` documenta todas las variables requeridas
