# 11 — Module Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de módulos: el inventario vivo de los módulos de negocio con su estado, fronteras, contratos y salud — la vista consolidada de la fábrica.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El catálogo de módulos existe (ESI-005/03); su anatomía está congelada (ESI-004); su registro técnico en el Kernel está normado (ESI-005/04, ESI-004/04). Este registro consolida la **vista de inventario**: qué módulos existen, en qué estado, con qué relaciones — la respuesta a "¿qué hay construido y cómo está?".

## 2. Contenido por entrada

Cada módulo declara, por referencia:

1. **Identidad y dominio**: su lugar en el catálogo (ESI-005/03) y los ETS que sirve.
2. **Estado del ciclo**: diseñado (DGP escrito) / en construcción / en producción / en evolución — con su ola de entrega (ESI-006/26).
3. **Fronteras**: qué contratos publica y qué contratos consume (doc 13); sus interacciones legales (ESI-005/04).
4. **Superficie**: sus pantallas con contrato (ESI-008/05), sus entradas de navegación y workspaces a los que aporta.
5. **Capacidades**: las que implementa (doc 10).
6. **Permisos**: su espacio `MODULO.RECURSO.ACCION` (ESI-005/16).
7. **Salud**: su scorecard (ESI-005/24) y hallazgos abiertos (deuda, waivers, hotfixes repetidos — ESI-009/16-17).
8. **Dueño**: el equipo responsable — todo módulo tiene exactamente uno.

## 3. Reglas del registro

1. **El registro refleja el DGP y el Kernel, no los sustituye**: la fuente del detalle es el DGP del módulo y su registro técnico; aquí vive el índice con estado.
2. **El módulo nuevo entra al registro al escribirse su DGP** — antes de la primera línea; el módulo fantasma (código sin entrada) es hallazgo de la puerta de arquitectura.
3. **La vista de relaciones es el mapa vivo**: módulo→contratos→consumidores materializa el mapa de dependencias (doc 05) a nivel de fábrica; el análisis de impacto de cambiar un módulo empieza aquí.
4. **La salud es visible por módulo**: el tablero (doc 25) lee este registro — el módulo con scorecard en intervención, deuda prioritaria o hotfixes repetidos se ve, se discute en la cadencia (ESI-009/20) y produce plan.

## Impacto sobre la implementación

La vista se construye sobre los registros técnicos ya congelados (Kernel) y los instrumentos de ESI-009; sin mecanismo nuevo.

## Dependencias

ESI-004 (anatomía, registro); ESI-005/03-04, /16, /24; ESI-006/26; ESI-008/03-05; ESI-009/16-17; docs 05, 10, 13, 25.

## Riesgos

- El registro divergiendo del Kernel real; mitigación: la fuente mecánica es el registro técnico del Kernel — la vista deriva de él, no se mantiene a mano (el principio de fuentes mecánicas de toda la casa).

## Decisiones habilitadas

- Inventario de la fábrica con estado y salud en una consulta.
- Planificación de olas informada por dependencias reales entre módulos.

## Decisiones bloqueadas

- Prohibidos módulos sin entrada, dueño y DGP.
- Prohibido mantener la vista a mano contra las fuentes mecánicas.
- Prohibidas relaciones entre módulos no visibles en el registro.

## Reusable Pattern

Inventario derivado de fuentes mecánicas + estado + salud + relaciones: el registro como vista consolidada de la fábrica — sin doble contabilidad.

## Anti-Patterns

- La lista de módulos en una presentación desactualizada.
- El módulo "en producción" cuyo DGP nadie escribió.
- Descubrir consumidores de un contrato al romperlo.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el dominio que los módulos sirven).
- **ESI que consume**: ESI-004; ESI-005/03-04, /16, /24; ESI-006/26.
- **DGP que originará**: ninguno; indexa los DGP de módulos existentes.
- **ADR relacionados**: ADR de inventario derivado del registro del Kernel.
- **Módulos que reutilizarán este patrón**: todos viven en el registro desde su DGP hasta su retiro.
