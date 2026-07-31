# 10_MATERIALIZED_VIEWS.md

> **DeltaOps — ETS-010 · v1.0** · Vistas materializadas en PostgreSQL: cuándo usar la característica nativa, cuándo tablas proyectadas, y el catálogo físico.
> El catálogo conceptual es ETS-009/08; aquí, su forma física. Documento de diseño. Sin SQL.

---

## 1. Decisión física: tablas proyectadas primero

Las "vistas materializadas" conceptuales de ETS-009/08 se materializan físicamente como **tablas normales pobladas por proyectores de eventos** (consumidores con cursor), NO como MATERIALIZED VIEW nativas, en el caso general:

| | Tabla proyectada (defecto) | MATERIALIZED VIEW nativa (excepción) |
|---|---|---|
| Refresco | Incremental por evento (fila a fila) | Recalcula todo (REFRESH) |
| Frescura | Segundos-minutos, continua | La del último REFRESH |
| Hechos tardíos | Re-proyectan su periodo exacto | Recalculan todo |
| Uso en DeltaOps | KPIs, costos, backlog, hoja de vida, descendencia… (todo el catálogo ETS-009/08 §2) | Agregaciones simples de refresco programado donde recalcular es barato y la lógica es puro SQL |

La MATERIALIZED VIEW nativa (con refresco concurrente para no bloquear lecturas) se admite solo para derivados secundarios de datos ya proyectados (ej. un resumen de un mart que se rehace cada noche) — registrada igual que cualquier vista del catálogo.

## 2. Forma física de las tablas proyectadas

- Viven en `lectura_*` / `marts` (02 §3), nombradas por la consulta que sirven (07 §1).
- Grano explícito como unicidad: `ux_(id_tenant, periodo, id_nodo, …)`; índices ricos por sus filtros (08 §1).
- Cada una con su **cursor** en `mensajeria.cursor_consumidor` y su frescura medible (retraso del cursor = la `X-Frescura` declarada, ETS-008).
- Idempotencia del proyector: aplicar el mismo evento dos veces no altera el resultado (upsert por grano + control de secuencia).
- Fotos de corte (backlog diario): append de filas por corte, jamás update de cortes pasados (ETS-009/08 §3).

## 3. Reconstrucción

Patrón conmutación sin ventana de mentira (ETS-009/08 §3): se construye `<nombre>_v2` por replay en paralelo, se valida (conteos, muestras contra la vigente), se conmuta por renombre/vista de alias en una transacción breve, se conserva la vieja hasta confirmar y se descarta. Los proyectores corren sobre réplica cuando el replay es profundo (20).

## 4. Gobierno

Toda vista/tabla proyectada del catálogo registra: dueño (módulo), fuente (qué eventos), grano, frescura objetivo, consumidores conocidos (22). Las de `marts` son contrato externo: cambios con gobierno N/N-1 (ETS-008/17).

---

## Impacto sobre la implementación
Los proyectores de eventos son componentes de primera clase de la implementación (uno por vista, con cursor, idempotencia y bandeja de errores); la infraestructura de conmutación v2 se construye una vez y se reutiliza.

## ETS relacionados
ETS-009 (07-08) · ETS-008 (09 consumo idempotente, 17 gobierno de marts) · ETS-010 (02 esquemas, 08 índices).

## Riesgos
- Proyector no idempotente corrompe silenciosamente → verificación de honestidad periódica (reconstruir muestra y comparar, ETS-009/09 §4).
- REFRESH de MV nativa en tablas grandes bloquea o tarda → por eso son la excepción acotada.

## Decisiones habilitadas
Implementación de proyectores, panel de retraso por cursor (20), contratos de frescura por vista.

## Decisiones bloqueadas hasta el siguiente ETS
Lista final de MVs nativas admitidas (nacerán solo con caso justificado) y el framework concreto de proyección.
