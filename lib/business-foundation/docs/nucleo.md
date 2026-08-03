# DGP-006 · Business Foundation Framework — Núcleo genérico

El **núcleo** (`src/nucleo/`) generaliza el patrón oficial del *Reference Module*
(DGP-004) a un framework declarativo: un módulo de negocio se **describe con
datos** (no con código imperativo) y el núcleo lo convierte en un
`PlatformServiceDefinition` completo, listo para `createPlatformRuntime`.

Es **100 % neutro**: no contiene ningún concepto de negocio. Todos los tipos son
genéricos y en español (`DefinicionEntidad`, `DefinicionCampo`, `RuntimeEntidad`,
`RepositorioGenerico`, …).

## Principios que respeta

- **Contract First + Configuration First**: la definición declarativa es el
  contrato; los `configuracionDefaults` se registran en `TenantConfigService`.
  **Convenio único de configuración**: los `configuracionDefaults` se declaran
  con la clave **sin** prefijo de servicio (p. ej. `"max-fichas"`).
  `registerPlatformService` llama a `TenantConfigService.registerDefaults(servicio, defaults)`,
  que **prefija** cada clave con el nombre del servicio. Por tanto, dentro de un
  handler la configuración **siempre** se lee con la clave **prefijada**:
  `tenantConfig.get(tenant, "<servicio>.<clave>")` (p. ej.
  `tenantConfig.get(tenant, "modulo.demo.max-fichas")`).
- **Todo pasa por el Kernel**: los comandos/consultas generados usan el pipeline
  (autorización por permisos/capacidades, validación Zod, UoW, outbox,
  auditoría implícita).
- **Multitenancy + RLS**: la persistencia delega 100 % en `RecordStorePort`
  (que ya resuelve tenant y RLS vía `setTenantContext` en `PgRecordStore`).
  El núcleo **no escribe SQL propio**.
- **Eventos de dominio autosuficientes**: `createDomainEvent` con payload
  completo → las proyecciones son idempotentes y se construyen **solo desde el
  payload**.
- **Offline First**: los comandos aceptan `opId` de cliente; la idempotencia se
  resuelve por recibo (metadato `data._opIds` del propio registro) sin SQL nuevo.

## Piezas del núcleo

| Archivo | Responsabilidad |
| --- | --- |
| `definicion.ts` | Tipos declarativos: `DefinicionCampo`, `DefinicionEntidad`, `DefinicionModulo`, máquina de estados. Helpers `campoAZod`, `camposAZod`, `eventosDeEntidad`, `nombresOperaciones`. |
| `maquina-estados.ts` | `MaquinaEstados`: evalúa transiciones (estado + comando → nuevo estado o `KernelError` `conflict`), guards y permisos por transición. |
| `entidad.ts` | `RuntimeEntidad`: aggregate genérico puro (esquema Zod, invariantes, `crear`/`actualizar`/`transicionar`, versión optimista, eventos tipados). |
| `repositorio.ts` | `RepositorioGenerico` sobre `RecordStorePort`: `insertar`/`actualizar(versión)`/`eliminarSuave`/`porId`/`listar`. |
| `crud.ts` | `crearComandosCrud(def)` y `crearQueriesCrud(def)`: generan los `CommandDefinition`/`QueryDefinition` CRUD. |
| `bootstrap.ts` | `crearModuloGenerico(def, extras?)` → `PlatformServiceDefinition`. |

## Nomenclatura generada

Para una entidad `nombre` en el servicio `servicio`:

- Comandos: `<servicio>.<nombre>.crear` · `.editar` · `.eliminar` · `.transicionar`
- Consultas: `<servicio>.<nombre>.obtener` · `.listar`
- Eventos: `<servicio>.<nombre>.creada` · `.actualizada` · `.eliminada` · `.transicionada`
  (el prefijo de eventos puede sobreescribirse con `DefinicionEntidad.eventos`).

## Contrato de los comandos

- `crear`: `{ id?, opId?, data }` → `{ id, version, estado, idempotente }`.
  Con `id` de cliente, un reintento devuelve `idempotente: true` sin duplicar.
- `editar`: `{ id, version, opId?, data }` (versión = concurrencia optimista).
  Con `opId` ya aplicado, devuelve éxito idempotente.
- `eliminar`: `{ id, opId? }` → borrado suave; eliminar algo inexistente es un
  no-op exitoso (idempotente).
- `transicionar`: `{ id, version, comando, opId? }`. Aplica la máquina de estados
  y comprueba el permiso específico de la transición si la definición lo exige.

## Ejemplo completo: módulo "demo"

```ts
import {
  crearModuloGenerico,
  type DefinicionModulo,
} from "@workspace/business-foundation"; // (exports desde src/index.ts)
import { createPlatformRuntime } from "@workspace/platform";

const SERVICIO = "modulo.demo";

const PERMISOS = {
  leer: `${SERVICIO}.read`,
  crear: `${SERVICIO}.write`,
  editar: `${SERVICIO}.write`,
  eliminar: `${SERVICIO}.write`,
  admin: `${SERVICIO}.admin`,
  publicar: `${SERVICIO}.publicar`,
};

const definicionModulo: DefinicionModulo = {
  servicio: SERVICIO,
  etiqueta: "Módulo Demo",
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.admin, PERMISOS.publicar],
  dependeDe: ["platform.config"],
  capacidades: [
    {
      name: "gestionar-fichas-demo",
      permissions: [PERMISOS.crear, PERMISOS.leer, PERMISOS.publicar],
      description: "Ciclo de vida de fichas demo",
    },
  ],
  entidades: [
    {
      nombre: "ficha",
      etiqueta: "Ficha",
      servicio: SERVICIO,
      permisos: PERMISOS,
      capacidades: [],
      configuracionDefaults: { "max-fichas": "1000" },
      campos: [
        { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120, buscable: true },
        { nombre: "cantidad", tipo: "numero", filtrable: true },
        { nombre: "categoria", tipo: "enum", enumValores: ["a", "b", "c"] },
      ],
      maquinaEstados: {
        estados: [
          { nombre: "borrador", inicial: true },
          { nombre: "publicado" },
          { nombre: "archivado", final: true },
        ],
        transiciones: [
          { de: "borrador", a: "publicado", comando: "publicar", permiso: PERMISOS.publicar },
          { de: "publicado", a: "archivado", comando: "archivar" },
        ],
      },
    },
  ],
};

// Montaje: mismo mecanismo que cualquier servicio de plataforma.
const rt = createPlatformRuntime({
  extraServices: [crearModuloGenerico(definicionModulo)],
});

// Uso a través del pipeline del Kernel:
const ctx = /* ExecutionContext con metadata.tenantId */;
await rt.kernel.commands.execute(ctx, "modulo.demo.ficha.crear", { data: { titulo: "Uno" } });
await rt.kernel.outboxProcessor.processPending();
await rt.kernel.queries.execute(ctx, "modulo.demo.ficha.listar", {});
```

### Composición del contrato con `ExtrasModulo`

`crearModuloGenerico(def, extras?)` **fusiona** los `extras` con lo derivado de
la `DefinicionModulo`, produciendo un `PlatformServiceDefinition` completo:

| Campo de `ExtrasModulo` | Efecto (dedupe) |
| --- | --- |
| `comandos` / `queries` | Se **añaden** a los CRUD generados. |
| `eventHandlers` / `proyeccion` | Se **añaden** como handlers de eventos. |
| `eventos` | Se **añaden** a los eventos declarados por las entidades (dedupe por valor). |
| `capacidades` | Se fusionan con las del módulo (dedupe por `name`). |
| `permisos` | Se fusionan con los del módulo (dedupe por valor). |
| `dependeDe` | Se fusionan con las dependencias del módulo (dedupe por valor). |
| `configuracionDefaults` | Se fusionan sobre los defaults del módulo y entidades (clave SIN prefijo). |

### Proyección genérica opcional

`crearModuloGenerico(def, { proyeccion })` acepta un hook que devuelve
`EventHandlerDefinition[]`. La proyección **debe** ser idempotente y construirse
solo desde `event.payload` (dedupe por `event.id`, patrón *module-reference*):

```ts
crearModuloGenerico(definicionModulo, {
  proyeccion: (entidades) =>
    entidades.flatMap((e) =>
      [`${e.servicio}.${e.nombre}.creada`, `${e.servicio}.${e.nombre}.actualizada`].map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps) => async (event) => {
          // Usar SOLO event.payload; upsert idempotente por event.id.
          return { ok: true, value: undefined };
        },
      })),
    ),
});
```

## Pruebas

`src/nucleo/__tests__/nucleo.test.ts` (24 tests con runtime **fake**) cubre:
definición→Zod, invariantes, máquina de estados (válida/ilegal/guard/permiso),
repositorio fake, y CRUD end-to-end (crear/editar con conflicto de versión/
eliminar/transicionar/listar/obtener, autorización denegada, multitenancy,
evento en outbox → drain, idempotencia por `id` y por `opId`, auditoría).
