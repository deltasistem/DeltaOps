# Asignaciones y responsables — DGP-009.2

## Comando `asignar-recurso-humano` (`modulo.ordenes.write`)

Registra la asignación de un recurso humano a la OT. Tipos admitidos
(`TIPOS_ASIGNACION`): `persona`, `grupo`, `cuadrilla`, `contratista`. Entrada:
`ordenId`, `tipo`, `asignadoId`, `rol?`, `reemplazaVigentes?`, `id?`, `opId?`.

- Con `reemplazaVigentes: true` se **cierran las asignaciones vigentes** del tipo antes
  de registrar la nueva (`asignacionCerrarVigentes`).
- Persiste en `ord_asignaciones` (write-side) y emite `ASIGNACION_REGISTRADA`.
- Idempotente por `opId` (recibo de resultado).

> Las asignaciones referencian **identidades por id** (personas/grupos/contratistas);
> el módulo NO gestiona el catálogo de personal ni inventario.

## Read models

- `asignaciones`: asignaciones proyectadas (`ord_asignaciones_read`) de la OT.
- `responsables`: histórico de responsables (`ord_responsables_read`), alimentado por
  las asignaciones y los cambios de responsable del agregado.

Ambos son append-only con guarda de idempotencia por `(tenant, eventId)`.
