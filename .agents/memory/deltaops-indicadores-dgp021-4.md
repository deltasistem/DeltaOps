---
name: Indicadores económicos DGP-021.4
description: Lecciones de costo/hora-km e indicadores (extensión aditiva de contrato congelado aprobada, integridad temporal, paginación fail-closed)
---

# DGP-021.4 — Costos por hora/km + indicadores económicos

## Extensión aditiva de contrato congelado — con aprobación de Dirección
Regla: si un módulo congelado degrada su dato exacto en el borde público (numeric→float), el camino legal es una extensión pública ADITIVA (exponer `valorExacto` string + marcadores de tramo/reinicio derivados de lo ya persistido), nunca convertir el float ni leer tablas internas. Requiere DETENERSE y aprobación explícita antes de tocar el contrato.
**Why:** Utilización exponía lecturas de medidor como float JS y sin anclajes de reinicio en el read model público; Dirección aprobó la Opción A (extensión aditiva) tras el Discovery.
**How to apply:** el gate es que ningún consumidor previo cambie de forma y sus suites sigan verdes sin modificarlas.

## Integridad temporal de indicadores derivados
- Toda serie temporal (tendencia mensual) debe INTERSECTAR cada tramo con el rango pedido: `[max(inicioMes,desde), min(finMes,hasta)]` — expandir al mes completo publica importes/deltas fuera del período (R2 MAYOR). Test canónico: rango intra-mes con hechos/lecturas dentro y fuera de los bordes.
- Mismo período en numerador (dinero) y denominador (medidor); jamás costo-período ÷ horas-históricas.

## Series bajo contrato público: paginar o fallar cerrado
Un `limit` fijo sin paginación trunca silenciosamente el denominador (delta parcial ⇒ ratio erróneo). Paginar el contrato público hasta agotar la serie con cota de seguridad; si se excede la cota ⇒ SIN_DATOS_SUFICIENTES con nota de truncamiento, nunca un valor parcial. Test con >límite (p.ej. 900 lecturas con limit 500).

## Ratios exactos
- Numerador micros BigInt por moneda; denominador delta de `valorExacto` como escala entera; división BigInt de escala fija determinista; delta solo intra-tramo (jamás cruzar reinicios); anuladas/inconsistentes excluidas; Δ≤0 ⇒ SIN_DATOS (nunca throw/Infinity); activo sin odómetro ⇒ NO_APLICA.
- Comparativa entre activos SIEMPRE por moneda (sin ranking combinado); orden en frontend con comparación string dígito a dígito (sin Number), null=ausencia al final.

## Otras lecciones
- Registro de fuentes de Analytics: claves aditivas resueltas genéricamente (sin listas hardcodeadas) permiten añadir dataset 'costos' sin tocar el motor.
- Tests de conteo de catálogo (N indicadores) son frágiles: acompañar siempre con aserción por identidad del elemento nuevo.
- Las suites PG truncan la BD dev: re-ejecutar seed:demo después de CADA ronda de revisión que corra suites, antes de cualquier E2E.
