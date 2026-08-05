# Planificación, agenda y calendario — DGP-009.2

## Comando `planificar` (`modulo.ordenes.write`)

Programa, reprograma o **bloquea** la planificación de una OT. Entrada:
`ordenId`, `inicioPlanificado`, `finPlanificado`, `ventanaInicio`, `ventanaFin`,
`bloquear`/`bloqueoMotivo`, `opId` (idempotencia offline). Persiste en
`ord_planificacion` (write-side, con versión optimista) y emite
`PLANIFICACION_ACTUALIZADA` (o `PLANIFICACION_BLOQUEADA`).

### Detección de conflictos

Antes de confirmar, el comando comprueba **solape de ventana** con otras OT
planificadas del **mismo responsable** (sobre la agenda proyectada). Devuelve
`enConflicto: true` cuando hay solape `[inicio, fin]`. La detección es informativa y
no bloquea por sí misma (política configurable a nivel de negocio).

## Read models

- **Agenda** (`agenda`): entradas de `ord_agenda_read` en un rango
  (`desde`/`hasta`/`limit`), proyectadas desde el evento de planificación
  (incluye responsable, ventana y estado).
- **Calendario** (`calendario`): las mismas entradas **agrupadas por día**
  (`YYYY-MM-DD`) sobre un rango requerido.

La planificación es **configurable** y no asume calendario laboral fijo: los rangos y
ventanas se toman del payload del comando.
