---
name: Experiencia Activos DGP-008.3
description: Lecciones de la capa de experiencia (Dynamic Forms UI, offline cliente, QR, adjuntos referencia-only, docs).
---

# Experiencia del módulo de Activos (DGP-008.3)

Reglas duras confirmadas por revisión (no repetir):
- **"Todos los formularios vía Dynamic Forms" es literal**: cualquier control construido a mano (filtros, comentarios, selects de modal, inputs de escaneo) es hallazgo MAYOR. Patrón aprobado: plantillas declarativas + un renderer React genérico en la app (el runtime dynamic-forms no depende de React; importar solo subpaths definicion/condiciones para no arrastrar node:crypto al bundle). Los componentes del DS solo aparecen DENTRO del renderer. Excepción aceptada: SearchInput de búsqueda rápida (no es formulario).
- **QR debe anclarse a platform.qr**: la etiqueta impresa codifica el `codigo` emitido por la plataforma, nunca una URL local; resolver es query side-effect-free (`platform.qr.resolve` es comando con efecto de escaneo — no llamarlo desde queries).
- **Adjuntos son referencia-only**: la URL firmada devuelve metadatos JSON, jamás binario; la UX correcta es tarjeta de metadatos verificables (hash, TTL, verificación de firma), con preview solo del File local pre-registro. Prometer <img>/<video> remotos es hallazgo MAYOR.
- **Nunca poner credenciales (ni de dev) en documentación** — CRÍTICO inmediato en revisión.
- Framework offline cliente vive en la app (cola persistente por tenant con opId UUID, auto-encolado en fallo de red, replay en `online`, conflictos visibles) reutilizando el POST /sync del módulo; no existe framework offline compartido en lib/.
- Búsqueda: indexación por eventHandlers payload-only hacia platform.search; el rebuild NO va dentro de la UoW de reproyectar (comando anidado prohibido) — rehidratación por platform.search.rebuild.
- listar del read model capaba en 100 antes de paginar en memoria; ojo con límites por defecto al paginar en la app.
- Los 404 de endpoints nuevos en smoke suelen ser tenant sin datos, no rutas ausentes; transiciones usan `expectedVersion`, relaciones `origenId/destinoId`.
