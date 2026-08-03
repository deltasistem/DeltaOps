# Sincronización Offline (Offline + Synchronization Runtime)

> DGP-007 · `sincronizacion.ts`. **Orquestación** de una cola de operaciones
> offline. **NO** es un comando del Kernel: cada operación se ejecuta como el
> comando real que representa, con **su propia UoW** (patrón `/sync` de DGP-006).
> Sin estado en memoria, sin UoW exterior, sin almacén de recibos aparte.

## Contrato

La función de orquestación:

```ts
procesarCola(runtime, ctx, operaciones): Promise<ResumenSync>
```

expuesta también en el runtime como `runtime.sincronizar(ctx, operaciones)`. Cada
operación es `{ opId, comando, input }` (máx. 100 por lote, `ColaSyncSchema`).
No hay comando `…sync.sincronizar` ni query `…sync.recibos`: fueron eliminados.

Cada operación se resuelve a un `ResultadoSync`:

| `estado` | Significado |
|---|---|
| `aplicada` | El comando se ejecutó con éxito por el pipeline del Kernel (una UoW propia). |
| `idempotente` | El comando devolvió `idempotente: true`: el `opId`/`id` ya estaba aplicado en el **propio registro** (`_opIds`) → sin re-ejecutar efectos (replay seguro). |
| `conflicto` | Conflicto de versión (`KRN-CFL-001`). Se adjunta `actual` (estado/versión/data actuales) para que el cliente **resuelva**. |
| `reintentable` | Fallo de infraestructura (`KRN-INF-001`) → se puede reintentar. |
| `rechazada` | Rechazo definitivo (validación, autorización, etc.). |

El `ResumenSync` agrega: `total`, `aplicadas`, `idempotentes`, `conflictos`,
`reintentables`, `rechazadas` y `resultados[]`.

## Idempotencia durable tenant-scoped (sin almacén de recibos)

- No existe recordType `recibo-sync` ni id `recibo:<opId>`. La idempotencia vive
  en el **propio registro** de la instancia/definición, en `_opIds` (deduplicado
  por el `id` de cliente en creación, o por `opId` en el resto de comandos).
- Es **tenant-scoped** de forma natural: los registros están particionados por
  tenant (RLS + clave por tenant). Un mismo `opId` en dos tenants es
  independiente porque afecta a registros distintos.
- El replay del cliente reenvía los mismos `opId`/`id` y el comando responde
  `idempotente: true` sin duplicar efectos.

## Reglas Offline First

- **Crear/iniciar exige `id` de cliente**: una operación de creación
  (`…iniciar`, `…definicion.publicar`) sin `input.id` se **rechaza**.
- El `opId` viaja en el `input` de cada comando (`{ ...input, opId }`), de modo
  que la idempotencia opera a nivel de comando.
- Cada operación usa **su propia UoW** (vía el pipeline del Kernel); **jamás**
  hay comandos anidados ni una UoW que envuelva la cola.
- El outbox se drena **una** vez al terminar la cola.

## Resolución de conflictos

Ante `conflicto`, el cliente recibe el estado `actual` de la instancia:

```jsonc
{
  "opId": "…",
  "comando": "flujo.demo.instancia.transicionar",
  "estado": "conflicto",
  "actual": { "id": "…", "estado": "enviada", "version": 2, "data": { /* … */ } },
  "error": "Conflicto de concurrencia…"
}
```

El cliente decide (reintentar con la versión actual, descartar, fusionar) y
vuelve a encolar con un **nuevo** `opId` si procede.

## Ejemplo neutro

```ts
const res = await runtime.sincronizar(ctx, [
  { opId: "op-1", comando: `${SERVICIO}.instancia.iniciar`,
    input: { id: "inst-1", data: { titulo: "Solicitud demo" } } },
  { opId: "op-2", comando: `${SERVICIO}.instancia.transicionar`,
    input: { id: "inst-1", version: 1, comando: "enviar" } },
]);
// res: { total, aplicadas, idempotentes, conflictos, reintentables, rechazadas, resultados: [...] }
```

Un segundo `sincronizar` con los mismos `opId` devuelve `idempotente` en todas
(replay seguro), sin duplicar efectos.
