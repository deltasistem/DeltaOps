# SGMA — Sistema de Gestión de Mantenimiento

SGMA is a Spanish (Colombian) CMMS/EAM maintenance platform for a logistics company (fertilizers, coal, general cargo) that maintains heavy machinery and static equipment. It covers assets, work orders, preventive maintenance, spare-parts inventory, locations, work centers, personnel, and suppliers, with a KPI dashboard. Inspired by IBM Maximo, SAP PM, UpKeep, and Fiix.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/sgma run dev` — run the SGMA web frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run after editing `lib/*`)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only; interactive)
- `pnpm --filter @workspace/db run push-force` — non-interactive push (still needs TTY for constraint prompts; apply such DDL via SQL)
- `pnpm --filter @workspace/scripts run seed-sgma` — seed demo data
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite + wouter + TanStack Query + Recharts + Tailwind (shadcn-style UI)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — 9 tables: locations, work_centers, assets, technicians, suppliers, spare_parts, work_orders, maintenance_plans, stock_movements
- API contract (source of truth): OpenAPI spec in `lib/api-spec/`; generated hooks in `lib/api-client-react/src/generated/`, Zod in `@workspace/api-zod`
- API route handlers: `artifacts/api-server/src/routes/` (registered in `routes/index.ts`)
- Frontend pages: `artifacts/sgma/src/pages/` (routes wired in `src/App.tsx`)
- Formatting helpers: `artifacts/sgma/src/lib/format.ts` (currency/date/badge)
- Seed script: `scripts/src/seed-sgma.ts`

## Architecture decisions

- Contract-first: define OpenAPI, run codegen, then implement. Server validates I/O with generated Zod; client uses generated TanStack Query hooks.
- Dates: DB returns `Date`; response Zod expects ISO strings, so handlers `.toISOString()` on the way out and convert incoming date strings to `Date` (with `Invalid Date` → 400) on the way in.
- `costoTotal` for work orders is computed (`costoManoObra + costoRepuestos`), not stored.
- Work-order `numero` is generated server-side (`OT-00001`) using `max(numero)+1` inside a retry loop, backed by a UNIQUE constraint on `work_orders.numero` to stay race-safe.
- Stock movements insert the movement and update `spare_parts.stock` inside a single DB transaction (atomic audit + balance).
- List responses are enriched with joined display names (e.g. `equipoNombre`, `ubicacionNombre`).
- IDs are plain integers without FK constraints (referential integrity deferred to a later phase).

## Product

Modules: dashboard KPIs (operational equipment, open WOs, low stock, MTTR; asset-status donut + monthly-cost bar charts), assets (list + detail with WO history timeline), work orders, preventive maintenance plans, spare-parts inventory with stock movements, locations, work centers, personnel, suppliers. Responsive, light + dark mode (toggle persists in localStorage). Colombian locale (es-CO, GMT-5).

Deferred to later phases: auth/roles, dynamic checklists, AI, WhatsApp, digital signature.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Never use `console.log` in server code — use `req.log` in handlers, the singleton `logger` elsewhere.
- `drizzle-kit push` requires a TTY for constraint-change prompts; in this environment apply such DDL directly via SQL.
- After editing `lib/*`, run `pnpm run typecheck:libs` before leaf typechecks (stale declarations cause phantom missing-export errors).
- Do not change the OpenAPI `info.title` — it controls generated filenames.
- Frontend mutations invalidate the base list query key (no params) so all filtered cache variants refresh.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
