# Recursos (solo referencias, sin inventario) — DGP-009.2

## Comando `registrar-recurso` (`modulo.ordenes.write`)

Registra un recurso necesario/consumido por la OT **por referencia**. Clases
(`CLASES_RECURSO`): `herramienta`, `material`, `epp`, `vehiculo`, `equipo-auxiliar`.
Entrada: `ordenId`, `clase`, `referenciaId`, `descripcion?`, `cantidad?`, `unidad?`,
`id?`, `opId?`.

- Persiste en `ord_recursos` (write-side) y emite `RECURSO_REGISTRADO`.
- Idempotente por `opId`.

## Sin inventario

Este módulo **NO** implementa gestión de inventario, stock, reservas ni movimientos de
almacén. Solo guarda **referencias** (`referenciaId`) y datos descriptivos
(cantidad/unidad) para trazabilidad operativa de la OT. Cualquier control de existencias
corresponde a otro módulo/dominio.
