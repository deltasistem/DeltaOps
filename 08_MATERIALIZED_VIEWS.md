# 08_MATERIALIZED_VIEWS.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de vistas materializadas: cuáles existirán, cómo se reconstruyen y cuándo.
> "Vista materializada" aquí es el concepto (agregación persistida y refrescada), no la característica homónima de ningún motor.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Cuándo se materializa (y cuándo no)

Se materializa una vista cuando se cumplen las tres:
1. La consulta agrega **muchos hechos** (miles+) por lectura,
2. se lee **mucho más** de lo que cambia, y
3. tolera frescura declarada (no exige el instante).

No se materializa: lo que se lee poco (se calcula al vuelo), lo que cambia tanto como se lee, y lo que exige verdad instantánea (saldos para validar comandos usan el estado vigente del agregado, 02 §4 — jamás una vista).

## 2. Catálogo de vistas materializadas

| Vista | Grano | Sirve a |
|---|---|---|
| KPIs de mantenimiento (disponibilidad, MTTR, MTBF, cumplimiento) | periodo × nodo organizacional × tipo de activo | Dashboards, drill-down U-05 |
| Costos consolidados (repuestos + HH + combustible + servicios) | periodo × activo × categoría de costo | Hoja de vida, gerencia, marts |
| Consumo de combustible/energía y rendimiento | periodo × activo/flota | Vigilancia de consumo, IA |
| Saldos históricos de inventario y rotación | corte × ítem × bodega | Reposición, conteos, marts |
| Backlog y envejecimiento de OTs | corte diario × estado × ámbito | Panel del planificador |
| Descendencia organizacional (árbol aplanado) | nodo → todos sus descendientes | Toda consulta jerárquica (02 §7) |
| Cumplimiento de preventivos | plan × periodo | Alertas, cumplimiento contractual |
| Resumen de sincronización por dispositivo | dispositivo × día | Panel de soporte (ETS-008/12 §7) |

El catálogo crece por evidencia (una consulta lenta y frecuente lo justifica, 15), nunca especulativamente; cada vista se registra con dueño, fuente, grano y frescura objetivo (gobernanza ETS-006/07).

## 3. Cómo se reconstruyen

- **Refresco incremental por eventos** como régimen normal: cada vista es un consumidor con cursor (ETS-008/09 §8) que aplica deltas — un tanqueo suma al periodo del activo, no dispara un recálculo global.
- **Hechos por fecha de negocio:** un hecho tardío re-proyecta el periodo al que pertenece, no el actual (04 §5); las vistas de corte (backlog diario) son fotos append-only que no se reescriben.
- **Reconstrucción total** (replay desde el flujo, ETS-008/09 §5) reservada para: corrección de defecto de proyección, cambio de definición (grano nuevo, KPI redefinido) o recuperación de pérdida. Se construye la versión nueva **en paralelo**, se valida contra la vigente y se conmuta sin ventana de mentira (ETS-007/15 §3).
- Toda reconstrucción degrada frescura declarada, jamás disponibilidad: la vista vieja sirve mientras la nueva alcanza.

## 4. Cuándo (calendario de refresco)

| Régimen | Aplica a | Frescura objetivo |
|---|---|---|
| Continuo (por evento) | KPIs operativos, backlog, sync por dispositivo | Segundos a minutos |
| Por microlotes programados | Costos consolidados, rotación de inventario, marts BI | Minutos a horas |
| Por corte de negocio | Fotos diarias/mensuales, cumplimiento de periodo | Al cierre del corte |
| Bajo demanda | Reconstrucciones y simulaciones | Gobernado |

La frescura de cada vista es contrato declarado (`X-Frescura`); un refresco atrasado dispara alerta operativa antes de que el usuario lo note (ETS-007/10). En horas valle se ejecutan los refrescos pesados (los programados se calendarizan por zona horaria del tenant).
