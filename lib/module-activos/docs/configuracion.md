# Configuración

Toda la parametrización de comportamiento pasa por `configDefaults` (valores
por defecto del módulo) combinados con `tenantConfig` (override por tenant vía
`platform.config.set`). El módulo nunca hardcodea umbrales.

## Claves (`configDefaults`)

| Clave | Defecto | Efecto |
|-------|---------|--------|
| `max-longitud-nombre` | `160` | Longitud máxima del nombre del activo. |
| `max-longitud-codigo` | `60` | Longitud máxima del código empresarial. |
| `moneda-defecto` | `USD` | Moneda aplicada si no se indica en la creación. |
| `permite-retroceso-horometro` | `false` | Si `true`, admite mediciones de horómetro no monótonas. |
| `permite-retroceso-odometro` | `false` | Si `true`, admite mediciones de odómetro no monótonas. |
| `requiere-aprobacion-retiro` | `false` | Si `true`, `retirar` exige `aprobado: true`. |

## Override por tenant

```ts
await rt.platform.kernel.commands.execute(ctx, "platform.config.set", {
  key: "modulo.activos.requiere-aprobacion-retiro",
  value: "true",
});
```

La consola técnica (`modulo.activos.consola`) expone la **configuración
efectiva** resuelta (defaults + overrides) junto con el contrato del módulo
(estados, catálogos, comandos, eventos), útil para UIs administrativas.

## Resolución

El helper `cfg(deps, tenant, clave, defecto)` lee `tenantConfig.get` y cae al
default del módulo cuando la clave no está configurada. Los valores numéricos
y booleanos se parsean desde su representación textual.
