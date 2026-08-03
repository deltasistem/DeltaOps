# 06 — Pattern Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de patrones: el catálogo consolidado de los Reusable Patterns de todas las series — la biblioteca de soluciones ya decididas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

Cada documento del corpus declara su Reusable Pattern; este registro los consolida en un catálogo consultable — el paso 2 del flujo (doc 02) pregunta aquí antes de inventar. La regla constitutiva: **ante un problema, primero el patrón existente; el patrón nuevo exige que ninguno aplique**.

## 2. Las familias troncales (consolidación por referencia)

| Familia | Patrón | Instancias |
|---|---|---|
| **Contrato-precede** | Declarar antes de construir | Comandos (ESI-003), contrato de pantalla (ESI-008/05), contrato de entrega (ESI-009/05), DoR (ESI-009/21) |
| **Catálogo cerrado** | Conjunto finito + evolución por ≥3 casos | Layouts (ESI-008/07), diálogos (ESI-008/16), ramas (ESI-009/03), toggles (ESI-009/12), severidades (ESI-009/15) |
| **Vida gobernada** | Dueño + caducidad + visibilidad + final | Waivers (ESI-007/18), toggles, deuda (ESI-009/17), cuarentena (ESI-009/08), artefactos (doc 03) |
| **Checklist + revisión** | Criterios mecánicos + preguntas humanas + promoción | CA (ESI-004), CS (ESI-006), SC (ESI-007), EC/XR (ESI-008/25), QC/RC + DR (ESI-009/24-25, /06) |
| **Score por dimensiones** | Fuentes mecánicas + franjas con consecuencia + sin promedio anestésico | Scorecard (ESI-005/24), seguridad (ESI-007/20), UX X1-X8 (ESI-008/24), entrega E1-E8 (ESI-009/19) |
| **N/N-1** | Convivencia de versiones con ventana | Contratos (ESI-003), tokens (ESI-008/08), versiones (ESI-009/11), esquema (expandir-migrar-contraer) |
| **Citar, no repetir** | Referencia resoluble en vez de duplicación | Grafos de cierre, criterios (ESI-009/23), esta serie entera |
| **Puerta mecánica** | Binaria, rápida, sin apelación caso a caso | ESI-002/17 y sus familias (ESI-009/07) |
| **Evolución por evidencia** | Hipótesis medible + antes/después + poda | ESI-005…009/28, doc 28 |
| **Cierre de serie** | Checklist + grafo + DGP + evolución | Los cuatro últimos docs de cada serie |

## 3. Reglas del registro

1. **El registro apunta a la fuente**: cada instancia vive en su documento; aquí solo el índice y la familia — cero redefinición.
2. **Usar el patrón es citarlo**: el trabajo que aplica un patrón lo referencia (en el DGP, el PR o el diseño); la trazabilidad patrón→usos (doc 14) revela qué patrones viven y cuáles son letra muerta.
3. **El patrón nuevo entra por generalización real**: ≥3 casos que ningún patrón existente cubre, propuesto por el proceso (ESI-002/27) — la misma regla que los catálogos imponen a sus miembros.
4. **El anti-patrón también se consulta**: las secciones Anti-Patterns del corpus son la contracara indexada; el diseño que reproduce un anti-patrón documentado es hallazgo de revisión con cita.

## Impacto sobre la implementación

El registro se consulta en el encuadre (doc 02 §2.2) y en revisión; su materialización navegable acompaña al índice (doc 04).

## Dependencias

Todos los Reusable Patterns del corpus; ESI-002/27; docs 02, 04, 14, 22.

## Riesgos

- El registro como museo que nadie consulta; mitigación: el encuadre lo exige (DoR-04) y la revisión cita patrones y anti-patrones por código — el uso está cosido al flujo.

## Decisiones habilitadas

- Reutilización de soluciones decididas con costo de búsqueda mínimo.
- Detección de reinvenciones en revisión con cita directa.

## Decisiones bloqueadas

- Prohibido inventar solución nueva sin verificar el registro.
- Prohibido redefinir patrones dentro del registro.
- Prohibidos patrones nuevos sin ≥3 casos y decisión.

## Reusable Pattern

El registro de patrones como índice de familias con fuentes resolubles: el patrón de los patrones — consolidar sin absorber.

## Anti-Patterns

- Copiar el patrón al registro y dejar morir la fuente.
- El patrón "aspiracional" sin instancias reales.
- Resolver en cada módulo lo que la familia ya resolvió.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: los Reusable Patterns de ESI-002…009 (tabla §2).
- **DGP que originará**: ninguno; los DGP citan patrones desde aquí.
- **ADR relacionados**: ADR de registro de patrones con entrada por generalización.
- **Módulos que reutilizarán este patrón**: todos consultan antes de diseñar; la reinvención es hallazgo.
