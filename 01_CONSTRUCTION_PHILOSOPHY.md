# 01 — Construction Philosophy

> **DeltaOps — DGP-000 · v1.0** · La filosofía de construcción: construir exactamente lo decidido, en el orden decidido, con la evidencia como única moneda de avance.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición del programa

DGP-000 es la máxima autoridad de **planificación** de la construcción — y solo de planificación. No decide arquitectura (congelada en ETS/Charter/ESI), no redefine principios, no genera DGP funcionales: gobierna **cuándo, en qué orden y bajo qué compuertas** se construye lo ya diseñado. Todo DGP futuro deriva obligatoriamente de este programa.

## 2. La filosofía en cinco tesis

1. **El diseño terminó; la fidelidad empieza.** La creatividad de la fase de construcción no está en inventar sino en materializar con exactitud: el corpus (ETS→Charter→ESI) es el plano y el código es su ejecución literal. La "mejora" no solicitada al plano es el defecto más caro de esta fase — lo plausible-pero-ilegal (ESI-010/16 §2.1) aplicado al constructor.
2. **El avance se mide en incrementos operables, no en actividad.** Cada DGP entrega una capacidad funcional completa que atraviesa el flujo entero (ESI-010/02) hasta operación verificada. El programa no reconoce "80% terminado": reconoce estados de DGP (doc 11) con evidencia (docs 22-23).
3. **La fábrica se construye antes que los productos.** El orden consolidado por la hoja de ruta oficial (ESI-010/27) rige: plataforma de entrega → fundación (Kernel, chasis, suelo de seguridad) → módulo de referencia que valida la fábrica → producto → olas. Construir módulos sobre fábrica sin validar es fabricar retrabajo al por mayor.
4. **La velocidad nace del orden, no del atajo.** Las compuertas (docs 22-23), las puertas mecánicas (ESI-009/07) y las ventanas N/N-1 no son fricción: son lo que permite construir en paralelo sin colisión (doc 09) y liberar sin miedo (doc 13). El atajo que salta una compuerta hipoteca la velocidad de todos los DGP siguientes.
5. **La evidencia gobierna la replanificación.** El programa es estable en orden y vivo en calendario: los hitos fallidos producen plan (ESI-010/24 §3.2), la fricción repetida produce propuesta (ESI-010/28 §2.5), y todo ajuste al programa entra por decisión registrada (ESI-010 doc 07) — jamás por deriva silenciosa.

## 3. Lo que este programa NO es

- No es un cronograma con fechas prometidas: es un orden con compuertas; las fechas viven en la planificación de cadencia (ESI-009/20).
- No es una re-arquitectura: toda necesidad arquitectónica emergente sigue DGP → ADR → Revisión Arquitectónica → actualización → continuación. Nunca al revés.
- No es un sustituto de los DGP funcionales: cada uno traerá su objetivo, alcance, criterios, DoD, evidencias y estrategias propias, derivados de aquí.

## Impacto sobre la implementación

Toda la fase de construcción se planifica, ejecuta y mide bajo este programa; ningún DGP funcional nace fuera de él.

## Dependencias

ETS-001…012; Charter; ESI-001…010 (autoridad congelada); ESI-010/27 (orden consolidado); docs 02-28 de este programa.

## Riesgos

- El programa tratado como formalidad mientras la construcción real improvisa; mitigación: el registro de construcción (doc 12) y las compuertas hacen que el DGP fuera del programa no tenga vía de ejecución.

## Decisiones habilitadas

- Planificación completa de la construcción con autoridad única.
- Derivación obligatoria y trazable de todos los DGP futuros.

## Decisiones bloqueadas

- Prohibido modificar decisiones de ETS/Charter/ESI desde la construcción.
- Prohibidos DGP funcionales fuera de este programa.
- Prohibido reconocer avance sin incremento operable con evidencia.

## Reusable Pattern

Programa maestro = orden normativo + compuertas + evidencia como moneda: la planificación como autoridad derivada del corpus, no como creatividad paralela.

## Anti-Patterns

- "Mejorar" el diseño congelado mientras se implementa.
- El avance reportado en porcentajes sin incremento operable.
- Replanificar por ansiedad comercial en vez de por evidencia.

## Knowledge Graph

- **ETS que consume**: todos (el negocio a materializar).
- **ESI que consume**: ESI-010/27 (orden); ESI-010/23-24 (compuertas PR/PF); ESI-009 (flujo de entrega).
- **DGP que originará**: todos los DGP funcionales derivan de este programa.
- **ADR relacionados**: ADR de adopción del programa maestro como autoridad de planificación.
- **Módulos que reutilizarán este patrón**: todos se construyen bajo esta filosofía.
