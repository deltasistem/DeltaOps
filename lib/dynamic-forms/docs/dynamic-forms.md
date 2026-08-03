# DGP-007 · Dynamic Forms Engine (`@workspace/dynamic-forms`)

Motor oficial de **formularios y checklists declarativos** de DeltaOps. Un solo
motor construye *cualquier* formulario del producto: el formulario nunca se
programa, se **diseña** con datos (una `DefinicionFormulario`) y se ejecuta con
el mismo comportamiento en web y móvil (offline incluido).

> **100 % neutro.** El motor no contiene ningún concepto de negocio. Los
> ejemplos usan formularios de **revisión genérica**, **solicitud genérica** o
> **expediente**. Está prohibido introducir vocabulario de negocio (activo,
> inventario, orden, compra, combustible, sst, empleado, proveedor, equipo, ot);
> un guardarraíl estructural (`vocabulario.ts`) lo rechaza en las importaciones.

Este paquete es **solo runtime + contratos TypeScript + persistencia**. La UI
llega en otra tarea: **no depende de React**.

## Arquitectura (congelada, reutilizada)

- **Kernel** (`@workspace/kernel`): todo pasa por el pipeline de
  `CommandDefinition`/`QueryDefinition` (autorización por permisos/capacidades,
  validación Zod, UoW, outbox, auditoría). Los eventos de dominio son
  autosuficientes (payload completo) para proyecciones idempotentes.
- **Shared Platform** (`@workspace/platform`): la persistencia delega 100 % en
  `RecordStorePort` (multitenancy + RLS). Las evidencias reutilizan
  `platform.attachment` y `platform.comment`.
- **Business Foundation** (`@workspace/business-foundation`): el motor reutiliza
  `RepositorioGenerico` sobre el Record Store; no escribe SQL propio.
- **Patrón de composición** idéntico a `module-reference`: `runtime.ts` monta
  Kernel + Plataforma + el motor vía `extraServices`, con adaptadores Fake
  (offline) o PostgreSQL según haya `pool`.

## Módulos del paquete

| Archivo | Responsabilidad |
|---|---|
| `definicion.ts` | `DefinicionFormulario` declarativa recursiva (campos + contenedores), validada con Zod. Deriva el esquema Zod de los **datos** del formulario. |
| `condiciones.ts` | Conditional Engine: **reutiliza** el motor base de `@workspace/workflow-engine` (expresiones JSON `{campo, operador, valor}` con `y/o/no`) y añade encima reglas por campo (`visible/oculto/obligatorio/soloLectura/calculado/validacion`) y cálculo declarativo seguro (sin `eval`). |
| `validacion.ts` | Validation Runtime: longitud, rangos, formato, cruzadas y validaciones **asincrónicas por contrato** (`ValidadorAsincrono`, resuelto vía QueryBus). Severidades `error`/`advertencia`/`bloqueo`. |
| `layout.ts` | Dynamic Layout Runtime: layout por breakpoint (`escritorio/tableta/movil`), solo datos, con defaults derivados. |
| `checklist.ts` | Checklist Runtime: checklists reutilizables versionados con puntajes y evidencias/firma por ítem. |
| `evidencias.ts` | Evidence Runtime: evidencias selladas con `{usuarioId, timestamp, dispositivo?}` del contexto; offline (`opId`). |
| `plantillas.ts` | Template Runtime: plantillas versionadas (publicar/activar/exportar/importar) vía Record Store. |
| `respuestas.ts` | Response Runtime: respuesta `BORRADOR → ENVIADA` con validación server-side. |
| `vocabulario.ts` | Guardarraíl de neutralidad (rechazo de vocabulario prohibido). |
| `resolutor.ts` | `ResolutorPlantillas` (store / memoria) que resuelve definición + contrato de una plantilla. |
| `modulo.ts` | `crearMotorFormularios(opciones)` → `PlatformServiceDefinition` con contrato completo. |
| `runtime.ts` | `crearFormulariosRuntime(opciones)` → composición Kernel + Plataforma + motor. |

## Tipos de campo soportados

`texto`, `numero`, `decimal`, `fecha`, `hora`, `fechaHora`, `booleano`,
`select`, `multiSelect`, `autocomplete` (fuente declarativa: catálogo/query),
`tabla` (subcampos + filas), `adjunto`, `firma`, `ubicacion`, `codigoQr`,
`codigoBarras`, `nfc`, `imagen`, `checklist`; y contenedores `grupo`, `seccion`,
`pestanas`, `wizard` (pasos).

## Uso

```ts
import { crearFormulariosRuntime, SERVICIO } from "@workspace/dynamic-forms";

const rt = crearFormulariosRuntime({ logger }); // Fake (offline)
// con PostgreSQL: crearFormulariosRuntime({ pool })

// Diseñar y publicar una plantilla (crea la versión inmutable 1, ACTIVA)
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.plantilla.crear`, {
  id: "b-1", opId: "op-1", clave: "revision-generica", contenido: { definicion },
});
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-1" });

// Capturar respuestas (sin plantillaVersion → se pinnea la versión ACTIVA)
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
  id: "r-1", opId: "g-1", plantillaClave: "revision-generica", datos: { titulo: "demo" },
});
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.respuesta.enviar`, { id: "r-1", opId: "e-1", version: 1 });
```

## Convenios

- **Configuración por tenant**: los `configDefaults` se declaran SIN prefijo de
  servicio; `registerPlatformService` los prefija. Los handlers leen con
  `tenantConfig.get(tenant, "modulo.formularios.<clave>")`.
- **Offline First**: crear exige un `id` de cliente; todos los comandos aceptan
  `opId` (recibo de idempotencia durable en el propio registro, tenant-scoped).
- **Versionado N/N-1**: cada versión publicada es un registro **inmutable**
  propio (`<clave>:v<version>`) con índice lógico por clave (`idx:<clave>`);
  publicar incrementa la versión y desactiva la activa anterior en la misma UoW
  (una sola activa por clave). Toda respuesta guarda `{ plantillaClave,
  plantillaVersion }` y se valida **siempre** contra su versión original, de modo
  que publicar N+1 no rompe respuestas N. Ver `docs/plantillas-checklists.md`.
- **Unificación con `workflow-engine`**: el motor de condiciones BASE se
  reutiliza de `@workspace/workflow-engine` (mismos operadores cerrados y
  combinadores `y/o/no`). `condiciones.ts` re-exporta ese motor y añade solo las
  extensiones propias de formularios (`ExpresionCalculo`, `ReglasCampo`). No se
  duplica la evaluación base. Ver `docs/condicionales.md`.
