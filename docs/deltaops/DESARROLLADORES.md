# DeltaOps — Guía de desarrolladores (DGP-001)

## Estructura definitiva (fábrica de ingeniería)

```
lib/
  api-spec/openapi.yaml          # Contrato OpenAPI (fuente de verdad, contract-first)
  api-zod/src/generated/         # Validadores Zod generados (backend)
  api-client-react/src/generated # Hooks TanStack Query generados (frontend)
  db/src/schema/deltaops.ts      # Esquema Drizzle (esquema PG "deltaops")
  db/migrations/deltaops/        # Migraciones SQL oficiales numeradas
artifacts/
  api-server/src/deltaops/       # Plataforma: config, sesión, métricas, errores, tests
  api-server/src/routes/deltaops # Rutas /api/deltaops/... (plataforma + auth)
  deltaops/                      # Frontend React + Vite (consola de plataforma)
scripts/src/
  seed-deltaops.ts               # Seed idempotente
  generate-deltaops-module.ts    # Generador oficial de módulos
docs/deltaops/                   # Esta documentación
docker/, docker-compose.yml      # Configuración portable (no ejecutable en Replit)
.github/workflows/ci.yml         # Pipeline de calidad
```

## Flujo contract-first (obligatorio)

1. Declarar rutas y esquemas en `lib/api-spec/openapi.yaml` (prefijo `/deltaops/...`, esquemas `Deltaops*`).
2. `pnpm --filter @workspace/api-spec run codegen`
3. Backend: implementar en `artifacts/api-server/src/routes/deltaops/`, validando E/S con `@workspace/api-zod`.
4. Frontend: consumir solo hooks generados de `@workspace/api-client-react`.

## Convenciones backend

- Express 5: handlers `async (req, res): Promise<void>`; responder con `res.status(...).json(...); return;`
- Logging estructurado: `req.log` (pino). Prohibido `console.log` en el servidor.
- Errores: lanzar `DeltaopsHttpError(status, mensaje)`; el manejador central (`src/deltaops/errors.ts`) responde `{ error }` y cuenta la falla en métricas.
- Configuración: toda variable de entorno pasa por `loadDeltaopsConfig()` (falla explícita al arrancar).
- Sesiones: `express-session` + `connect-pg-simple` sobre `deltaops.sessions`; contraseñas con bcrypt.

## Base de datos

- Todas las tablas DeltaOps en el esquema PG `deltaops` (`deltaopsSchema` en Drizzle).
- Cada cambio de esquema = nuevo archivo SQL numerado en `lib/db/migrations/deltaops/` + espejo en Drizzle + export en `lib/db/src/schema/index.ts`.

## Generador oficial

```bash
pnpm --filter @workspace/scripts run generate:module -- nombre-modulo
```

Genera router backend + tabla Drizzle con las convenciones de la fábrica. No sobrescribe archivos existentes.

## Calidad

```bash
pnpm run typecheck                              # monorepo completo
pnpm --filter @workspace/api-server run test    # pruebas base (vitest)
pnpm exec prettier --write .                    # formato
```

El pipeline (`.github/workflows/ci.yml`) ejecuta instalación reproducible, typecheck, formato y pruebas. Ningún cambio se integra en rojo.
