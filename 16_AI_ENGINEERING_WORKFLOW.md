# 16 — AI Engineering Workflow

> **DeltaOps — ESI-010 · v1.0** · El flujo de ingeniería asistida por IA: la IA como constructor bajo el mismo estándar — el corpus como contexto, las compuertas como frontera y el humano como responsable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

DeltaOps se construye con asistencia intensiva de IA. La regla constitutiva: **la IA no tiene proceso propio** — recorre el mismo flujo (doc 02), pasa las mismas compuertas y deja el mismo rastro que cualquier actor. Lo que cambia es cómo se le da contexto y quién responde por su salida. (Este documento norma la IA que *construye* el producto; la IA *dentro* del producto ya está congelada: ESI-006/13, ESI-008/22.)

## 2. Reglas normativas

1. **El corpus es el contexto**: todo trabajo asistido parte del índice (doc 04) y los registros — la IA encuadra contra el estándar como cualquier ingeniero (doc 02 §2.2); la IA que improvisa arquitectura desde su conocimiento general en vez del corpus produce el defecto más caro: lo plausible-pero-ilegal.
2. **La declaración precede también aquí**: la tarea a la IA se formula con el encuadre hecho — normas aplicables, patrones del registro (doc 06), contratos que tocar (doc 13); la tarea vaga produce salida vaga con confianza alta.
3. **Toda salida de IA pasa las compuertas completas**: puertas (ESI-009/07), revisión humana (ESI-009/06) — DR-01 (¿respeta lo congelado?) es la pregunta crítica ante salida de IA; QC no distingue autor.
4. **Un humano responsable por cada cambio**: el PR asistido por IA tiene un dueño humano que entiende el cambio y responde por él — "lo generó la IA" no es una posición ante un hallazgo; la responsabilidad no se delega en herramientas (el principio de identidad real, ESI-009/02 §2.7).
5. **La IA no decide normas**: puede proponer y analizar; las decisiones van al proceso (ESI-002/27) con humanos decidiendo — el equivalente constructor del "propone-dispone-decide" de la IA de producto (ESI-008/22).
6. **Los límites de contexto se respetan**: la IA de construcción no recibe secretos, datos reales de clientes ni material fuera de su necesidad (ESI-007/16 aplicado al proceso de construcción); trabaja con datos sintéticos como todos (ESI-009/08 §3.6).
7. **El apalancamiento se dirige a donde rinde**: generación dentro de patrones establecidos, pruebas, migraciones mecánicas, exploración del corpus — la IA multiplica al estándar; en las fronteras del estándar (decisiones, diseños nuevos), asiste pero no sustituye el juicio.
8. **La calidad de la salida asistida se observa**: si los cambios asistidos concentran hallazgos o reversas (medible por el rastro, ESI-009/18), el encuadre o el uso se corrigen — el flujo asistido también se gobierna por evidencia.

## Impacto sobre la implementación

Las prácticas de contexto y encuadre se materializan en guías operativas del DGP de entrega; las compuertas no cambian — ya no distinguen autor.

## Dependencias

Docs 02, 04, 06, 13; ESI-002/27; ESI-006/13; ESI-007/16; ESI-008/22; ESI-009/02, /06-08, /18.

## Riesgos

- La velocidad de generación superando la capacidad de revisión humana (el cuello se muda a la revisión); mitigación: cambios chicos (ESI-009/05 §2.3) también para la IA, y el dueño humano que entiende — la salida que su dueño no puede explicar no se integra.

## Decisiones habilitadas

- Apalancamiento de IA a escala sin proceso paralelo ni zonas grises.
- Confianza en la salida asistida por las mismas compuertas de siempre.

## Decisiones bloqueadas

- Prohibido integrar salida de IA sin dueño humano que la entienda.
- Prohibida la IA decidiendo normas o saltando el proceso de decisión.
- Prohibidos secretos y datos reales en el contexto de construcción.

## Reusable Pattern

IA bajo el mismo flujo + corpus como contexto + dueño humano + compuertas ciegas al autor: el multiplicador gobernado — velocidad sin proceso paralelo.

## Anti-Patterns

- El PR de 3.000 líneas generadas que "seguro está bien".
- Preguntarle a la IA lo que el índice responde con autoridad.
- La arquitectura inventada por la IA porque nadie le dio el corpus.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/27; ESI-006/13 y ESI-008/22 (la IA de producto, deslindada); ESI-007/16; ESI-009 (compuertas).
- **DGP que originará**: guías de encuadre y contexto en el DGP de entrega.
- **ADR relacionados**: ADR de IA sin proceso paralelo; ADR de dueño humano obligatorio.
- **Módulos que reutilizarán este patrón**: todos se construyen con el mismo flujo asistido gobernado.
