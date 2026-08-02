# 25 — Experience Checklist

> **DeltaOps — ESI-008 · v1.0** · El checklist de experiencia: criterios verificables EC-01…EC-12 y las preguntas del revisor XR-01…XR-06 — "se siente bien" convertido en verificable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los criterios (EC-01…EC-12)

Aplicables a toda pantalla en su DGP y en cambios relevantes:

| # | Criterio | Verificación |
|---|---|---|
| **EC-01** | Contrato de pantalla completo (los ocho rubros, doc 05) y consistente (permisos/KPIs citados existen) | Puerta mecánica |
| **EC-02** | Layout del catálogo declarado (doc 07); regiones respetadas; una acción principal máxima | Declaración + revisión |
| **EC-03** | Los cuatro estados diseñados: carga (doc 12), error (doc 13), vacío por causa (doc 14), offline (doc 11) | Declaración + revisión |
| **EC-04** | Cero valores visuales sueltos; solo tokens (doc 08) | Detección mecánica en puerta |
| **EC-05** | Verificaciones de accesibilidad en verde (contraste, semántica, foco, objetivos táctiles, doc 10) | Puerta mecánica + revisión |
| **EC-06** | Las tres posturas verificadas; priorización esencial/secundario declarada (doc 09) | Revisión por postura |
| **EC-07** | Pantallas de ejecución diseñadas campo-primero con presupuesto de interacción (doc 23) | Orden del DGP + declaración |
| **EC-08** | Habilitación honesta: nada falla al pulsar por lo sabido antes (doc 05 §2.3); online-only deshabilitado con motivo | Revisión + batería |
| **EC-09** | Ningún cálculo de KPI ni regla de negocio duplicada en superficie (docs 18-19) | Revisión de bloqueo |
| **EC-10** | Nada se pierde: borradores, cierres, expiración, errores (docs 13, 16-17, 19) | Batería de rescate |
| **EC-11** | Textos del catálogo de contenido, operativos, sin jerga (docs 10, 13) | Revisión |
| **EC-12** | Marca de IA presente en todo lo generado; "IA: ninguna" verificado (doc 22) | Revisión de bloqueo |

## 2. Las preguntas del revisor (XR-01…XR-06)

La revisión humana caza lo que la puerta no ve (tercera instancia del patrón: R, RS, SR):

| # | Pregunta | Qué caza |
|---|---|---|
| **XR-01** | ¿Esta pantalla la completa el usuario real de ETS-001 en su contexto real (guantes, prisa, sol)? | El diseño de escritorio disfrazado |
| **XR-02** | ¿La misma acción se ve/nombra/comporta igual que en el resto del producto? | La divergencia silenciosa |
| **XR-03** | ¿Hay elementos accionables fuera del contrato, o semántica reinterpretada de los módulos? | La pantalla que inventa |
| **XR-04** | ¿Los vacíos/errores dejan salida y los textos orientan en términos de la tarea? | El callejón y la jerga |
| **XR-05** | ¿Se filtró algo por canal lateral (conteos, sugerencias, búsquedas) fuera del alcance? | La fuga por superficie (ESI-007/04) |
| **XR-06** | ¿La pantalla justifica existir o es una variante de otra que debió extenderse? | La proliferación |

## 3. Reglas de aplicación

1. **EC-01…EC-12 en la definición de terminado** de toda pantalla; se suman a CA/CS/SC de las series previas sin sustituirlas; los mecánicos, en puerta.
2. **XR con cita o "no aplica" razonado**; XR-03 y XR-05 son de bloqueo siempre; hallazgos repetidos se promueven a EC mecánico (la regla de ESI-002/17).
3. **Waivers por el régimen único** (ESI-007/18 §2.2): dueño, caducidad, visibles; EC-05 y EC-12 no se waivean.

## Impacto sobre la implementación

Los criterios entran a las puertas y a la plantilla de DGP; las preguntas, a la plantilla de revisión activada al tocar superficie.

## Dependencias

Docs 05, 07-23; ESI-002/17; ESI-004/25-26; ESI-006/24-25; ESI-007/18, /22-23.

## Riesgos

- La revisión de experiencia como cuello de botella de todo cambio visual; mitigación: los EC mecánicos filtran lo grueso y XR se concentra en pantallas nuevas y cambios de contrato — proporcionalidad como en seguridad (ESI-007/23).

## Decisiones habilitadas

- Calidad de experiencia exigible por criterio, no por gusto del revisor.
- Mejora continua por promoción de hallazgos a puerta.

## Decisiones bloqueadas

- Prohibida producción de pantallas sin EC-01…EC-12 en verde o waiver visible.
- Prohibido aprobar con XR-03/XR-05 abiertos.
- Prohibidos waivers de accesibilidad y de marca de IA.

## Reusable Pattern

EC mecánicos + XR humanos + promoción de hallazgos: la cuarta instancia del patrón checklist+revisión — la maquinaria de calidad ya estándar, aplicada a la experiencia.

## Anti-Patterns

- Revisar capturas de pantalla en vez del contrato y los estados.
- El revisor de experiencia opinando de estética en vez de verificar criterios.
- Verificar solo el flujo feliz en la postura cómoda.

## Knowledge Graph

- **ETS que consume**: ETS-001, ETS-011 (los usuarios y contextos que XR-01 invoca).
- **ESI que consume**: ESI-002/17; ESI-004/25-26; ESI-006/24-25; ESI-007/22-23 (patrón).
- **DGP que originará**: EC en toda definición de terminado; XR en la plantilla de revisión.
- **ADR relacionados**: ADR de checklist de experiencia con doble régimen.
- **Módulos que reutilizarán este patrón**: todas sus pantallas pasan EC/XR sin excepción.
