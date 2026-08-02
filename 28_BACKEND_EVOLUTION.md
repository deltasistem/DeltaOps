# 28 — Evolución del Backend Foundation

> **DeltaOps — ESI-003 · v1.0** · Cómo cambia la plataforma backend sin romper a quienes viven encima.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Principio

El Foundation es la pieza con más dependientes del sistema: todo módulo, presente y futuro, vive encima. Por eso evoluciona **más despacio y con más evidencia** que cualquier módulo. Su regla de oro: **los contratos del Kernel son lo más caro de cambiar; las implementaciones de plataforma, lo más barato.** Toda evolución busca convertirse en cambio de implementación detrás de un contrato estable.

## 2. Tipos de cambio y su tratamiento

| Tipo de cambio | Ejemplo | Tratamiento |
|---|---|---|
| **Implementación interna** | Optimizar el relevo del outbox, cambiar detalles del pool | PR normal con pruebas de contrato verdes |
| **Parámetro nuevo** | Ajuste de reintentos, plazos | Clave de plano plataforma con default compatible (doc 08) |
| **Contrato nuevo en el Kernel** | Un puerto nuevo (p. ej. firma digital) | ADR + revisión del dueño de arquitectura + fake incluido desde el día uno |
| **Cambio de contrato existente** | Ampliar el contexto, cambiar un puerto | Solo expandir-migrar-contraer (ETS-010 aplicado a contratos): coexistencia N/N-1, migración de módulos, retirada |
| **Sustitución de infraestructura** | Bandejas → broker externo; sesiones → almacén dedicado | ADR con medición previa; el contrato sobrevive (docs 14/19 ya declaran sus fronteras) |

## 3. Señales de evolución (patrón señal → respuesta, ESI-002/28)

| Señal medible | Respuesta pre-decidida |
|---|---|
| Edad de bandeja creciendo de forma sostenida | Escalar relevo/consumidores; si el techo es PostgreSQL, activar el ADR de broker |
| Latencia de validación de sesión relevante en el presupuesto del borde | Activar el ADR de caché/almacén dedicado (doc 14) |
| Módulos pidiendo repetidamente la misma excepción a un contrato | El contrato está mal: rediseño por expandir-migrar-contraer, no excepciones |
| Duración de transacciones al alza | Auditar casos de uso contra doc 20; buscar llamadas externas coladas |
| Crecimiento del catálogo de errores/permisos por encima de lo revisable | Revisión de diseño con el dueño del catálogo: probable exceso de granularidad |
| Costes de telemetría fuera de presupuesto | Ajustar muestreo y cardinalidad (doc 17) antes que recortar señales |

## 4. Reglas normativas

1. **Nada de bifurcaciones por módulo**: si un módulo necesita "su versión" de un runtime, el runtime se evoluciona para todos o el módulo está mal diseñado.
2. **Compatibilidad N/N-1 también hacia dentro**: durante una migración de contrato, plataforma vieja y nueva conviven una versión (ESI-002/21).
3. **Los fakes evolucionan con el contrato en el mismo PR**: un contrato cuyo fake no está al día está roto.
4. **Toda sustitución de infraestructura se ensaya primero en QA con carga sintética**; la evidencia entra en el ADR.
5. **Este documento cierra ESI-003**: cambios a la serie siguen el proceso único de cambio de reglas (ESI-002/27) y respetan la jerarquía normativa (doc 01).

## Impacto sobre la implementación

Da a los DGP futuros el procedimiento para tocar plataforma sin romper módulos, y a la operación las señales que disparan cada evolución prevista.

## Dependencias

Docs 01, 08, 14, 17, 19 y 20; ETS-010 (expandir-migrar-contraer); ESI-002/13, /21, /27 y /28.

## Riesgos

- Parálisis: tanto proceso que la plataforma no evoluciona; mitigación: los cambios de implementación interna son PR normales — el peso cae solo sobre contratos.
- Evolución guiada por moda tecnológica y no por señales; mitigación: la tabla señal→respuesta es el disparador legítimo; lo demás exige ADR con medición.

## Decisiones habilitadas

- Evolucionar implementaciones con libertad detrás de contratos estables.
- Activar las sustituciones previstas (broker, almacén de sesiones) con criterios objetivos.

## Decisiones bloqueadas

- Prohibido cambiar contratos del Kernel fuera de expandir-migrar-contraer.
- Prohibidas versiones de runtime por módulo.
- Prohibida la sustitución de infraestructura sin ADR con medición.

---

**Fin de la serie ESI-003.**
