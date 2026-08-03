# DGP-006 · Familia ANDAMIAJE (scaffolding)

La familia **andamiaje** del Business Foundation Framework automatiza la creación de
módulos nuevos y estandariza el borde HTTP. Es **100 % neutra**: no contiene ni admite
ningún nombre de negocio (regla DGP-006).

Ubicación: `lib/business-foundation/src/andamiaje/`

```
andamiaje/
  plantilla.ts       Generador programático de módulos (artefactos textuales)
  validacion.ts      Validador de DefinicionModulo/DefinicionEntidad
  bootstrap-http.ts  Helpers genéricos del borde HTTP
  index.ts           Barrel de la familia
  __tests__/andamiaje.test.ts
```

---

## 1. `plantilla.ts` — Generic Module Scaffolding Runtime

Generador **programático** (todavía sin CLI). Dado el mínimo declarativo produce el
**contenido textual** de los artefactos de un módulo nuevo. **No escribe a disco**:
devuelve `{ ruta, contenido }[]` para que una herramienta futura los materialice.
Es una función pura y testeable.

```ts
import { generarModulo, type EntradaScaffolding } from "@workspace/business-foundation";

const entrada: EntradaScaffolding = {
  slug: "modulo.demo",       // kebab por segmentos separados por punto
  etiqueta: "Módulo Demo",
  entidades: [/* DefinicionEntidad[] del núcleo */],
};

const artefactos = generarModulo(entrada);
// artefactos → [{ ruta: "src/module.ts", contenido }, ...]
```

Artefactos generados:

| Ruta                              | Contenido |
|-----------------------------------|-----------|
| `src/module.ts`                   | Descriptor que invoca `crearModuloGenerico(definicionModulo)`. |
| `src/runtime.ts`                  | Composición `crear<Slug>Runtime` con adaptadores fake/pg (patrón `createXRuntime`). |
| `src/routes.ts`                   | Router Express fino: montaje, `resolverHttp`/`statusOf`, drain del outbox y endpoint `/sync` idempotente tenant-scoped. |
| `src/__tests__/modulo.test.ts`    | Test base end-to-end sobre runtime FAKE (crear → drain → listar). |

Antes de generar, `generarModulo` valida la definición con `validarDefinicionModulo`
y **aborta con un `Error` explícito** si es inválida (regla DGP-006).

> Los `guard` de las transiciones son funciones y **no** se serializan en `module.ts`;
> se re-añaden a mano tras generar. El resto de la máquina de estados sí se emite.

### Sincronización offline (`/sync`)

El endpoint `/sync` generado **no** mantiene ningún caché de recibos en memoria (sería
global y no tenant-scoped). Delega la idempotencia en el núcleo, **siempre por tenant** (el
tenant sale del `ExecutionContext`, `ctxOf(res)`), y propaga `op.opId` dentro del input de
cada comando; el recibo de respuesta se deriva del resultado (`idempotente: true`), sin
estado local.

**Contrato Offline First (el cliente genera `id` y `opId`):**

- El cliente genera un **`id` (UUID) estable por entidad** y un **`opId` por operación**.
- Para `crear`, el esquema Zod del `/sync` **exige `input.id`** (un `refine` rechaza la
  operación con un mensaje en español citando Offline First). Es la clave de
  deduplicación durable: `crud.ts` deduplica `crear` por id de cliente dentro del tenant,
  de modo que un reintento con el mismo `id` **no crea otro registro ni emite otro
  evento**.
- Para `editar` / `eliminar` / `transicionar`, la idempotencia es por `opId`, que el
  núcleo guarda como `_opIds` en el propio registro (dentro del Unit of Work).

> Sin `id` en `crear`, cada reintento del mismo `{opId, comando:'crear'}` crearía un
> registro nuevo: por eso el contrato lo hace obligatorio.

Helper auxiliar: `definicionDesdeEntrada(entrada)` construye la `DefinicionModulo`
completa (reuniendo capacidades y permisos de las entidades).

---

## 2. `validacion.ts` — Validador de definiciones

Valida `DefinicionModulo`/`DefinicionEntidad` para el scaffolding. Función pura que
devuelve la lista de errores (vacía ⇒ válido); no lanza.

```ts
import { validarDefinicionModulo, asegurarDefinicionValida } from "@workspace/business-foundation";

const r = validarDefinicionModulo(def);
if (!r.valido) console.error(r.errores);

asegurarDefinicionValida(def); // lanza Error explícito si es inválida
```

Reglas comprobadas:

- **Forma de nombres**: slug de servicio kebab por segmentos (`modulo.demo`), nombre
  de entidad kebab-case, campos/estados/comandos en camelCase.
- **Palabras reservadas de negocio (DGP-006)**: se rechaza cualquier identificador que
  contenga `activo`, `inventario`, `orden`, `compra`, `combustible` o `sst`. El error
  **cita explícitamente la regla DGP-006**. La lista está exportada como
  `PALABRAS_RESERVADAS_NEGOCIO`.
- **Máquina de estados coherente**: exactamente **un** estado inicial, estados sin
  duplicar, todas las transiciones referencian estados existentes, sin ambigüedad
  `de + comando`.
- **Permisos CRUD completos**: `leer`, `crear`, `editar`, `eliminar`, `admin` presentes
  y no vacíos en cada entidad.
- **Enums**: un campo `enum` debe declarar al menos un valor.

---

## 3. `bootstrap-http.ts` — Borde HTTP genérico

Helpers reutilizables para la capa fina HTTP → Command/Query del Kernel. Neutros y sin
dependencia de Express: devuelven datos puros.

### `statusOf(error): number`

Traduce un `KernelError` a código HTTP:

| Error del Kernel                    | HTTP |
|-------------------------------------|------|
| `KRN-AUTH-*` (auth)                 | 403  |
| `KRN-NF-*` (not-found)              | 404  |
| `KRN-CFL-*` (conflict)              | 409  |
| `KRN-VAL-*` (validation)            | 400  |
| resto                               | 500  |

Como red de seguridad para códigos futuros, cae al `kind` del error si el `code` no
coincide con ningún prefijo conocido.

### `resolverHttp(result): { status, body }`

Convierte un `Result` del Kernel en una respuesta HTTP neutra: `200` con el valor en
éxito, o `statusOf(error)` con `{ error, code }` en fallo.

### `contextoDesdeAutenticacion(datos): ExecutionContext`

Construye el `ExecutionContext` a partir de datos **ya autenticados** (`actorId`, `rol`,
`tenantId`, permisos/capacidades resueltos). El principal es abstracto (el Kernel no
conoce usuarios de dominio) y el tenant viaja en `metadata.tenantId` (lo consume
`tenantOf` de la plataforma). Reproduce el `contextFor` del Reference Module de forma
genérica.

---

## Pruebas

`__tests__/andamiaje.test.ts` cubre las tres capas con un módulo demo neutro (≥ 8 tests):
validación (kebab/camel, cada palabra reservada, estado inicial único, transiciones a
estados inexistentes, permisos completos, guardia que lanza), borde HTTP (todos los
mapeos de `statusOf`, `resolverHttp`, construcción de contexto) y generador (rutas,
contenido de cada artefacto y aborto ante definición inválida).

```bash
cd lib/business-foundation && pnpm vitest run src/andamiaje
```
