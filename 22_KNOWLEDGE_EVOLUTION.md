# 22 — Knowledge Evolution

> **DeltaOps — ESI-010 · v1.0** · La evolución del conocimiento: cómo el corpus aprende — huecos registrados, lecciones promovidas y el saber tácito convertido en norma navegable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El corpus congelado no es un museo: es un organismo con canales de aprendizaje ya construidos. Este documento consolida esos canales — cómo entra conocimiento nuevo, cómo se corrige el existente y cómo se evita la pérdida.

## 2. Los canales de entrada (consolidación)

| Canal | Qué aporta | Fuente |
|---|---|---|
| **Promoción de hallazgos** | Hallazgo repetido → puerta/prueba/criterio | ESI-009/07 §3.6, /15 §2.8; doc 08 |
| **Retrospectivas** | Barreras faltantes, causas, acciones | ESI-009/15, /20 |
| **Presión de evolución** | Workarounds repetidos → propuesta con casos | Doc 21 §2.5; series /28 |
| **Huecos del índice** | Preguntas sin ruta → entrada nueva | Doc 04 §2.7 |
| **Generalización** | ≥3 casos → patrón/servicio/layout nuevo | ESI-006/03; doc 06 §3.3 |
| **Evidencia de scores** | Dimensiones enfermas → hipótesis de cambio | Doc 09; series /28 |
| **Decisiones** | Nuevo saber institucional con memoria | ESI-002/27; doc 07 |

## 3. Reglas normativas

1. **Lo que se repite se escribe**: la explicación dada dos veces es candidata a documento; la tercera vez es un defecto del corpus — el conocimiento oral es el que se pierde con la persona (el riesgo registrable del doc 18 §2.5).
2. **El conocimiento entra por su canal, con su régimen**: normas por decisión, calibraciones por DGP, patrones por generalización, documentación operativa por uso (doc 15) — el canal define el rigor; el bypass ("lo agrego al wiki y ya") produce el corpus paralelo prohibido.
3. **La corrección es aprendizaje de primera clase**: descubrir que una norma congelada está mal es un aporte, no una herejía — viaja por el proceso con evidencia (doc 15 §2.4); la casa premia el reporte del hueco sobre el silencio cómodo.
4. **El olvido se combate con estructura, no con memoria**: registros derivados de fuentes mecánicas, decisiones con sucesión explícita, grafos con citas resolubles — el sistema recuerda por construcción; la persona que "se acuerda de por qué" es un punto único de falla documental.
5. **El aprendizaje se mide por sus efectos**: puertas promovidas, huecos cerrados, decisiones con evidencia, preguntas resueltas por ruta — no por documentos producidos; el corpus que crece sin que el retrabajo baje está engordando, no aprendiendo.
6. **Lo aprendido se propaga por defecto**: la lección de un módulo (un incidente, un patrón torcido) se evalúa contra todos los análogos — la retrospectiva pregunta "¿dónde más aplica?" como paso estándar; aprender de a uno lo que puede aprenderse de a todos es pagar el precio n veces.

## Impacto sobre la implementación

Sin mecanismo nuevo: los canales existen; este documento los nombra como sistema y fija las reglas de uso transversales.

## Dependencias

ESI-002/27; ESI-006/03; ESI-009/07, /15, /20; docs 04, 06-09, 15, 18, 21.

## Riesgos

- El aprendizaje capturado como texto que nadie reencuentra; mitigación: todo aporte entra indexado (doc 04) y citado desde su contexto de uso — el conocimiento sin ruta de llegada no existe (la regla del índice).

## Decisiones habilitadas

- El corpus mejorando con cadencia medible, no por héroes documentadores.
- Resiliencia ante rotación de personas sin pérdida institucional.

## Decisiones bloqueadas

- Prohibido el conocimiento operativo crítico solo-oral.
- Prohibida la entrada de conocimiento por fuera de su canal.
- Prohibido corregir normas por erosión en vez de por proceso.

## Reusable Pattern

Canales de entrada con régimen propio + lo repetido se escribe + medición por efectos: el corpus como organismo que aprende — estructura contra el olvido.

## Anti-Patterns

- El post-mortem brillante que nadie vuelve a leer.
- El experto irremplazable como estrategia de documentación.
- Documentar todo por si acaso (el corpus obeso e innavegable).

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: los canales de ESI-002, ESI-006, ESI-009 (tabla §2).
- **DGP que originará**: ninguno; los canales viven en sus regímenes.
- **ADR relacionados**: ADR de evolución del conocimiento por canales.
- **Módulos que reutilizarán este patrón**: todos aprenden y aportan por los mismos canales.
