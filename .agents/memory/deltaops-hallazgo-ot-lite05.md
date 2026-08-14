---
name: Hallazgo→OT LITE-05
description: Lecciones del cierre del bucle hallazgo→OT→ejecución→cierre por composición sobre Correctivo/Órdenes.
---

# DELTAOPS LITE-05 — Hallazgo → OT → Ejecución → Cierre

## Unicidad por identificadores deterministas, no por estructura nueva
UN hallazgo → MÁX. una OT sin tabla ni restricción nueva: `solicitudId = uuidv5(hallazgoId)` ancla la claveDedup y los opIds a los recibos/guardas ya existentes de Correctivo (recibo por opId → dedup.reservar único atómico → materializarGeneracion). La derivación determinista de ids convierte la idempotencia existente en la garantía de negocio.

## Estados derivados, no persistidos
El estado del hallazgo (pendiente/convertido/descartado) se DERIVA de datos reales (materializaciones + descartes); solo el descarte se persiste (recordType en platform_records, sellado, reversible, auditable — decisión de Dirección). Invariante de precedencia ante carreras cross-store: la OT siempre gana; un descarte concurrente queda inerte (documentado, sin transacción común).

## Gates de aprobación del motor congelado
Dos bugs GENERALES de Órdenes solo visibles con E2E de navegador real: (1) drift OpenAPI→cliente (`aprobado:boolean` vs `decision:enum` — el spec documentaba mal y el cliente se construyó contra docs malas; el seed usaba el shape correcto y lo enmascaraba); (2) el gate `aprobadores:["validador"]` compara `principal.rol` y ningún rol canónico real era "validador" — solo el seed con principal sintético pasaba. Fix quirúrgico: el adaptador de principal presenta `rol:"validador"` para roles con esa capacidad, verificando que `principal.rol` no tenga otros consumidores. **Lección:** las transiciones gated exigen abrir el gate (`transicionar`) y luego decidirlo (`aprobarCierre`) — un botón de UI que llame solo al segundo paso falla siempre; y los caminos que solo el seed ejercita están sin probar de verdad.

## Suites PG destruyen el tenant demo
Las suites de integración limpian datos demo del DB de desarrollo: re-ejecutar `seed:demo` antes de cualquier E2E de navegador posterior a correr tests, o el tester encontrará entidades desaparecidas.

## Indicadores "pedidos pero sin agregado"
Si la directiva pide un indicador y la fuente real existe embebida (p. ej. hallazgos dentro de ejecuciones selladas), un resumen read-only acotado por composición (con flag `acotado`, sin estimar) es la respuesta correcta — no es métrica inventada ni requiere decisión de Dirección.
