# DGP-005 · Componentes avanzados

Familia avanzada del Design System DeltaOps (`src/components/advanced.tsx`). Incluye orquestación de pasos, envoltorio de gráficos y los motores de tema e internacionalización. Todos los componentes visuales consumen exclusivamente tokens `--do-*` y son 100 % genéricos (sin lógica de negocio).

## Stepper
- **Objetivo:** indicar el progreso a través de una secuencia de pasos.
- **Cuándo usar:** flujos lineales (altas, asistentes, aprobaciones) donde el usuario debe ver dónde está.
- **Props:** `pasos` (`{ id, etiqueta, descripcion? }[]`), `actual` (índice 0-indexado), `orientation` (`horizontal | vertical`, por defecto `horizontal`), `label` (etiqueta accesible, por defecto "Progreso por pasos").
- **Estados visuales:** *completado* (marcador con check, color éxito), *actual* (acento Rojo oficial `var(--do-primario)`, `aria-current="step"`), *pendiente* (neutro).
- **Accesibilidad:** se renderiza como `<ol>` con `aria-label`; el paso activo lleva `aria-current="step"`; los marcadores son `aria-hidden` (decorativos).
- **Ejemplo:** `<Stepper pasos={pasos} actual={1} />`

## Wizard
- **Objetivo:** asistente multi-paso controlado que combina `Stepper`, el panel del paso y las acciones de navegación.
- **Cuándo usar:** captura de datos por etapas con validación opcional antes de avanzar.
- **Props:** `pasos` (`{ id, etiqueta, contenido: ReactNode, validar?: () => boolean }[]`), `actual`, `onCambio(indice)`, `onFinalizar?`, `etiquetaSiguiente?` ("Siguiente"), `etiquetaAnterior?` ("Anterior"), `etiquetaFinalizar?` ("Finalizar"), `orientation?`.
- **Comportamiento:** componente **controlado** (el estado del paso vive fuera). "Anterior" se deshabilita en el primer paso. En el último paso el botón principal muestra "Finalizar" e invoca `onFinalizar`. Si `validar()` del paso actual devuelve `false`, el botón "Siguiente/Finalizar" queda **bloqueado**.
- **Accesibilidad:** el panel del paso es `role="group"` con `aria-labelledby` apuntando a la etiqueta del paso; las acciones reutilizan `Button` y `FormActions`.
- **Ejemplo:**
  ```tsx
  const [paso, setPaso] = useState(0);
  <Wizard
    pasos={[{ id: "a", etiqueta: "Datos", contenido: <Formulario />, validar: () => esValido }]}
    actual={paso}
    onCambio={setPaso}
    onFinalizar={guardar}
  />
  ```

## ChartWrapper
- **Objetivo:** envoltorio genérico y accesible para gráficos, **sin** acoplar ninguna librería de charts. El gráfico llega como `children` o como render prop.
- **Cuándo usar:** cualquier visualización (barras, líneas, dona) que necesite título, estados y una paleta coherente.
- **Props:** `titulo`, `descripcion?`, `altura?` (px, por defecto `280`), `cargando?`, `error?`, `onReintentar?`, `vacio?`, `vacioTexto?`, y el contenido vía `children` **o** `render?: (ctx: { colores: string[] }) => ReactNode`.
- **Paleta:** exporta `paletaCategorica` (array de colores) derivada de los **tokens tipados** de `../tokens` — Rojo oficial primero, luego Oceano, semánticos y grises. No usa `getComputedStyle`. El mismo array se entrega al render prop en `ctx.colores`.
- **Estados:** `cargando` → `Skeleton`; `error` → `ErrorState` (con `onReintentar`); `vacio` → `EmptyState`. Todos reutilizan los componentes existentes de `data.tsx`.
- **Accesibilidad:** `role="figure"` con `aria-labelledby` (título) y `aria-describedby` (descripción, si existe).
- **Ejemplo:**
  ```tsx
  <ChartWrapper titulo="Producción" descripcion="Últimos 6 meses" altura={320}>
    <MiGraficoDeBarras />
  </ChartWrapper>

  <ChartWrapper titulo="Distribución" render={({ colores }) => <Dona paleta={colores} />} />
  ```

## ThemeProvider + useTheme (Theme Engine)
- **Objetivo:** gestionar el tema visual de la aplicación y su persistencia.
- **Props (`ThemeProvider`):** `children`, `temaInicial?` (`light | dark | auto`, por defecto `auto`).
- **Hook:** `useTheme()` → `{ tema, setTema }`.
- **Comportamiento:** aplica `data-do-theme` en `document.documentElement` y sincroniza la clase `dark` (puente para Tailwind). Persiste la elección en `localStorage` bajo la clave `do-tema`. En modo `auto` reacciona a `prefers-color-scheme`.
- **SSR-safe:** todos los accesos a `window`/`document`/`localStorage` están protegidos con guardas `typeof`.
- **Uso:** `useTheme` lanza un error descriptivo si se usa fuera de `<ThemeProvider>`.
- **Ejemplo:**
  ```tsx
  <ThemeProvider temaInicial="auto">
    <App />
  </ThemeProvider>

  const { tema, setTema } = useTheme();
  <button onClick={() => setTema(tema === "dark" ? "light" : "dark")}>Cambiar tema</button>
  ```

## I18nProvider + useI18n (internacionalización preparada)
- **Objetivo:** contexto ligero de traducción, **sin dependencias externas**, dejando el sistema listo para i18n.
- **Props (`I18nProvider`):** `children`, `idioma?` (por defecto `'es'`), `mensajes?: Record<string, Record<string, string>>` (diccionario por idioma).
- **Hook:** `useI18n()` → `{ t(clave, porDefecto?), idioma, setIdioma }`. `t` devuelve la traducción del idioma activo; si no existe, usa `porDefecto` o, en su defecto, la propia clave.
- **Estado actual:** en esta fase los componentes del DS **no** se migran a `t()`; sus textos por defecto siguen en español. El proveedor queda **preparado** para adoptar `t()` en una fase posterior sin cambiar la API pública.
- **Ejemplo:**
  ```tsx
  <I18nProvider mensajes={{ es: { guardar: "Guardar" }, en: { guardar: "Save" } }}>
    <App />
  </I18nProvider>

  const { t, setIdioma } = useI18n();
  <button>{t("guardar", "Guardar")}</button>
  ```
