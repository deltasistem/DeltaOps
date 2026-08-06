---
name: Experiencia Inventario DGP-011.3
description: Lecciones de la experiencia de inventario y del tenant DEMO delta-demo.
---

# Enterprise Inventory Experience + Tenant DEMO (DGP-011.3)

- **Las acciones de workflow de la UI deben mapear 1:1 a transiciones reales del motor**: mapear varios botones (aprobar/despachar/recibir/cancelar) a un único comando "completar" fue CRÍTICO. Si el dominio no expresa una acción, se añade el comando de transición explícito ({accion, expectedVersion, opId, motivo?}) o se elimina el botón — nunca se simula.
- **Decisiones operativas deben ser campos autoritativos del comando** (p.ej. `aplicarDiferencias: boolean` en cerrar-conteo), no flags que el backend ignora. Cancelar/rechazar transferencias restituyen el en-tránsito al origen (conservación de masa); solo recibir/completar mutan destino.
- **Todo cambio de esquema Drizzle exige su migración .sql aditiva en lib/db/migrations/deltaops** (ALTER ... IF NOT EXISTS + DEFAULT para backfill). Columna solo en el espejo = CRÍTICO de despliegue (BD limpia rompería login/seed).
- Tenant DEMO permanente `delta-demo` (empresa DELTA DEMO, admin admin@delta.demo, usuario id=3): seed idempotente y state-aware `pnpm --filter @workspace/api-server run seed:demo`, TODO vía comandos oficiales con `drenarCompleto()` (drenar el outbox en bucle tras cada módulo — runtimes comparten kernel_outbox y un runtime ajeno se traga eventos de otro). Credencial SOLO en el seed.
- **Las suites PG de módulos limpian read models sin filtrar por tenant y vacían los datos DEMO** — re-ejecutar seed:demo tras correrlas.
- `users.tenant` selecciona el contexto por usuario en los middlewares de módulo; el aislamiento efectivo con conexión superusuario (sin FORCE RLS) lo dan los predicados tenant_id de los repos.
- Rutas de detalle `/:id` capturan literales tipo `/items` — el listado de inventario vive en la BASE del módulo (GET /api/deltaops/inventario); registrar sub-rutas estáticas antes de `/:id`.
