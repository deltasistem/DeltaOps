# 08 — Critical Path

> **DeltaOps — DGP-000 · v1.0** · El camino crítico del programa: la secuencia mínima que determina la duración total — protegida, visible y descargada de todo lo paralelizable.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. El camino crítico oficial

La secuencia cuya demora demora todo el programa:

```
W0: pipeline con puertas operativas
  → W1: Kernel (tenancy + RLS + permisos + auditoría)
    → W2: módulo de referencia de punta a punta (Hito A)
      → W3: primer módulo del corazón (activos)
        → W3: órdenes de trabajo (el módulo central del CMMS)
          → W3: operación productiva + Hito B (primer tenant)
```

Todo lo demás — chasis de experiencia, servicios compartidos, módulos restantes del corazón, seguridad más allá del suelo — es **casi-crítico o paralelo**: importa, pero su demora tiene holgura; la del camino crítico no.

## 2. Reglas de gestión

1. **El camino crítico se dota primero**: las personas más fuertes y el mayor apalancamiento de IA legal (doc 20) van al camino crítico; los frentes paralelos absorben la capacidad restante — no al revés (la tentación de dotar lo vistoso).
2. **El camino crítico no espera a nadie**: el trabajo paralelo se planifica para no bloquearlo — sus contratos con el camino se publican temprano (dependencia de contrato, doc 07 §3.2) y sus demoras se absorben con holgura propia, jamás trasladándose al camino.
3. **El bloqueo del camino crítico es la prioridad número uno del programa**: cualquier DGP del camino en estado Bloqueado (doc 11) escala de inmediato en la cadencia — antes que cualquier otro asunto del programa.
4. **El camino se recalcula por evidencia**: si la matriz (doc 16) cambia por decisión, el camino se rederiva y se comunica; trabajar con un camino crítico desactualizado es planificar a ciegas.
5. **La holgura no se rellena**: los frentes con holgura no la consumen en alcance extra ("ya que hay tiempo, agreguemos"); la holgura es el amortiguador del programa, no presupuesto disponible (el anti-scope-creep estructural).

## 3. Los cuellos conocidos

| Cuello | Riesgo | Tratamiento |
|---|---|---|
| **Kernel (W1)** | Todo lo demás lo espera; su calidad es irreversiblemente fundacional | Los no-waiveables desde el día uno (CP-09); revisión reforzada; sin recortes silenciosos |
| **Módulo de referencia (W2)** | Valida la fábrica entera; sus hallazgos reconfiguran el molde | Tiempo de promoción de hallazgos presupuestado, no robado |
| **Órdenes de trabajo (W3)** | El módulo más rico del dominio; concentra contratos cruzados | Partición en DGP encadenados chicos; contratos publicados temprano |
| **Operación productiva (W3)** | Primera vez con tenant real; PF-03/04 sin precedente interno | Simulacros y reversa ensayada antes del tenant (ESI-009/14-15) |

## Impacto sobre la implementación

La dotación de equipos, el orden de especificación de DGP y la prioridad de desbloqueo siguen el camino crítico; el tablero (doc 25) lo marca.

## Dependencias

Docs 04, 07, 11, 16, 18, 20, 25; ESI-009/14-15; ESI-010/24.

## Riesgos

- El camino crítico invisible en la práctica (todos los frentes tratados igual); mitigación: el registro marca los DGP del camino y el tablero los distingue — la prioridad es un dato, no una percepción.

## Decisiones habilitadas

- Asignación de capacidad con criterio objetivo de impacto en duración.
- Escalada inmediata y justificada de bloqueos críticos.

## Decisiones bloqueadas

- Prohibido dotar frentes paralelos a costa del camino crítico.
- Prohibido rellenar holgura con alcance extra.
- Prohibido operar con el camino crítico desactualizado tras cambios de matriz.

## Reusable Pattern

Camino crítico explícito + dotación prioritaria + holgura protegida + cuellos con tratamiento nombrado: la duración del programa gestionada como el recurso que es.

## Anti-Patterns

- El equipo estrella construyendo el frente vistoso mientras el Kernel espera.
- "Aprovechar" la holgura del frente paralelo hasta volverlo crítico.
- Descubrir el camino crítico en la retrospectiva del retraso.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la presión de tiempo que este camino administra honestamente).
- **ESI que consume**: ESI-003/004 (los cuellos W1/W2); ESI-009 (operación productiva).
- **DGP que originará**: los DGP del camino se marcan como críticos en el registro.
- **ADR relacionados**: ADR de camino crítico como dato del programa.
- **Módulos que reutilizarán este patrón**: los módulos futuros heredan la gestión por camino crítico de sus olas.
