---
name: Design System DeltaOps (DGP-005)
description: Reglas durables del sistema de diseño oficial (marca DELTA) y cómo consumirlo en las apps.
---

# Design System DeltaOps

- Fuente de verdad: `brand/tokens/tokens.json` + `@workspace/design-system` (`lib/design-system`). Componentes con prefijo `.do-`, variables CSS `--do-*`, props en español.
- **Regla:** ningún componente ni pantalla debe hardcodear colores/espaciados/sombras de marca; consumir tokens o variables `--do-*`. Colores de marca permitidos SOLO: #FFFFFF, #D2002B, #BA0C2F, #080A16, #000000 (+ rojo 50%/20% alfa). Tipografías solo Montserrat (títulos) y Roboto (textos).
- **Why:** el Brandbook DELTA es normativo con autoridad nivel ETS; inventar colores o recrear logos está prohibido por directiva DGP-005.
- **How to apply:** logos únicamente vía componente `Logo` (fuerza mínimos oficiales: imagotipo 90px, isotipo 20px); assets oficiales en `brand/logo/` (derivados: favicon/app-icons/splash en `brand/`). Decisiones no cubiertas por el Brandbook (grises, semánticos, spacing, motion…) están documentadas como conservadoras en `brand/documentation/ANALISIS-BRANDBOOK.md` — mantener coherencia con ese documento al ampliar tokens.
- Temas: `data-do-theme="light|dark|auto"`; en deltaops las variables shadcn de `index.css` están mapeadas a la marca (rojo = primary/ring/destructive, Oceano = sidebar/fondo oscuro).
- Galería viva de documentación: ruta `/design-system` en la app deltaops.
- El build de deltaops requiere `PORT` y `BASE_PATH` como env (p. ej. `PORT=5000 BASE_PATH=/deltaops pnpm build`).
