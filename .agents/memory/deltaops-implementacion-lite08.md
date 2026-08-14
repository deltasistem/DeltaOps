---
name: Implementación operacional LITE-08
description: Lecciones de la implementación operacional Delta (rutinas, lecturas, combustible, mano de obra, timeline, visibilidad-nav)
---

# LITE-08 — Implementación Operacional Delta

- **Las libs del workspace se consumen COMPILADAS por el api-server.** Cambiar `lib/module-*` sin `pnpm --filter @workspace/<lib> build` deja el bundle vivo con el código viejo aunque el workflow rebuilde el api-server. **Why:** dos rondas de E2E fallidas con backend "correcto" en tests pero payload viejo en vivo. **How to apply:** tras tocar cualquier lib, rebuild de la lib + restart del workflow; verificar el payload real con curl antes de re-lanzar E2E.
- **Cerrar una OT NO cierra sus sesiones de trabajo.** Una sesión puede quedar ABIERTA para siempre dentro de una OT final/inmutable. **How to apply:** toda vista de mano de obra por activo debe exponer sesiones no valoradas (CERRADA→PENDIENTE, ABIERTA/PAUSADA→EN_CURSO) con horas reales y costo null — jamás "sin datos" ni $0; la política de auto-cierre queda como decisión de negocio.
- **La query de timeline de plataforma devuelve filas crudas anidadas** (`data.eventType/occurredAt/payload`); la UI espera campos planos. Normalizar en la frontera del módulo consumidor (aplanar + resumen derivado del tipo real), nunca reenviar el shape del store.
- **Un FAIL de E2E de navegador tras un fix puede ser caché del cliente/bundle, no el fix.** Verificar la cadena por capas: SQL → curl autenticado del endpoint → petición de red del navegador (pedir al tester URL+status+body), antes de tocar más código.
- Visibilidad de navegación por rol = preferencia de presentación sobre platform_records: WRITE solo admin con doble barrera backend, la lectura solo FILTRA la nav ya gateada por entitlements (ocultar jamás revela módulos no habilitados).
