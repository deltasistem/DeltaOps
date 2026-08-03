# Familia CONSULTA — Business Foundation (DGP-006)

Runtimes genéricos y **neutros** (sin ningún concepto de negocio) para consulta
sobre el núcleo del framework. Todo se compone vía `ExtrasModulo` de
`crearModuloGenerico` (ver `nucleo/bootstrap.ts`): `queries`, `comandos` y
`eventHandlers`. Nada persiste SQL propio: se usa el `RecordStorePort`
(multitenancy + RLS) y los servicios de plataforma por Kernel.

Ubicación: `src/consulta/` — `filtro.ts`, `busqueda.ts`, `catalogo.ts`, `arbol.ts`.

---

## 1. `filtro.ts` — Generic Filter Runtime

Deriva un runtime de filtro a partir de los campos marcados como `filtrable` en
una `DefinicionEntidad`.

- `derivarDefinicionFiltro(def)` → `DefinicionFiltro` (campos filtrables +
  operadores admitidos por tipo).
- Operadores: `eq | neq | gt | gte | lt | lte | contiene | en | entre`.
  - numéricos/fecha → ordenables; texto → `eq/neq/contiene/en`; enum/booleano/
    referencia/json → igualdad (`eq/neq/en`).
- Expresiones combinables: hoja `{ campo, operador, valor }` o combinación
  `{ y: [...] }` / `{ o: [...] }` (árbol recursivo).
- `esquemaFiltro(definicion)` / `parsearFiltro` / `parsearFiltroSafe`: validación
  **Zod** de campo permitido, operador válido para el campo y forma del `valor`
  (`en` → arreglo no vacío; `entre` → tupla de 2).
- `evaluarFiltro(expr, data)` / `aplicarFiltro(expr, registros)`: aplicación
  **en memoria** sobre el `data` de los registros (read models fake / listados).
- `serializarFiltro(expr)` / `deserializarFiltro(def, texto)`: serialización
  **estable** (misma expresión ⇒ mismo string), apta para query params y cacheo.

## 2. `busqueda.ts` — Generic Search Runtime

Puente al servicio de plataforma `platform.search` (nunca reimplementa índice).

- `documentIdDe(def, id)` → `<servicio>:<entidad>:<id>` (patrón `ref:`), estable
  ⇒ `platform.search.indexDocument` hace **upsert idempotente**.
- `tipoEntidadBusqueda(def)` → `entityType` = `<servicio>:<entidad>`.
- `indexarEntidad(deps, def, registro, ctx)`: ejecuta `platform.search.indexDocument`.
- `crearHandlerIndexacion(def)` → `EventHandlerDefinition[]` que indexa **solo
  desde el payload** de los eventos `.creada` y `.actualizada` (autosuficiente,
  idempotente por documentId estable). El texto se toma de los campos `buscable`.
- `crearQueryBusqueda(def)` → query `<servicio>.<entidad>.buscar` que delega en
  `platform.search.global` y **filtra por `entityType`** (aísla la entidad frente
  a otras del mismo tenant en el índice compartido).

## 3. `catalogo.ts` — Generic Catalog Runtime

Fábrica de entidades "catálogo": clave única, etiqueta, posición y estado
habilitado/deshabilitado. **Vocabulario NEUTRO (DGP-006)**: se evitan palabras
reservadas de negocio ("activo"/"orden") en favor de `habilitado`/`deshabilitado`
y `posicion` (compatibles con el validador de andamiaje).

- `crearDefinicionCatalogo(opciones)` → `DefinicionEntidad` preconfigurada:
  campos `clave` (texto req., filtrable/buscable), `etiqueta` (texto req.,
  buscable), `posicion` (número filtrable), + máquina `habilitado ⇄ deshabilitado`
  (`habilitado` inicial; comandos `deshabilitar` / `habilitar` con permiso
  `editar`). Se le pueden añadir `camposExtra`.
  - Constantes exportadas: `CAMPO_CLAVE`, `CAMPO_ETIQUETA`, `CAMPO_POSICION`,
    `ESTADO_HABILITADO`, `ESTADO_DESHABILITADO`.
- `crearQueryOpciones(def)` → query `<servicio>.<entidad>.opciones` que lista los
  **habilitados ordenados** (por `posicion`, luego `etiqueta`) como
  `{ value, label }`.

La definición resultante es 100% compatible con `crearComandosCrud` /
`crearQueriesCrud`: se incluye como una entidad más del módulo.

## 4. `arbol.ts` — Generic Tree Runtime

Soporte jerárquico genérico con campo `padreId` y **ruta materializada** en
`data._ruta` (`/a/b/c/`). `_ruta` se declara como campo (vía `camposArbol()`)
para que el esquema Zod del comando `.editar` del núcleo la conserve.

- `camposArbol()` → campos `padreId` (referencia) y `_ruta` (texto) a incluir
  en la `DefinicionEntidad`.
- `crearComandoMover(def)` → comando `<servicio>.<entidad>.mover`. Ejecuta TODO
  el movimiento (nodo + descendientes) en **UNA SOLA Unit of Work** usando
  `RepositorioGenerico` directamente en el handler (sin comandos anidados):
  - Valida **anti-ciclos** (el nuevo padre no puede ser descendiente del nodo,
    ni el propio nodo) mediante la ruta materializada.
  - Escribe el nodo (con concurrencia optimista sobre `input.version`) y
    reescribe la ruta de **todos los descendientes** (prefijo `rutaAnterior` →
    `rutaNueva`) en el **mismo `uow`** ⇒ atomicidad: si cualquier escritura
    falla, PostgreSQL revierte el conjunto (nunca queda un árbol parcial); el
    UoW en memoria descarta además los eventos ante error.
  - **Idempotencia offline por `opId`**: el recibo se guarda en `_opIds` del
    propio nodo (patrón del núcleo); un reintento con el mismo `opId` devuelve
    éxito idempotente sin reemitir eventos ni duplicar efectos.
  - Emite **un ÚNICO evento** `<prefijo>.movida` con payload autosuficiente:
    `{ id, padreAnterior, padreNuevo, rutaAnterior, ruta, rutasActualizadas,
    tenantId, recordType, estado, version, actorId, actualizadoAt }`.
  - Auditoría única (`accion: "mover"`) en el mismo `uow`.
- `crearQueriesArbol(def)` → `<servicio>.<entidad>.hijos` (hijos directos de un
  `padreId`, o raíces si se omite) y `<servicio>.<entidad>.arbol` (árbol completo
  construido en memoria desde el listado del tenant).
- Helpers puros: `calcularRuta`, `rutaDe`, `construirArbol`.

---

## Composición (patrón)

```ts
crearModuloGenerico(definicionModulo, {
  queries: [
    crearQueryBusqueda(ficha),
    crearQueryOpciones(catalogo),
    ...crearQueriesArbol(nodo),
  ],
  comandos: [crearComandoMover(nodo)],
  eventHandlers: crearHandlerIndexacion(ficha),
});
```

## Reglas respetadas

- Cero nombres de negocio; nomenclatura en español.
- Todo por Kernel (CommandDefinition/QueryDefinition, permisos, Zod, UoW, outbox,
  auditoría) y `RecordStorePort` (multitenancy + RLS).
- Proyecciones/indexación **idempotentes solo desde payload** (documentId estable).
- Offline First: `mover` acepta `opId`; reusa el patrón `_opIds` del núcleo vía
  `.editar`.
- Pruebas Vitest con `createPlatformRuntime` fake (20 tests; incluye atomicidad
  de `mover` en una sola UoW e idempotencia por `opId`). `vitest run` y
  `typecheck` en verde.
```
