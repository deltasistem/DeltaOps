# 24 — Quality Checklist

> **DeltaOps — ESI-009 · v1.0** · El checklist de calidad del cambio: criterios QC-01…QC-12 aplicables a todo cambio antes de integrar — lo mecánico en puerta, lo demás en revisión.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El checklist de calidad opera sobre **el cambio** (el PR camino a la principal); el de liberación (doc 25) opera sobre **la versión** camino a producción. Es la instancia de entrega de la familia de checklists de la casa (CA ESI-004/25, CS ESI-006/24, SC ESI-007/22, EC ESI-008/25) y las invoca cuando el cambio toca su dominio, sin repetirlas.

## 2. Criterios (QC-01…QC-12)

| # | Criterio | Verificación |
|---|---|---|
| **QC-01** | Contrato de PR completo: los nueve rubros con contenido real (doc 05 §2.2) | Puerta mecánica |
| **QC-02** | Commits en formato, rama nombrada, tamaño bajo umbral o justificado (docs 03-05) | Puerta mecánica |
| **QC-03** | Puertas estáticas en verde, sin reglas deshabilitadas inline (doc 07) | Puerta mecánica |
| **QC-04** | Pruebas de los niveles declarados presentes y en verde; cobertura sin descender del piso (doc 08) | Puerta mecánica |
| **QC-05** | Revisión aprobada sin bloqueantes; reforzada si la categoría lo exige (doc 06) | Plataforma |
| **QC-06** | Checklists de dominio invocados cuando toca: seguridad (SC) si toca permisos/datos, experiencia (EC) si toca superficie, plataforma (CS/CA) si toca servicios o módulos | Revisión |
| **QC-07** | Contratos publicados sin ruptura no declarada; ruptura marcada con ventana N/N-1 (docs 04, 11) | Puerta mecánica |
| **QC-08** | Migraciones en fase expandir; contracción solo con ventana cumplida (doc 10 §2.4) | Puerta + revisión |
| **QC-09** | Peldaño de rollback declarado y coherente con el cambio (doc 14 §3.1) | Revisión |
| **QC-10** | Toggle registrado con dueño/tipo/caducidad si el cambio entra apagado (doc 12) | Puerta mecánica |
| **QC-11** | Señal de observabilidad declarada verificable: existe o el cambio la crea (doc 05 §2.6) | Revisión |
| **QC-12** | Deuda nueva registrada; nada de pendientes en comentarios sueltos (doc 17) | Revisión |

## 3. Reglas de aplicación

1. **QC es la lista de la compuerta de integración**: los mecánicos corren en puerta (doc 07); los de revisión se verifican con DR-01…06 (doc 06) — sin duplicar esfuerzo, cada criterio tiene un solo verificador.
2. **Proporcionalidad por categoría**: el cambio de documentación no ejercita QC-07/08/10; la plantilla marca los aplicables — el checklist completo idéntico para todo es el ritual que este régimen evita.
3. **Waivers por el régimen único** (ESI-007/18); QC-03 y QC-04 en sus componentes de seguridad y aislamiento no se waivean (doc 08 §3.3).

## Impacto sobre la implementación

QC se materializa en la plantilla de PR y la configuración de puertas; la marca de aplicabilidad por categoría vive en el DGP de entrega.

## Dependencias

Docs 03-12, 14, 17; ESI-004/25; ESI-006/24; ESI-007/18, /22; ESI-008/25.

## Riesgos

- La familia de checklists percibida como burocracia acumulada; mitigación: QC invoca a las demás solo cuando el dominio se toca (§2, QC-06) y la mayoría de criterios son puertas automáticas invisibles cuando están en verde.

## Decisiones habilitadas

- Compuerta de integración uniforme y mayormente automática.
- Invocación precisa de los checklists de dominio sin duplicarlos.

## Decisiones bloqueadas

- Prohibido integrar con QC aplicables en rojo sin waiver.
- Prohibido duplicar criterios de dominio dentro de QC.
- Prohibidos waivers de los componentes de seguridad/aislamiento.

## Reusable Pattern

Checklist del cambio + invocación por dominio + un solo verificador por criterio: la quinta instancia de la familia — coordinada con sus hermanas, no encimada.

## Anti-Patterns

- Marcar QC-06 "no aplica" en un cambio que toca permisos.
- El checklist como formulario post-hoc rellenado tras aprobar.
- Duplicar los criterios de seguridad de SC dentro de QC "por si acaso".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-004/25; ESI-006/24; ESI-007/22; ESI-008/25 (las hermanas invocadas).
- **DGP que originará**: plantilla QC con aplicabilidad por categoría en el DGP de entrega.
- **ADR relacionados**: ADR de checklist de cambio con invocación por dominio.
- **Módulos que reutilizarán este patrón**: todo cambio de todo módulo pasa QC.
