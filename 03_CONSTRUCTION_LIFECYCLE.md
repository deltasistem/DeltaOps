# 03 — Construction Lifecycle

> **DeltaOps — DGP-000 · v1.0** · El ciclo de vida de construcción: las siete etapas que todo incremento recorre — del DGP autorizado a la capacidad operada y aprendida.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

El flujo de ingeniería ya existe (ESI-010/02, nueve etapas); este ciclo lo **instancia para la fase de construcción**: cómo un DGP funcional recorre de autorización a cierre. No crea etapas nuevas — nombra el recorrido del constructor.

## 2. Las siete etapas del incremento

| Etapa | Contenido | Compuerta de salida |
|---|---|---|
| **1. Autorización** | El DGP existe en el programa (doc 04), sus dependencias están satisfechas (doc 16) y hay equipo con capacidad real | Entrada al registro (doc 12) en estado Autorizado |
| **2. Especificación** | El DGP se escribe completo: objetivo, alcance, criterios, DoD, evidencias, estrategias de pruebas/rollback/observabilidad, referencias exactas a ETS/ESI | Revisión del DGP aprobada (doc 22, QG-1) |
| **3. Preparación** | Contratos declarados (CP-02): esquema, APIs, eventos, pantallas con contrato de ocho rubros; pruebas de aceptación esqueletizadas | QG-2: contratos registrados (ESI-010/13) |
| **4. Construcción** | Implementación por el flujo (CP-07): ramas cortas, PR con contrato, puertas, revisión; IA bajo ESI-010/16 | QG-3: todos los PR integrados con compuertas verdes |
| **5. Verificación** | La cadena de entornos completa: pruebas de aceptación en verde, migraciones ensayadas, RC formado | QG-4: RC aprobado (ESI-009/25) |
| **6. Liberación y operación** | Tren de liberación, exposición gradual, señales confirmadas en producción (interna o real según fase) | AG-1: criterios de aceptación demostrados en operación (doc 23) |
| **7. Cierre y aprendizaje** | Evidencias archivadas, deuda registrada, hallazgos promovidos, retrospectiva, registros actualizados (capacidades, módulos, contratos) | AG-2: DGP en estado Cerrado con evidencia completa |

## 3. Reglas del ciclo

1. **Las etapas no se saltan ni se solapan hacia atrás**: construir sin especificación aprobada o liberar sin verificación es la violación estructural del programa; el estado del DGP (doc 11) refleja la etapa real.
2. **El ciclo es fractal en tamaño, no en rigor**: el DGP chico recorre las mismas etapas con artefactos proporcionales (la proporcionalidad de ESI-009); ninguna etapa se vuelve ritual vacío ni se omite.
3. **El bloqueo es un estado visible, no una espera silenciosa**: el DGP detenido por dependencia, decisión pendiente o hallazgo entra en Bloqueado (doc 11) con causa registrada — el programa gobierna lo que ve.
4. **El cierre es un acto, no un desvanecimiento**: el DGP que dejó de avanzar sin cerrar es un zombi del programa; el registro (doc 12) los expone y la cadencia los resuelve (cerrar, replanificar o cancelar con decisión).

## Impacto sobre la implementación

Cada DGP funcional estructura su ejecución por estas etapas; los estados del registro derivan de las compuertas superadas.

## Dependencias

ESI-009/25; ESI-010/02, /13, /16; docs 04, 11-12, 16, 22-23.

## Riesgos

- El ciclo degradándose a cascada pesada por DGP demasiado grandes; mitigación: el tamaño del DGP se acota en el programa (docs 04-06) — capacidad funcional completa pero mínima; lo grande se parte en DGP encadenados.

## Decisiones habilitadas

- Ejecución uniforme y auditable de todos los DGP.
- Estados de programa derivados de compuertas, no de reportes.

## Decisiones bloqueadas

- Prohibido construir sin DGP especificado y aprobado.
- Prohibido liberar sin verificación completa de la cadena.
- Prohibidos DGP zombis sin estado ni resolución.

## Reusable Pattern

Siete etapas con compuerta de salida + estados derivados + cierre como acto: el ciclo que hace del avance un hecho verificable.

## Anti-Patterns

- "Vamos codeando mientras se escribe el DGP".
- El DGP eternamente "al 90%".
- Cerrar el DGP sin actualizar los registros que lo reflejan.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009 (flujo de entrega); ESI-010/02 (flujo integrado, instanciado aquí).
- **DGP que originará**: todos los funcionales recorren este ciclo.
- **ADR relacionados**: ADR de ciclo de construcción en siete etapas.
- **Módulos que reutilizarán este patrón**: cada capacidad de cada módulo se construye por este ciclo.
