# 02 — Construction Principles

> **DeltaOps — DGP-000 · v1.0** · Los principios de construcción CP-01…CP-12: las reglas operativas que todo DGP funcional hereda por defecto.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Los principios (CP-01…CP-12)

| # | Principio | Fundamento |
|---|---|---|
| **CP-01** | **Fidelidad al corpus**: se construye exactamente lo normado; la duda se resuelve consultando el índice (ESI-010/04), no interpretando | Jerarquía ETS→Charter→ESI→DGP→código |
| **CP-02** | **El contrato precede al código**: esquema, contrato de API, criterios y pruebas se declaran antes de implementar | ESI-003; ESI-009/23; patrón troncal ESI-010/06 |
| **CP-03** | **Incremento completo o nada**: cada DGP entrega capacidad operable de punta a punta (esquema→lógica→contrato→pantalla→observabilidad); prohibidas las capas huérfanas ("todas las tablas primero") | ESI-010/02; doc 03 |
| **CP-04** | **Vertical antes que horizontal**: se construye una rebanada funcional completa y se generaliza después con casos reales (≥3, ESI-006/03) | Patrón de generalización |
| **CP-05** | **La fábrica valida con producción interna**: nada se declara "listo" sin haber atravesado liberación y operación reales, aunque el tenant sea interno | ESI-010/24 hito A |
| **CP-06** | **Paralelo solo con fronteras**: dos DGP corren en paralelo únicamente si sus superficies de contacto están contratadas (doc 09); la colisión prevista es defecto de planificación | ESI-005/04; ESI-010/05 |
| **CP-07** | **Todo cambio por el flujo**: rama→PR con contrato→puertas→revisión→tren de liberación; sin excepciones por fase temprana — la disciplina se instala desde el primer commit | ESI-009 completo |
| **CP-08** | **Datos sintéticos, seed asimétrico**: la construcción jamás usa datos reales; los entornos se pueblan por el régimen congelado | ESI-009/08 §3.6; seed asimétrico |
| **CP-09** | **Lo no-waiveable es no-waiveable desde el día uno**: aislamiento multi-tenant, murallas RLS, idempotencia, las cuatro verdades — sin período de gracia | ESI-007 |
| **CP-10** | **La deuda nace registrada**: todo recorte consciente entra al registro de deuda con dueño y plan (ESI-009/16); el recorte silencioso es el hallazgo, no el recorte | ESI-009/16-17 |
| **CP-11** | **IA al máximo apalancamiento legal**: generación dentro de patrones, pruebas, migraciones mecánicas — siempre bajo el flujo asistido gobernado | ESI-010/16 |
| **CP-12** | **Cada DGP deja la fábrica mejor**: hallazgos promovidos a puertas, patrones instanciados registrados, fricción reportada — construir y afilar en el mismo movimiento | ESI-009/07 §3.6; ESI-010/22 |

## 2. Régimen de los principios

1. Los principios son herencia obligatoria: cada DGP funcional los asume sin re-declararlos; su sección de riesgos cubre solo lo específico.
2. El conflicto entre un principio y una situación concreta escala por el canal (DGP → ADR → revisión); el principio no se suspende localmente.
3. Los principios evolucionan por evidencia de construcción mediante decisión registrada (doc 28) — nunca por costumbre.

## Impacto sobre la implementación

CP-01…12 se verifican en la compuerta de aceptación de cada DGP (doc 23); la plantilla de DGP los referencia como base heredada.

## Dependencias

Doc 01 (filosofía); ESI-003; ESI-005/04; ESI-006/03; ESI-007; ESI-009; ESI-010/02, /04-06, /16, /22.

## Riesgos

- Principios recitados pero no aplicados; mitigación: cada CP tiene verificador concreto en las compuertas (docs 22-23) — el principio sin verificador no habría entrado a la lista.

## Decisiones habilitadas

- Plantilla de DGP con base normativa heredada y compacta.
- Discusiones de construcción ancladas a CP numerados, no a opiniones.

## Decisiones bloqueadas

- Prohibida la suspensión local de principios sin ADR.
- Prohibidas capas horizontales huérfanas como estrategia.
- Prohibido el arranque "flexible" que instala la disciplina después.

## Reusable Pattern

Principios numerados con verificador + herencia obligatoria + evolución por decisión: la base normativa que cada DGP hereda en una línea.

## Anti-Patterns

- "Primero construimos todas las tablas y luego vemos".
- El período de gracia de seguridad "mientras es interno".
- El DGP que redefine principios en su sección de contexto.

## Knowledge Graph

- **ETS que consume**: ninguno directo; sirven a todos.
- **ESI que consume**: ESI-003, ESI-005…010 (fundamentos citados por CP).
- **DGP que originará**: todos heredan CP-01…12.
- **ADR relacionados**: ADR de principios de construcción heredables.
- **Módulos que reutilizarán este patrón**: todos se construyen bajo los mismos CP.
