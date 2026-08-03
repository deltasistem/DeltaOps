<!-- DGP-005 · Documentación de los componentes de formulario del Design System DeltaOps. -->

# Formularios · DeltaOps Design System (DGP-005)

Componentes de captura de datos del sistema oficial. Todos consumen exclusivamente
tokens `--do-*`, usan el prefijo de clases `.do-`, iconos de `lucide-react` y cumplen
accesibilidad AA (etiquetas, `aria-*`, foco visible global y navegación por teclado).

Importación:

```tsx
import {
  Field, Input, PasswordInput, SearchInput, Textarea,
  Checkbox, RadioGroup, Radio, Switch, Select, FormActions,
} from "@workspace/design-system/components/forms";
```

Tamaños disponibles en los controles: `sm` / `md` (por defecto) / `lg`.

---

## Field

**Objetivo.** Envoltorio estándar que aporta etiqueta, descripción, mensaje de error y
marca de obligatorio a cualquier control. Asocia automáticamente `id`,
`aria-describedby` y `aria-invalid` al control hijo mediante contexto.

**Cuándo usar.** Siempre que un control necesite etiqueta visible. Es la forma
recomendada de componer todos los controles de esta familia.

**Props.**

| Prop          | Tipo        | Por defecto | Descripción                                   |
| ------------- | ----------- | ----------- | --------------------------------------------- |
| `label`       | `ReactNode` | —           | Etiqueta visible (obligatoria).               |
| `description` | `ReactNode` | —           | Texto de ayuda opcional.                      |
| `error`       | `ReactNode` | —           | Mensaje de error; marca el campo inválido.    |
| `required`    | `boolean`   | `false`     | Añade indicador `*` y `aria-required`.        |
| `htmlFor`     | `string`    | auto        | Id del control (por defecto se autogenera).   |

**Estados.** default / con descripción / error / requerido.

**Accesibilidad.** El `<label>` referencia el control por `id`; la descripción y el
error se enlazan por `aria-describedby`; el error usa `role="alert"`.

**Ejemplo.**

```tsx
<Field label="Correo electrónico" description="Lo usaremos para avisos." required>
  <Input type="email" placeholder="nombre@empresa.com" />
</Field>
```

**Buenas prácticas.** Un `Field` por control. **Malas prácticas.** No metas varios
controles no relacionados dentro del mismo `Field` (rompe la asociación de la etiqueta).

---

## Input

**Objetivo.** Campo de texto de una línea con soporte de prefijo/sufijo de icono.

**Cuándo usar.** Entradas cortas: nombres, correos, números, etc.

**Props.** Extiende `input` HTML (salvo `size`). `size`, `prefijo?: ReactNode`,
`sufijo?: ReactNode`, `invalid?: boolean`. Hereda estado inválido del `Field`.

**Estados.** default / hover / focus / error / disabled / readonly.

**Accesibilidad.** Dentro de un `Field` recibe `id`/`aria-describedby`/`aria-invalid`
automáticamente. Los iconos son decorativos (`aria-hidden`).

**Ejemplo.**

```tsx
<Field label="Usuario">
  <Input prefijo={<User size={20} />} placeholder="usuario" />
</Field>
```

**Buenas prácticas.** Usa `type` correcto (`email`, `tel`…). **Malas prácticas.** No
uses el prefijo/sufijo como botón sin etiqueta accesible.

---

## PasswordInput

**Objetivo.** Entrada de contraseña con botón accesible para mostrar/ocultar.

**Cuándo usar.** Cualquier campo de contraseña.

**Props.** Igual que `Input` (sin `type`/`sufijo`). `mostrarLabel` / `ocultarLabel`
personalizan las etiquetas accesibles del botón.

**Estados.** oculto (por defecto) / visible; hereda estados de `Input`.

**Accesibilidad.** El botón alterna `aria-pressed` y su `aria-label`
(«Mostrar/Ocultar contraseña»).

**Ejemplo.**

```tsx
<Field label="Contraseña">
  <PasswordInput autoComplete="current-password" />
</Field>
```

**Buenas prácticas.** Mantén `autoComplete`. **Malas prácticas.** No ocultes el botón
de visibilidad: es un patrón de usabilidad esperado.

---

## SearchInput

**Objetivo.** Campo de búsqueda con icono de lupa y botón de limpiar.

**Cuándo usar.** Buscadores y filtros.

**Props.** Igual que `Input` (sin `type`/`prefijo`). `limpiarLabel`, `onClear`.
Funciona controlado (`value`) o no controlado (`defaultValue`).

**Estados.** vacío (sin botón limpiar) / con texto (aparece el botón).

**Accesibilidad.** `role="searchbox"`; el botón limpiar tiene `aria-label` y devuelve
el foco al campo tras vaciarlo.

**Ejemplo.**

```tsx
<Field label="Buscar activo">
  <SearchInput placeholder="Nombre o código…" onClear={() => refrescar()} />
</Field>
```

**Buenas prácticas.** Aporta `onClear` para reaccionar al vaciado. **Malas prácticas.**
No lo uses para entradas que no sean búsqueda.

---

## Textarea

**Objetivo.** Campo de texto multilínea.

**Cuándo usar.** Comentarios, descripciones, notas.

**Props.** Extiende `textarea` HTML. `size`, `invalid?`. `rows` por defecto `4`.

**Estados.** default / hover / focus / error / disabled / readonly.

**Accesibilidad.** Hereda asociación de `Field` igual que `Input`.

**Ejemplo.**

```tsx
<Field label="Observaciones">
  <Textarea rows={6} />
</Field>
```

**Buenas prácticas.** Permite redimensionar en vertical (por defecto). **Malas
prácticas.** No fijes alturas gigantes por defecto.

---

## Checkbox

**Objetivo.** Casilla de verificación con etiqueta y soporte de estado indeterminado.

**Cuándo usar.** Selección booleana o «seleccionar todo» parcial.

**Props.** Extiende `input` HTML (sin `type`/`size` nativo). `label`, `size`,
`indeterminate?`.

**Estados.** sin marcar / marcada / indeterminada / disabled / focus.

**Accesibilidad.** El `<label>` envuelve el control; en modo indeterminado se expone
`aria-checked="mixed"` y `element.indeterminate`.

**Ejemplo.**

```tsx
<Checkbox label="Acepto los términos" />
<Checkbox label="Seleccionar todo" indeterminate />
```

**Buenas prácticas.** Etiqueta siempre presente. **Malas prácticas.** No uses un
checkbox para acciones mutuamente excluyentes (usa `RadioGroup`).

---

## RadioGroup + Radio

**Objetivo.** Grupo de opciones mutuamente excluyentes.

**Cuándo usar.** Elegir una única opción de una lista corta.

**Props (RadioGroup).** `name?`, `value?` / `defaultValue?`, `onChange(value)`,
`size`, `disabled?`, `label` (etiqueta accesible del grupo), `orientation`
(`vertical` | `horizontal`). **Props (Radio).** `value` (obligatorio), `label`, `size`.

**Estados.** por opción: sin marcar / marcada / disabled / focus.

**Accesibilidad.** El contenedor usa `role="radiogroup"` con `aria-label` y
`aria-orientation`. Las flechas **↑/↓/←/→** mueven el foco y la selección de forma
cíclica entre opciones habilitadas.

**Ejemplo.**

```tsx
<Field label="Prioridad">
  <RadioGroup label="Prioridad" defaultValue="media">
    <Radio value="baja" label="Baja" />
    <Radio value="media" label="Media" />
    <Radio value="alta" label="Alta" />
  </RadioGroup>
</Field>
```

**Buenas prácticas.** Proporciona siempre `label` al grupo. **Malas prácticas.** No
mezcles `Radio` de distintos `RadioGroup` sin `name` propio.

---

## Switch

**Objetivo.** Interruptor de encendido/apagado inmediato.

**Cuándo usar.** Activar/desactivar ajustes que aplican al instante.

**Props.** Extiende `input` HTML (sin `type`/`size` nativo). `label`, `size`.

**Estados.** apagado / encendido / disabled / focus.

**Accesibilidad.** `role="switch"`; el `<label>` aporta el nombre accesible; se opera
con teclado (Espacio) como cualquier checkbox.

**Ejemplo.**

```tsx
<Switch label="Notificaciones por correo" defaultChecked />
```

**Buenas prácticas.** Úsalo cuando el cambio se aplica de inmediato. **Malas
prácticas.** No lo uses para confirmar formularios (usa un checkbox).

---

## Select

**Objetivo.** Selección de una opción de una lista, sobre `<select>` nativo estilizado.
Decisión conservadora por accesibilidad y compatibilidad móvil.

**Cuándo usar.** Listas medianas/largas de opciones simples.

**Props.** Extiende `select` HTML (sin `size` nativo). `size`, `invalid?`,
`placeholder?` (renderiza una opción inicial deshabilitada con `value=""`).

**Estados.** default / hover / focus / error / disabled.

**Accesibilidad.** Es un `<select>` nativo: teclado, lectores de pantalla y UI móvil
funcionan de serie. Hereda asociación del `Field`.

**Ejemplo.**

```tsx
<Field label="Estado">
  <Select placeholder="Seleccione…">
    <option value="abierto">Abierto</option>
    <option value="cerrado">Cerrado</option>
  </Select>
</Field>
```

**Buenas prácticas.** Prefiere el nativo para accesibilidad. **Malas prácticas.** No
reimplementes un combo a mano si el nativo cubre el caso.

---

## FormActions

**Objetivo.** Fila de acciones de un formulario (botones enviar/cancelar).

**Cuándo usar.** Al cierre de cualquier formulario.

**Props.** `align`: `inicio` | `centro` | `fin` (por defecto) | `distribuido`.

**Estados.** No aplica (contenedor de disposición).

**Accesibilidad.** Contenedor neutro; los propios botones aportan la semántica.

**Responsive.** Mobile-first: apila en columna en móvil y pasa a fila a partir de
`640px` usando las variables de espaciado `--do-*`.

**Ejemplo.**

```tsx
<FormActions>
  <Button variant="secundario">Cancelar</Button>
  <Button type="submit">Guardar</Button>
</FormActions>
```

**Buenas prácticas.** Coloca la acción primaria a la derecha (`fin`). **Malas
prácticas.** No pongas más de dos o tres acciones en la fila.
