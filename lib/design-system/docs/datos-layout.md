<!-- DGP-005 · Documentación de componentes de Datos y Layout del Design System DeltaOps -->

# DGP-005 · Componentes de Datos y Layout

Componentes oficiales para presentar datos y estructurar páginas de consola.
Todos consumen exclusivamente tokens `--do-*` (colores, espaciado, sombras, tiempos),
usan clases con prefijo `.do-`, iconos de `lucide-react` y textos por defecto en español formal.
Accesibilidad AA: roles/ARIA correctos, foco visible global, navegación por teclado.

Importación:

```tsx
import {
  Table, Pagination, Breadcrumb, KpiCard, EmptyState, ErrorState, Timeline, OfflineBadge,
} from "@workspace/design-system"; // vía components/data
import {
  Card, CardHeader, CardContent, CardFooter, PageHeader, Section, Toolbar, AppShell,
} from "@workspace/design-system"; // vía components/layout
```

Recuerda importar una sola vez la hoja de estilos: `import "@workspace/design-system/styles.css"`.

---

## Table

**Objetivo.** Presentar datos tabulares con encabezados y filas estilizados.

**Cuándo usar.** Listados densos con columnas comparables (órdenes, activos, inventario).
No usar para maquetar layout; para eso usa `Card`/`Section`.

**Props.**
| Prop | Tipo | Por defecto | Descripción |
|------|------|-------------|-------------|
| `caption` | `string` | — (obligatorio) | Descripción accesible de la tabla. |
| `captionOculto` | `boolean` | `false` | Oculta el caption visualmente, manteniéndolo accesible. |
| `compacta` | `boolean` | `false` | Variante compacta (menor altura de filas). |
| `hover` | `boolean` | `true` | Resalta la fila al pasar el ratón. |

Estructura `thead`/`tbody`/`th`/`td` como HTML nativo dentro de `<Table>`.

**Variantes.** normal · `compacta`. **Estados.** hover de fila (opcional).

**Accesibilidad.** Envuelta en `role="region"` con `aria-label` = `caption` y `tabIndex=0`
para permitir desplazamiento horizontal por teclado. Usa `caption` siempre.

**Ejemplo.**
```tsx
<Table caption="Órdenes recientes" compacta>
  <thead><tr><th>Folio</th><th>Estado</th></tr></thead>
  <tbody><tr><td>OT-001</td><td>Abierta</td></tr></tbody>
</Table>
```

**Buenas prácticas.** Encabezados en `<th>`; caption descriptivo.
**Malas prácticas.** Omitir `caption`; usar `<div>` para simular celdas.

---

## Pagination

**Objetivo.** Navegar entre páginas de un conjunto de resultados.

**Cuándo usar.** Listados/tablas paginados en servidor o cliente.

**Props.** `pagina` (1-indexada), `totalPaginas`, `onChange(pagina)`, `ventana` (páginas contiguas, def. `2`), `label` (def. `"Paginación"`).

**Variantes.** Tamaño fijo `sm` (coherente con listados). **Estados.** default/hover/pressed/activa/disabled (flechas en los extremos).

**Accesibilidad.** `nav` con `aria-label`; la página actual expone `aria-current="page"`;
flechas con `aria-label` "Página anterior/siguiente" y se deshabilitan en los extremos.

**Ejemplo.**
```tsx
<Pagination pagina={p} totalPaginas={12} onChange={setP} />
```

**Buenas prácticas.** Deriva `pagina`/`totalPaginas` del estado real.
**Malas prácticas.** Ocultar la página activa; usar índices 0-indexados sin ajustar.

---

## Breadcrumb

**Objetivo.** Indicar la ubicación dentro de la jerarquía y permitir volver.

**Cuándo usar.** Vistas de detalle anidadas.

**Props.** `items: { label, href?, onClick? }[]`, `label` (def. `"Ruta de navegación"`).

**Variantes.** Enlace (`href`) o botón (`onClick`); el último elemento es texto actual.
**Estados.** hover/foco en enlaces.

**Accesibilidad.** `nav` con `aria-label`, lista ordenada `<ol>`, último elemento con
`aria-current="page"`; separadores `ChevronRight` marcados `aria-hidden`.

**Ejemplo.**
```tsx
<Breadcrumb items={[{ label: "Inicio", href: "/" }, { label: "Activos", href: "/activos" }, { label: "Bomba 3" }]} />
```

**Buenas prácticas.** El último item sin enlace (página actual).
**Malas prácticas.** Enlazar la página actual; rutas demasiado profundas (>4 niveles).

---

## KpiCard

**Objetivo.** Destacar un indicador clave (valor + tendencia).

**Cuándo usar.** Tableros/resúmenes operativos.

**Props.** `titulo`, `valor`, `delta?: { valor, tendencia?: 'positiva'|'negativa'|'neutra', descripcion? }`, `icono?: LucideIcon`.

**Variantes.** Delta con color semántico: positiva=éxito, negativa=error, neutra=suave.
**Estados.** estático (elevación 1).

**Accesibilidad.** Icono `aria-hidden`; el título y el valor son texto legible.
El delta incluye descripción textual (p. ej. "vs. mes anterior").

**Ejemplo.**
```tsx
<KpiCard titulo="Disponibilidad" valor="98,4%" icono={TrendingUp}
  delta={{ valor: "+2,1%", tendencia: "positiva", descripcion: "vs. mes anterior" }} />
```

**Buenas prácticas.** Usa la tendencia acorde a si "más" es bueno o malo.
**Malas prácticas.** Colorear el delta al revés de su significado.

---

## EmptyState

**Objetivo.** Comunicar ausencia de datos y ofrecer una acción de salida.

**Cuándo usar.** Listas/búsquedas sin resultados, primeras cargas.

**Props.** `titulo`, `descripcion?`, `icono?: LucideIcon` (def. `Inbox`), `accion?: { label, onClick }`.

**Estados.** default; botón de acción con sus estados de `Button`.

**Accesibilidad.** `role="status"`; icono `aria-hidden`; acción como `Button` primario.

**Ejemplo.**
```tsx
<EmptyState titulo="Sin resultados" descripcion="No hay órdenes que coincidan."
  accion={{ label: "Crear orden", onClick: crear }} />
```

**Buenas prácticas.** Texto orientado a la acción siguiente.
**Malas prácticas.** Mensajes vagos ("Nada aquí") sin salida.

---

## ErrorState

**Objetivo.** Variante de `EmptyState` para errores, con reintento.

**Cuándo usar.** Fallos de carga/red recuperables.

**Props.** `titulo?` (def. "Se produjo un error"), `descripcion?`, `icono?: LucideIcon` (def. `AlertTriangle`), `onReintentar?`, `reintentarLabel?` (def. "Reintentar").

**Estados.** default; botón de reintento (secundario).

**Accesibilidad.** `role="alert"` (anuncio inmediato); icono `aria-hidden`.

**Ejemplo.**
```tsx
<ErrorState onReintentar={recargar} />
```

**Buenas prácticas.** Ofrece reintento cuando el error es recuperable.
**Malas prácticas.** Mostrar detalles técnicos crudos al usuario final.

---

## Timeline

**Objetivo.** Cronología vertical de eventos con punto y hora.

**Cuándo usar.** Historial/auditoría de una orden o activo.

**Props.** `eventos: { titulo, hora?, descripcion?, tono? }[]`, `label` (def. "Cronología de eventos").
`tono`: `neutro|primario|exito|advertencia|error|info` (color del punto).

**Estados.** estático.

**Accesibilidad.** `<ol>` con `aria-label`; hora en `<time>`; punto decorativo `aria-hidden`.

**Ejemplo.**
```tsx
<Timeline eventos={[{ titulo: "Orden creada", hora: "08:00", tono: "info" }]} />
```

**Buenas prácticas.** Orden cronológico coherente; tonos semánticos.
**Malas prácticas.** Sobrecargar cada evento con texto largo.

---

## OfflineBadge

**Objetivo.** Indicar el estado de conexión/sincronización.

**Cuándo usar.** Apps de campo con soporte offline.

**Props.** `estado: 'offline'|'sincronizando'|'sincronizado'`, `texto?` (sobrescribe el texto por defecto).

**Variantes/estados.** offline=error, sincronizando=advertencia (icono girando), sincronizado=éxito.

**Accesibilidad.** `role="status"` + `aria-live="polite"`; icono `aria-hidden`; texto siempre presente.

**Ejemplo.**
```tsx
<OfflineBadge estado="sincronizando" />
```

**Buenas prácticas.** Reflejar el estado real de sincronización.
**Malas prácticas.** Depender solo del color (el texto ya lo evita).

---

## Card / CardHeader / CardContent / CardFooter

**Objetivo.** Superficie con borde y elevación 1 para agrupar contenido.

**Cuándo usar.** Bloques de contenido relacionados; tarjetas de detalle.

**Props.** `Card`: `interactiva?` (hover destacado). Subcomponentes: props de `div`.

**Variantes.** normal · `interactiva`. **Estados.** hover (solo interactiva).

**Accesibilidad.** Contenedor neutro; usa encabezados reales dentro del contenido.

**Ejemplo.**
```tsx
<Card>
  <CardHeader>Detalle del activo</CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button>Guardar</Button></CardFooter>
</Card>
```

**Buenas prácticas.** Un solo tema por tarjeta.
**Malas prácticas.** Anidar tarjetas en exceso.

---

## PageHeader

**Objetivo.** Encabezado de página con título `h1` (Montserrat), descripción y acciones.

**Cuándo usar.** Parte superior de cada vista principal.

**Props.** `titulo`, `descripcion?`, `acciones?` (alineadas a la derecha).

**Variantes/estados.** Responsive: columna en móvil, fila con acciones a la derecha desde `768px`.

**Accesibilidad.** Título como `<h1>` (uno por página).

**Ejemplo.**
```tsx
<PageHeader titulo="Panel de control" descripcion="Resumen operativo"
  acciones={<Button>Nueva orden</Button>} />
```

**Buenas prácticas.** Un único `PageHeader`/`h1` por vista.
**Malas prácticas.** Varios `h1`; acciones sin etiqueta accesible.

---

## Section

**Objetivo.** Agrupar contenido bajo un título `h2`.

**Cuándo usar.** Subdivisiones dentro de una página.

**Props.** `titulo?`, `acciones?`.

**Accesibilidad.** `<section>` con `aria-labelledby` vinculado al `h2` (id automático).

**Ejemplo.**
```tsx
<Section titulo="Órdenes abiertas" acciones={<Button size="sm">Ver todas</Button>}>…</Section>
```

**Buenas prácticas.** Jerarquía `h1` (página) → `h2` (sección).
**Malas prácticas.** Saltar niveles de encabezado.

---

## Toolbar

**Objetivo.** Fila flexible de controles con separación por tokens.

**Cuándo usar.** Filtros, acciones sobre una lista/tabla.

**Props.** `justificar?: 'inicio'|'centro'|'fin'|'entre'`, `label?`.

**Accesibilidad.** `role="toolbar"`; añade `label` si contiene varios grupos.

**Ejemplo.**
```tsx
<Toolbar justificar="entre" label="Filtros"><Input/><Button>Aplicar</Button></Toolbar>
```

**Buenas prácticas.** Usa `justificar` en vez de márgenes manuales.
**Malas prácticas.** Hardcodear `gap`/`margin` con px.

---

## AppShell

**Objetivo.** Layout de consola: barra superior fija (fondo `--do-shell`), navegación
horizontal y contenido centrado a `--do-max-ancho`.

**Cuándo usar.** Marco raíz de aplicaciones de la plataforma.

**Props/slots.** `logo?`, `nav?`, `acciones?`, `labelBarra?` (def. "Barra principal"),
`labelNav?` (def. "Navegación principal"), `children` (contenido).

**Variantes/estados.** Mobile-first: navegación colapsable con botón de menú (`Menu`/`X`);
en `≥768px` la navegación es horizontal en línea y el botón se oculta.

**Accesibilidad.** Barra con `aria-label`; navegación en `<nav>` con `aria-label`;
botón de menú con `aria-expanded`/`aria-controls` y etiqueta accesible; **Escape** cierra el menú.
Contenido en `<main>`.

**Ejemplo.**
```tsx
<AppShell logo={<Logo width={110} />} acciones={<Avatar nombre="Ana León" />}
  nav={<><a href="/panel">Panel</a><a href="/ordenes">Órdenes</a></>}>
  <PageHeader titulo="Panel de control" />
</AppShell>
```

**Buenas prácticas.** Un único `AppShell` como raíz; enlaces `<a>` o `<button>` en `nav`.
**Malas prácticas.** Múltiples shells anidados; navegación sin etiqueta.
