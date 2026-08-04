# Búsqueda de activos (DGP-008.3)

La búsqueda del módulo **delega íntegramente** en el servicio de plataforma
`platform.search` (índice de documentos alimentado por eventos). El módulo NO
mantiene su propio índice ni consulta el índice por SQL: sólo **indexa** desde
sus `eventHandlers` y **consulta** vía las queries de plataforma.

## Indexación automática (payload-only)

Cada evento del módulo (`EVENTOS_MODULO`: registro, edición, transiciones de
estado, cambio de ubicación, reasignación de responsable y medidores) dispara el
handler `indexar:<evento>`, que construye un **documento de búsqueda** SOLO desde
el payload del evento (nunca releyendo el aggregate) y lo envía a
`platform.search.indexDocument`.

- `documentId`/`entityRef`: `activo:<id>` (estable e idempotente: reindexar
  actualiza el mismo documento).
- `entityType`: `"activo"` (scope del módulo para la búsqueda contextual).
- `titulo`: `"<codigoEmpresarial> · <nombre>"`.
- `contenido` (tokenizable): código empresarial, nombre, descripción, tipo,
  categoría, familia, subfamilia, estado, ubicación (etiqueta + id),
  responsable, supervisor, **fabricante/modelo/serie**.

Como todos los eventos son *payload-autosuficientes*, el documento refleja
siempre el **último estado** del activo tras editar/transicionar/mover/reasignar.

### Reproyección

`reproyectar` reconstruye los **read models** del módulo desde la bitácora
durable `act_eventos`. El índice de `platform.search` **no** se limpia en la
reproyección: se mantiene incrementalmente por los `eventHandlers` (idempotente
por `documentId`). Rehidratar el índice desde cero, si se necesitara, se hace
**fuera del pipeline** con el comando `platform.search.rebuild` (evitando anidar
un comando dentro de la UoW de `reproyectar`).

## Consulta: `GET /deltaops/activos/busqueda`

Query del módulo `busqueda`. Delega en `platform.search.contextual`
(`entityType = "activo"`), y **enriquece/filtra** los resultados con el read
model del activo (para poder filtrar por atributos estructurados y devolver
campos de tabla/tarjeta):

```
GET /deltaops/activos/busqueda?q=excavadora
  &estado=&tipo=&categoria=&familia=&criticidad=&ubicacionId=&responsable=&limit=
```

Respuesta (ordenada por `score` del índice):

```jsonc
[
  {
    "id": "…",
    "score": 2,
    "codigoEmpresarial": "EXC-320",
    "nombre": "Excavadora Caterpillar",
    "estado": "REGISTRADO",
    "tipo": "movil",
    "categoria": "maquinaria",
    "familia": "excavadoras",
    "criticidad": "alta",
    "ubicacionId": "planta-1",
    "responsable": "ana",
    "fabricante": "cat",
    "modelo": "320",
    "serie": null
  }
]
```

Permiso requerido: `modulo.activos.read` + `platform.search.read` (el rol lector
ya los incluye). El scope por tenant lo garantiza `platform.search` (el índice
es tenant-scoped) y la validación cruzada contra el read model del módulo.

## Listado con filtros avanzados

Independientemente de la búsqueda textual, `GET /deltaops/activos` (query
`listar`) admite filtros avanzados para tabla/tarjetas: `estado`, `criticidad`,
`tipo`, `ubicacionId` (columnas indexadas del read model) y `categoria`,
`familia`, `responsable`, `q` (texto sobre código/nombre) aplicados en la
aplicación sobre el read model, con **paginación** `limit`/`offset`. Todo es
*payload-only*: no toca el dominio.
