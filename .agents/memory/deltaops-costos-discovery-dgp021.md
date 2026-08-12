---
name: Discovery de costos DGP-021
description: Decisiones y hallazgos del discovery de costos de mantenimiento — arquitectura híbrida, GAPs bloqueantes y reglas para fases 021.x.
---

## Arquitectura aprobada para revisión: híbrido «module-costos delgado»
Materializar SOLO hechos económicos que no existen en ninguna fuente (inicialmente consumo valorizado de repuestos, vía orquestación api-server post-drain, patrón DGP-020.3); COMPONER sin copiar los que ya son snapshot (valoraciones de mano de obra, tanqueos). Read models de composición (costo OT/activo por moneda) son recalculables, no fuente de verdad.
**Why:** duplicar hechos snapshot crea dos fuentes de verdad; un proyector transversal exigiría suscripción cross-módulo por outbox que no existe.
**How to apply:** en DGP-021.x, jamás copiar valoraciones/tanqueos a tablas de costos; combustible se atribuye al ACTIVO, nunca a la OT (no existe vínculo tanqueo→OT y no debe inventarse).

## GAP-COST-14: no hay camino legal hoy al costo exacto de materiales
La query pública `modulo.abastecimiento.costos` expone floats JS; `abs_costos_read` es read model interno de abastecimiento (prohibido cross-módulo). Prerrequisito DGP-021.0: query pública nueva string-decimal (excepción §45 de Dirección). Nunca adaptadores provisionales sobre tablas internas ajenas ni consumir contratos float para dinero.

## Hallazgos clave del corpus (verificados con evidencia)
- Inventario: movimientos físicos SIN costo, SIN unidad explícita, SIN activo; relación a OT = referencia {tipo,id} opaca opcional. `registrar-recurso` de ordenes = referencia sin FK ni costo («solo referencias, sin inventario»).
- Abastecimiento: cost-engine valora al RECIBIR (promedio/último/estándar); consumido NO existe; impuestos NO existen; sin recálculo retroactivo; VO Dinero usa float JS aunque persista numeric.
- Tanqueos: hecho snapshot con anulación; moneda OPCIONAL sin fallback al tenant (demo tiene USD con tenant CLP) — agregaciones siempre por moneda, sin conversión.
- OT: activo_principal opcional/editable/opaco; costoReal manual = declaración sin fuente; tipo = clave de catálogo del tenant (sin semántica preventivo/correctivo garantizada); downtime NO existe.
- Denominador de costo/h = horómetro (nunca horas de sesión ni calendario); patrón `sin-datos` de utilización es la referencia para «sin datos ≠ $0».

## Lecciones del proceso
- En fases discovery-only con entregable único, cuidar `git add -A`: el reviewer falló R2 por commitear el directivo adjunto junto al doc (fix: reset soft + recommit solo el entregable).
