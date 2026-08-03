# 27 — Official Roadmap

> **DeltaOps — ESI-010 · v1.0** · La hoja de ruta oficial: la secuencia de construcción consolidada desde las series — fases, hitos y las reglas que la mantienen honesta.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Las series ya decidieron los órdenes parciales (ESI-005/27, ESI-006/26, ESI-007/25, ESI-008/27, ESI-009/27); esta hoja de ruta los consolida en la **secuencia oficial única**, gobernada por los hitos de portafolio (doc 24). No es un cronograma con fechas: es un orden con compuertas — las fechas viven en la planificación de cadencia y cambian; el orden es normativo y estable.

## 2. Las fases consolidadas

| Fase | Contenido | Compuerta de salida |
|---|---|---|
| **0. Preparación** | Corpus completo; plataforma de entrega mínima; DGP de arranque; registros inicializados; equipos con dueños | **PR-01…10** (doc 23) |
| **1. Fundación** | Kernel y fundación backend (ESI-003); fundamento y chasis de experiencia (ESI-008/27 §1); identidad y suelo de seguridad (ESI-007/25); servicios compartidos de Ola 1 | Fundación ejercitable por un módulo real |
| **2. Fábrica validada** | El módulo de referencia (ESI-004) completo de idea a operación interna, ejercitando todas las plataformas | **Hito A: PF-01/02** |
| **3. Primer producto** | Los módulos del corazón del CMMS (el orden interno de ESI-005/27) sobre la fábrica validada; liberación y operación completas | **Hito B: PF-03/04** — primer tenant productivo |
| **4. Olas de expansión** | Las olas de módulos y servicios (ESI-006/26), cada una con marcos por demanda (ESI-008/27 §3.2) | **Hito C: PF-05/06** por ola |
| **5. Escala** | Cobertura comercial plena del catálogo de capacidades; operación a escala | **Hito D: PF-07/08** |

## 3. Reglas normativas

1. **El orden es normativo; las fechas, planificación**: adelantar una pieza saltando su compuerta es la única violación posible de esta hoja de ruta — retrasar, repartir o partir fases es gestión legítima.
2. **Cada fase entrega valor verificable**: la fase 2 entrega la fábrica probada; la 3, un producto vendible acotado — la hoja de ruta evita tanto el big-bang (todo al final) como el teatro de demos (nada operable nunca).
3. **La hoja de ruta se replanifica por evidencia, no por ansiedad**: los hitos fallidos producen plan (doc 24 §3.2); el alcance de cada fase se ajusta por decisión registrada — la hoja de ruta viva pero con memoria.
4. **Lo transversal madura dentro de las fases, no como fases propias**: seguridad, experiencia y entrega crecen por hitos dentro de cada fase (sus series /25-/27 lo norman) — el "proyecto de seguridad" separado del producto es el anti-patrón ya bloqueado.
5. **La presión comercial negocia alcance, jamás compuertas** (doc 24 §3.1): la respuesta honesta a "¿cuándo?" sale del estado real de fases e hitos en el tablero (doc 25).

## Impacto sobre la implementación

La hoja de ruta gobierna la planificación de cadencia desde el arranque; su estado vive en la vista de hitos del tablero.

## Dependencias

ESI-003; ESI-004; ESI-005/27; ESI-006/26; ESI-007/25; ESI-008/27; ESI-009/27; docs 23-25.

## Riesgos

- La hoja de ruta tratada como promesa de fechas hacia afuera; mitigación: es un orden con compuertas — la comunicación comercial usa el estado de hitos demostrado, no proyecciones del orden (la honestidad de ETS-012).

## Decisiones habilitadas

- Planificación de cadencia anclada a una secuencia estable.
- Conversaciones de alcance/fecha con el orden como invariante.

## Decisiones bloqueadas

- Prohibido saltar compuertas de fase por presión.
- Prohibidas fases transversales separadas del producto.
- Prohibido replanificar el orden sin decisión registrada.

## Reusable Pattern

Orden normativo + compuertas de hito + fechas como planificación: la hoja de ruta que promete secuencia demostrable, no calendarios deseados.

## Anti-Patterns

- El Gantt de dos años con fechas por trimestre y confianza decreciente.
- Construir la Ola 3 porque "el equipo estaba libre".
- Renegociar el orden cada vez que llega un prospecto grande.

## Knowledge Graph

- **ETS que consume**: ETS-012 (mercado y cadencia); ETS-002/003 (el corazón del producto de la fase 3).
- **ESI que consume**: los órdenes parciales de ESI-003…009 (consolidados).
- **DGP que originará**: ninguno; la planificación de cadencia la ejecuta.
- **ADR relacionados**: ADR de hoja de ruta como orden con compuertas.
- **Módulos que reutilizarán este patrón**: todos entran al portafolio por su fase y ola.
