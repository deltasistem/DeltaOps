---
name: Contrato público de costos exactos DGP-021.0
description: Reglas del contrato string-decimal de abastecimiento y lecciones sobre dinero exacto extremo a extremo.
---

## Contrato canónico de costos exactos
`modulo.abastecimiento.costos-exactos` (HTTP `GET /articulos/:id/costos-exactos`) es la ÚNICA fuente legal de costo exacto de materiales para módulos futuros. Expone `costo_unitario numeric(18,6)` de abs_costos_read = **costo promedio ponderado de recepciones**, por (artículo, moneda), como string con patrón `^\d{1,12}\.\d{6}$`. Ausencia ⇒ `costos: []` (SIN COSTO ≠ "0"). Auth reutiliza `modulo.abastecimiento.read`; tenant solo de sesión; RLS vía withTenantRead. Prohibido para consumidores: `abs_costos_read` directo y la query legacy float `costos`.
**Why:** GAP-COST-14 — dinero en float pierde exactitud; el read model interno no es frontera pública.

## Lección: «sin float en ninguna capa» incluye los fakes
Un fake/adaptador de test que deriva strings exactos desde campos number legacy (`toFixed`) ES un camino float del puerto público y falla revisión (MAYOR en R1). Los fakes de contratos string-decimal necesitan respaldo string-only independiente con seeder que rechace `number` (TypeError), más un test con valor float-inseguro (p.ej. "12345678901.123456") probando preservación bit a bit.
**How to apply:** en cualquier contrato dinero-exacto futuro (021.1+), el camino string debe ser puro DB→driver→zod regex→API, y sus fakes espejo string-only.

## GAPs restantes documentados
`ultimoCosto` (float en jsonb `datos`) y `costoEstandar` (fuera del read model) NO se exponen en el contrato exacto; si 021.x los necesita, requieren trabajo previo en abastecimiento.
