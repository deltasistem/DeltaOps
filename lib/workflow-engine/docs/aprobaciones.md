# Aprobaciones (Approval Runtime)

> DGP-007 · Motor de aprobaciones declarativo del Workflow Engine. Generaliza el
> patrón `_aprobacion` del Business Foundation. Neutro. Sin timers internos.

## La aprobación GOBIERNA la transición (gate)

La aprobación se declara **inline** en la transición mediante el campo
`aprobacion` (objeto `DefinicionAprobacionTransicion`). Cuando una transición
declara `aprobacion`, es un **gate**: el comando `…instancia.transicionar` **no
cambia el estado** — en la **misma UoW** crea una aprobación pendiente ligada a
la transición (guarda `estadoOrigen`, `estadoDestino`, `comando`, `solicitante`)
y la instancia **permanece en su estado origen**.

La transición completa (validaciones + acciones + evento `transicionada`) solo
se **ejecuta** cuando `…instancia.aprobar` alcanza la resolución del modo
(individual/mayoría/unanimidad/secuencial/paralela), en **esa** UoW. Es
**imposible** saltar el gate: no hay otra vía al estado destino.

`…instancia.rechazar` resuelve al destino declarado en la transición
(`rechazoA`) o, si no se declara, deja la instancia en su estado origen. No se
usa ninguna acción `solicitarAprobacion` (fue eliminada).

## Estado dentro de la instancia

Cada aprobación en curso vive en `data._aprobaciones`, indexada por el `comando`
de la transición gobernada (`EstadoAprobacion`, que guarda además `estadoOrigen`,
`estadoDestino`, `rechazoA` y `alVencer`). No hay tablas nuevas: se persiste
dentro del registro de la instancia vía `RecordStorePort`.

## Modos (`ModoAprobacion`)

| Modo | Regla de resolución |
|---|---|
| `individual` | Basta **una** aprobación. |
| `paralela` | Alcanza `minAprobaciones` (default 1) de los aprobadores. |
| `secuencial` | Lista **en secuencia**: cada aprobador decide en su turno. |
| `mayoria` | Estrictamente **más de la mitad** de los aprobadores. |
| `unanimidad` | **Todos** los aprobadores declarados. |

Cualquier **rechazo** resuelve la aprobación como `rechazada` de inmediato.

## Modificadores

- **Delegada** — comando `…instancia.delegar { transicion, a }`: un aprobador
  (o su rol) delega su turno en otro principal, que podrá decidir por él
  (`aprobadorEfectivo` resuelve la delegación). Requiere el permiso del paso.
- **Con vencimiento** — `vencimientoMinutos` fija una **fecha límite ISO**
  (`venceEn`) al solicitar la aprobación.
- **Al vencer** — `alVencer` decide la política de expiración:
  - `escalar` — la aprobación se **escala una vez** (marca `escalado`, renueva
    `venceEn`) para que el rol superior decida; si vuelve a vencer, se rechaza.
    Requiere `rolEscalamiento`; es el **default** cuando hay `rolEscalamiento`.
  - `rechazar` — al vencer se resuelve como `rechazada` (el motor aplica el
    destino `rechazoA` de la transición). Default cuando **no** hay escalamiento.
  - `nada` — la aprobación queda `expirada`, **sin** efectos ni rechazo forzado.
  Nunca se fuerza el rechazo si aún queda un escalamiento pendiente.
- **Auto-aprobación** — prohibida por defecto (`permitirAutor: false`): el
  solicitante no puede aprobar ni rechazar su propia solicitud.

## Expiración sin timers: comando `expirarAprobaciones`

La expiración **no** usa timers internos. Un cron/scheduler externo (o el
cliente) invoca el comando idempotente:

```ts
await commands.execute(ctx, `${SERVICIO}.instancia.expirarAprobaciones`, {
  id: instanciaId, version,
});
```

- Recorre las aprobaciones pendientes y aplica `aplicarVencimiento` a cada una.
- Es **idempotente**: si no hay ninguna vencida, es un no-op exitoso sin subir
  versión; con `opId` repetido devuelve resultado idempotente.
- Si alguna aprobación expira como **rechazada**, la instancia se mueve a su
  destino de rechazo (`rechazoA` o el estado origen).
- Emite `…instancia.aprobacion-escalada` (si escaló) y
  `…instancia.aprobacion-resuelta`.

## Ejemplo neutro

```ts
// Aprobación inline que GOBIERNA la transición (secuencial, con vencimiento
// + escalamiento) y su destino de rechazo declarado.
{ de: "enRevision", a: "aprobada", comando: "resolver",
  permiso: "flujo.demo.revisar",
  rechazoA: "rechazada",
  aprobacion: {
    nombre: "revisionDoble",
    modo: "secuencial",
    permiso: "flujo.demo.revisar",
    aprobadores: ["revisorA", "revisorB"],
    vencimientoMinutos: 1440,        // 24 h
    rolEscalamiento: "supervisor",
    alVencer: "escalar",
  },
}

// 1) Abrir el gate: NO cambia estado, crea la aprobación pendiente.
await commands.execute(ctx, `${SERVICIO}.instancia.transicionar`, { id, version, comando: "resolver" });

// 2) Decidir (respeta turno en secuencial, permiso del paso, no auto-aprobación):
//    aprobar → ejecuta la transición completa a "aprobada".
//    rechazar → mueve a "rechazada" (rechazoA).
await commands.execute(ctx, `${SERVICIO}.instancia.aprobar`,  { id, version, transicion: "resolver" });
await commands.execute(ctx, `${SERVICIO}.instancia.rechazar`, { id, version, transicion: "resolver", motivo: "…" });
await commands.execute(ctx, `${SERVICIO}.instancia.delegar`,  { id, version, transicion: "resolver", a: "revisorC" });
```

## Funciones puras exportadas

- `iniciarAprobacion(def, objetivo, solicitante, ahora)` — `objetivo` es un
  `ObjetivoTransicion { comando, estadoOrigen, estadoDestino, rechazoA? }`.
- `resolverEstado(def, decisiones)` → `pendiente | aprobada | rechazada`
- `turnoSecuencial(aprobacion)`
- `estaVencida(aprobacion, ahora)`
- `aplicarVencimiento(aprobacion, ahora)` → `{ aprobacion, cambio, escalada }`
- `aprobadorEfectivo(aprobacion, actorId, actorRol)`
