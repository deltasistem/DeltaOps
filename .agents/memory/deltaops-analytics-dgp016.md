---
name: Analytics DGP-016
description: Lecciones del módulo analytics — indicadores como datos, fan-out de fuentes, OpenAPI obligatorio aunque el patrón se olvide.
---

# Enterprise Analytics & KPI Platform (DGP-016)

- **Indicadores/dashboards como DATOS declarativos**: el catálogo canónico (30 KPIs, 8 dashboards de sistema) se define como configuración con fallback, nunca código por indicador; el motor de evaluación es una función pura genérica (conteo/suma/promedio/ratio/duración/tasa + filtros/ventanas/agrupadores).
- **OpenAPI + drift es mandato de fase aunque el builder "no encuentre el patrón"**: el subagente afirmó que "ningún módulo tiene OpenAPI" pese a que correctivo/preventivo lo tienen — verificar afirmaciones de ausencia; su omisión fue MAYOR en revisión.
- **Toda fuente declarada debe estar registrada de verdad**: declarar 8 puertos y registrar 7 adaptadores = MAYOR (plataforma no reutilizable). Si un módulo congelado no expone query tenant-wide (correctivo eventos-activo solo por activoId), el fan-out vía otra query pública (activos.listar → agregar por activo) ES el adaptador permitido dentro del módulo nuevo.
- Filtro de dimensión→parámetro de fuente: mapear filtros del indicador (activo eq) a criterio.extra del puerto, o las evaluaciones devuelven vacío silencioso.
- DEMO sin datos falsos es literal: snapshots en 0 son legítimos si el tenant no captura ese dato (disponibilidad/costos); asertar "no todos cero", no "todos no-cero".
- Colisión de capacidades entre servicios de plataforma: capacidad `gestionar-dashboards` ya existía en platform → prefijar por módulo (`gestionar-dashboards-analytics`).
- Drift del tenant DEMO por corridas parciales: guardas de idempotencia pueden dejar estado a medias; el wipe idempotente por tenant (session_replication_role=replica) al inicio del seed lo hace determinista.
