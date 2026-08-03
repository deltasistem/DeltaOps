# 12 — Service Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de servicios: el inventario vivo de los servicios compartidos con sus contratos, consumidores y salud — la vista consolidada de la plataforma.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El catálogo de servicios compartidos está congelado (ESI-006/02): notificaciones, adjuntos, búsqueda, exportes, IA, KPIs, configuración, y los demás de su serie. Este registro consolida la **vista operativa**: qué servicios existen, quién los consume, en qué estado están sus contratos — el espejo de plataforma del registro de módulos (doc 11).

## 2. Contenido por entrada

Cada servicio declara, por referencia:

1. **Identidad y propósito**: su lugar en el catálogo (ESI-006/02) y el documento que lo norma.
2. **Contratos publicados**: sus interfaces de consumo con versión y estado N/N-1 (doc 13).
3. **Consumidores**: qué módulos y superficies lo usan — derivado mecánicamente del grafo del monorepo (doc 05 §2.4), no declarado a mano.
4. **Estado**: por ola de entrega (ESI-006/26) y ciclo del artefacto (doc 03).
5. **Salud**: sus señales operativas y hallazgos abiertos, con los instrumentos de ESI-009.
6. **Dueño**: el equipo de plataforma responsable.

## 3. Reglas del registro

1. **El servicio nuevo entra por su serie**: la creación de servicios compartidos sigue la regla de generalización (≥3 casos, ESI-006/03) y el proceso de decisión; el registro refleja — el "servicio compartido" creado por un módulo para sí mismo es un módulo disfrazado y la puerta de arquitectura lo detecta.
2. **La lista de consumidores es el radio de impacto**: cambiar un contrato de servicio exige recorrer sus consumidores (doc 05 §2.5); la lista mecánica hace el recorrido exacto, no estimado.
3. **La dirección es ley**: servicios no dependen de módulos (doc 05 §2.3); el registro expone cualquier inversión como defecto.
4. **La salud del servicio es salud de todos**: el servicio compartido degradado afecta a todos sus consumidores; su franja de intervención escala con prioridad de plataforma en la cadencia (ESI-009/20).

## Impacto sobre la implementación

La vista deriva del grafo del monorepo y los registros técnicos; sin mecanismo nuevo — la misma regla de fuentes mecánicas del doc 11.

## Dependencias

ESI-006/02-03, /26; ESI-009/18-20; docs 03, 05, 11, 13, 25.

## Riesgos

- Consumidores invisibles (uso de un servicio por caminos no declarados); mitigación: la derivación mecánica del grafo + la puerta de arquitectura que bloquea imports ilegales — el consumo invisible es imposible por construcción en el monorepo.

## Decisiones habilitadas

- Evolución de servicios con radio de impacto exacto.
- Priorización de plataforma informada por consumo real.

## Decisiones bloqueadas

- Prohibidos servicios compartidos fuera del catálogo de su serie.
- Prohibida la dependencia servicio→módulo.
- Prohibido declarar consumidores a mano contra la fuente mecánica.

## Reusable Pattern

Inventario de plataforma con consumidores derivados mecánicamente + radio exacto de impacto: el registro que hace del "¿a quién rompo?" una consulta, no una encuesta.

## Anti-Patterns

- El servicio "compartido" con un solo consumidor de siempre.
- Cambiar un contrato y avisar "a los que me acuerde".
- El módulo que copia la funcionalidad del servicio "para no depender".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-006 completo (el catálogo); ESI-009 (instrumentos de salud).
- **DGP que originará**: ninguno; indexa lo normado por ESI-006 y sus DGP.
- **ADR relacionados**: ADR de consumidores derivados del grafo.
- **Módulos que reutilizarán este patrón**: todos consumen servicios visibles en el registro; ninguno por caminos laterales.
