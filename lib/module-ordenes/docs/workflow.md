# Orquestación con el Workflow Engine

## Comandos-orquestadores

Los comandos de transición de la OT (`modulo.ordenes.transicionar`,
`modulo.ordenes.aprobarCierre`) son **orquestadores**: no mutan el ciclo por su
cuenta, sino que:

1. Invocan el comando de instancia del **Workflow Engine** en su propio contexto
   y unidad de trabajo (UoW).
2. Consultan el estado resultante de la instancia.
3. **Sincronizan** ese estado al aggregate OT en una **UoW separada**
   (`sincronizarEstado`), reflejándolo con `aplicarEstado`.

Se usan UoW separadas a propósito para respetar la regla dura del kernel que
prohíbe anidar comandos dentro de una UoW en curso.

## Correspondencia 1:1

El `id` de la instancia de workflow coincide con el `id` del aggregate OT (1:1).
La definición se publica y activa de forma **perezosa** e **idempotente** por
tenant (`asegurarWorkflow`, apoyado en `activa`/`publicar`/`activar`).

## Cierre gobernado por aprobación (gate)

La transición `enValidacion → cerrado` (`cerrar`) está protegida por una
**aprobación inline** declarada en la definición:

- `cerrar` **no** cierra: abre un gate y la instancia permanece en
  `EN_VALIDACION` con `aprobacionPendiente = true`.
- `aprobarCierre { decision: "aprobar" }` aplica la transición ⇒ `CERRADA`.
- `aprobarCierre { decision: "rechazar" }` devuelve a `EN_EJECUCION` (`rechazoA`).

El aprobador debe tener el permiso `modulo.ordenes.validar` y coincidir con el
rol aprobador declarado (`validador`); el solicitante no puede auto-aprobar
(regla del motor). Ver pruebas "cierra con aprobación" y "rechazo de cierre".

## Estado como reflejo

El aggregate nunca decide transiciones: `aplicarEstado` solo refleja el estado
que devuelve el motor y sella `fechas.inicio`, `fechas.finalizacion` y
`fechas.cierre` según corresponda.
