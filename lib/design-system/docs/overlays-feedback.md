# DGP-005 · Overlays y Feedback

Familia de componentes de superposición y retroalimentación del Design System DeltaOps.
Todos consumen exclusivamente tokens `--do-*`, usan iconos de `lucide-react`, textos por
defecto en español formal y cumplen accesibilidad AA (roles/aria correctos, foco visible
global, navegación por teclado). Importar los estilos una vez con
`import "@workspace/design-system/styles.css"`.

Variantes semánticas compartidas (`FeedbackVariant`): `exito` · `advertencia` · `error` · `info`.

---

## Tooltip

**Objetivo:** mostrar una ayuda contextual breve al pasar el ratón o enfocar el elemento.

**Cuándo usar:** para aclarar iconos o acciones cuyo significado no es obvio. No lo uses para
información esencial ni para textos largos.

**Props:** `contenido` (ReactNode, requerido), `posicion` (`arriba`|`abajo`|`izquierda`|`derecha`,
por defecto `arriba`), `retardo` (ms, por defecto 200), `children`.

**Variantes:** cuatro posiciones.

**Estados:** oculto / visible (hover y focus). El retardo usa la duración de tokens.

**Accesibilidad:** la burbuja tiene `role="tooltip"` y se enlaza con `aria-describedby`. Aparece
al enfocar por teclado y se cierra con `Escape`.

**Ejemplo:**
```tsx
<Tooltip contenido="Guardar cambios">
  <IconButton label="Guardar"><Save size={20} /></IconButton>
</Tooltip>
```

**Buenas prácticas:** texto corto; deja que aparezca también con foco de teclado.
**Malas prácticas:** meter enlaces o botones dentro (no es interactivo); usarlo como único
medio para información crítica.

---

## Dropdown

**Objetivo:** menú de acciones desplegable a partir de un disparador.

**Cuándo usar:** para agrupar acciones secundarias de un elemento (editar, duplicar, eliminar).

**Props:** `disparador` (ReactNode), `items` (`DropdownItem[]`: `etiqueta`, `onSelect?`,
`disabled?`, `icono?`), `etiquetaMenu` (por defecto "Menú de acciones"), `className`.

**Variantes:** ítems con o sin icono; ítems deshabilitados.

**Estados:** cerrado / abierto; ítem hover/pressed/disabled/focus.

**Accesibilidad:** el disparador expone `aria-haspopup="menu"` y `aria-expanded`; el menú es
`role="menu"` con `role="menuitem"`. Teclado: `ArrowUp`/`ArrowDown` mueven el foco (saltando
deshabilitados), `Home`/`End`, `Escape` cierra, clic fuera cierra.

**Ejemplo:**
```tsx
<Dropdown
  disparador="Acciones"
  items={[
    { etiqueta: "Editar", icono: Pencil, onSelect: editar },
    { etiqueta: "Eliminar", icono: Trash2, onSelect: eliminar },
  ]}
/>
```

**Buenas prácticas:** etiquetas de acción claras y verbos en infinitivo.
**Malas prácticas:** usarlo como selector de formulario (usa un `Select`); listas enormes.

---

## Modal

**Objetivo:** diálogo centrado que bloquea la interacción con el resto de la página.

**Cuándo usar:** confirmaciones, formularios cortos o contenido que requiere atención inmediata.

**Props:** `abierto`, `onClose`, `titulo` (obligatorio), `children`, `pie`, `size`
(`sm`|`md`|`lg`), `etiquetaCerrar`.

**Variantes:** tres tamaños.

**Estados:** cerrado (no renderiza) / abierto.

**Accesibilidad:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` al título. Foco
atrapado dentro del panel (ciclo con `Tab`/`Shift+Tab`), `Escape` cierra, clic en el fondo
cierra, y al cerrar se restaura el foco previo. El fondo usa `--do-op-overlay`.

**Ejemplo:**
```tsx
<Modal abierto={abierto} onClose={cerrar} titulo="Confirmar borrado"
  pie={<><Button variant="secundario" onClick={cerrar}>Cancelar</Button>
        <Button variant="peligro" onClick={borrar}>Eliminar</Button></>}>
  Esta acción no se puede deshacer.
</Modal>
```

**Buenas prácticas:** título siempre descriptivo; una sola acción primaria en el pie.
**Malas prácticas:** anidar modales; abrirlo sin un disparador enfocable que lo origine.

---

## Drawer

**Objetivo:** panel lateral deslizante con las mismas reglas de accesibilidad que `Modal`.

**Cuándo usar:** contenido contextual más extenso (filtros, detalles) sin salir de la vista.

**Props:** iguales a `Modal` salvo `lado` (`derecha` por defecto | `izquierda`) y `size`.

**Variantes:** lado izquierdo/derecho; tamaños `sm`/`md`/`lg`.

**Estados:** cerrado / abierto.

**Accesibilidad:** idéntica a `Modal` (dialog modal, foco atrapado, `Escape`, restauración de foco).

**Ejemplo:**
```tsx
<Drawer abierto={abierto} onClose={cerrar} titulo="Filtros" lado="derecha">
  {/* controles de filtro */}
</Drawer>
```

**Buenas prácticas:** úsalo para flujos laterales; mantén el ancho responsive.
**Malas prácticas:** meter navegación primaria permanente (eso es un layout, no un overlay).

---

## Alert

**Objetivo:** mensaje contextual persistente dentro del contenido.

**Cuándo usar:** avisos que deben permanecer visibles (estado de un formulario, información
importante de una sección).

**Props:** `variant` (`exito`|`advertencia`|`error`|`info`, por defecto `info`), `titulo?`,
`onClose?` (si se define, muestra botón de cierre), `etiquetaCerrar`, `children`.

**Variantes:** cuatro semánticas, cada una con su icono `lucide` y color de token.

**Estados:** con/sin cierre; hover del botón de cierre.

**Accesibilidad:** contenedor `role="alert"`; el icono es decorativo (`aria-hidden`); el botón de
cierre tiene etiqueta accesible.

**Ejemplo:**
```tsx
<Alert variant="advertencia" titulo="Sesión por expirar" onClose={descartar}>
  Guarda tus cambios antes de continuar.
</Alert>
```

**Buenas prácticas:** elige la variante según la severidad real.
**Malas prácticas:** usar `error` para mensajes informativos; abusar de alertas simultáneas.

---

## ToastProvider + useToast

**Objetivo:** notificaciones efímeras apiladas abajo-derecha con auto-cierre.

**Cuándo usar:** confirmar acciones ("Guardado") o informar de resultados no bloqueantes.

**Uso:** envuelve la app en `<ToastProvider>` y llama `const { mostrar, descartar } = useToast()`.

**Props del provider:** `etiquetaRegion` (por defecto "Notificaciones").
**`mostrar(opciones)`:** `variant?`, `titulo?`, `mensaje?`, `duracion?` (ms; `0` desactiva el
auto-cierre; por defecto 5000). Devuelve el `id` para `descartar(id)`.

**Variantes:** cuatro semánticas.

**Estados:** entrada animada, auto-cierre, cierre manual.

**Accesibilidad:** la región es `role="region"` etiquetada; cada toast es `role="status"` con
`aria-live="polite"`; botón de cierre con etiqueta.

**Ejemplo:**
```tsx
const { mostrar } = useToast();
mostrar({ variant: "exito", titulo: "Guardado", mensaje: "Los cambios se aplicaron." });
```

**Buenas prácticas:** mensajes breves; usa `role="status"` (no interrumpe al lector).
**Malas prácticas:** poner acciones críticas o mucho texto; duraciones demasiado cortas para leer.

---

## Progress

**Objetivo:** indicar el avance de una operación.

**Cuándo usar:** cargas o procesos con avance conocido (determinado) o desconocido (indeterminado).

**Props:** `value?` (omitir para indeterminado), `max` (por defecto 100), `etiqueta`
(obligatoria, accesible), `variant` (`primario`|semánticas).

**Variantes:** determinada / indeterminada; colores por variante.

**Estados:** progreso normal; indeterminado con animación.

**Accesibilidad:** `role="progressbar"` con `aria-label`; en modo determinado expone
`aria-valuenow`/`aria-valuemin`/`aria-valuemax`; en indeterminado se omiten los valores.

**Ejemplo:**
```tsx
<Progress value={64} etiqueta="Subiendo archivo" />
<Progress etiqueta="Procesando" /> {/* indeterminada */}
```

**Buenas prácticas:** siempre una `etiqueta` significativa.
**Malas prácticas:** usar indeterminada cuando conoces el porcentaje real.

---

## Skeleton

**Objetivo:** marcador de carga que anticipa la estructura del contenido.

**Cuándo usar:** mientras se obtienen datos, para reducir el salto perceptivo.

**Props:** `forma` (`linea`|`bloque`|`circulo`), `ancho`, `alto`, más atributos de `span`.

**Variantes:** tres formas.

**Estados:** animación de brillo sutil; se detiene con `prefers-reduced-motion`.

**Accesibilidad:** es puramente decorativo (`aria-hidden="true"`); acompáñalo de un texto o
estado accesible de carga en la región correspondiente.

**Ejemplo:**
```tsx
<Skeleton forma="circulo" />
<Skeleton forma="linea" ancho="60%" />
```

**Buenas prácticas:** imitar la forma real del contenido.
**Malas prácticas:** dejarlo indefinidamente; usarlo como único indicador accesible de carga.

---

## Accordion

**Objetivo:** paneles colapsables con encabezados tipo botón.

**Cuándo usar:** agrupar contenido secundario u opcional para reducir el ruido visual.

**Props:** `items` (`AccordionItem[]`: `id`, `encabezado`, `contenido`, `disabled?`),
`multiple` (permite varios abiertos), `porDefecto` (ids abiertos), `className`.

**Variantes:** uno abierto (por defecto) o múltiples abiertos.

**Estados:** abierto/cerrado; hover; disabled; flecha rotada.

**Accesibilidad:** encabezado dentro de `<h3>` con `<button>` que expone `aria-expanded` y
`aria-controls`; el panel es `role="region"` con `aria-labelledby` y `hidden` cuando cierra.

**Ejemplo:**
```tsx
<Accordion multiple items={[
  { id: "a", encabezado: "Detalles", contenido: <p>…</p> },
  { id: "b", encabezado: "Historial", contenido: <p>…</p> },
]} />
```

**Buenas prácticas:** encabezados cortos y descriptivos.
**Malas prácticas:** ocultar contenido esencial que debería estar siempre visible.

---

## Tabs

**Objetivo:** alternar entre vistas relacionadas dentro del mismo espacio.

**Cuándo usar:** organizar contenido en categorías paralelas del mismo nivel.

**Props:** `items` (`TabItem[]`: `id`, `etiqueta`, `contenido`, `disabled?`), `porDefecto`
(id activo inicial), `etiquetaLista`, `className`.

**Variantes:** pestañas habilitadas/deshabilitadas.

**Estados:** activa/inactiva; hover; disabled; foco visible.

**Accesibilidad:** `role="tablist"` etiquetado; cada pestaña `role="tab"` con `aria-selected`,
`aria-controls` y patrón de foco por `tabIndex`; paneles `role="tabpanel"` con `aria-labelledby`
y `hidden`. Teclado: flechas `←/→` y `↑/↓` (saltan deshabilitadas), `Home`/`End`.

**Ejemplo:**
```tsx
<Tabs items={[
  { id: "gen", etiqueta: "General", contenido: <Panel/> },
  { id: "seg", etiqueta: "Seguridad", contenido: <Panel/> },
]} />
```

**Buenas prácticas:** pocas pestañas y etiquetas breves.
**Malas prácticas:** usar tabs para pasos secuenciales (usa un asistente/stepper).
