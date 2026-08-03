# 27 — DeltaOps Roadmap 1.0

> **DeltaOps — DGP-000 · v1.0** · El roadmap oficial 1.0: la síntesis ejecutable del programa — olas, hitos, releases y la secuencia inmediata de DGP con la que comienza la construcción real.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. La línea maestra

```
W0 Plataforma de entrega ──► M0 Programa listo (PR-01…10)
W1 Fundación ──────────────► M1 Fundación ejercitable
W2 Módulo de referencia ───► M2 Fábrica validada (Hito A)
W3 Corazón CMMS ───────────► M3 Primer tenant productivo (Hito B) ═► R1.0
W4 Expansión operativa ──┐
                         ├─► M4 / M5 (PF-05/06 por ola) ═► releases mayores
W5 Expansión analítica ──┘      (solape legal, doc 07)
W6 Escala ─────────────────► M6 Escala comercial (Hito D)
```

El orden es normativo (ESI-010/27); las fechas viven en la cadencia y se revisan por evidencia (doc 15 §3.1). **R1.0 = M3**: el primer release de programa es el primer tenant productivo demostrado.

## 2. La secuencia inmediata de DGP

Los primeros DGP funcionales del programa, derivados de los entregables de W0 (doc 06) y ordenados por la matriz (doc 16):

| Orden | DGP | Contenido | Camino crítico |
|---|---|---|---|
| 1 | **DGP-001 — Fábrica mínima** | Monorepo, pipeline de PR con puertas, plantillas, registro de construcción operativo | Sí |
| 2 | **DGP-002 — Cadena de entornos y tren** | Entornos con seed asimétrico, tren de liberación mínimo, registro de releases | Sí |
| 3 | **DGP-003 — Tablero mínimo** | Métricas derivándose, vista de programa (doc 25) | No (casi-crítico) |
| 4+ | **DGP del Kernel (W1)** | Partición en cadena definida al especificarse, respetando doc 16 | Sí |

DGP-001 es el próximo documento a generar cuando se instruya: el primer proyecto ejecutable de DeltaOps.

## 3. Reglas del roadmap

1. **El roadmap se lee con el tablero, no contra la memoria**: su estado vivo es la vista de hitos (doc 25); este documento fija la estructura — el avance es dato derivado.
2. **Cambiarlo es decisión de radio máximo** (doc 28): composición de olas, orden de hitos o definición de releases mayores solo cambian con decisión registrada y recálculo del camino crítico.
3. **Hacia afuera se comunica lo demostrado** (doc 15 §3.5): el roadmap externo es el interno filtrado por evidencia — nunca una versión embellecida paralela.

## Impacto sobre la implementación

Este roadmap gobierna la cola de autorización desde el primer día; DGP-001 arranca la construcción real al ser instruido.

## Dependencias

ESI-010/27 (orden congelado); docs 04-08, 13, 15-16, 24-25, 28.

## Riesgos

- El roadmap tratado como promesa de calendario; mitigación: promete orden y compuertas — la conversación de fechas ocurre en cadencia con evidencia, y la comunicación externa se ancla al último hito demostrado.

## Decisiones habilitadas

- Arranque inmediato de la construcción con secuencia definida.
- Comunicación interna y externa sobre una sola estructura honesta.

## Decisiones bloqueadas

- Prohibida la alteración del roadmap sin decisión de radio máximo.
- Prohibido el roadmap externo divergente del interno.
- Prohibido arrancar DGP fuera de la secuencia autorizada.

## Reusable Pattern

Roadmap = estructura normativa + estado derivado + comunicación por evidencia: el plan que promete orden demostrable, no fechas deseadas.

## Anti-Patterns

- El Gantt de 18 meses presentado como compromiso.
- Arrancar "algo del Kernel" antes de M0 para sentir avance.
- Dos roadmaps: el real y el de las reuniones con clientes.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la ambición comercial que la línea maestra sirve).
- **ESI que consume**: ESI-010/27 (orden consolidado, ahora ejecutable).
- **DGP que originará**: DGP-001…003 nombrados; toda la cola derivará de aquí.
- **ADR relacionados**: ADR de adopción del Roadmap 1.0.
- **Módulos que reutilizarán este patrón**: todos entran a construcción por esta línea.
