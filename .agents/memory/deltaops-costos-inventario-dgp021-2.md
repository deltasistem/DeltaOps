---
name: Integración Inventario→Costos DGP-021.2
description: Lecciones de la orquestación movimiento físico → hecho económico (opId determinista, ledger CARGO/ABONO, anti-bypass HTTP)
---

# DGP-021.2 — Integración Inventario → Costos

## Naturaleza semántica, no montos negativos
Regla: un ledger inmutable con dinero string no-negativo representa reversiones (devoluciones) con un discriminador `naturaleza` CARGO|ABONO derivado de la familia del movimiento — nunca enrutando la devolución por la semántica positiva de consumo ni con montos negativos.
**Why:** R1 FAIL — devoluciones materializadas como cargos positivos indistinguibles ⇒ ledger incorrecto que la composición futura no puede restar.
**How to apply:** cualquier hecho económico derivado de un movimiento debe registrar la familia cruda en la fuente y derivar la naturaleza fail-closed; los read models filtran por naturaleza sin agregar netos.

## Procedencia jamás desde HTTP (anti-bypass real)
Regla: si la vía canónica de un hecho es la orquestación de servicio, NO basta exigir `movimientoId` en el schema — hay que eliminar la ruta HTTP pública y sellar el comando con un marcador de contexto interno fail-closed (`origenOrquestacion`) que solo fija el contexto de orquestación.
**Why:** R2 FAIL — un supervisor con permiso materializar podía forjar CARGO/ABONO con movimientoId/familia inventados vía POST público.
**How to apply:** recuperación administrativa = reproceso de pendientes que relee el movimiento contra el módulo fuente y deriva TODA la procedencia del snapshot; nada del body salvo identificadores. OpenAPI: conservar el schema como contrato interno documentado y testear que la operación HTTP no exista.

## RBAC de rutas que ejecutan con principal de servicio
Regla: una ruta HTTP que internamente ejecuta con principal de SERVICIO debe aplicar su propia guarda de permiso del llamante en la frontera — la authorization del comando interno no alcanza al llamante.
**Why:** E2E — TECNICO obtuvo 200 en /pendientes/reprocesar porque "la autorización la valida el comando" era falso con principal de servicio.

## Otros aprendizajes
- Cantidades float de un módulo congelado: convertir a cadena escala 6 UNA sola vez en la frontera del orquestador, validada por regex, y declarar el GAP (la deuda pertenece al módulo congelado).
- Recuperación fail-safe = tabla durable de pendientes propia (cos_pendientes_material, RLS) — los recibos de idempotencia tienen otra semántica; opId determinista `inv:<movimientoId>` garantiza 1 hecho por movimiento incluso bajo concurrencia/reproceso.
- Seed demo: par artículo==item con el MISMO id (GAP-INV-ART); promedio ponderado real vía 2 recepciones a precios distintos; disparar la orquestación con la misma función del endpoint, no duplicando lógica.
- Catálogo `motivos-movimiento` del tenant demo está vacío ⇒ `motivo` debe omitirse en /mover o falla KRN-VAL-001.
