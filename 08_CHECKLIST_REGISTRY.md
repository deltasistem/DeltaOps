# 08 — Checklist Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de checklists: la familia completa (CA, CS, SC, EC/XR, QC/RC, DoR/DoD, DR) con su alcance, su invocación y la regla de un verificador por criterio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La familia consolidada

| Checklist | Opera sobre | Cuándo se invoca | Fuente |
|---|---|---|---|
| **CA** | El módulo (anatomía, pruebas, integración al Kernel) | Al construir o cambiar módulos | ESI-004/25-26 |
| **CS** | El consumo de servicios compartidos | Al integrar un servicio de ESI-006 | ESI-006/24-25 |
| **SC** | Seguridad (permisos, datos, aislamiento, superficies) | Cambios que tocan seguridad | ESI-007/22-23 |
| **EC + XR** | La pantalla y la superficie | Pantallas nuevas o cambios de contrato de pantalla | ESI-008/25 |
| **DR-01…06** | El cambio, en revisión humana | Todo PR | ESI-009/06 |
| **QC-01…12** | El cambio, en la compuerta de integración | Todo PR | ESI-009/24 |
| **RC-01…10** | La versión, en la promoción | Toda liberación | ESI-009/25 |
| **DoR-01…08** | El trabajo, antes de empezar | Entrada al ciclo | ESI-009/21 |
| **DoD-01…10** | El trabajo, para declararlo terminado | Salida del ciclo | ESI-009/22 |

## 2. Reglas de integración

1. **QC es el coordinador**: en el cambio, QC-06 invoca a las listas de dominio (CA/CS/SC/EC) solo cuando el dominio se toca (ESI-009/24 §2) — la familia opera como sistema, no como pila.
2. **Un criterio, un verificador**: ningún criterio se verifica dos veces por listas distintas; la duplicación entre listas es defecto del registro y se resuelve por decisión (la regla de ESI-009/24 §3.1 elevada a familia).
3. **Lo mecánico a puerta, lo humano a revisión**: cada lista declara qué criterios son puertas (ESI-009/07) y cuáles juicio; la promoción de hallazgo repetido a puerta atraviesa toda la familia (el motor común).
4. **Waivers por el régimen único** (ESI-007/18); los no-waiveables ya declarados por cada fuente (seguridad, aislamiento, accesibilidad, marca de IA) se respetan sin excepción.
5. **La familia evoluciona por sus fuentes**: criterios nuevos entran por la serie dueña con evidencia; este registro solo refleja — la lista que crece aquí sin fuente es ilegal.

## Impacto sobre la implementación

El registro se materializa como la vista consolidada en la plataforma de entrega (plantillas de PR y compuertas ya normadas); la invocación por dominio es configuración del DGP de entrega.

## Dependencias

ESI-004/25-26; ESI-006/24-25; ESI-007/18, /22-23; ESI-008/25; ESI-009/06, /21-22, /24-25; docs 02, 22.

## Riesgos

- La percepción de "checklist infinito" al ver la familia junta; mitigación: la invocación por dominio y la proporcionalidad ya normadas — el cambio típico ve QC + DR y nada más; la familia completa solo aparece donde el riesgo la exige.

## Decisiones habilitadas

- Vista única de qué se verifica, dónde y por quién.
- Detección de solapamientos y huecos entre listas.

## Decisiones bloqueadas

- Prohibido crear checklists fuera de las series dueñas.
- Prohibida la verificación duplicada del mismo criterio.
- Prohibido invocar listas de dominio donde el dominio no se toca.

## Reusable Pattern

Familia de checklists con coordinador + un verificador por criterio + invocación por dominio: las listas como sistema integrado, no como sedimento.

## Anti-Patterns

- Pegar las cinco listas completas a todo PR "por seguridad".
- El criterio duplicado que se contesta distinto en dos listas.
- La lista local de equipo que "resume" (y muta) las oficiales.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: las listas de ESI-004, ESI-006, ESI-007, ESI-008, ESI-009 (tabla §1).
- **DGP que originará**: ninguno; la configuración vive en el DGP de entrega ya normado.
- **ADR relacionados**: ADR de familia de checklists con coordinador.
- **Módulos que reutilizarán este patrón**: todos verifican con la misma familia; ninguno lista propia.
