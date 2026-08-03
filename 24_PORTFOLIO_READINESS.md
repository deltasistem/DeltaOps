# 24 — Portfolio Readiness

> **DeltaOps — ESI-010 · v1.0** · La preparación del portafolio: los criterios PF-01…PF-08 que gobiernan los hitos mayores — de la fábrica lista al primer tenant, de la ola piloto a la escala.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El proyecto arranca con PR (doc 23); el portafolio avanza por **hitos con compuerta propia**: cada salto de escala (primer módulo terminado, primer tenant productivo, apertura de olas, escala comercial) verifica que el sistema completo — no solo el código — está listo para el nivel siguiente.

## 2. Los hitos y sus criterios (PF-01…PF-08)

**Hito A — Fábrica validada** (módulo de referencia en producción interna):
| # | Criterio |
|---|---|
| **PF-01** | El módulo de referencia (ESI-004) atravesó el flujo completo (doc 02) de idea a operación, con todos los instrumentos usados de verdad |
| **PF-02** | Las plataformas transversales validadas por el uso real: seguridad, experiencia y entrega ejercitadas por un módulo real, hallazgos promovidos |

**Hito B — Primer tenant productivo**:
| # | Criterio |
|---|---|
| **PF-03** | Liberación y operación completas: cadena de entornos, reversa ensayada, incidentes con simulacro, soporte definido (ESI-009/27 §3.2) |
| **PF-04** | Las promesas enterprise demostrables: aislamiento probado por las baterías intocables, auditoría recorrible (doc 14), score de seguridad en franja sana (ESI-007) |

**Hito C — Olas de módulos** (ESI-006/26):
| # | Criterio |
|---|---|
| **PF-05** | La ola anterior en salud: scorecards sin intervención abierta, deuda prioritaria pagada, capacidad de equipos real (no aspiracional) |
| **PF-06** | Los marcos y servicios que la ola nueva demanda, listos por demanda real (ESI-008/27 §3.2) — ni antes ni después |

**Hito D — Escala comercial**:
| # | Criterio |
|---|---|
| **PF-07** | El catálogo de capacidades (doc 10) alineado con la oferta comercial; el registro sin divergencia promesa/código |
| **PF-08** | La operación escala sin héroes: métricas de estabilidad en franja sana sostenida, hotfix bajo umbral, on-call sostenible |

## 3. Reglas de aplicación

1. **El hito no se declara: se demuestra** — cada criterio con evidencia de los registros y scores; la presión comercial no adelanta hitos, adelanta conversaciones sobre alcance (la honestidad de ETS-012 hacia adentro).
2. **El hito fallido produce plan, no excepción**: el criterio en rojo se resuelve o el hito espera; "avanzar con el rojo conocido" es la deuda fundacional a escala de portafolio.
3. **La vara sube con el hito**: lo tolerable en fábrica interna (PF-01) no lo es con tenants (PF-04); los criterios de hitos previos se mantienen en verde — el portafolio no avanza soltando lo conquistado.

## Impacto sobre la implementación

Los hitos se verifican en la cadencia con el tablero (doc 25); la evidencia sale de los registros y scores existentes — sin auditoría paralela.

## Dependencias

ESI-004; ESI-006/26; ESI-007; ESI-008/27; ESI-009/27; docs 02, 10, 14, 23, 25, 27.

## Riesgos

- Los hitos usados como burocracia que retrasa sin proteger; mitigación: pocos criterios, todos anclados a riesgos reales del salto de escala, verificados con evidencia ya existente — la compuerta cuesta una revisión, no un trimestre.

## Decisiones habilitadas

- Saltos de escala con riesgo conocido y evidencia.
- Conversaciones comerciales ancladas al estado real del portafolio.

## Decisiones bloqueadas

- Prohibido el primer tenant sin PF-03/PF-04 en verde.
- Prohibido abrir olas con la anterior en intervención.
- Prohibido escalar comercialmente con divergencia promesa/código.

## Reusable Pattern

Hitos con compuerta demostrable + vara creciente + evidencia de registros: el portafolio que avanza sin soltar lo conquistado.

## Anti-Patterns

- Vender lo que el hito B aún no demuestra.
- La ola nueva arrancada para no "desaprovechar" un equipo libre.
- Declarar el hito en una reunión sin abrir un solo registro.

## Knowledge Graph

- **ETS que consume**: ETS-012 (los hitos comerciales que estos hitos técnicos sostienen).
- **ESI que consume**: ESI-004 (hito A); ESI-006/26 (olas); ESI-007 (promesas); ESI-009/27 (maduración).
- **DGP que originará**: ninguno; la evidencia sale de los instrumentos existentes.
- **ADR relacionados**: ADR de hitos de portafolio con compuerta.
- **Módulos que reutilizarán este patrón**: cada ola de módulos pasa por PF-05/PF-06.
