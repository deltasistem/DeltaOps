---
name: Correctivo DGP-015
description: Lecciones del módulo correctivo — colisión de claves de workflow, gobierno completo y puertos que validan de verdad.
---

# Enterprise Corrective Maintenance (DGP-015)

- **Ids de definición de workflow son globales por tenant** (`wf-def:<clave>:<tenant>` en platform_records, PK sin service): dos módulos con la misma clave (`ciclo-solicitud` de abastecimiento vs correctivo) colisionan y el segundo nunca puede publicar su definición. Regla: prefijar SIEMPRE las claves con el módulo (`cor-atencion`, `cor-intervencion`, `cor-generacion`). No se detecta en tests aislados — solo en el tenant DEMO combinado.
- **Todo tramo declarado del flujo debe estar gobernado de verdad**: declarar una definición (pendiente→materializada) sin exigir iniciar/transicionar en el comando es bypass ⇒ CRÍTICO del revisor. El gate del motor va ANTES de cualquier efecto observable (OT, vínculo, estado).
- **Los puertos deben validar, no aparentar**: un adaptador que "siempre devuelve válido" (componentesExisten que ignoraba los componentes) es MAYOR. Componer la query pública real (modulo.activos.componentes, relaciones compuesto-por) y rechazar ids ajenos/inexistentes.
- Contratos canónicos verificados: tipos-reserva de inventario incluye `correctivo` (no "operativa"); abastecimiento.crear-solicitud exige cantidad `{valor, unidad}`; items con lote no aceptan consumo simple (usar items sin-lote o manejar lote).
- Threading de versión: tras comandos que suben la versión del agregado, usar la versión RETORNADA por el comando, no la del read model (va por detrás).
- `pnpm -r run test` con suites PG en paralelo tiene flakiness latente pre-existente: el outbox global kernel_outbox se comparte y `FOR UPDATE SKIP LOCKED` permite que un runtime ajeno marque procesados eventos de otro módulo. Los paquetes son deterministas en aislamiento; mitigación local: asertar vía replay durable propio y drenar solo en afterAll.
