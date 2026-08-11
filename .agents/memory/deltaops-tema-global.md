---
name: Tema global y consistencia visual DeltaOps
description: Lecciones de la directiva de consistencia visual: autoridad única de tema, contención de overflow móvil.
---

# Tema global y consistencia visual

- **Autoridad única de tema:** ThemeProvider del design-system montado en la raíz de App; preferencia Claro/Oscuro/Automático en `localStorage["do-tema"]` (matchMedia para auto). Ningún Shell ni página debe fijar `data-do-theme` — un atributo descendiente prevalece sobre el `<html>` y rompe la política global (fue la causa raíz: 8 Shells forzaban `light`; también /design-system con estado local).
- Guardas de fuente en tests: escaneo recursivo de pages/ y lib/ que falla si algún archivo fija `data-do-theme` o usa `minmax(NNNpx,…)` sin `min()` — patrón barato que previene regresiones que la revisión encuentra tarde.
- **Contención de overflow móvil sistémica** (390px): `minmax(min(NNNpx,100%),…)` en grids; capa CSS en index.css: `.do-root{max-width:100%;overflow-x:clip}` (clip no crea scroll container ni afecta portales fixed), `min-width:0` en envolturas scrollables e hijos de flex/grid, medios acotados. Las envolturas de tabla ya scrollables fallaban por `min-width:auto` de flex/grid, no por falta de wrapper.
- Selector de apariencia: menú de perfil → "Apariencia" (modal radiogroup accesible ≥48px) + variante compacta en header de la consola SUPER_ADMIN; aplicación inmediata sin logout.
- Persistencia server-side por identidad: deuda documentada como evolución futura (sin contratos nuevos).
