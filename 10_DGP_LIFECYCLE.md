# 10 — DGP Lifecycle

> **DeltaOps — DGP-000 · v1.0** · El ciclo de vida del DGP: cómo nace, se especifica, se ejecuta y se cierra el proyecto ejecutable — el artefacto central de la fase de construcción.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. El DGP como artefacto

El DGP es un **proyecto ejecutable**: implementa una capacidad funcional completa derivada del programa maestro. No rediseña — implementa. Su anatomía obligatoria (fijada en la transición de fase): objetivo, alcance, dependencias, riesgos, criterios de aceptación, Definition of Done, evidencias, estrategia de pruebas, estrategia de rollback, estrategia de observabilidad, reutilización de patrones y referencias exactas a ETS y ESI.

## 2. El ciclo (instancia del ciclo de construcción, doc 03)

| Fase del DGP | Contenido | Regla |
|---|---|---|
| **Origen** | El DGP nace de un entregable de ola (doc 06) — nunca de la inspiración suelta; recibe identificador `DGP-NNN` secuencial y entrada en el registro (doc 12) | Sin entregable padre, no hay DGP |
| **Especificación** | Se escribe completo con su anatomía; referencias exactas verificables (el índice ESI-010/04 como fuente); patrones del registro citados (ESI-010/06) | La vaguedad se rechaza en QG-1 |
| **Aprobación** | Revisión contra QG-1 (doc 22): fidelidad al corpus, alcance acotado, dependencias reales, criterios verificables | Aprueba quien no lo escribió |
| **Ejecución** | Etapas 3-6 del ciclo (doc 03): preparación, construcción, verificación, liberación — con estados visibles (doc 11) | Todo por el flujo (CP-07) |
| **Cierre** | AG-1/AG-2 (doc 23): criterios demostrados en operación, evidencias archivadas, registros actualizados, retrospectiva, deuda registrada | El cierre es un acto con evidencia |
| **Sucesión** | Lo que el DGP dejó fuera de alcance conscientemente nace como DGP sucesor o entrada de deuda — nunca como promesa oral | La cadena de sucesión es rastro |

## 3. Reglas normativas

1. **Tamaño: capacidad completa pero mínima** — el DGP entrega algo operable de punta a punta, y lo más chico que cumpla eso; el DGP de un trimestre se parte en cadena de DGP (la lección de cambios chicos, ESI-009/05, a escala de proyecto).
2. **Una necesidad arquitectónica detiene, no desvía**: DGP → ADR → Revisión Arquitectónica → actualización del documento correspondiente → continuación. El DGP queda Bloqueado mientras tanto — jamás "resuelve por su cuenta y avisa".
3. **El DGP es inmutable tras aprobación en objetivo y criterios**: el cambio de alcance material es una re-aprobación registrada, no una edición — el DGP que muta en silencio invalida su propia evidencia.
4. **Todo DGP tiene exactamente un dueño humano** (ESI-010/16-17): responde por especificación, ejecución y cierre; la IA asiste bajo el flujo gobernado.
5. **El DGP cita, no repite**: su especificación referencia normas por código; el DGP que re-explica arquitectura está creando un corpus paralelo (violación de ESI-010/15 §2.6).

## Impacto sobre la implementación

La plantilla oficial de DGP (entregable de W0) materializa la anatomía; el registro (doc 12) gobierna identificadores, estados y sucesión.

## Dependencias

Docs 03, 06, 11-12, 22-23; ESI-002/27 (ADR); ESI-009/05; ESI-010/04, /06, /15-17.

## Riesgos

- DGP inflados hasta proyectos-trimestre que nunca cierran; mitigación: QG-1 verifica el tamaño (§3.1) y el registro expone la edad de los DGP abiertos — el DGP viejo es una alarma, no un hábito.

## Decisiones habilitadas

- Construcción entera organizada en proyectos auditables con anatomía uniforme.
- Cadenas de sucesión que convierten el recorte en plan, no en olvido.

## Decisiones bloqueadas

- Prohibidos DGP sin entregable padre en el programa.
- Prohibida la mutación silenciosa de alcance tras aprobación.
- Prohibido que un DGP resuelva necesidades arquitectónicas por su cuenta.

## Reusable Pattern

DGP = proyecto ejecutable con anatomía fija + origen en entregable + inmutabilidad post-aprobación + sucesión con rastro: la unidad de construcción gobernada.

## Anti-Patterns

- El DGP-paraguas que absorbe todo lo que aparece.
- "Aprovechando que estamos acá" como método de alcance.
- El DGP cerrado con criterios demostrados solo en staging.

## Knowledge Graph

- **ETS que consume**: los que cada DGP referencia exactamente.
- **ESI que consume**: ESI-002/27 (canal ADR); ESI-009/05 (tamaño); ESI-010/15-17 (documento, humanos, IA).
- **DGP que originará**: todos los funcionales instancian este ciclo.
- **ADR relacionados**: ADR de anatomía y ciclo del DGP.
- **Módulos que reutilizarán este patrón**: cada capacidad de cada módulo nace como DGP de este ciclo.
