# 21 — Search Experience

> **DeltaOps — ESI-008 · v1.0** · La experiencia de búsqueda: encontrar antes que navegar — una búsqueda global gobernada por el servicio congelado y las murallas de siempre.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Base congelada y superficies

El servicio de búsqueda existe (ESI-006/08: índices declarados por módulo, alcance por permisos). Las superficies normadas:

| Superficie | Dónde | Comportamiento |
|---|---|---|
| **Búsqueda global** | Zona de sistema del shell (doc 02), invocable por atajo | Busca en todos los índices alcanzables del tenant activo; resultados agrupados por tipo con enlace profundo |
| **Búsqueda en contexto** | Dentro de tablas (doc 20) y selectores de referencia (doc 19) | Acotada a la colección/el catálogo del control; misma sintaxis, alcance local |

## 2. Reglas

1. **Solo lo alcanzable aparece** (ESI-006/08): los resultados respetan tenant, alcance y permisos por construcción; la búsqueda jamás revela existencia de lo no alcanzable (no-fuga, ESI-007/04) — ni en resultados, ni en conteos, ni en sugerencias.
2. **El resultado orienta**: cada resultado muestra tipo, identificador operativo y el contexto mínimo para distinguir ("Bomba P-101 · Planta Norte · Activo"); el clic lleva por enlace profundo (doc 03 §2.3). Los resultados agrupados por tipo declaran cuántos más hay por grupo.
3. **La búsqueda entiende lo operativo**: códigos parciales, identificadores con y sin formato (guiones, ceros), tolerancia a error tipográfico razonable — lo que el servicio declare (ESI-006/08); la superficie no promete magia que el índice no da (honestidad de capacidades).
4. **Recientes y frecuentes primero**: sin consulta, la búsqueda global ofrece lo reciente del usuario y accesos frecuentes (por cuenta y contexto); el campo vacío también es útil.
5. **Buscar no es filtrar**: la búsqueda encuentra recursos y lleva a ellos; el análisis de colecciones es de la tabla con filtros (doc 20 §2.1). La búsqueda global que devuelve "vista filtrada de OT" ofrece el salto a la tabla con el filtro aplicado — puentes, no confusión de papeles.

## 3. Declaración (los ocho rubros)

- **Commands**: ninguno; buscar no muta.
- **Queries**: consultas al servicio de búsqueda con alcance del solicitante; recientes por cuenta.
- **Capacidades**: los índices siguen las capacidades de sus módulos.
- **Servicios**: búsqueda (ESI-006/08) — esta es su superficie.
- **Permisos**: los del solicitante aplicados por el servicio; la superficie no filtra por su cuenta (ni podría: no ve lo que el servicio no entrega).
- **Offline**: la búsqueda global es online; en campo, la búsqueda en contexto opera sobre catálogos sincronizados y lo dice (doc 11 §2.1).
- **KPIs**: búsquedas con clic (efectividad), búsquedas sin resultados (huecos de índice o de vocabulario), uso del atajo.
- **IA**: la búsqueda semántica/por lenguaje natural es evolución declarada del servicio (ESI-006/08); su superficie la marcará como IA (doc 22) cuando exista — no antes.

## Impacto sobre la implementación

Las dos superficies entran al DGP de experiencia consumiendo el servicio congelado; cada DGP de módulo ya declara sus índices (ESI-006/08).

## Dependencias

Docs 02-03, 11, 19-20, 22; ESI-006/08; ESI-007/04.

## Riesgos

- Expectativa de "buscador de internet" frente a índices declarados acotados; mitigación: el KPI de sin-resultados alimenta la ampliación de índices por evidencia, y el estado vacío de búsqueda explica qué se indexa (doc 14).

## Decisiones habilitadas

- El identificador operativo (código de activo, número de OT) como camino más corto a cualquier cosa.
- Detección de huecos de vocabulario del producto por evidencia.

## Decisiones bloqueadas

- Prohibido revelar existencia fuera de alcance en cualquier forma.
- Prohibidos índices o búsquedas paralelas por módulo fuera del servicio.
- Prohibido prometer semántica que el servicio no declara.

## Reusable Pattern

Dos superficies sobre un servicio + no-fuga por construcción + vacío útil: la búsqueda como proyección de permisos — encontrar rápido sin abrir rendijas.

## Anti-Patterns

- El buscador que tarda más que navegar.
- Resultados sin contexto ("P-101" ¿de qué planta?).
- La búsqueda en contexto con sintaxis distinta de la global.

## Knowledge Graph

- **ETS que consume**: ETS-011 (el código operativo como lengua franca).
- **ESI que consume**: ESI-006/08 (servicio congelado); ESI-007/04.
- **DGP que originará**: superficies de búsqueda en el DGP de experiencia.
- **ADR relacionados**: ADR de búsqueda-como-proyección-de-permisos.
- **Módulos que reutilizarán este patrón**: todos vía sus índices declarados; ninguno construye buscador.
