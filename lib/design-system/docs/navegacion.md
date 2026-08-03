# DGP-005 · Componentes de navegación / layout

Familia de navegación y estructura del workspace del Design System DeltaOps (`src/components/navigation.tsx`). Todos consumen exclusivamente tokens `--do-*`. Diseño **mobile-first** y accesibilidad AA (roles, `aria-*`, foco visible con `var(--do-focus-anillo)`, tema claro/oscuro automático vía tokens).

## Sidebar
- **Objetivo:** barra lateral de navegación principal del workspace (fondo `--do-shell`, texto `--do-shell-texto`).
- **Props:** `encabezado?`, `pie?`, `children`, `colapsada?`, `onColapsar?`, `etiqueta?` (aria-label del `<nav>`, por defecto `"Navegación principal"`), `abiertaMovil?`, `onCerrarMovil?`.
- **Colapsable:** con `colapsada` reduce el ancho de `--do-sidebar-ancho` (260px) a `--do-sidebar-ancho-colapsada` (64px) mostrando solo iconos.
- **Responsive:** en `<768px` la barra queda fuera de canvas; se muestra con `abiertaMovil` (requiere `onCerrarMovil`) como panel modal. El **propio `<nav>`** pasa a ser el diálogo (`role="dialog"` + `aria-modal="true"` + `aria-label`), envolviendo la navegación real; el backdrop es **decorativo** (`aria-hidden="true"`, solo cierra al clic). `Escape` o clic en el backdrop invocan `onCerrarMovil`.
- **Gestión de foco modal (patrón `Modal`):** al abrir, el foco entra al primer elemento enfocable del panel; `Tab`/`Shift+Tab` quedan atrapados dentro; `Escape` cierra; al cerrar se **restaura el foco** al elemento previamente activo.
- **Accesibilidad:** `<nav>` etiquetado; en modo modal es el diálogo accesible (no un backdrop vacío).
- **Ejemplo:**
  ```tsx
  <Sidebar encabezado={<Logo />} colapsada={colapsada}>
    <SidebarGrupo titulo="Principal">
      <SidebarItem icono={Home} etiqueta="Inicio" href="/" activo />
      <SidebarItem icono={Wrench} etiqueta="Órdenes" href="/ordenes" badge={5} />
    </SidebarGrupo>
  </Sidebar>
  ```

### SidebarGrupo
- **Objetivo:** agrupar ítems bajo un título de sección.
- **Props:** `titulo?`, `children`.
- **Accesibilidad:** `role="group"` etiquetado por el título; contiene la `<ul>` de ítems.

### SidebarItem
- **Objetivo:** entrada de navegación individual.
- **Props:** `icono?` (`LucideIcon`), `etiqueta` (obligatoria), `activo?`, `href?`, `onClick?`, `badge?`.
- **Estados:** default, hover, focus (anillo rojo), activo (acento `--do-primario` + `aria-current="page"`).
- **Render:** `<a>` cuando hay `href`, `<button type="button">` en caso contrario.

## Topbar
- **Objetivo:** barra superior del workspace.
- **Props:** `titulo?`, `inicio?` (slot izquierdo: migas de pan o botón de menú), `acciones?` (slot derecho), `children?`, `unico?`.
- **Accesibilidad:** con `unico={true}` se renderiza como `<header>` (landmark `banner` implícito; usar solo si es la única barra de la página). Sin `unico` (valor por defecto) se renderiza como `<div>` con la misma clase, **sin** generar landmark. El título se renderiza como `<h1>`.
- **Ejemplo:** `<Topbar titulo="Panel" inicio={<IconButton label="Menú"><Menu/></IconButton>} acciones={<Avatar nombre="Ana" />} />`

## Workspace
- **Objetivo:** contenedor que compone `Sidebar` + `Topbar` + `<main>`.
- **Props:** `sidebar`, `topbar`, `children`.
- **Estructura:** incluye un enlace `.do-skip-link` "Saltar al contenido" (visible solo con foco) y un `<main id="do-contenido">` con `tabIndex={-1}`.
- **Responsive:** en escritorio el sidebar queda fijo (sticky, alto completo); en móvil se controla vía `abiertaMovil`/`onCerrarMovil` del `Sidebar`.
- **Ejemplo:**
  ```tsx
  <Workspace sidebar={<Sidebar>…</Sidebar>} topbar={<Topbar titulo="Panel" />}>
    <DashboardLayout>…</DashboardLayout>
  </Workspace>
  ```

## DashboardLayout
- **Objetivo:** rejilla responsive mobile-first para dashboards.
- **Props:** `columnas?` (1–4; por defecto `auto-fit` con `minmax(260px, 1fr)`), `children`.
- **Comportamiento:** una columna en móvil; a partir de `640px` aplica la rejilla (auto-fit o número fijo).

### DashboardItem
- **Objetivo:** celda del dashboard.
- **Props:** `span?` (1–4), `children`.
- **Ejemplo:**
  ```tsx
  <DashboardLayout columnas={4}>
    <DashboardItem span={2}><KpiCard … /></DashboardItem>
    <DashboardItem><KpiCard … /></DashboardItem>
    <DashboardItem><KpiCard … /></DashboardItem>
  </DashboardLayout>
  ```

## Tokens introducidos
- `--do-sidebar-ancho: 260px`
- `--do-sidebar-ancho-colapsada: 64px`
