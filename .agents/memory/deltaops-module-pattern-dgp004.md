---
name: DeltaOps module pattern (DGP-004)
description: Reglas duraderas del molde oficial de módulos (Reference Module) y lecciones de la revisión de arquitectura.
---

Guía canónica escrita en `docs/deltaops/modulo-referencia/COMO-CONSTRUIR-UN-MODULO.md` — todo módulo futuro debe copiar ese molde.

Lecciones no obvias (hallazgos de la revisión de arquitectura, ya corregidos en el módulo de referencia — no repetirlos en módulos futuros):

- **RLS también en lecturas**: los adaptadores PG del módulo nunca usan `pool.query` desnudo; toda lectura pasa por una transacción con `set_config('app.tenant_id',…)` (helper `withTenantRead`). **Why:** con rol sin BYPASSRLS las lecturas devuelven vacío; con rol owner un predicado olvidado filtra entre tenants.
- **Proyección/efectos solo desde el payload del evento** (payload autosuficiente: nombre, descripcion, estado, version, createdBy, actualizadoAt). **Why:** releer el aggregate en un handler permite que una reentrega tardía proyecte estado posterior bajo un evento viejo.
- **Queries = solo read model** (CQRS estricto); `detalle` no toca el repositorio. El read model lleva las columnas que la UI necesita (p. ej. created_by).
- **Handlers at-least-once necesitan recibo**: los efectos de activación usan el snapshot KPI con dimensión `eventId` como recibo de idempotencia (se ejecuta al final, se chequea al principio); notification groupKey y webhook payload incluyen el eventId.
- **Sync offline necesita recibos durables por opId** (`deltaops.ref_sync_receipts`, RLS): reintentar una op aplicada con respuesta perdida devuelve el recibo en vez de re-ejecutar (evita falsos KRN-CFL-001). El cliente solo descarta de la cola las ops aplicadas; las fallidas quedan persistidas como conflictos visibles.
- **Mínimo privilegio**: `operador` recibe solo permisos del módulo + los de plataforma imprescindibles (comment/attachment/timeline/search/config.read/ai.infer); la consola de plataforma exige rol admin/platform_admin.
- Ojo al probar rutas API con curl: el catch-all del SPA devuelve 200 para rutas inexistentes — probar contra una ruta real del router.
