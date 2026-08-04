# Eventos de dominio y CQRS

## Eventos (autosuficientes)

Cada operación del aggregate emite un evento cuyo `payload` contiene **todo el
estado necesario** para proyectar sin releer el aggregate (self-sufficient).
`EVENTOS_MODULO` los agrupa; la definición del módulo los declara en su
contrato (`emits`).

| Constante | Tipo | Origen |
|-----------|------|--------|
| `ACTIVO_REGISTRADO` | `modulo.activos.registrado` | `crear` |
| `ACTIVO_ACTUALIZADO` | `modulo.activos.actualizado` | `editar`, `cambiar-ubicacion`, `asignar-responsable`, mediciones |
| `ACTIVO_OPERATIVO` | `modulo.activos.operativo` | `operar` |
| `ACTIVO_EN_MANTENIMIENTO` | `modulo.activos.en-mantenimiento` | `mantener` |
| `ACTIVO_FUERA_SERVICIO` | `modulo.activos.fuera-servicio` | `fuera-servicio` |
| `ACTIVO_RETIRADO` | `modulo.activos.retirado` | `retirar` |
| `ACTIVO_UBICACION_ACTUALIZADA` | `modulo.activos.ubicacion-actualizada` | `cambiar-ubicacion` |
| `ACTIVO_RESPONSABLE_ACTUALIZADO` | `modulo.activos.responsable-actualizado` | `asignar-responsable` |
| `ACTIVO_HOROMETRO_ACTUALIZADO` | `modulo.activos.horometro-actualizado` | `actualizar-horometro` |
| `ACTIVO_ODOMETRO_ACTUALIZADO` | `modulo.activos.odometro-actualizado` | `actualizar-odometro` |

## CQRS

- **Comandos** (write): idempotentes por `opId` (offline) o por `id` de cliente
  en la creación; usan `expectedVersion` → conflicto `KRN-CFL-001`. Escriben el
  aggregate + auditoría + evento en **una** unidad de trabajo (outbox
  transaccional).
- **Proyección** (read): los handlers del módulo consumen los eventos del outbox
  y actualizan `act_activos_read`. La proyección es **idempotente**: guardada
  por `lastEventId` y por comparación de `version`, de modo que reentregas del
  outbox o `processPending()` repetidos no duplican ni corrompen el read model.
- **Reproyección**: el comando `modulo.activos.reproyectar` reconstruye el read
  model a partir del estado de los aggregates (devuelve `{ proyectados }`).

## Consultas

`listar` (filtros estado/tipo/criticidad/ubicación), `detalle`,
`catalogo.opciones`, `consola` (contrato + configuración efectiva).

> DGP-008.1 **no** expone dashboards/reportes/KPIs: no hay consulta `stats`. El
> `healthCheck` puede sondear el read model internamente, sin query pública.
