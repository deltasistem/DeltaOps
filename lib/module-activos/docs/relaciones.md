# Relaciones inter-activo — DGP-008.2

Las relaciones se modelan como un **grafo dirigido tipado**: aristas
`origen --tipo--> destino`, persistidas en `deltaops.act_relaciones` (fuente de
verdad, RLS por tenant, arista única por `(tipo, origen, destino)`).

## Catálogo de tipos (con inverso declarativo)

| Tipo | Categoría | Inverso | Jerárquico |
|------|-----------|---------|------------|
| `padre-de` | jerarquia | `hijo-de` | sí |
| `hijo-de` | jerarquia | `padre-de` | sí |
| `compuesto-por` | componente | `componente-de` | sí |
| `componente-de` | componente | `compuesto-por` | sí |
| `depende-de` | dependencia | `requerido-por` | no |
| `requerido-por` | dependencia | `depende-de` | no |
| `reemplaza-a` | sustitucion | `reemplazado-por` | no |
| `reemplazado-por` | sustitucion | `reemplaza-a` | no |
| `relacionado-con` | asociacion | `relacionado-con` (simétrica) | no |

El par inverso es **declarativo** (definido en `domain/relaciones.ts`); permite a
la UI navegar la relación en ambos sentidos.

## Tipos habilitados por tenant (catálogo `tiposRelacion`)

Los tipos de relación son **configurables por tenant** vía el catálogo
`tiposRelacion` (consistente con el catálogo de estados), resuelto por
`resolverTiposRelacion`:

- catálogo **vacío** ⇒ los **8 tipos canónicos** de la tabla anterior;
- catálogo **no vacío** ⇒ **sólo** los tipos presentes y habilitados, con la
  regla de que su **inverso también debe estar declarado** (pares inversos);
  auto-inversos (`relacionado-con`) se admiten solos.

Configurar un tipo desconocido, o uno cuyo inverso falta, produce
`KRN-VAL-*`. `crear-relacion` valida el `tipo` contra esta resolución y rechaza
(`KRN-VAL-*`) los tipos no habilitados para el tenant.

## Comandos

- `modulo.activos.crear-relacion { tipo, origenId, destinoId, id?, opId? }`
  - Verifica **existencia** de ambos extremos (fuente de verdad = aggregate).
  - Rechaza **auto-relación** y **duplicados** (`KRN-CFL-001`).
  - En tipos **jerárquicos** ejecuta verificación **anticiclo** (CTE recursiva en
    PG; BFS en el adaptador Fake): rechaza cerrar un ciclo (`KRN-CFL-001`).
  - Idempotente offline por `id` de cliente.
- `modulo.activos.eliminar-relacion { id, opId? }` — `KRN-NF-001` si no existe.

## Proyección

Los eventos `relacion-creada` / `relacion-eliminada` proyectan a
`act_relaciones_read`, consultable por `relacionados`, `arbol` y `componentes`.
