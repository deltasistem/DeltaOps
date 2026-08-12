---
name: Fundación module-costos DGP-021.1
description: Modelo de hechos económicos, reglas de idempotencia obligatoria y lecciones de la fundación de costos.
---

## Modelo de hecho económico
`cos_hechos` (esquema deltaops): identidad del hecho (costoId, tipo MATERIAL/COMBUSTIBLE/MANO_DE_OBRA/OTROS, originType/originId, otId verificado, activoId DERIVADO de la OT, identityId canónico, opId) separada de datos snapshot (cantidad/costoUnitario/costoTotal numeric(18,6) string-safe, moneda, unidad, fuente jsonb). Estados solo ACTIVO/ANULADO con CHECK de coherencia de anulación (anulado_at/por/motivo); append-only, bitácora `cos_eventos` y recibos `cos_recibos` en la misma UoW. Consultas siempre por read models tenant-scoped; multi-moneda ⇒ series separadas por moneda, jamás sumadas.

## Idempotencia es invariante, no opción
opId OBLIGATORIO (zod: trim, 8–200, ASCII imprimible) en TODO comando mutante; reclamar() falla cerrado sin opId y el claim ocurre ANTES de cualquier lookup (OT/fuente) o efecto; cero fallbacks `opId ?? randomUUID()` (randomUUID solo para identidad de entidad).
**Why:** R1 FAIL (MAYOR): con opId opcional un reintento genera hechos duplicados y el índice único (tenant,op_id) no protege nada si cada intento fabrica un opId nuevo.
**How to apply:** en cualquier comando nuevo del programa, opId requerido en schema + claim fail-closed + test «sin opId ⇒ rechazado sin fila».

## Fronteras cross-módulo de costos
Solo contratos públicos: `ordenes.detalle` (OT verificable, activo derivado, NF→null), `abastecimiento.costos-exactos` (strings crudos). Prohibido abs_costos_read, endpoint float legacy, handlers sobre eventos ajenos. Gancho 021.2: `hecho.materializar-material` idempotente disparable fail-safe desde api-server.

## Lecciones operativas
- Habilitar módulo nuevo por tenant: PATCH `/api/deltaops/admin/tenants/:id/modules` (superadmin) con la lista completa + clave nueva; sin esto todo da 403 MODULE_NOT_ENTITLED. El seed demo debería reafirmar la lista de módulos.
- Las tablas del dominio viven en el esquema PG `deltaops` (psql: calificar `deltaops.cos_*`).
- Tenant demo sin catálogos de abastecimiento ⇒ no se pueden crear artículos vía API sin sembrar catálogos; el camino MATERIAL E2E completo requiere seed de catálogos/recepciones (pendiente natural de 021.2).
