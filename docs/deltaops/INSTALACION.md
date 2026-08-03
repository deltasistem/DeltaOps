# DeltaOps — Guía de instalación (DGP-001)

## 1. Requisitos

- Node.js 22+ y pnpm 10+ (`corepack enable`)
- PostgreSQL 16+ (en Replit ya está provisionado; `DATABASE_URL` existe)
- Variables de entorno: ver `.env.example` en la raíz

## 2. Instalación

```bash
pnpm install
```

## 3. Base de datos

Las tablas de DeltaOps viven en el esquema PostgreSQL `deltaops`, aisladas de
`public`. Migraciones oficiales: archivos SQL numerados en
`lib/db/migrations/deltaops/`.

```bash
# Aplicar migraciones (desarrollo)
psql "$DATABASE_URL" -f lib/db/migrations/deltaops/0001_deltaops_init.sql

# Seed inicial (idempotente): crea admin@deltaops.dev / deltaops-dev-2026
pnpm --filter @workspace/scripts run seed:deltaops
```

En producción (Replit) el esquema se sincroniza con el flujo de publicación de
la plataforma; no ejecute scripts de migración manuales contra producción.

## 4. Ejecución local (Replit — modo oficial)

Los workflows nativos levantan cada servicio:

- `artifacts/api-server: API Server` — backend Express (rutas DeltaOps bajo `/api/deltaops/...`)
- `artifacts/deltaops: web` — frontend Vite (preview en `/deltaops/`)

## 5. Ejecución con Docker (fuera de Replit)

Replit no ejecuta Docker; los archivos son configuración portable equivalente.

```bash
export SESSION_SECRET="un-secreto-fuerte"
docker compose up --build
# API:  http://localhost:8080/api/deltaops/platform/health
# Web:  http://localhost:5173
```

## 6. Verificación

```bash
curl http://localhost:80/api/deltaops/platform/health   # {"status":"ok",...}
curl http://localhost:80/api/deltaops/platform/ready    # 200 ready / 503 not_ready
```

Ver `docs/deltaops/CHECKLIST_VALIDACION.md` para la lista completa.
