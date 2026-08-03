# 25 — Construction Dashboard

> **DeltaOps — DGP-000 · v1.0** · El tablero de construcción: la vista del programa dentro del tablero único de la casa — DGP, olas, hitos, riesgos y camino crítico, todo derivado.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

El modelo de tablero está congelado (ESI-010/25: derivación total, superficie única, lo verde silencioso). Este documento define la **vista de programa** que se le añade: qué compone y de qué fuentes — sin crear un tablero paralelo.

## 2. Las vistas del programa

| Vista | Compone | Fuente |
|---|---|---|
| **Portafolio** | DGP por estado (doc 11) con edad por estado; distribución por ola; WIP contra límite (doc 24 §3.1) | Registro de construcción (doc 12) |
| **Camino crítico** | Los DGP críticos con estado y bloqueos; la holgura consumida de los frentes casi-críticos | Doc 08; registro |
| **Hito en curso** | Los criterios del próximo M-N con estado y evidencia enlazada — visible siempre, no la semana del hito | Doc 15 §Impacto |
| **Bloqueos** | Bloqueados con causa, dueño del desbloqueo y edad; críticos resaltados | Doc 11 §3.2 |
| **Riesgos** | Señales R-01…R-10 (doc 17 §2): activadas, en tratamiento, extinguidas | Instrumentos por riesgo |
| **Releases** | Qué versión corre en qué audiencia; releases de ola/programa próximos con contenido real | Registro de releases (doc 14) |
| **Paralelismo** | Contratos tocados por más de un DGP activo (la señal anti-colisión, doc 09 §3.4) | Registro §2.6 |

## 3. Reglas normativas

1. **Hereda las leyes del tablero de la casa** (ESI-010/25 §3): todo derivado, nada declarado; una superficie con lecturas por audiencia sobre los mismos números; lo verde silencioso; el tablero señala y los foros deciden.
2. **La vista de programa es la agenda de la cadencia hecha pantalla** (doc 24 §2.1): bloqueados críticos, hito, cola, cerrables, riesgos — la conducción lee exactamente lo que el bucle recorre.
3. **La edad es la señal maestra del programa**: edad por estado, edad de bloqueo, edad de DGP abiertos — el programa sano circula; el tablero hace del estancamiento un rojo automático, no una percepción.
4. **La vista muere con el programa**: al cierre de W6 la vista de construcción se archiva con su historia; el tablero permanente de la casa sigue (ESI-010/25) — la maquinaria temporal se retira, como todo artefacto con fin explícito (ESI-010/03).

## Impacto sobre la implementación

Se materializa en W0 como parte del tablero mínimo (doc 06 W0.6), creciendo con los registros que la alimentan.

## Dependencias

ESI-010/03, /25; docs 08-09, 11-12, 14-15, 17, 24.

## Riesgos

- La vista de programa degenerando en reporte de gestión decorativo; mitigación: es la agenda de la cadencia (§3.2) — si la conducción la usa para conducir, no puede desactualizarse sin que se note en la misma reunión.

## Decisiones habilitadas

- Conducción del programa con lectura de minutos sobre números derivados.
- Detección automática de estancamiento, colisión y riesgo activado.

## Decisiones bloqueadas

- Prohibido un tablero de programa paralelo al de la casa.
- Prohibidas celdas manuales en la vista de programa.
- Prohibido mantener la vista viva tras el cierre del programa.

## Reusable Pattern

Vista temporal sobre el tablero permanente + edad como señal maestra + agenda de cadencia hecha pantalla: el programa observable sin maquinaria nueva.

## Anti-Patterns

- El PowerPoint semanal del programa armado desde capturas.
- La vista que muestra todo menos lo bloqueado.
- Conservar la vista de construcción como reliquia eterna.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-010/25 (modelo heredado); ESI-010/03 (fin explícito).
- **DGP que originará**: parte del DGP del tablero mínimo (W0).
- **ADR relacionados**: ADR de vista de programa sobre el tablero único.
- **Módulos que reutilizarán este patrón**: sus carteras se observan con las mismas vistas.
