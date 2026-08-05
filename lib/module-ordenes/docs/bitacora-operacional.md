# Bitácora operacional — DGP-009.2

La bitácora registra los hitos operativos de campo de la OT. **Siempre** se produce
vía eventos (comando → evento → proyección); nunca por escritura directa al read model.

## Comando `bitacora.registrar` (`modulo.ordenes.operar`)

Entrada: `ordenId`, `accion`, `detalle?`, `ocurridoAt?`, `opId?`.

Se admite mientras la OT no esté en estado FINAL (política `puede-editar`; no exige
`EN_EJECUCION`). Idempotente por `opId`.

## Las 8 acciones (`ACCIONES_BITACORA`)

1. `inicio`
2. `pausa`
3. `reanudacion`
4. `espera`
5. `cambio-responsable`
6. `llegada`
7. `salida`
8. `finalizacion`

## Proyección

El evento `BITACORA_REGISTRADA` proyecta **dos** read models append-only con guarda de
idempotencia independiente por mapa/tabla:

- `ord_bitacora_read` — bitácora consultable por `bitacora`.
- `ord_historial_read` — entrada cronológica en el `historial`.

Como ambas inserciones comparten el `eventId`, la guarda de idempotencia es por
`(tabla, tenant, eventId)`: reaplicar el evento no duplica, pero sí alimenta ambas
proyecciones.
