# 21 — Security Maturity

> **DeltaOps — ESI-007 · v1.0** · La escala de madurez de seguridad: M0–M4 para el programa completo, con criterios acumulativos verificables.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La escala

Hermana de las escalas de módulos (ESI-005/23) y servicios (ESI-006/23), evalúa el **programa de seguridad** como conjunto:

| Nivel | Nombre | Criterios verificables (acumulativos) |
|---|---|---|
| **M0** | Diseñado | Esta serie aprobada; escala de riesgo asignada a lo existente; registro de gobierno con estructura |
| **M1** | Fundamentos operando | Identidad, sesiones, RBAC y almacén de secretos en producción (DGP-Identidad y plataforma de seguridad, doc 25); eventos de seguridad emitiéndose; detección de secretos en puerta |
| **M2** | Gobernado | Los seis rubros declarados en todos los componentes en producción; score operando con fuentes reales; rituales con calendario cumplido un ciclo completo; waivers con caducidad al día |
| **M3** | Demostrable | Simulacros del checklist (doc 22) ejecutados con resultados dentro de umbral; modelos de amenazas R1 vigentes; primer compromiso externo mapeado con evidencia continua (doc 14); vistas de tenant empresarial disponibles |
| **M4** | Anticipatorio | Tendencia del score estable/mejorando por ≥2 ciclos; señales detectando antes que los reportes humanos; auditoría externa superada con el registro como fuente; el criterio de activación ABAC (doc 08 §3) evaluable con datos |

## 2. Reglas

1. **La madurez es del programa, no de una pieza**: se evalúa sobre evidencia del registro (doc 18) y del score (doc 20); una dimensión crítica baja acota el nivel del conjunto (el eslabón más débil manda en seguridad).
2. **Los niveles ordenan el portafolio**: M1 es prerequisito del primer módulo en producción real (doc 25 §2); M2 lo es de clientes con datos sensibles declarados; M3 lo es de la venta empresarial con compromisos (doc 27) — la madurez de seguridad regula el negocio, no al revés.
3. **Evaluación con evidencia mecánica** donde exista (score, baterías, calendario) y acta donde no; el mismo régimen que sus escalas hermanas.
4. **Sin saltos**: los criterios son acumulativos; declarar M3 con rituales incumplidos de M2 es la inflación que la evidencia impide.

## 3. Declaración (los seis rubros)

- **Clasificación**: evaluaciones = interno (I).
- **Riesgo**: R2 (función de gobierno).
- **Permisos**: `GOBIERNO.MADUREZ.EVALUAR` (plataforma).
- **Auditoría**: evaluaciones con evidencia citada, auditadas.
- **Retención**: historial de evaluaciones permanente.
- **Evidencias**: la evaluación vigente con criterios verificados uno a uno — insumo directo del doc 27.

## Impacto sobre la implementación

Sin piezas: la evaluación es un ritual del calendario de gobierno que consume registro y score; los umbrales de negocio §2.2 entran a las decisiones de portafolio.

## Dependencias

Docs 08, 14, 18-20, 22, 25, 27; ESI-005/23; ESI-006/23.

## Riesgos

- Presión comercial por declarar niveles ("necesitamos M3 para ese cliente"); mitigación: criterios acumulativos con evidencia citada §2.3-2.4 — el atajo honesto es acelerar los criterios, no la declaración.

## Decisiones habilitadas

- Compromisos comerciales calibrados a madurez real.
- Hoja de ruta de seguridad con hitos objetivos.

## Decisiones bloqueadas

- Prohibido declarar niveles sin criterios verificados.
- Prohibida la venta empresarial con compromisos bajo M3.
- Prohibidos saltos de nivel.

## Reusable Pattern

M0–M4 acumulativa con reguladores de negocio: la tercera instancia del patrón de madurez (módulos, servicios, seguridad) — cualquier programa futuro replica la estructura.

## Anti-Patterns

- La madurez como promedio de dimensiones (esconde el eslabón débil).
- Evaluar una vez al año por obligación.
- Confundir madurez del programa con ausencia de incidentes (la suerte no es madurez).

## Knowledge Graph

- **ETS que consume**: ETS-010 (calidad exigible), ETS-012 (expectativas del mercado).
- **ESI que consume**: ESI-005/23; ESI-006/23.
- **DGP que originará**: el ritual de evaluación en el DGP de gobierno.
- **ADR relacionados**: ADR de madurez como regulador de negocio (doc 26).
- **Módulos que reutilizarán este patrón**: ninguno directamente; el programa los cubre a todos.
