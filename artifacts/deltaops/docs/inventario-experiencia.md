# Experiencia de Inventario (DGP-011.3)

Guía funcional y técnica de la experiencia empresarial del módulo de
**Inventario** de DeltaOps. La experiencia se **compone sobre el corpus
existente**: no introduce arquitectura ni infraestructura nueva y **no modifica**
el dominio ni el contrato de API (congelado en
`lib/module-inventario/openapi/inventario.openapi.json`, montado en
`/api/deltaops/inventario`), el Workflow Engine, el Dynamic Forms Engine ni la
Shared Platform. El patrón de referencia es la experiencia de Órdenes de Trabajo
(DGP-009.3) y de Activos (DGP-008.3).

> **Sin credenciales.** Este documento no contiene usuarios, contraseñas ni
> secretos. Las pruebas en vivo usan las credenciales de desarrollo del entorno,
> que **nunca** deben documentarse.

---

## 1. Mapa de la experiencia

| Pantalla | Ruta | Descripción |
|---|---|---|
| Listado | `/inventario` | Tabla/tarjetas, búsqueda, filtros (Dynamic Forms), orden, paginación, estados vacío/error/offline. |
| Ficha del item | `/inventario/:id` | Ficha integrada: general, existencias, lotes, series, movimientos, reservas, transferencias, conteos, ajustes, comentarios, adjuntos, timeline, historial y etiqueta QR. |
| Nuevo item | `/inventario/nuevo` | Wizard de alta (Dynamic Forms) con autoguardado de borrador y degradación offline. |
| Movimientos | `/inventario/movimientos` | Ledger de movimientos, filtrable por item y tipo. |
| Transferencias | `/inventario/transferencias` | Alta y ciclo de vida de transferencias entre bodegas (gobernado por Workflow). |
| Conteos | `/inventario/conteos` | Conteos cíclicos/físicos: programar, registrar, diferencias y cierre. |
| Bodegas y ubicaciones | `/inventario/bodegas` | Árbol jerárquico bodega → ubicaciones, capacidad y disponibilidad; alta de ambas. |
| Escanear | `/inventario/escanear` | QR de plataforma + navegación contextual al item. |
| Sincronización | `/inventario/sincronizacion` | Cola offline: estado, reintentos, conflictos, purga. |

Todas las pantallas se montan bajo `ShellInventario` (sesión + navegación +
banner offline) y usan **exclusivamente** el Design System
(`@workspace/design-system`) y los tokens `--do-*`.

Puntos de integración: la Consola (`/`) y el Centro Global de Mantenimiento
(`/centro`) enlazan a la experiencia de Inventario.

---

## 2. Comandos y ciclo de vida (Workflow Engine)

La UI sólo **presenta** las transiciones y **delega la decisión al motor**;
nunca las omite ni las autoaprueba. Los comandos consumidos (todos del contrato
congelado) son:

- **Ítems:** `crear-item`, `editar-item` (anclado a `expectedVersion`).
- **Existencias:** `mover` (entrada/salida/ajuste según `tipo`).
- **Reservas:** `reservar` (con `demanda:{tipo,id}`), `liberar-reserva`.
- **Transferencias:** `transferir` (POST `/transferencias`, **despacha a
  tránsito**) y `transicionar-transferencia` (POST
  `/transferencias/:id/transicion`) con las **cuatro** acciones del contrato:
  `recibir`/`completar` (el stock entra a destino) y `cancelar`/`rechazar` (el
  stock se restituye al origen; exigen `motivo`). Cada botón envía **su** acción
  real — nunca se mapea todo a "completar". La versión viaja como
  `expectedVersion`; la respuesta es `{id,estado,accion,version,idempotente}`.
- **Ajustes:** `ajustar` (`tipo` + `motivo`; gobernado por Workflow).
- **Conteos:** `iniciar-conteo` (`tipo` + `lineas:[{inventarioId}]` derivadas de
  la selección de items, `alcance?` opcional), `registrar-conteo`
  (`contados:[{inventarioId,cantidad}]`) y `cerrar-conteo` con la decisión
  **autoritativa** `aplicarDiferencias` (`false` no muta stock; `true` aplica los
  ajustes). La respuesta trae `{diferencias, aplicadas}`, que la UI muestra.
- **Trazabilidad:** `crear-lote`, `registrar-serie`.
- **Ubicaciones:** `crear-bodega`, `crear-ubicacion`.

Cada mutación acuña un `opId` (idempotencia) y, para los comandos de creación
(`crear-item`, `transferir`, …), un **id de cliente** que hace el replay por
`/sync` idempotente incluso si se originó offline.

---

## 3. Captura por Dynamic Forms

**Toda** la captura se hace con el Dynamic Forms Engine (sin HTML manual). Las
definiciones viven en `src/lib/forms/plantillas-inventario.ts` y sólo importan de
`@workspace/dynamic-forms/definicion`. Cada plantilla se valida con
`validarDefinicion`. Incluye: alta de item (wizard), edición, filtros del
listado, movimiento, reserva, liberación, transferencia, ajuste, conteo,
registro de conteo, lote, serie, bodega, ubicación, comentario, adjunto y
escaneo manual.

---

## 4. Offline First

La cola generalizada se instancia con `modulo="inventario"` y espacio de nombres
`deltaops:inventario:cola:<tenant>`, aislada de las demás (activos, ordenes). Las
mutaciones degradan ante fallo de red **encolando** el comando completo; un error
de negocio (no de red) **no** se encola y se propaga. El registro de adjuntos es
**sólo en línea** (referencia verificable: metadatos + hash SHA-256; nunca sube
binarios ni se encola).

---

## 5. Comentarios, adjuntos, timeline e historial

El contrato congelado de Inventario **no** expone endpoints anidados para estas
capacidades. En consecuencia:

- **Timeline** e **Historial** se **derivan (sólo lectura)** del ledger de
  movimientos del item (consolidado sobre sus existencias). No se inventan datos.
- **Comentarios** y **Adjuntos** intentan las rutas convencionales de plataforma
  con tolerancia a 404; si la capacidad no está desplegada, se muestra un aviso
  accesible y **no** se fabrican datos.

---

## 6. QR y escaneo

La ficha imprime una **etiqueta QR** por item cuyo valor codifica el código de
plataforma (`inv:<sku>`). El escaneo (`BarcodeDetector` con alternativa manual
por Dynamic Forms) resuelve el código priorizando el **resolvedor del servidor**
y, como degradación secundaria, interpreta `inv:<sku>` / UUID / URL de ficha para
navegar contextualmente al item (abrir ficha, existencias, movimiento, reserva,
ledger).

---

## 7. Accesibilidad y responsividad

Objetivo **AA**: tablas con `caption`, cabeceras `scope=col` y `aria-sort` en las
columnas ordenables, controles etiquetados (`aria-label`, grupos con nombre),
foco visible y navegación por teclado provistos por el Design System. Las vistas
son responsivas (tabla ⇄ tarjetas).

---

## 8. Pruebas

- **Contrato** (`inventario-contract.test.ts`): valida los cuerpos online y
  **encolados** de cada comando contra los esquemas del OpenAPI congelado
  (tipos, requeridos, enum, `additionalProperties:false`).
- **Deep links** (`inventario-deep-links.test.tsx`): consumo ruta→filtro del
  listado extremo a extremo, lectura de `?tab=` y resolución QR.
- **Offline** (`inventario-offline.test.ts`): aislamiento/persistencia de la
  cola, acuñado de id de cliente y degradación.
- **Superficie/A11y** (`inventario-superficie.test.tsx`): semántica accesible y
  estados de datos/error.
