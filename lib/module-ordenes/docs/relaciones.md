# Relaciones, dependencias y activos relacionados — DGP-009.2

## Comando `crear-relacion` (`modulo.ordenes.write`)

Crea una relación desde la OT hacia otra entidad. Categorías (`CATEGORIAS_RELACION`):
`activo`, `orden`, `formulario`, `checklist`, `evidencia`, `recurso`. Entrada:
`ordenId`, `categoria`, `tipo`, `destinoId`, `destinoCodigo?`, `destinoNombre?`,
`id?`, `opId?`.

Reglas:

- **Anti-lazo**: se rechaza relacionar la OT consigo misma.
- **Anti-duplicado**: si la relación ya existe (`relacionExiste`), la operación es
  **idempotente** (no crea otra fila).
- Persiste en `ord_relaciones` (write-side) y emite `RELACION_CREADA`.
- Idempotente por `opId`.

> Las relaciones son **referencias** (por id/código/nombre); no se copia ni gestiona la
> entidad destino (activos, formularios, etc.).

## Read models

Proyectados en `ord_relaciones_read` desde `RELACION_CREADA`:

- `relaciones`: todas las relaciones de la OT (filtro opcional por `categoria`).
- `activos-relacionados`: relaciones de categoría `activo`.
- `dependencias`: relaciones de categoría `orden` (OT↔OT).
