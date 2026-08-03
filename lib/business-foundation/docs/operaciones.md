# Business Foundation · Familia OPERACIONES (DGP-006)

Runtimes genéricos y **neutros** (sin ningún concepto de negocio) que amplían
una `DefinicionEntidad` del núcleo con operaciones transversales. Todo pasa por
el **Kernel** (CommandDefinition/QueryDefinition, permisos/capacidades, Zod,
UoW, outbox, auditoría) y por el **RecordStorePort** (multitenancy + RLS). No
hay SQL propio ni fallbacks silenciosos.

Cada runtime produce fábricas `(deps) => CommandDefinition | QueryDefinition`
compatibles con `ExtrasModulo` de `crearModuloGenerico(def, extras)`. El helper
`crearOperaciones(def, opciones)` empaqueta las seleccionadas:

```ts
import { crearModuloGenerico } from "@workspace/business-foundation";
import { crearOperaciones } from "@workspace/business-foundation";

const extras = crearOperaciones(entidad, {
  asignacion: true,
  aprobacion: { pasos: [{ nombre: "n1", permiso: "svc.aprobar" }] },
  lote: true,
  importacion: true,
  exportacion: true,
});
const servicio = crearModuloGenerico(modulo, extras);
```

`crearOperaciones` devuelve un **`ExtrasModulo` completo**: además de `comandos`
y `queries`, cada runtime seleccionado **aporta su parte del contrato** para que
el descriptor final del módulo lo declare todo (el núcleo fusiona con dedupe):

| Runtime | `eventos` | `capacidades` | `permisos` | `configuracionDefaults` (clave SIN prefijo) |
|---|---|---|---|---|
| asignación | `<pref>.asignada/.desasignada` | `asignar-<entidad>` | `asignar` (o `editar`), `leer` | — |
| aprobación | `<pref>.aprobacion-solicitada/-aprobada/-rechazada/-paso-aprobado` | `aprobar-<entidad>` | `editar` + permiso de cada paso | `aprobacion-permitir-autor="false"` |
| lote | — | — | `leer` | `lote-max="100"` |
| importación | — | — | `crear` | `importar-max="500"` |
| exportación | — | `exportar-<entidad>` | `leer` | — |

### Convenio de configuración (alineado con el núcleo)

- Los defaults se **declaran SIN prefijo** de servicio (`lote-max`,
  `importar-max`, `aprobacion-permitir-autor`); `registerPlatformService` →
  `TenantConfigService.registerDefaults(servicio, defaults)` los **prefija** con
  `<servicio>.`.
- Los handlers **siempre leen con la clave prefijada**:
  `tenantConfig.get(tenant, "<servicio>.<clave>")` — ver `configNumero`/
  `configBooleano` en `comun.ts` y las claves `CONFIG_LOTE_MAX`,
  `CONFIG_IMPORTAR_MAX`, `clavePermitirAutor(def)`.
- Un **override por tenant** (`platform.config.set`) gana sobre el default del
  runtime; otros tenants siguen viendo el default.

## Convenciones comunes (`comun.ts`)

- **Offline First**: idempotencia por `opId` reutilizando el patrón `_opIds` del
  núcleo (recibo en el propio registro; reintento = no-op exitoso).
- **Eventos autosuficientes**: `payloadOperacion()` incluye
  `tenantId/id/entityRef/recordType/estado/version/data/...` para que la
  proyección se construya **solo desde el payload** y sea dedupable por
  `eventId`.
- **Configuración por tenant**: `configNumero`/`configBooleano` leen de
  `TenantConfigService` (defaults declarados por la entidad/módulo, overrides por
  `platform.config.set`).

## 1. Asignación (`asignacion.ts`)

Asignar/desasignar un principal (`usuarioId`) a cualquier registro.

| Operación | Nombre | Efecto |
|---|---|---|
| Comando | `<servicio>.<entidad>.asignar` | añade a `data._asignados: string[]`, evento `<prefijo>.asignada` |
| Comando | `<servicio>.<entidad>.desasignar` | quita de `data._asignados`, evento `<prefijo>.desasignada` |
| Consulta | `<servicio>.<entidad>.asignaciones` | devuelve `{ id, asignados }` |

- Permiso dedicado `asignar` (`PermisosEntidad["asignar"]`); si falta, cae al de
  edición.
- Idempotencia semántica (asignar dos veces = no-op) y offline (`opId`).
- Input: `{ id, usuarioId, version, opId? }` (concurrencia optimista por
  `version`). Consulta: `{ id }` (permiso `leer`).

## 2. Aprobación (`aprobacion.ts`)

Flujo declarativo `DefinicionAprobacion { pasos: [{nombre, permiso, minAprobaciones?}] }`.

| Comando | Nombre | Efecto |
|---|---|---|
| Solicitar | `<servicio>.<entidad>.solicitar-aprobacion` | crea `data._aprobacion`, evento `<prefijo>.aprobacion-solicitada` |
| Aprobar | `<servicio>.<entidad>.aprobar` | registra aprobación; al alcanzar `minAprobaciones` avanza de paso; evento `...aprobacion-paso-aprobado` / `...aprobacion-aprobada` |
| Rechazar | `<servicio>.<entidad>.rechazar` | marca `rechazada`, evento `<prefijo>.aprobacion-rechazada` |

- Estado: `data._aprobacion = { paso, solicitante, aprobaciones: [{actorId,fecha}], estado: pendiente|aprobada|rechazada }`.
- **Permiso por paso**: se comprueba en el handler contra el `authorization`
  del Kernel (`paso.permiso`).
- **Guard: no auto-aprobación** — `actor ≠ solicitante`, salvo que el
  TenantConfig `<servicio>.aprobacion-permitir-autor` sea `"true"`.
- `minAprobaciones` (default 1); un mismo actor no aprueba dos veces el paso.

## 3. Lote (`lote.ts`)

Comando `<servicio>.<entidad>.lote` con `operaciones: [{opId, comando, input}]`
(`comando ∈ crear|editar|eliminar|transicionar`).

- Ejecución **secuencial** reutilizando el **bus de comandos** (`deps.runtime.commands.execute`),
  con contexto hijo (misma correlación/tenant). Cada sub-comando aplica su propia
  autorización/validación/UoW/outbox/auditoría.
- **Parcial**: un fallo no aborta el lote; se devuelve un recibo por elemento
  `{opId, ok, error?, result?}`.
- **Idempotente** por `opId` (se propaga a cada sub-comando → patrón `_opIds`).
- **Máximo** configurable por tenant: clave `<servicio>.lote-max` (default 100);
  exceder el máximo rechaza el lote completo (`KRN-VAL-001`).

## 4. Importación (`importacion.ts`)

`importarDesdeFilas(def)` → comando `<servicio>.<entidad>.importar` con
`filas: Record<string, unknown>[]` (JSON ya parseado; el CSV es del borde HTTP).

- Valida cada fila contra el **Zod de la entidad** (`camposAZod`).
- Aplica en lote vía el comando `crear` del núcleo; recibo por fila
  `{fila, ok, id?, errores?}`.
- **Modo `simular`** (dry-run): valida sin escribir.
- Máximo por tenant: `<servicio>.importar-max` (default 500); las filas
  excedentes reciben error explícito.
- Permiso `crear`; `opIdBase` opcional para idempotencia offline (`opIdBase:fila`).

## 5. Exportación (`exportacion.ts`)

Consulta `<servicio>.<entidad>.exportar` que lista registros (filtro simple por
`estado` + paginación del repositorio genérico) y los proyecta a **filas planas**.

- Cada fila = campos declarados de la entidad + metadatos
  `id/version/estado/createdBy/actualizadoAt`.
- Devuelve `{ entidad, cabeceras, filas, total }`, listo para serializar a
  CSV/JSON en el borde.
- Valores tipados a texto (`json` → `JSON.stringify`, booleanos → `"true"|"false"`).
- Permiso `leer` + capacidad dedicada `exportar-<entidad>`
  (`capacidadExportar(def)`).

## Pruebas

`src/operaciones/__tests__/operaciones.test.ts` — 23 pruebas Vitest sobre un
runtime de plataforma **fake** (`createPlatformRuntime` sin pool): contrato
completo del descriptor (eventos/capacidades/permisos/configDefaults), convenio
de configuración (default declarado resuelto vía `TenantConfig` con clave
prefijada + override por tenant que gana), asignación (idempotencia semántica y
por `opId`, permiso), aprobación (flujo multipaso, guard de auto-aprobación +
override de config, rechazo, conflicto), lote (parcial, máximo por override,
idempotencia), importación (validación + dry-run + permiso) y exportación
(proyección, permiso, filtro).
