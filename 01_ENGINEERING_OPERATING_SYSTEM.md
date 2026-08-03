# 01 — Engineering Operating System

> **DeltaOps — ESI-010 · v1.0** · El sistema operativo de ingeniería: la integración de todo lo congelado en un único sistema de operación — de la idea a producción, sin arquitectura nueva.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

ETS-001…012 definieron el producto; el Charter, los principios; ESI-001…003, la plataforma técnica; ESI-004…005, la fábrica de módulos; ESI-006, los servicios compartidos; ESI-007, la seguridad; ESI-008, la experiencia; ESI-009, la entrega. **ESI-010 no crea nada nuevo: integra.** Es el sistema operativo que hace operar juntas a todas las piezas congeladas — el índice ejecutable de la ingeniería, escrito solo con referencias.

## 2. Principios de integración

1. **Todo está ya decidido; aquí se orquesta**: cuando este sistema parece decir algo nuevo, la lectura correcta es la referencia a la norma congelada que lo dijo primero; el conflicto aparente se resuelve siempre a favor de la fuente.
2. **Referencias, no duplicación**: el régimen "citar, no repetir" (ESI-006/27) es la ley constitutiva de esta serie; ningún documento de ESI-010 redefine lo que cita.
3. **Un solo sistema para humanos e IA**: las mismas normas, puertas, checklists y registros gobiernan el trabajo humano (doc 17) y el asistido por IA (doc 16); no hay un proceso paralelo "para la IA".
4. **El sistema es navegable por construcción**: registros (docs 06-13), índice (doc 04), trazabilidad (doc 14) y grafo global (doc 26) hacen que cualquier pregunta de ingeniería tenga una ruta de respuesta — la ignorancia del estándar deja de ser una excusa estructural.
5. **El sistema se gobierna con sus propios instrumentos**: scores (doc 09), checklists (doc 08) y evolución por evidencia (doc 28) — los mismos que impone a todo lo demás.

## 3. Anatomía del sistema

| Plano | Qué contiene | Documentos |
|---|---|---|
| **Flujo** | El camino idea→producción y el ciclo de vida de los artefactos | 02-03 |
| **Conocimiento** | Índice, mapa de dependencias y registros consolidados | 04-13 |
| **Trazabilidad** | El hilo requisito→norma→cambio→liberación y la vida de los documentos | 14-15 |
| **Trabajo** | Flujos de IA y humanos, y su colaboración | 16-18 |
| **Gobierno** | Ingeniería, calidad y arquitectura como regímenes integrados | 19-21 |
| **Preparación** | Evolución del conocimiento, readiness de proyecto y portafolio, tablero | 22-25 |
| **Cierre** | Grafo global, hoja de ruta oficial y evolución del sistema | 26-28 |

## 4. Jerarquía normativa (recordatorio integrador)

ETS (qué) → Charter (principios) → ESI (cómo, por dominio) → DGP (materialización con herramientas) → trabajo diario (bajo ESI-009). Ante conflicto, gana el nivel superior; los conflictos reales entre pares van al proceso de decisión (ESI-002/27). Este sistema no altera la jerarquía: la hace operable.

## Impacto sobre la implementación

Ninguna pieza nueva de software; los equipos operan el sistema desde el primer día usando los instrumentos ya normados por las series citadas.

## Dependencias

Todas las series congeladas (ETS-001…012, Charter, ESI-001…009); en particular ESI-002/27 y ESI-006/27 (los regímenes que hacen posible integrar por referencia).

## Riesgos

- El sistema operativo leído como una capa más de burocracia sobre las series; mitigación: no añade obligaciones nuevas — consolida las existentes y las hace navegables; su score (doc 09) hereda la poda de ceremonia de ESI-009/28.

## Decisiones habilitadas

- Operación integral de la ingeniería con un mapa único.
- Incorporación de personas y agentes con una sola puerta de entrada al estándar.

## Decisiones bloqueadas

- Prohibido crear normas nuevas desde esta serie (solo integra).
- Prohibido resolver conflictos contra la jerarquía normativa.
- Prohibido duplicar contenido de las series en vez de citarlo.

## Reusable Pattern

El sistema operativo como integración pura por referencias sobre un corpus congelado: la capa que orquesta sin legislar.

## Anti-Patterns

- El "documento maestro" que reescribe las series y deriva de ellas.
- Tratar ESI-010 como fuente normativa por encima de sus referencias.
- El proceso paralelo no oficial "más práctico" conviviendo con el sistema.

## Knowledge Graph

- **ETS que consume**: ETS-001…012 (el "qué" que todo el sistema sirve).
- **ESI que consume**: ESI-001…009 completos; ESI-002/27 y ESI-006/27 como regímenes constitutivos.
- **DGP que originará**: ninguno (esta serie no genera DGP); ordena los ya normados.
- **ADR relacionados**: los consolidados en el registro de decisiones (doc 07).
- **Módulos que reutilizarán este patrón**: todos operan dentro del sistema; ninguno por fuera.
