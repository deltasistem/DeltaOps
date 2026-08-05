# SLA configurable — DGP-009.2

## Comando `sla.definir` (`modulo.ordenes.write`)

Configura, **pausa** o **reanuda** el SLA de una OT. Entrada: `ordenId`,
`politica?`, `minutosObjetivo?`, `inicioAt`, `suspender?`, `reanudar?`, `opId?`.

- Persiste en `ord_sla` (write-side, versión optimista) y emite `SLA_ACTUALIZADO`.
- Estados (`ESTADOS_SLA`): activo / pausado / cumplido / vencido.
- El cómputo de vencimiento considera las **pausas** acumuladas: el reloj se detiene
  mientras el SLA está suspendido y se reanuda al continuar.
- Idempotente por `opId`.

## Configurable, nada hardcodeado

- La **política** y los **minutos objetivo** provienen del comando o de la
  configuración por tenant (`tenantConfig`), no de constantes fijas.
- El resultado del comando reporta el `estado` y los `minutosRestantes` calculados en el
  momento de la operación.
