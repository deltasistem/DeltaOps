# 02 — Engineering Flow

> **DeltaOps — ESI-010 · v1.0** · El flujo de ingeniería: el camino único de una idea hasta producción, integrando las compuertas y regímenes ya congelados por etapa.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El camino único

Toda pieza de trabajo — funcionalidad, corrección, cambio de norma, cambio de proceso — recorre el mismo camino con compuertas ya normadas. Este documento no crea etapas: las encadena.

| Etapa | Qué pasa | Compuerta de salida | Norma fuente |
|---|---|---|---|
| **1. Idea** | Necesidad expresada (mercado, ETS, retrospectiva, score, incidente) | Entra al registro de trabajo con dueño | ESI-009/20 |
| **2. Encuadre** | ¿Qué normas toca? ¿Qué módulos/servicios/contratos? (consulta a registros, docs 05-13) | Alcance y categoría conocidos | ESI-009/21 (DoR-04/05) |
| **3. Decisión previa** (solo si toca norma o arquitectura) | Propuesta por el proceso de decisiones | Decisión registrada (doc 07) | ESI-002/27 |
| **4. Listo** | Criterios de aceptación, riesgos, exposición, verificación | DoR-01…08 completo | ESI-009/21, /23 |
| **5. Construcción** | Diseño dentro de las normas; contratos antes que pantallas (ESI-008/05); pruebas con el código | Contrato de PR de nueve rubros | ESI-009/05, /08 |
| **6. Integración** | Puertas + revisión (DR + checklists de dominio invocados) | QC-01…12 en verde | ESI-009/06-07, /24 |
| **7. Liberación** | Tren de versiones, RC, exposición gradual | RC-01…10 + confirmación de señales | ESI-009/10-13, /25 |
| **8. Operación** | Observación, incidentes, reversa si hace falta | DoD-01…10; señales confirmadas | ESI-009/14-15, /22 |
| **9. Aprendizaje** | Retrospectivas, promociones a puertas, deuda, evolución | Acciones con dueño cerradas | ESI-009/15-17, docs 22, 28 |

## 2. Reglas de integración

1. **Ninguna etapa se salta**: los atajos legítimos ya existen dentro del camino (hotfix ESI-009/16 acelera esperas, no compuertas; los cambios chicos satisfacen compuertas proporcionales) — el atajo por fuera del camino no existe.
2. **La etapa 2 es la que este sistema potencia**: encuadrar contra los registros (qué módulo, qué servicio, qué contrato, qué patrón aplica) convierte el corpus congelado en consulta de minutos; el encuadre pobre es la causa raíz clásica del retrabajo.
3. **La etapa 3 es excepcional por diseño**: la mayoría del trabajo cabe dentro de las normas; si cada pieza requiere decisión previa, o el encuadre falla o el estándar tiene un hueco — ambos se reportan (doc 22).
4. **El flujo es el mismo para todo actor**: humano (doc 17), asistido por IA (doc 16) o mixto (doc 18) — las compuertas no distinguen quién teclea.
5. **El flujo emite trazabilidad por construcción** (doc 14): cada etapa deja el rastro ya exigido por su norma fuente; la trazabilidad no es trabajo extra sino subproducto.

## Impacto sobre la implementación

Los equipos operan el camino con los instrumentos de ESI-009; los registros de esta serie (docs 05-13) se consultan en el encuadre como paso estándar.

## Dependencias

ESI-002/27; ESI-008/05; ESI-009 completo (etapas y compuertas); docs 05-14, 16-18, 22.

## Riesgos

- El camino percibido como pesado para cambios triviales; mitigación: la proporcionalidad ya normada (ESI-009/21 §3.2, /24 §3.2) — las compuertas se encogen con el riesgo, el camino nunca se abandona.

## Decisiones habilitadas

- Cualquier pieza de trabajo localizable en una etapa con su compuerta clara.
- Métricas de flujo (ESI-009/18) leídas contra etapas uniformes.

## Decisiones bloqueadas

- Prohibido trabajo en producción que no recorrió el camino.
- Prohibidos flujos alternativos por equipo o por tipo de actor.
- Prohibido saltar el encuadre contra los registros.

## Reusable Pattern

Un camino único con compuertas heredadas + encuadre contra registros: el flujo como encadenamiento de lo ya normado — integración sin legislación.

## Anti-Patterns

- El "proyecto especial" que opera fuera del camino por urgencia.
- Encuadrar de memoria en vez de consultar los registros.
- Tratar la decisión previa como trámite para todo (o para nada).

## Knowledge Graph

- **ETS que consume**: ETS-012 (la cadencia que el camino sostiene).
- **ESI que consume**: ESI-002/27 (etapa 3); ESI-008/05 (contratos antes que pantallas); ESI-009 (etapas 4-9).
- **DGP que originará**: ninguno; el camino usa los instrumentos del DGP de entrega ya normado.
- **ADR relacionados**: ADR de camino único con compuertas proporcionales.
- **Módulos que reutilizarán este patrón**: todo trabajo de todo módulo recorre las nueve etapas.
