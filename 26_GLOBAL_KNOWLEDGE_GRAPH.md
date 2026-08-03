# 26 — Global Knowledge Graph

> **DeltaOps — ESI-010 · v1.0** · El grafo global de conocimiento: la unión de todos los grafos de cierre en una topología única — nodos, aristas y las reglas de navegación del corpus completo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Cada serie cerró con su grafo (ESI-006/27, ESI-007/24, ESI-008/26, ESI-009/26; esta serie cierra el conjunto). El grafo global no los reemplaza: **los enlaza** — la topología completa del conocimiento de DeltaOps, navegable desde el índice (doc 04).

## 2. La topología

**Nodos**: documentos normativos (ETS, Charter, ESI), decisiones (doc 07), DGP, registros (docs 06-13), y los artefactos indexados por ellos (módulos, servicios, contratos, capacidades, patrones).

**Aristas** (todas ya existentes por régimen):
| Arista | Significado | Origen |
|---|---|---|
| *cita* | Un documento invoca una norma por código | "Citar, no repetir" |
| *decide* | Un ADR fundamenta una norma o cambio | ESI-002/27 |
| *deriva* | Un DGP materializa normas | Series /27 |
| *implementa* | Un módulo/servicio realiza una capacidad o contrato | Docs 10-13 |
| *consume* | Un actor depende de un contrato o servicio | Docs 5, 12-13 (mecánica) |
| *sucede* | Una decisión o versión reemplaza a otra | Docs 07; ESI-009/11 |
| *instancia* | Un uso concreto aplica un patrón | Doc 06 §3.2 |

## 3. Reglas de navegación global

1. **Toda cita es resoluble o es defecto**: la regla local de cada grafo, elevada a ley global; la cita rota se repara con la prioridad de un enlace roto en producción documental.
2. **El radio se calcula por aristas**: el impacto de cambiar un nodo = sus aristas entrantes recorridas transitivamente; los nodos de radio total ya identificados (contrato de pantalla, contrato de entrega, DoD, tokens, el mapa de capas) se cambian con el máximo cuidado — el grafo hace el costo visible antes de decidir.
3. **El grafo crece por las series y decisiones, jamás a mano**: cada serie nueva trae su grafo de cierre y se enlaza; cada decisión añade sus aristas al nacer (doc 07) — el grafo global es la suma gobernada, no un dibujo mantenido aparte.
4. **La navegación tiene dos puertas**: el índice (doc 04) para preguntas, el grafo para impactos y relaciones; ambos son el mismo corpus visto de frente y de perfil.

## Impacto sobre la implementación

Instrumento documental; su materialización navegable acompaña al índice en el tablero documental — sin software nuevo obligatorio.

## Dependencias

Los grafos de cierre de ESI-006…010; ESI-002/27; docs 04-13.

## Riesgos

- El grafo global como maqueta desactualizada; mitigación: crece solo por los regímenes existentes (§3.3) y las citas rotas son defectos con dueño — el mantenimiento está cosido a los procesos, no a la voluntad.

## Decisiones habilitadas

- Análisis de impacto de cualquier cambio normativo con recorrido exacto.
- Visión de conjunto del corpus para gobierno y onboarding.

## Decisiones bloqueadas

- Prohibido mantener el grafo a mano contra sus fuentes.
- Prohibidas aristas sin régimen de origen.
- Prohibido cambiar nodos de radio total sin recorrer citantes.

## Reusable Pattern

Grafo global = unión de grafos de serie + aristas por régimen + radio calculable: la topología del conocimiento como suma gobernada de cierres locales.

## Anti-Patterns

- El diagrama mural del corpus pintado una vez y venerado.
- Calcular impactos por intuición teniendo el grafo.
- Aristas decorativas que ningún régimen respalda.

## Knowledge Graph

- **ETS que consume**: ETS-001…012 (nodos raíz).
- **ESI que consume**: ESI-001…009 y sus grafos de cierre (subgrafos enlazados).
- **DGP que originará**: ninguno; indexa los existentes como nodos.
- **ADR relacionados**: ADR de grafo global por unión gobernada.
- **Módulos que reutilizarán este patrón**: todos son nodos; sus relaciones son aristas mecánicas.
