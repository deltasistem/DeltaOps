# Sincronización offline por orquestación — DGP-009.2

El protocolo offline es **durable** y por **orquestación** (nunca comandos anidados).

## Protocolo claim → ejecutar → finalizar

Cada operación de la cola lleva un `opId` de cliente. La sincronización
(`procesarCola`, expuesta como `runtime.sincronizar`) procesa la cola operación a
operación, **una Unit of Work por operación real**:

1. **Claim durable**: se reclama el `opId` de forma **atómica** (tenant-scoped). El
   almacén de reclamos es `ord_sync_receipts` (`SyncReceiptStore`), distinto del
   almacén de idempotencia de resultado de comando (`ord_recibos`, `ReciboPort`).
   - Si el claim es **ajeno** (otro worker ya lo posee) **no se ejecuta** el comando:
     - recibo ya **finalizado** ⇒ se devuelve su resultado sellado (replay);
     - recibo aún **`pendiente`** (otro worker ejecutando) ⇒ se **espera** (poll
       acotado) a que finalice y se devuelve su resultado; si no finaliza a tiempo ⇒
       `reintentable`.
2. **Ejecutar** (sólo el dueño del claim): se resuelve el nombre del comando
   (`bitacora.registrar` ⇒ `modulo.ordenes.bitacora.registrar`, soporta sufijos con
   punto) y se ejecuta como comando normal del kernel (UoW propia). El comando sella su
   recibo de resultado por `opId` (`ReciboPort`).
3. **Finalizar / liberar**:
   - resultado **terminal** (aplicada / idempotente / conflicto / rechazada) ⇒
     `finalize` sella el resultado en el recibo de claim (los claims futuros lo
     devuelven sin re-ejecutar);
   - fallo **reintentable** (infra, `KRN-INF-001`) ⇒ `release` libera el claim para que
     un reintento posterior pueda re-reclamar y ejecutar **sin duplicar** efectos (el
     `ReciboPort` del comando evita el doble efecto si el comando alcanzó a aplicarse).

Al terminar la cola se **drena el outbox** (`processPending`) para materializar las
proyecciones.

## Idempotencia y concurrencia

- **Dos workers concurrentes con el mismo `opId` ⇒ un solo efecto**: el claim atómico
  designa un único dueño; el otro observa el claim ajeno y devuelve el resultado sin
  re-ejecutar.
- Reenviar la misma cola devuelve los resultados como **idempotentes** (mismos efectos,
  sin duplicar eventos ni filas), gracias al doble mecanismo: claim durable de `opId` +
  recibo de resultado por comando.
- Un **fallo parcial reintentable** libera el claim; el reintento aplica una única vez.

## Resumen

`ResumenSync` reporta: `total`, `aplicadas`, `idempotentes`, `conflictos`,
`reintentables`, `rechazadas` y el detalle por operación.
