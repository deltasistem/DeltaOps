# Experiencia del módulo de Activos (DGP-008.3)

Guía funcional y técnica de la experiencia completa del módulo de **Activos** en la
consola DeltaOps (`/deltaops`). Toda la interfaz se construye exclusivamente con el
**Design System** oficial (`@workspace/design-system`, tokens `--do-*`, componentes
`Do*`); no se usa HTML/estilo manual fuera de componentes o utilidades del DS.

> Se requiere sesión de administrador para explorar la experiencia (las credenciales de desarrollo se gestionan fuera de la documentación).

---

## 1. Rutas

Todas las páginas se registran en `src/App.tsx` (router `wouter`, base
`import.meta.env.BASE_URL`) y comparten el envoltorio `ShellActivos`
(`src/lib/activos/Shell.tsx`): `ThemeProvider` + `do-root`, control de sesión
(redirige a `/login` en 401), navegación de la sección y framework offline.

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/activos` | `activos-listado.tsx` | Listado con tabla/tarjetas, filtros, búsqueda y KPIs |
| `/activos/nuevo` | `activos-nuevo.tsx` | Wizard de alta (9 pasos) sobre Dynamic Forms |
| `/activos/arboles` | `activos-arboles.tsx` | Árboles jerárquico / por ubicación / por componentes |
| `/activos/sincronizacion` | `activos-sincronizacion.tsx` | Panel de la cola offline |
| `/activos/escanear` | `activos-escanear.tsx` | Escaneo QR (cámara + manual) |
| `/activos/:id` | `activos-ficha.tsx` | Ficha completa con pestañas y acciones |

La ficha declara `/activos/:id` **después** de las rutas literales
(`/activos/nuevo`, etc.) para que `wouter` no las capture como `:id`.

La consola (`console.tsx`) incluye un enlace **Activos** en la barra superior.

---

## 2. Arquitectura de datos y librerías compartidas

```
src/lib/activos/
  api.ts          Cliente fetch (cookies, 401→login, toleraNoEncontrado→null en 404)
  tipos.ts        Tipos/enums del dominio + helpers de estado
  hooks.ts        Hooks de consulta GET + buscar()/filtrarLocal() (degradación)
  mutaciones.ts   Mutaciones (crear/editar/transición/comentar/relacionar/adjuntar…)
  constantes.ts   MODULO, claveBorrador(tenant)
  alta.ts         construirInput() + borradores (leer/guardar/borrar)
  hash.ts         SHA-256 (SubtleCrypto)
  Shell.tsx       Envoltorio común (tema + sesión + nav + offline)
  Arbol.tsx       Árbol accesible (role=tree/treeitem)
  RelacionesGrafo.tsx  Grafo SVG de relaciones (tokens --do-*)
src/lib/forms/    Motor de formularios dinámicos (ver §4)
src/lib/offline/  Framework offline (ver §5)
src/lib/qr/       Codificador QR + componente/impresión (ver §6)
```

### Seguridad del bundle (crítico)

El motor de formularios importa **solo** los subpaths seguros para navegador
`@workspace/dynamic-forms/definicion` y `@workspace/dynamic-forms/condiciones`
(dependen solo de `zod`). **No** se importa `@workspace/dynamic-forms/validacion`
ni barriles de `@workspace/kernel`, que arrastran `node:crypto` y rompen el build
de Vite. La validación de cliente se reimplementa localmente con el esquema Zod
del campo (`esquemaCampo`) + evaluación de condiciones.

### Degradación elegante (endpoints opcionales)

Tres endpoints nuevos pueden no estar desplegados aún (responden `404`
`KRN-NF-001`). La UI degrada sin romperse:

| Endpoint | Degradación |
|----------|-------------|
| `GET /activos/busqueda?q=` | Se filtra en cliente sobre `listar` (`filtrarLocal`) y se muestra un aviso |
| `GET /qr/resolver?codigo=` | Se interpreta el código localmente (UUID o `…/activos/:id` en el contenido) |
| `GET /:id/documentacion/:attachmentId/url` | Se muestra la ficha del adjunto con la previsualización deshabilitada y el motivo |

---

## 3. Listado, ficha, árboles

- **Listado**: alterna tabla/tarjetas (en móvil siempre tarjetas vía utilidades
  `.do-solo-movil`/`.do-solo-desktop`), filtros por estado/tipo/categoría/familia/
  criticidad/ubicación/responsable, búsqueda rápida con *debounce* y KPIs de
  resumen. Paginación cliente (`Pagination`).
- **Ficha**: cabecera con estado (`Badge`), acciones de **transición** (con `Modal`
  de confirmación) calculadas por `transicionesDesde(estado)`, edición en `Modal`,
  y pestañas (`Tabs`): **Timeline**, **Documentación**, **Relaciones**,
  **Históricos**, **Comentarios**, **Etiqueta** (QR + impresión). Las transiciones
  envían `{id, expectedVersion}`.
- **Árboles**: tres modos. *Jerárquico* y *por ubicación* se construyen en cliente
  a partir del listado (`datos.padreId` / `ubicacionId`). *Por componentes* consume
  `GET /:id/componentes`. El componente `Arbol` usa roles WAI-ARIA
  (`tree`/`treeitem`/`group`, `aria-expanded`, `aria-level`) y nodos navegables.

---

## 4. Motor de formularios dinámicos

**TODOS** los formularios de la experiencia se definen como **plantillas
declarativas** del Dynamic Forms Engine (`DefinicionFormulario`, en
`src/lib/forms/plantillas.ts`) y se pintan con el **renderer genérico**
`FormularioDinamico`. No hay controles de formulario construidos a mano fuera del
renderer: los componentes del DS (`Input`/`Textarea`/`Select`/`Checkbox`/
`Switch`/`RadioGroup` e `input[type=file]` para archivos) sólo aparecen DENTRO de
`CampoRenderer`.

```
DefinicionFormulario (plantillas.ts)
        │  nodos: contenedores (wizard/sección/pestañas/grupo) + campos hoja
        ▼
FormularioDinamico (recursivo)  ──►  CampoRenderer (un control DS por tipo)
        │                                   Input/Textarea/Select/Checkbox/Switch/RadioGroup/file
        ▼
motor.ts (lógica pura)
  evaluarEstados()  reglas → visible/obligatorio/soloLectura/calculado
  validar()         obligatoriedad + esquema Zod del campo + validaciones condicionales
  hayBloqueos()     ¿hay errores/bloqueos?
```

El hook `useFormularioDinamico` (o el estado del wizard) mantiene los valores y
expone `validarAhora`/`esValido`. La prop `soloClaves` limita el render a los
campos de un paso concreto (usada por el wizard).

### Plantillas por formulario

| Plantilla | Uso | Tipos de campo |
|-----------|-----|----------------|
| `plantillaAlta` | Wizard de alta (7 pasos de datos) | texto, número, fecha, select (catálogo) |
| `plantillaEdicion` | Edición en la ficha | texto, textarea, select |
| `plantillaAdjunto` | Registro de documentación | select + **adjunto (input file)** |
| `plantillaFiltrosListado` | Filtros del listado | select (catálogo) + texto |
| `plantillaFiltrosTimeline` | Filtros del timeline | texto, select, **fecha** |
| `plantillaComentario` | Crear/editar comentario | texto (largo → Textarea) |
| `plantillaRelacion` | Crear relación | select + texto |
| `plantillaTipoEtiqueta` | Selector de tipo de etiqueta | select |
| `plantillaEscaneoManual` | Entrada manual de escaneo | texto |

**Tipo de campo `adjunto`/`imagen`:** el `CampoRenderer` pinta un `input[type=file]`
que emite un objeto `File`. El motor NO valida ese `File` contra el esquema Zod
del campo (que espera un id de plataforma): sólo comprueba su presencia por
obligatoriedad. Los grupos (`grupo`) son pura maquetación (sin leyenda) y, cuando
agrupan varios campos hoja, se distribuyen en una rejilla responsive (filtros).

### Wizard de alta (9 pasos)

`PASOS_WIZARD` define **7 pasos de datos** (identificación, clasificación, técnica,
ubicación, responsables, garantía, documentación); la página añade **2 pasos** más:
**Revisión** (resumen de todos los valores) y **Confirmación**. El DS `Wizard`
recibe estos 9 pasos; cada paso de datos valida sus campos con una función *pura*
(`pasoValido`, sin `setState`) para no provocar bucles de render, y al cambiar de
paso se materializan los hallazgos de los pasos visitados.

- **Borradores** (`alta.ts`): autoguardado en `localStorage` con clave por tenant
  `deltaops:activos:borrador:<tenant>`; botón *Descartar borrador*; se borra al
  crear con éxito.
- `construirInput()` traduce los valores planos al `CrearInput` del módulo
  (compone `ubicacion` y `garantia`, descarta vacíos). El alta se envía por
  `crearActivo()` con `id`/`opId` generados en cliente (necesario para idempotencia
  y para el `crear` del protocolo de sync).

---

## 5. Framework offline (Offline First)

```
src/lib/offline/
  tipos.ts     EstadoSync/EstadoOperacion, OperacionCola, ReciboSync, ResumenSync
  cola.ts      ColaSync (store observable) + nuevoOpId() + enviarPorHttp()
  contexto.tsx OfflineProvider / useOffline / mutarConOffline()
```

- **Cola persistente** (`ColaSync`): una instancia por tenant, persistida en
  `localStorage` (`deltaops:activos:cola:<tenant>`). Store observable
  (`subscribe`/`getSnapshot`) apto para `useSyncExternalStore`.
- **opId** UUID por operación (`crypto.randomUUID`), reusado entre reintentos →
  idempotencia en `POST /activos/sync`.
- **Auto-encolado**: `mutarConOffline` intenta el envío directo; si falla por red
  (TypeError de `fetch` / mensaje de red) encola la operación; cualquier otro error
  (validación, conflicto HTTP) se devuelve al llamador sin encolar.
- **Reintento**: automático al recuperar conexión (evento `online`) y al montar si
  hay pendientes; manual desde el panel.
- **Recuperación**: al recargar, las operaciones en estado `enviando` vuelven a
  `pendiente`.
- **Conflictos**: el recibo `conflicto` conserva el estado `actual` del servidor y
  el mensaje; el panel permite **reintentar** o **descartar**.
- **UI**: `OfflineBadge` en el banner del Shell y panel dedicado
  `/activos/sincronizacion` (KPIs, tabla de operaciones, purgar exitosas).

```
Mutación ──► ¿online y directo OK? ──► aplicada
     │                └─ error de red ──► encolar (pendiente)
     ▼
evento "online" / montaje / "Sincronizar ahora"
     └─► ColaSync.procesar() ─► POST /sync (lote) ─► aplicar recibos
             aplicada/idempotente ─► purgable
             reintentable ─────────► reintento
             conflicto/rechazada ──► requiere acción (reintentar/descartar)
```

---

## 6. QR (integrado con platform.qr)

El código de la etiqueta lo **emite la plataforma** (`platform.qr`); el cliente
NUNCA codifica una URL. Flujo:

```
Ficha › pestaña Etiqueta
  detalle.etiqueta {id,codigo,tipo}?  ── sí ─► usa ese código (no re-emite)
        │ no
        ▼
  POST /activos/:id/qr {tipo:"qr"} ─► {codigo, reutilizada}   (idempotente por activo+tipo)
        ▼
  QrCode(valor = codigo)  +  imprimirEtiqueta(valor = codigo)

Escáner (/activos/escanear)
  BarcodeDetector (cámara) | entrada manual
        ▼
  resolverCodigoActivo(codigo, servidor):
     1) GET /activos/qr/resolver?codigo=  ─► {activoId}  (fuente primaria)
     2) degradación: extraerId(codigo)  (UUID o URL …/activos/:id)  ─► activoId
        ▼
  navegar /activos/:activoId
```

- **Emisión/reutilización:** al abrir la pestaña *Etiqueta*, la ficha reutiliza
  `detalle.etiqueta` si vino en el detalle; si no, llama `POST /:id/qr` (respuesta
  `{codigo, reutilizada}`, idempotente). El SVG (`QrCode`) y la etiqueta impresa
  (`imprimirEtiqueta`) codifican **ese `codigo` de plataforma**, no una URL. Tipos
  **código de barras** y **NFC** quedan *«preparado»* (sin generación).
- **Resolución** (`src/lib/qr/etiqueta.ts`, lógica pura): `resolverCodigoActivo`
  prioriza el resolvedor del servidor `GET /qr/resolver?codigo=`; sólo si éste no
  está desplegado (404 → `null`) degrada a interpretación local del contenido
  (`extraerId`: UUID o URL `…/activos/:id`), avisando de la degradación.
- **Codificador propio** (`src/lib/qr/encoder.ts`): codificador autocontenido
  (modo byte, EC nivel M, versiones 1–10, Reed–Solomon sobre GF(256)); `qrASvg()`
  serializa con tokens `--do-*` en pantalla. Pruebas: tamaño, patrones
  localizadores, temporizador, determinismo, SVG.

---

## 7. Documentación y adjuntos (referencia-only)

El **Attachment Service** de plataforma es **referencia-only**: la «URL firmada»
(`GET /:id/documentacion/:attachmentId/url`) devuelve **JSON de metadatos**
(`url`, `expiresAt`, `nombreArchivo`, `mimeType`, `tamanoBytes`, `hashSha256`,
`almacenamiento:"referencia"`), y el propio servidor de adjuntos responde metadatos,
**nunca un binario**. Por eso la pestaña *Documentación* NO es un visor de binarios,
sino una **UX de metadatos verificables**:

- Aviso permanente de que la plataforma custodia **referencias**, no binarios
  (enlaza `lib/module-activos/docs/colaboracion.md`).
- Una **tarjeta por documento**, agrupada por categoría, con: categoría, nombre,
  `mimeType`, tamaño formateado, **hash SHA-256** y un botón *Verificar referencia*
  que hace `fetch` de la URL firmada y muestra el estado: **verificada** (firma
  HMAC válida + caducidad), **no disponible** (servicio no desplegado) o **error**.
- **Registro**: formulario dinámico (`plantillaAdjunto` = categoría + archivo);
  el **SHA-256 se calcula en cliente** (`SubtleCrypto`, `hash.ts`) y se envían sólo
  metadatos + hash (`POST /:id/documentacion`), sin subir el binario.
- **Excepción de previsualización** (única permitida): un archivo **recién
  seleccionado en esta sesión** (aún no registrado) SÍ se previsualiza desde el
  `File` local (`URL.createObjectURL`, revocado al desmontar). Nunca se promete
  previsualización de binarios remotos.

---

## 8. Accesibilidad y responsive

- Todo el interactivo usa componentes DS con etiquetas asociadas (`Field` +
  `htmlFor`), `aria-current` en navegación, `role=status`/`aria-live` en el banner
  offline, `role=tree` en árboles, `role=group`/`role=button` con soporte de
  teclado (Enter/Espacio) en el grafo de relaciones.
- Responsive mediante utilidades `.do-solo-movil` / `.do-solo-desktop` (breakpoint
  768px, coherente con el DS): el listado usa tarjetas en móvil y tabla en desktop.

---

## 9. Pruebas

`vitest` + `@testing-library/react` (`pnpm --filter @workspace/deltaops test`).

| Archivo | Cobertura |
|---------|-----------|
| `offline-cola.test.ts` | Encolado, persistencia, aislamiento por tenant, procesar/replay, conflictos, reversión por red, recuperación `enviando→pendiente`, purga |
| `qr-encoder.test.ts` | Tamaño por versión, patrones localizadores, temporizador, determinismo, escalado de versión, SVG |
| `forms-motor.test.ts` | Obligatoriedad, reglas condicionales, restricciones de rango, coherencia de pasos |
| `forms-renderer.test.tsx` | Render por paso (`soloClaves`), etiquetas accesibles (a11y), propagación de cambios, opciones de catálogo |
| `alta-wizard.test.ts` | Borradores por tenant (round-trip, aislamiento, JSON corrupto), `construirInput` |
| `filtros.test.ts` | Filtro de búsqueda local (nombre/código/tipo, umbral, sin coincidencias) |
| `forms-migrados.test.tsx` | Formularios migrados a Dynamic Forms: filtros (listado/timeline), campo **archivo** (input file + validación de `File`), comentario, relación, tipo de etiqueta, escaneo manual |
| `qr-plataforma.test.ts` | Integración platform.qr: el QR codifica el **código de plataforma** (no URL), `extraerId` (degradación), `resolverCodigoActivo` (servidor primario → local secundario) |

**Resultado:** 8 archivos, 55 pruebas en verde.

---

## 10. Verificación

```bash
pnpm -w typecheck                                      # OK (5 proyectos)
cd artifacts/deltaops && PORT=5000 BASE_PATH=/deltaops pnpm build   # OK (aviso de chunk > 500 kB, no fatal)
pnpm --filter @workspace/deltaops test                 # 55/55 OK
```

Smoke-test en vivo (`$REPLIT_DEV_DOMAIN/deltaops`, sesión admin, tras poblar
catálogos y crear un activo): `login 200`, `POST /activos 200`,
`POST /:id/qr 200` (`{codigo,reutilizada:false}`; re-emisión → `reutilizada:true`),
`GET /qr/resolver?codigo= 200` (`{activoId}`), `GET /busqueda?q= 200`,
`POST /:id/documentacion 200`, `GET /:id/documentacion/:att/url 200`
(**JSON de metadatos** con `almacenamiento:"referencia"`; el servidor de adjuntos
también responde metadatos, nunca binario → confirma la UX referencia-only).

### Degradaciones pendientes / notas

- El tenant de desarrollo arranca **sin catálogos ni activos**; para ver datos hay
  que poblar catálogos (`catalogo.upsert` + `catalogo.habilitar`) y crear activos.
  Con el tenant vacío, `/busqueda` y `/qr/resolver` devolvían `404` (activando las
  degradaciones); con datos responden `200` (verificado en vivo).
- El backend acepta hoy 6 categorías de documentación; la UI ofrece 8 (añade
  *fotografía* y *video*), preparadas para cuando el enum se amplíe.
```
