---
name: Discovery DeltaOps Lite Fase 1
description: Hallazgos de producto/UX y decisiones del discovery LITE-01 (nav por rol, preoperacional por composición, GAPs G1–G7).
---

# DeltaOps Lite — Fase 1 Discovery (LITE-01)

Doc: `docs/dgp/DELTAOPS-LITE-01-DISCOVERY.md` (revisión independiente PASS). Solo discovery: NADA implementado.

- **Lite = core intacto + experiencia simple.** Prohibido eliminar módulos o duplicar funcionalidad (nada de "segunda versión" de Órdenes/Activos/Inventario). Toda pantalla nueva debe ser composición sobre capacidades existentes.
- **Preoperacional es composición, no módulo nuevo:** Dynamic Forms ya trae checklist + hallazgos con severidad (`hayBloqueos()`), correctivo ya trae el patrón hallazgo→OT (`generar-orden-correctiva`). GAPs reales G1–G7: veredicto APTO/NO APTO por instancia, tipo "preoperacional", metadato de ítem crítico, puente automático a correctivo, rol OPERADOR (no existe hoy — 6 roles canónicos sin OPERADOR; decisión de Dirección).
- **Problemas UX confirmados:** nav plana 1 botón/módulo (~9), Activos con 9 controles de filtrado, 4 `<select>` nativos crudos (correctivo-solicitud-ficha, ordenes-planificacion, ordenes/tab-dependencias, preventivo-calendario) ilegibles en oscuro, exceso de info técnica. **Refutado:** inconsistencia sistémica de temas (disciplina de tokens alta; residual = selects nativos).
- **Nav propuesta:** 4–6 grupos por proceso y por rol (Inicio/Mantenimiento/Equipos/Preoperacional/Inventario/Indicadores/Administración). Realidad actual: nav por entitlement, no por perfil; Utilización/Costos/Mano de obra fuera del enum `Modulo`.
- **Clasificación A–E de 24 funcionalidades** (A=5 nav principal, B=9 embebidas, C=4 admin, D=4 ocultas, E=2 a decisión de Dirección: Consola-vs-/centro y Referencia en nav).
- Indicadores para la experiencia principal solo con fuente real (8 dashboards declarativos existentes); MTTR/MTBF/disponibilidad NO tienen fuente hoy — no inventar.
