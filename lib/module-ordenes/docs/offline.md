# Offline-first e idempotencia

El módulo está diseñado para operar con clientes que trabajan sin conexión y
sincronizan colas de operaciones al reconectar.

## Idempotencia por `opId`

Cada comando de escritura acepta un `opId` opcional. El módulo mantiene un
registro durable de **recibos** (puerto de dominio `ReciboPort`; el adaptador de
producción llega en 009.2, en 009.1 se usa un fake en memoria):

- Antes de ejecutar, `reciboPrevio` busca el recibo; si existe, **corta en corto**
  y devuelve el resultado original con `idempotente: true`.
- Tras ejecutar, sella el recibo en la misma UoW.

Consecuencias probadas:

- Reintentar `crear` con el mismo `opId` **no** duplica la OT **ni** consume la
  secuencia del consecutivo: la siguiente OT nueva sigue siendo `OT-000002`.

## Aprobación/rechazo idempotentes (claim→execute→finalize)

`aprobarCierre` orquesta el gate de aprobación del motor. El `opId` se **propaga
al comando del motor** (`aprobar`/`rechazar`, sufijo `:wf`), que es idempotente
por `opId`. Protocolo claim→execute→finalize:

1. **Claim**: si ya hay recibo para el `opId`, devuelve el resultado sellado.
2. **Execute**: ejecuta el comando del motor con el `opId` propagado. Si el gate
   ya fue resuelto en un intento anterior, el motor responde de forma idempotente
   sin reaplicar; la sincronización de estado también es idempotente.
3. **Finalize**: sella el recibo del comando del módulo.

Así, un **reintento tras un fallo parcial** (gate resuelto pero recibo aún no
sellado) **no** produce doble aplicación ni inconsistencia de estado. Ver prueba
"aprobarCierre: reintento con mismo opId tras fallo parcial NO reaplica".

## Id de cliente para creación offline

La creación offline **exige** un `id` generado por el cliente (UUID), de modo que
la operación sea idempotente extremo a extremo antes de existir en el servidor.

## Sincronización de colas

`procesarCola(runtime, adapters, ctx, operaciones)` drena una cola offline
(orquestación, no comando anidado):

- Una UoW por operación (a través de `commands.execute`), idempotencia a nivel de
  comando por `opId`, y drenado del outbox al final.
- Devuelve un `ResumenSync { total, aplicadas, idempotentes, rechazadas, … }`.

Ver pruebas "reintentar crear con el mismo opId", "procesarCola sincroniza" y
"la creación offline exige id de cliente".

## Alcance 009.1 · read-side diferido a 009.2

El paquete 009.1 conserva del lado escritura solo lo indispensable del dominio:
aggregate (repositorio), catálogos, consecutivo, plantillas (Dynamic Forms) y
**recibos** de idempotencia offline. **NO** incluye read models materializados
(`listar`, dashboard), proyección CQRS asíncrona, **bitácora durable** ni
indexación de búsqueda: todo eso es **infraestructura de lectura** y llega en
**DGP-009.2**. El único acceso de lectura expuesto es `modulo.ordenes.detalle`,
que lee el **aggregate** del repositorio (fuente de verdad), no un read model.
El outbox sigue emitiendo los eventos de dominio para que 009.2 los consuma.
