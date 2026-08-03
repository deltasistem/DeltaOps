# 21 — Architecture Governance

> **DeltaOps — ESI-010 · v1.0** · El gobierno de la arquitectura: la arquitectura congelada como patrimonio — defendida por puertas, evolucionada por decisión y jamás erosionada por conveniencia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La arquitectura está decidida y congelada (ESI-001…008). Gobernarla no es rediseñarla: es **defenderla de la erosión y evolucionarla por el canal**. Este documento consolida cómo — sin comité de arquitectura como cuello de botella.

## 2. Reglas normativas

1. **La arquitectura se defiende en tres instancias**, todas ya normadas:
   - **Mecánica**: la puerta de arquitectura (fronteras, dependencias, capas — ESI-009/07) compara contra el mapa (doc 05) en cada PR.
   - **Humana**: DR-04 (acoplamiento fuera de contratos) y DR-01 (respeto a lo congelado) en toda revisión (ESI-009/06); revisión reforzada donde el riesgo lo exige.
   - **Programada**: la verificación de deriva (ESI-009/09 §2.1) caza la divergencia acumulada que el PR individual no muestra.
2. **La evolución entra por el proceso**: cambios de arquitectura son decisiones (ESI-002/27) con registro (doc 07), radio recorrido (docs 05, 26) y, cuando tocan contratos, N/N-1 con migración planificada — el mismo régimen que las series /28 ya establecieron por dominio.
3. **El arquitecto es un rol de proceso, no un aprobador universal**: diseña propuestas, cuida el mapa, entrena el encuadre — pero la defensa diaria es de las puertas y revisores; el arquitecto-embudo es el anti-patrón que las instancias §2.1 eliminan.
4. **La erosión chica es la grande en cuotas**: el import ilegal "temporal", la tabla ajena consultada "solo esta vez", el servicio que conoce un módulo "por ahora" — cada uno es hallazgo bloqueante precisamente porque individualmente parecen inofensivos; la arquitectura muere de mil excepciones razonables.
5. **La presión arquitectónica se registra**: cuando las normas congeladas fuerzan soluciones torcidas repetidamente (el workaround como patrón emergente), eso es evidencia de evolución necesaria — se lleva al proceso como propuesta con casos (doc 22), no se resuelve torciendo más.
6. **Lo experimental tiene su carril**: explorar alternativas arquitectónicas usa ramas de experimento (ESI-009/03 §2.5) y propuestas — jamás producción como laboratorio.

## Impacto sobre la implementación

Sin órgano nuevo: las tres instancias de defensa ya operan; el rol de arquitectura se materializa en el proceso de decisiones y el cuidado del mapa.

## Dependencias

ESI-001…008 (lo defendido); ESI-002/27; ESI-009/03, /06-07, /09; docs 05, 07, 22, 26.

## Riesgos

- La arquitectura convertida en dogma que impide responder al mercado; mitigación: el canal de evolución es real y con evidencia (§2.5 + doc 22) — congelado significa "se cambia por decisión", no "no se cambia jamás".

## Decisiones habilitadas

- Defensa arquitectónica escalable sin comité-embudo.
- Evolución de la arquitectura con memoria, radio y evidencia.

## Decisiones bloqueadas

- Prohibidas las excepciones arquitectónicas "temporales" sin waiver.
- Prohibido el arquitecto como aprobador manual de todo cambio.
- Prohibido experimentar arquitectura en producción.

## Reusable Pattern

Defensa en tres instancias (puerta, revisión, deriva) + evolución por decisión con evidencia: la arquitectura como patrimonio gobernado — ni dogma ni deriva.

## Anti-Patterns

- El diagrama oficial y el sistema real como dos países.
- La "excepción del cliente importante" que redefine la arquitectura.
- Rediseñar por moda lo que la evidencia no acusa.

## Knowledge Graph

- **ETS que consume**: ninguno directo; protege la capacidad de servirlos a largo plazo.
- **ESI que consume**: ESI-001…008 (el patrimonio); ESI-002/27; ESI-009 (las instancias).
- **DGP que originará**: ninguno; la defensa usa instrumentos existentes.
- **ADR relacionados**: ADR de defensa en tres instancias sin comité-embudo.
- **Módulos que reutilizarán este patrón**: todos viven bajo la misma defensa.
