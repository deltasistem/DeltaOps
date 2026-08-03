# DGP-007 · Plantillas y Checklists

## Template Runtime (`plantillas.ts`)

Las plantillas son **versionadas e INMUTABLES**, persistidas vía
`RecordStorePort` (recordType `plantilla-formulario`). No hay SQL propio: el
Record Store resuelve multitenancy y RLS.

### Modelo de datos (versionado N/N-1 real)

Cada plantilla se materializa en **tres clases de registro** por clave lógica:

| Registro | Id determinista | Rol |
|---|---|---|
| BORRADOR | `<id de cliente>` | Diseño mutable, aún sin versión (offline). |
| Versión publicada | `<clave>:v<version>` | **Inmutable**; nunca se reescribe su contenido. Estado `ACTIVA`/`INACTIVA`. |
| Índice por clave | `idx:<clave>` | Apunta a la versión **ACTIVA** y lleva la última versión publicada. |

Este diseño garantiza que **las versiones históricas permanecen legibles para
siempre**: una respuesta creada con la versión N se sigue resolviendo y
validando aunque exista una N+1 activa.

### Ciclo de vida

```
BORRADOR ──publicar──▶ crea <clave>:vN+1 (ACTIVA) · desactiva la anterior · actualiza idx:<clave>
                        (todo en la MISMA UoW)
<clave>:vN ──activar(true|false)──▶ ACTIVA / INACTIVA (siempre UNA sola activa por clave)
```

- **crear** (`modulo.formularios.plantilla.crear`) — crea un BORRADOR. Exige
  `id` de cliente e `opId` (offline). Rechaza vocabulario de negocio prohibido.
  **No** recibe número de versión.
- **publicar** (`{ id }` del borrador) — lee el índice, calcula **N+1**, crea el
  registro inmutable `<clave>:vN+1` como ACTIVA, **desactiva la versión activa
  anterior** y actualiza el índice; todo en una única UoW.
- **activar** (`{ clave, version, activar }`) — activa/desactiva una versión
  publicada concreta, preservando la invariante de **una sola activa por clave**.
- **obtener** (query, `{ clave, version }`) — resuelve una versión **exacta**
  (resolución histórica).
- **obtenerActiva** (query, `{ clave }`) — resuelve la versión ACTIVA vía índice.
- **exportar** (query, `{ clave, version }`) — documento JSON autocontenido
  (`formatoExport: "deltaops.dynamic-forms.plantilla.v1"`).
- **importar** (`{ documento }`) — valida la estructura con Zod, **rechaza
  vocabulario prohibido** y crea el registro inmutable `<clave>:v<version>`.
  Si esa clave+versión **ya existe → conflicto** (inmutabilidad histórica).
- **compatibilidad** (query, `{ clave, version }`) — indica si existe la versión
  con la que se llenó una respuesta (y si es la activa).

> **Regla de versionado.** Toda respuesta guarda `{ plantillaClave,
> plantillaVersion }` y se valida **siempre** contra su versión original.
> Publicar N+1 nunca reinterpreta respuestas pasadas (garantía N/N-1).

### Resolución de versiones (resolutor)

`ResolutorPlantillaStore` resuelve `(tenant, clave, version)` → definición
exacta (por id `<clave>:v<version>`) y `(tenant, clave)` → activa (vía
`idx:<clave>`). `ResolutorPlantillaMemoria` (pruebas) replica ese comportamiento con un
índice de versión activa por clave. Al **guardar un borrador** de respuesta sin
`plantillaVersion`, se **pinnea** la versión activa del momento en la respuesta,
quedando inmutable.

### Rechazo de vocabulario (`vocabulario.ts`)

`detectarVocabularioProhibido(entrada)` recorre recursivamente todas las cadenas
del JSON (claves y valores) buscando términos de negocio prohibidos. Se aplica
al crear y al importar plantillas para preservar la neutralidad del motor.

## Checklist Runtime (`checklist.ts`)

Checklists **reutilizables y versionados**, instanciables dentro de un
formulario (campo `checklist` con `checklistRef`) o de forma autónoma.

Cada `ItemChecklist` declara: `obligatorio`, `evidenciasRequeridas`,
`firmaRequerida` y `puntaje`. El cálculo de puntaje es **declarativo**:

```ts
import { calcularPuntaje, itemsPendientes, validarChecklist } from "@workspace/dynamic-forms";

const chk = validarChecklist({
  clave: "revision-chk", titulo: "Revisión genérica", version: 1,
  items: [
    { clave: "i1", etiqueta: "Ítem 1", obligatorio: true, puntaje: 10, evidenciasRequeridas: ["fotografia"] },
    { clave: "i2", etiqueta: "Ítem 2", puntaje: 20, firmaRequerida: true },
  ],
});

const puntaje = calcularPuntaje(chk, [
  { clave: "i1", estado: true, evidencias: ["att-1"] },
  { clave: "i2", estado: "na" }, // "na" se excluye del máximo
]);
// puntaje.porcentaje, puntaje.itemsConformes, ...

const pendientes = itemsPendientes(chk, respuestas); // obligatorios/evidencias/firma faltantes
```

Los ítems marcados **N/A** (`estado: "na"`) se excluyen del puntaje máximo para
no penalizar el porcentaje.

## Evidencias (`evidencias.ts`)

Toda evidencia (adjunto, comentario, firma, fotografía, geolocalización) se
**sella** con `{ usuarioId, timestamp ISO, dispositivo? }` tomados del **contexto
de ejecución** — nunca del cliente. Los adjuntos/fotos referencian ids ya
subidos vía `platform.attachment`; los comentarios se registran en
`platform.comment`. Offline: cada evidencia lleva `opId`.
