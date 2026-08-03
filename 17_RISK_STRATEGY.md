# 17 — Risk Strategy

> **DeltaOps — DGP-000 · v1.0** · La estrategia de riesgos del programa: el registro de riesgos de construcción, los riesgos mayores nombrados y el régimen que los mantiene gestionados.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Régimen

1. **Dos niveles**: cada DGP declara sus riesgos específicos (anatomía obligatoria, doc 10); el **programa** gestiona los riesgos estructurales — los que ningún DGP individual puede tratar. Este documento gobierna el segundo nivel.
2. **Riesgo gestionado = riesgo con dueño, señal y tratamiento**: el riesgo listado sin los tres es decoración; la revisión de riesgos es parte de la cadencia del programa (doc 24), no un anexo anual.
3. **Los riesgos se detectan por señal, no por sensación**: cada riesgo mayor nombra la señal observable (métrica, estado del registro, franja de score) que lo activa — el tablero (doc 25) las expone.

## 2. Los riesgos mayores del programa

| # | Riesgo | Señal | Tratamiento |
|---|---|---|---|
| **R-01** | **Infidelidad al corpus**: la construcción deriva de lo diseñado ("mejoras" no solicitadas, interpretación creativa) | Hallazgos DR-01 en revisión; deriva detectada (ESI-009/09) | CP-01; QG-1 verifica referencias exactas; puerta de arquitectura |
| **R-02** | **Kernel débil**: el cuello fundacional (doc 08 §3) sale con recortes silenciosos que todo hereda | Baterías intocables; hallazgos de aislamiento; deuda no registrada descubierta | CP-09/10; revisión reforzada en W1; sin gracia |
| **R-03** | **Saltarse la validación de fábrica**: presión por llegar a W3 sin M2 real | Estados del registro vs. compuertas; presión registrada en cadencia | M2 como compuerta dura (doc 07); la más protegida del programa |
| **R-04** | **DGP inflados que no cierran**: el programa acumula "en ejecución" eternos | Edad por estado (doc 11 §3.4) | QG-1 verifica tamaño; partición en cadenas (doc 10 §3.1) |
| **R-05** | **Colisión de paralelismo**: frentes simultáneos sobre superficies sin contratar | Contratos tocados duplicados en el registro (doc 12 §2.6) | Doc 09; serialización o partición por decisión |
| **R-06** | **Velocidad de IA sobre capacidad de revisión**: generación que supera lo que los dueños humanos pueden entender | Tamaño de PR; hallazgos en cambios asistidos (ESI-010/16 §2.8) | Cambios chicos también para IA; dueño que entiende o no se integra |
| **R-07** | **Erosión de disciplina temprana**: "es fase interna, después ordenamos" | Compuertas saltadas (debería ser cero); waivers acumulados | CP-07: el flujo completo desde el primer commit |
| **R-08** | **Camino crítico invisible**: capacidad dispersa en frentes vistosos | Dotación vs. criticidad en el registro | Doc 08 §2.1; el tablero marca lo crítico |
| **R-09** | **Presión comercial contra compuertas**: audiencias o hitos adelantados sin evidencia | Solicitudes de excepción en cadencia | Docs 13 §3.2, 15 §3.5: alcance se negocia, compuertas no |
| **R-10** | **Equipo/capacidad aspiracional**: olas abiertas con nombres que no existen | Asignaciones en el registro vs. personas reales (doc 18) | Dependencia de capacidad (doc 07 §3.3) |

## 3. Evolución del registro de riesgos

Los riesgos mayores se revisan en cada hito (doc 15): se cierran los extinguidos, se promueven los emergentes desde las retrospectivas (ESI-009/15) y la fricción registrada (ESI-010/28 §2.5) — por decisión, como todo en este programa.

## Impacto sobre la implementación

La cadencia del programa incluye la lectura de señales R-01…R-10; los DGP heredan este marco y declaran solo lo específico.

## Dependencias

ESI-009/09, /15; ESI-010/16, /28; docs 07-13, 15, 18, 24-25.

## Riesgos

- La gestión de riesgos como liturgia (la lista leída, nada tratado); mitigación: cada riesgo tiene señal observable en el tablero — el riesgo activado sin tratamiento en curso es un rojo visible, no una opinión.

## Decisiones habilitadas

- Vigilancia estructural del programa con señales mecánicas.
- Herencia limpia: los DGP declaran solo riesgos específicos.

## Decisiones bloqueadas

- Prohibidos riesgos sin dueño, señal y tratamiento.
- Prohibido tratar los riesgos mayores como responsabilidad de DGP individuales.
- Prohibida la revisión de riesgos desacoplada de la cadencia.

## Reusable Pattern

Riesgos en dos niveles + señal observable por riesgo + revisión en cadencia e hitos: el riesgo como dato vigilado, no como sección obligatoria.

## Anti-Patterns

- La matriz de riesgos pintada al inicio y nunca releída.
- El riesgo "falta de tiempo" sin señal ni tratamiento.
- Descubrir R-03 consumado en la retrospectiva de W3.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la presión comercial de R-09).
- **ESI que consume**: ESI-009/09, /15; ESI-010/16, /22, /28 (señales y canales).
- **DGP que originará**: todos heredan R-01…R-10 y declaran lo específico.
- **ADR relacionados**: ADR de riesgos estructurales con señal.
- **Módulos que reutilizarán este patrón**: sus riesgos se gestionan con el mismo régimen de dos niveles.
