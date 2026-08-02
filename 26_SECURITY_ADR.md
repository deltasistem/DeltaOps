# 26 — ADR Relacionados

> **DeltaOps — ESI-007 · v1.0** · El catálogo de decisiones de arquitectura del programa de seguridad: cada una citable, con su documento normativo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El catálogo (ADR-SEC-01…20)

Las decisiones estructurales que esta serie fija, en el formato del corpus de decisiones (ESI-002/27):

| ADR | Decisión | Doc |
|---|---|---|
| **ADR-SEC-01** | Los seis rubros de declaración obligatorios en todo componente, sobre los registros existentes | 01 |
| **ADR-SEC-02** | Identidad global separada de cuenta por tenant; retiro sin borrar historia | 02 |
| **ADR-SEC-03** | Step-up declarativo por acción; mínimos de plataforma no rebajables por tenant | 03 |
| **ADR-SEC-04** | Las cuatro verdades ordenadas con contrato de error por capa (inexistencia ≠ denegación) | 04 |
| **ADR-SEC-05** | Caducidad doble de sesión; fuerza viaja con la sesión; revocación central con margen único | 05 |
| **ADR-SEC-06** | No-suplantación: rastro doble en toda actuación por-otro; re-delegación prohibida por defecto | 06 |
| **ADR-SEC-07** | RBAC aditivo puro sin permisos negativos; separación de deberes declarativa | 07 |
| **ADR-SEC-08** | Postura ABAC-readiness: preparación sin construcción, con criterio de activación triple | 08 |
| **ADR-SEC-09** | Exposición por catálogo; nada anónimo en la superficie de producto | 09 |
| **ADR-SEC-10** | Cuenta de servicio con dueño humano y comportamiento declarado; una por sistema | 10 |
| **ADR-SEC-11** | Secretos por referencia-no-valor en almacén único; sin re-lectura tras el alta | 11 |
| **ADR-SEC-12** | Rotación por solapamiento N/N-1; la sospecha dispara rotación, no debate | 12 |
| **ADR-SEC-13** | Registro dual: auditoría de negocio (congelada) + eventos de seguridad solo-anexar con señales con dueño | 13 |
| **ADR-SEC-14** | Cumplimiento por mapeo a controles citables con evidencia continua | 14 |
| **ADR-SEC-15** | Supresión por desvinculación: privacidad compatible con imputabilidad | 15 |
| **ADR-SEC-16** | Escala única de clasificación O/I/P/S con efectos mecánicos y herencia | 16 |
| **ADR-SEC-17** | Confianza cero como composición verificable; sin zonas de confianza ni acceso permanente elevado | 17 |
| **ADR-SEC-18** | Registro de gobierno derivado con dientes (waivers que caducan, riesgos aceptados visibles) | 18 |
| **ADR-SEC-19** | Escala de riesgo R1-R4 con tabla de efectos normativa | 19 |
| **ADR-SEC-20** | Score con fuentes mecánicas y consecuencias; madurez M0-M4 como regulador de negocio | 20-21 |

## 2. Reglas

1. **Cada ADR vive en el corpus** (ESI-002/27) con su contexto, decisión y consecuencias; esta tabla es el índice de la serie, no el registro.
2. **Revisar un ADR-SEC es proceso completo**: análisis de citantes (doc 24 §4.2), radio total en los transversales (01, 16, 19), y decisión registrada; ninguno se "ajusta" informalmente.
3. **Los DGP citan ADR por código**: las decisiones de diseño locales que un DGP tome sobre estas bases referencian el ADR que las habilita o acota.

## 3. Declaración (los seis rubros)

- **Clasificación**: interno (I).
- **Riesgo**: R2 (gobierno del corpus).
- **Permisos**: el corpus de decisiones lo gobierna plataforma (ESI-002/27).
- **Auditoría**: cambios de ADR por el proceso registrado.
- **Retención**: permanente; los ADR reemplazados se marcan, no se borran.
- **Evidencias**: el índice vigente con estado de cada ADR.

## Impacto sobre la implementación

Ninguna pieza; el índice entra al corpus de decisiones y el registro de gobierno lo referencia (doc 18 §1).

## Dependencias

ESI-002/27; docs 01-21 y 24.

## Riesgos

- ADR tratados como documentación en vez de decisiones vinculantes; mitigación: las puertas y revisiones citan ADR en sus validaciones — contradecir un ADR vigente es hallazgo de bloqueo (doc 23).

## Decisiones habilitadas

- Trazabilidad decisión→norma→control→evidencia completa.
- Evolución del programa por revisión formal de decisiones.

## Decisiones bloqueadas

- Prohibido contradecir ADR vigentes sin proceso de revisión.
- Prohibidos ADR de seguridad fuera del corpus único.
- Prohibido borrar ADR reemplazados.

## Reusable Pattern

El índice ADR por serie con códigos citables: toda serie futura cierra sus decisiones así, y los DGP las citan por código.

## Anti-Patterns

- Decisiones estructurales enterradas en documentos sin código ADR.
- ADR duplicados con matices entre series.
- El ADR "vivo" editado sin versionar.

## Knowledge Graph

- **ETS que consume**: ninguno directo; los ADR consumen los ETS vía sus documentos.
- **ESI que consume**: ESI-002/27 (el corpus y su proceso).
- **DGP que originará**: ninguno; los DGP citan estos ADR.
- **ADR relacionados**: los veinte del catálogo §1.
- **Módulos que reutilizarán este patrón**: todos citan ADR-SEC por código en sus decisiones locales.
