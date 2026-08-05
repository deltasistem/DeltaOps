# Catálogos configurables

Los catálogos de clasificación (tipos, prioridades, severidades, riesgos,
impactos, ubicaciones, monedas, etc.) son **configurables por tenant** y se
persisten en el Record Store (`recordType` por catálogo).

## Comandos y consultas

- `modulo.ordenes.catalogo.upsert { catalogo, clave, etiqueta, posicion? }`
- `modulo.ordenes.catalogo.habilitar { catalogo, clave, habilitado }`
- `modulo.ordenes.catalogo.opciones { catalogo }` (solo entradas habilitadas)

## Regla de validación (canónico vs presente+habilitado)

`CatalogoService` valida un valor de clasificación así:

- **Catálogo vacío** (el tenant aún no configuró ese catálogo): se acepta un
  valor **canónico** predefinido (o, según catálogo, un valor libre). Esto
  permite operar desde el minuto cero sin sembrar catálogos.
- **Catálogo no vacío**: el valor debe estar **presente y habilitado**; en caso
  contrario se rechaza con error explícito.

Ejemplo (probado): con el catálogo `tipos` vacío se acepta `preventiva`
(canónico); tras `upsert` de `campana`, `preventiva` deja de ser válido y
`campana` solo es válido mientras esté habilitado.

## Valores canónicos

`CANONICOS_POR_CATALOGO` define los valores canónicos por catálogo
(`TIPOS_CANONICOS`, prioridades, severidades, riesgos, impactos). Son el
respaldo cuando el tenant no ha personalizado el catálogo.

## Catálogo `estados` y extensión de la máquina

El catálogo `estados` declara los **estados extra** (neutros, camelCase) que el
tenant añade al ciclo de vida. Complementariamente, `CatalogoPort` expone
`extensionMaquina(tenantId)`, que devuelve la **extensión declarativa** de la
máquina (`{ estados, transiciones }`). El módulo compone base + extensión, la
valida y la activa en el Workflow Engine, y exige **coherencia** entre el
catálogo `estados` y la definición activa (ver `maquina-estados.md`).
