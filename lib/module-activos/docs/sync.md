# Sincronización offline

El módulo soporta clientes offline que encolan operaciones y las envían al
reconectar. La sincronización se implementa por **orquestación**, nunca con
comandos anidados ni con una unidad de trabajo exterior que envuelva a otras.

## Orquestación `sincronizar(ctx, operaciones)`

No es un comando del Kernel (eso anidaría UoWs). Es una función de
orquestación expuesta por el **runtime** (`ActivosRuntime.sincronizar`) y por el
**router** HTTP (`POST /api/deltaops/activos/sync`). Ver
`lib/module-activos/src/sincronizacion.ts` (`procesarCola`).

Entrada: `[{ opId, comando, input }, ...]` (máx. 100 operaciones).

## Protocolo de RECLAMACIÓN durable (claim → ejecutar → finalizar)

La idempotencia por `opId` NO puede basarse en «buscar y luego insertar»: esa
carrera no es segura bajo concurrencia ni ante fallo del guardado. En su lugar,
cada operación **reclama durablemente el `opId` ANTES de ejecutar**:

1. **CLAIM** — `receipts.claim(tenant, opId, clienteId, comando)`: `INSERT` del
   recibo en estado **`pendiente`** con `ON CONFLICT (tenant_id, op_id) DO
   NOTHING` y, en la **misma transacción**, se determina si esta solicitud ganó
   la reclamación (en PG vía `RETURNING (xmax = 0)`; si no ganó, relee el recibo
   existente). Devuelve `{duenio:true}` o `{duenio:false, recibo}`.
2. Si **NO es dueño**:
   - recibo en estado **terminal** ⇒ **REPLAY**: se devuelve el recibo original
     tal cual (creación **y** mutación), sin re-ejecutar el comando.
   - recibo **`pendiente` vivo** (de otro dueño en curso) ⇒ *polling acotado* de
     relectura; si sigue `pendiente`, se devuelve **`reintentable`** — **jamás**
     se ejecuta el comando.
   - recibo **`pendiente` viejo** (`created_at` + umbral configurable) ⇒
     **RECUPERACIÓN**: el nuevo solicitante **adopta** la propiedad y
     **reconcilia** contra el agregado (ver abajo), finalizando el recibo con el
     resultado reconciliado.
3. Si **es dueño**: ejecuta el comando destino vía `commands.execute` (su
   **propia** UoW del pipeline, jamás anidada) y luego **FINALIZA** el recibo con
   `UPDATE` (`pendiente` → `aplicada`/`idempotente`/`conflicto`/`rechazada`),
   guardando el `ResultadoSync` completo.

Al terminar la cola, **drena el outbox una vez** (como el `/sync` de DGP-006).

El resultado es un `ResumenSync` con contadores
(`total/aplicadas/idempotentes/conflictos/reintentables/rechazadas`) y el
detalle `resultados: ResultadoSync[]` (con `replay:true` cuando provienen de un
recibo durable, y `advertencia` cuando el efecto se aplicó pero el recibo no
pudo finalizar).

## Manejo honesto de fallos

- **Falla la FINALIZACIÓN del recibo** (infra) tras confirmarse el comando: NO
  se reporta éxito durable. Se devuelve **`reintentable`** con `advertencia`; el
  recibo queda **`pendiente`**. Un `claim` posterior lo detecta como
  `pendiente` viejo y lo **recupera por reconciliación**.
- **Falla el CLAIM** (infra): sin efecto durable ⇒ `reintentable`.
- **Infra del comando** (`KRN-INF-001`): se **LIBERA** la reclamación
  (`release` = `DELETE` del `pendiente`) para que un reintento posterior pueda
  **volver a reclamar** el `opId`. *Elección de diseño*: se prefiere borrar la
  reclamación (en vez de dejarla `pendiente`) porque un fallo de infra del
  comando no deja ningún efecto durable que reconciliar; borrar permite el
  camino limpio de re-ejecución. Los errores de `save`/`update`/`delete` del
  store se **propagan** (nunca se descartan).

## Reconciliación de `pendiente` viejos

Al adoptar un `pendiente` viejo, se consulta el **agregado** (repositorio, no el
read model, que puede no estar proyectado aún):

- **Creación**: `findById(tenant, clienteId)`. Si el activo existe ⇒ la creación
  se aplicó ⇒ recibo `aplicada` con `{id, estado, version}`. Si no existe ⇒ se
  re-ejecuta la creación (ya somos dueños adoptados).
- **Mutación**: `findById(tenant, id)` y se compara la versión actual con
  `expectedVersion`. Si la versión **avanzó** (`actual > esperada`) ⇒ la
  mutación se aplicó ⇒ `aplicada` con el estado/versión actuales (NO se
  re-ejecuta). Si la versión **no avanzó** ⇒ la mutación no llegó a aplicarse ⇒
  se re-ejecuta.

`finalize` sólo actualiza si el recibo **sigue `pendiente`**, de modo que dos
adopciones concurrentes no se pisan: quien no gane el `UPDATE` relee el recibo
ya terminal y hace `replay`.

## Recibos durables (`act_sync_receipts`)

Tabla PROPIA del módulo (`deltaops.act_sync_receipts`, RLS por tenant,
`PRIMARY KEY (tenant_id, op_id)`). Columnas: `op_id`, `cliente_id`, `comando`,
`estado` (`pendiente` durante la reclamación; luego terminal), `resultado`
(`ResultadoSync` completo; `null` mientras `pendiente`), `created_at`,
`updated_at`. Puertos + adaptadores en `infrastructure/repository.ts`:
`SyncReceiptStore` con `claim`/`find`/`finalize`/`release`, implementado por
`FakeSyncReceiptStore` (memoria, con reloj inyectable) y `PgSyncReceiptStore`
(PostgreSQL; cada método en su propia transacción mínima con
`set_config('app.tenant_id', …, true)`).

## Garantías

- **Idempotencia durable, concurrente y tenant-scoped por `opId`**: la
  reclamación atómica garantiza **exactamente un efecto** aunque dos
  orquestaciones procesen el mismo `opId` en paralelo (probado con `Promise.all`
  real contra PG, para creación y mutación); replay de creación y de mutación
  devuelve el recibo original sin re-ejecutar; recibos aislados por tenant.
- **Offline First**: una operación `crear` sin `id` de cliente se **rechaza**.
- **Conflictos**: `expectedVersion` desactualizado ⇒ `conflicto` con el estado
  actual del activo adjunto (`resultado.actual`).
- **Sin anidamiento**: una unidad de trabajo por operación real; la
  orquestación sólo coordina, no abre transacciones que contengan otras.

## Cobertura de TODAS las operaciones (DGP-008.2)

`procesarCola` es **agnóstico al comando**: despacha genéricamente cualquier
`op.comando` del módulo vía `commands.execute`, por lo que la cola offline cubre
**todo** el catálogo sin cambiar el protocolo: `crear`, `editar`,
`cambiar-ubicacion`, `asignar-responsable`, `actualizar-horometro`,
`actualizar-odometro`, las transiciones de estado, `catalogo.upsert` /
`catalogo.habilitar`, las **relaciones** (`crear-relacion` /
`eliminar-relacion`) y las operaciones de **colaboración**.

- Las relaciones tienen su **propia idempotencia offline** adicional: `crear-
  relacion` acepta un `id` de cliente y detecta el reenvío como duplicado
  idempotente antes de tocar el grafo.
- La prueba `sincroniza crear/…/relación` (Fake) y la suite PG ejercitan una
  cola mixta de 8 operaciones heterogéneas, verificando `aplicadas` en la primera
  pasada y `replay:true` en la reenvío completo (idempotencia durable).

### Colaboración por la cola offline

`sincronizacion.ts` declara la whitelist `COMANDOS_COLABORACION`
(`comentar`, `editar-comentario`, `borrar-comentario`, `adjuntar`), que se
mapean a los comandos del módulo que **delegan** en `platform.comment` /
`platform.attachment`. Siguen el mismo protocolo claim→ejecutar→finalizar: un
reenvío devuelve el recibo original con `replay:true` **sin re-ejecutar** (no se
duplican comentarios ni adjuntos), verificado con pruebas Fake y PG.

Estas operaciones **no** son reconciliables por versión/id de agregado; por eso,
en la ruta de RECUPERACIÓN de un recibo `pendiente` **viejo**, `reconciliar` las
degrada a **`reintentable`** (nunca re-ejecución a ciegas): una reclamación
limpia posterior las procesa exactamente una vez.
