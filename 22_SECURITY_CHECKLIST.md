# 22 — Security Checklist

> **DeltaOps — ESI-007 · v1.0** · El checklist de seguridad: criterios verificables SC-01…SC-12 aplicables a todo componente, más los simulacros que prueban lo que el papel promete.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los criterios (SC-01…SC-12)

Aplicables a todo componente (módulo, servicio, pieza) en su DGP y en cambios relevantes:

| # | Criterio | Verificación |
|---|---|---|
| **SC-01** | Los seis rubros declarados (clasificación, riesgo, permisos, auditoría, retención, evidencias) | Puerta contra la declaración |
| **SC-02** | Clasificación por campo con herencia correcta (doc 16 §2.3) | Validación de puerta + revisión |
| **SC-03** | Nivel de riesgo propuesto con razonamiento; efectos aplicados (doc 19 §2.2) | Registro + revisión |
| **SC-04** | Autorización por el pipeline: cuatro verdades sin atajos; patrón declarado por contrato (docs 04, ESI-006/19) | Batería de contrato de error por capa |
| **SC-05** | Aislamiento y no-fuga en verde (batería multi-tenant extendida + inexistencia vs. denegación) | Batería CA-05 ampliada |
| **SC-06** | Cero secretos fuera del almacén; referencias por nombre lógico (doc 11) | Detección mecánica en puerta |
| **SC-07** | Auditoría según riesgo: eventos de negocio y de seguridad emitidos donde se declaró | Batería de emisión |
| **SC-08** | Sin datos sensibles en bitácoras, errores, telemetría ni eventos (docs 11 §2.5, 13 §2.6) | Inspección mecánica de formatos + revisión |
| **SC-09** | Retención declarada y ejecutable por categoría (docs 15-16, ETS-009) | Declaración + verificación de puerta |
| **SC-10** | Step-up declarado en acciones de riesgo alto donde aplique (doc 03 §2.1) | Declaración de comandos |
| **SC-11** | Cuentas de servicio e integraciones con dueño, alcance mínimo y comportamiento declarado (doc 10) | Registro + revisión |
| **SC-12** | Evidencias exportables producidas por operación normal (doc 14 §2.2) | Muestra de exporte |

## 2. Los simulacros

El papel se prueba con ejercicios calendarizados (R1 periódicos; el resto por ciclo de gobierno), con umbrales y acta:

1. **Revocación de emergencia**: cuenta comprometida → tiempo hasta sin-acceso-efectivo dentro de umbral (docs 05, 12).
2. **Rotación extraordinaria**: secreto expuesto → rotación sin interrupción de servicio (doc 12 §2.3).
3. **Respuesta a señal**: alerta inyectada → atendida por dueño con runbook dentro de plazo (doc 13 §2.4).
4. **Restauración con integridad**: el ensayo de recuperación existente (plataforma) verificando también eventos de seguridad y auditoría íntegros.
5. **Acceso de soporte**: ciclo completo con visibilidad al tenant verificada (doc 06).

## 3. Reglas de aplicación

1. **SC-01…SC-12 en la definición de terminado** de todo DGP (se suman a CA/CS de las series previas, sin sustituirlas); mecánicos en puerta donde se indicó.
2. **Waivers por el régimen único** (doc 18 §2.2): dueño, caducidad, visibles; en R1, de vida corta.
3. **Los simulacros alimentan D7 del score** (doc 20); el simulacro fallido abre acción con dueño, no se repite hasta pasar "para la foto".

## Impacto sobre la implementación

Los criterios entran a las puertas y plantillas de DGP existentes; los simulacros, al calendario de gobierno con runbooks del DGP de operación.

## Dependencias

Docs 03-06, 10-16, 18-20; ESI-002/17; ESI-004/25; ESI-006/24.

## Riesgos

- El checklist como trámite final (el mismo riesgo de sus hermanos); mitigación: criterios secuenciados por fase en los DGP y mecánicos en puerta — la mayoría se cumplen construyendo, no auditando.

## Decisiones habilitadas

- "Seguro" como estado verificable por componente.
- Prueba periódica de las promesas operativas (simulacros con umbral).

## Decisiones bloqueadas

- Prohibido producción sin SC-01…SC-12 en verde o waiver visible.
- Prohibidos simulacros sin acta ni umbral.
- Prohibido repetir simulacros fallidos sin acción intermedia.

## Reusable Pattern

SC-01…SC-12 + simulacros con umbral y acta: la instancia de seguridad del patrón de checklist (CA de módulos, CS de servicios) — verificación declarada por criterio.

## Anti-Patterns

- Baterías en verde sobre seed trivial (un tenant, datos O).
- El simulacro anunciado con semanas que no prueba nada.
- Waivers de SC-05/SC-06 (las murallas y los secretos no se waivean).

## Knowledge Graph

- **ETS que consume**: ETS-009/010 (protección y calidad exigibles).
- **ESI que consume**: ESI-002/17; ESI-004/25; ESI-006/24.
- **DGP que originará**: los criterios en toda definición de terminado; simulacros en el DGP de operación.
- **ADR relacionados**: ADR de simulacros con umbral (doc 26).
- **Módulos que reutilizarán este patrón**: todos pasan SC-01…SC-12; sus checklists previos (CA, RN) siguen vigentes.
