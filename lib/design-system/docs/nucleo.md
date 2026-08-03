# DGP-005 · Componentes núcleo

Familia base del Design System DeltaOps (`src/components/core.tsx`). Todos consumen exclusivamente tokens `--do-*`.

## Button
- **Objetivo:** acción principal o secundaria del usuario.
- **Cuándo usar:** cualquier acción explícita; usar `primario` una sola vez por vista.
- **Props:** `variant` (`primario | secundario | fantasma | peligro`), `size` (`sm | md | lg`), `loading`, más atributos nativos de `<button>`.
- **Estados:** default, hover, pressed, focus (anillo rojo), disabled (opacidad token), loading (spinner superpuesto, `aria-busy`).
- **Accesibilidad:** foco visible, `aria-busy` en carga; deshabilitado no recibe eventos.
- **Ejemplo:** `<Button variant="peligro" loading>Eliminar</Button>`
- **Buenas prácticas:** texto en infinitivo/acción clara. **Malas:** dos botones primarios juntos; usar `peligro` para acciones no destructivas.

## IconButton
- **Objetivo:** acción compacta representada solo por un icono.
- **Props:** las de Button + `label` (obligatoria; se aplica como `aria-label` y `title`).
- **Accesibilidad:** nunca sin `label`.
- **Ejemplo:** `<IconButton label="Ajustes"><Settings size={20} /></IconButton>`

## Spinner
- **Objetivo:** indicar carga en curso.
- **Props:** `size` (`sm | md | lg`), `label` (por defecto "Cargando").
- **Accesibilidad:** `role="status"` + `aria-label`; respeta `prefers-reduced-motion` (gira más lento).

## Divider
- **Objetivo:** separación visual de bloques.
- **Props:** `vertical` (booleano).
- **Accesibilidad:** variante vertical con `aria-hidden`.

## Logo
- **Objetivo:** uso correcto del logotipo oficial DELTA.
- **Props:** `variant` (`imagotipo | imagotipo-oscuro | isotipo`), `width`, `alt`.
- **Reglas Brandbook (pág. 3):** el componente FUERZA los mínimos oficiales (imagotipo ≥90px, isotipo ≥20px). Prohibido recolorear, rotar o recrear el logotipo; solo se sirven los archivos oficiales de `brand/logo/`.
- **Buenas prácticas:** `imagotipo-oscuro` sobre fondos Oceano/oscuros. **Malas:** escalarlo por CSS por debajo del mínimo; superponerlo a imágenes con bajo contraste.

## Badge / Tag / Chip
- **Objetivo:** clasificar (Tag), señalar estado (Badge) o filtros activos removibles (Chip).
- **Props:** `variant` (`neutro | primario | exito | advertencia | error | info`); Chip añade `onRemove` y `removeLabel`.
- **Accesibilidad:** botón de cierre del Chip con `aria-label`.

## Avatar
- **Objetivo:** identidad visual de una persona.
- **Props:** `nombre` (obligatorio; genera iniciales), `src`, `size`.
- **Accesibilidad:** `role="img"` + `aria-label` con el nombre completo.
