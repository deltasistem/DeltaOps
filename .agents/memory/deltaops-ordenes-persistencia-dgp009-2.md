---
name: Órdenes persistencia/CQRS DGP-009.2
description: Lecciones de la infraestructura operacional de Work Orders (CQRS estricto, claim durable, proyecciones).
---

# Órdenes — Persistencia, CQRS y Motor Operacional (DGP-009.2)

- **"Toda consulta vía Read Models" incluye `detalle`**: leer el aggregate en cualquier consulta es hallazgo MAYOR aunque sea la fuente más fresca. Detalle debe servirse del read model, sin fallback al repositorio (verificable por test de sabotaje: fake repository que lanza en findById durante la consulta) y debe funcionar tras replay. OT no proyectada ⇒ notFound explícito.
- **Definir el claim durable no basta — debe estar cableado en la orquestación**: `SyncReceiptStore.claim/finalize/release` sin invocarse desde `procesarCola` es hallazgo MAYOR. Protocolo: claim atómico tenant-scoped → claim ajeno no re-ejecuta (resultado sellado si finalizado; espera acotada si pendiente; si no, reintentable) → dueño ejecuta → terminal ⇒ finalize sella resultado; solo fallos de infraestructura reintentables ⇒ release. Probar con dos workers concurrentes mismo opId y con fallo parcial.
- Idempotencia de proyecciones append-only debe guardarse por `(read model, tenant, eventId)` — una guarda global por eventId colisiona cuando varios read models proyectan el mismo evento (bitácora + historial).
- Policies de comandos operacionales (bitácora, planificación, asignaciones): leer el aggregate ANTES de evaluar la policy y pasar el estado real; una policy "puede ejecutar" (exige EN_EJECUCION) no sirve para registrar eventos de bitácora generales — usar "puede editar" (bloquea solo estados finales).
- Conflictos de planificación = solape real de ventanas (intervalos), no punto-en-rango.
- Normalizador de comandos de sync debe aceptar sufijos con punto (`bitacora.registrar` ⇒ comando completo del módulo).
- Read models consolidables: 13 superficies requeridas pueden servirse desde ~8 tablas (p.ej. documentación/formularios/checklists por columna `clase`; activos-relacionados/dependencias desde tabla de relaciones) — el revisor lo acepta si cada superficie de consulta existe.
- Consola técnica admin lee el outbox del kernel (`deltaops.kernel_outbox`), no una copia propia.
