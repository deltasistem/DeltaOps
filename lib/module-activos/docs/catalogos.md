# Catálogos configurables por tenant

Los catálogos son datos de configuración por tenant; se guardan en el
**Record Store** de la Plataforma (`deltaops.platform_records`), **no** en
tablas ad-hoc. `CatalogoService` (`infrastructure/catalogo-service.ts`)
encapsula el acceso con `recordType = catalogo:<nombre>`.

## Catálogos disponibles (`CATALOGOS`)

`tipos`, `categorias`, `familias`, `subfamilias`, `estados`, `criticidades`,
`prioridades`, `empresas`, `centros-costo`, `proyectos`, `ubicaciones`,
`fabricantes`, `modelos`, `monedas`, `unidades`, `proveedores`,
`tiposRelacion`.

El catálogo `tiposRelacion` hace **configurable por tenant** el conjunto de
tipos de relación inter-activo (vacío ⇒ los 8 canónicos; no vacío ⇒ sólo los
habilitados con su inverso declarado). Ver `relaciones.md`.

Jerárquicos (`CATALOGOS_JERARQUICOS`): `categorias → familias → subfamilias`.

El catálogo `estados` es **configurable**, con semántica **inequívoca** (ver
[maquina-estados.md](./maquina-estados.md)):

- Catálogo `estados` **VACÍO** ⇒ **máquina canónica completa**: toda transición
  del dominio es admisible (comportamiento por defecto, sin configuración).
- Catálogo `estados` **NO vacío** ⇒ el tenant declara **explícitamente** el
  subconjunto de estados admitidos: el estado destino de cada transición debe
  estar **presente y habilitado**. Si está **ausente** o **deshabilitado**, la
  transición se rechaza con `KRN-VAL-001`.

## Entrada de catálogo (`EntradaCatalogo`)

| Campo | Descripción |
|-------|-------------|
| `clave` | Identificador estable referenciado por el aggregate. |
| `etiqueta` | Texto mostrado. |
| `posicion` | Orden en las opciones. |
| `habilitado` | Sólo las entradas habilitadas son opciones válidas. |
| `padre?` | Clave del catálogo padre (para jerárquicos). |
| `meta?` | Metadatos libres. |

## Comandos y consultas

```ts
await exec(ctx, `${MODULO}.catalogo.upsert`,     { catalogo, clave, etiqueta, posicion? });
await exec(ctx, `${MODULO}.catalogo.habilitar`,  { catalogo, clave, habilitado });
await query(ctx, `${MODULO}.catalogo.opciones`,  { catalogo });  // sólo habilitados, ordenados
```

## Validación referencial

Al crear/editar un activo, `validarCatalogos` comprueba que cada clave
referenciada (`tipo`, `categoria`, `familia`, `subfamilia`, `criticidad`,
`prioridad`, `ubicacionId`, `moneda`, `centroCosto`, `empresa`, `proyecto`,
`fabricante`, `modelo`) exista y esté **habilitada**. Una referencia
inexistente o deshabilitada devuelve `KRN-VAL-001`. Además:

- **Moneda efectiva**: la configuración `moneda-defecto` se aplica **antes** de
  validar, de modo que la moneda por defecto de un tenant también debe estar
  habilitada en el catálogo `monedas`.
- **Unidades**: las unidades de las mediciones (`horometro`/`odometro`, y las
  actualizaciones de horómetro/odómetro) se validan contra el catálogo
  `unidades`.
- **Proveedor**: el proveedor del activo se valida contra el catálogo
  `proveedores`.
- **Estados**: cada transición valida su estado destino contra el catálogo
  `estados` con la semántica vacío⇒canónico / no-vacío⇒presente-y-habilitado
  (ver arriba y maquina-estados.md).
