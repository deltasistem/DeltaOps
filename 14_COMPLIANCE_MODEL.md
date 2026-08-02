# 14 — Compliance Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de cumplimiento: compromisos declarados, controles mapeados a lo ya construido y evidencia que se produce sola.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

El cumplimiento en DeltaOps es **mapeo, no construcción**: los marcos externos (los que el mercado objetivo exija: gestión de seguridad de la información, privacidad de datos, controles de servicio) se satisfacen mapeando sus requisitos a controles que las series congeladas ya definen. El modelo:

| Concepto | Definición |
|---|---|
| **Compromiso** | Un marco o requisito contractual que DeltaOps declara cumplir (por decisión de negocio registrada); versionado |
| **Control** | Una norma citable del sistema (doc + sección de las series) que satisface requisitos; con su verificación (mecánica por puerta/batería, o procedimental con dueño y calendario) |
| **Mapeo** | Requisito del compromiso → controles que lo satisfacen → evidencias que lo demuestran; mantenido en el registro de gobierno (doc 18) |
| **Evidencia** | El material exportable que cada componente ya declara producir (el sexto rubro); el cumplimiento la recolecta, no la fabrica |

## 2. Reglas

1. **Los controles son las normas existentes**: un requisito sin control citable revela un hueco real → se diseña la norma por el proceso (ESI-002/27) y el mapeo la cita; jamás se responde a auditores con documentos que no correspondan al sistema real.
2. **Evidencia continua, no arqueología**: las evidencias declaradas (docs 02-13) se producen por operación normal; la auditoría externa consume el corpus vigente. La "preparación de auditoría" como proyecto de rescate es el anti-patrón que este modelo elimina.
3. **Rituales con calendario y dueño**: los controles procedimentales mínimos — **revisión de accesos** (periódica por tenant y plataforma: cuentas, roles administrativos, cuentas de servicio con dueño, delegaciones), **revisión de proveedores** (los sub-servicios de la plataforma), **simulacros** (doc 22) — viven en el registro (doc 18) con cumplimiento medible (doc 20).
4. **Los compromisos por tenant son capacidades**: el cliente que exige residencia de datos, plazos de retención propios o aprobación previa del soporte (doc 06 §2.5) los obtiene por configuración/capacidad declarada — sin forks de cumplimiento.
5. **Incidentes con disciplina**: el proceso de incidente de seguridad (detección → contención → erradicación → comunicación → post-mortem sin culpa) es control nombrado; los compromisos de notificación a clientes tienen plazos declarados.

## 3. Declaración (los seis rubros)

- **Clasificación**: mapeos y planes = interno (I); informes de incidente pueden portar datos personales (P).
- **Riesgo**: alto (R2) como función; los incidentes se clasifican por su propia severidad.
- **Permisos**: `GOBIERNO.CUMPLIMIENTO.ADMINISTRAR` (plataforma); consultas de evidencia propia por tenant.
- **Auditoría**: cambios de compromisos/mapeos auditados; los rituales dejan acta.
- **Retención**: mapeos y actas por el plazo de compromiso más largo vigente.
- **Evidencias**: la matriz requisito→control→evidencia exportable por compromiso; actas de rituales; post-mortems.

## Impacto sobre la implementación

Sin piezas técnicas nuevas: el mapeo vive en el registro (doc 18); los rituales entran al calendario operativo; el proceso de incidentes se documenta como runbook maestro.

## Dependencias

Docs 01-13, 15-16, 18, 20, 22; ESI-002/27; ETS-009.

## Riesgos

- Compromisos comerciales firmados sin verificar el mapeo ("sí cumplimos" optimista); mitigación: el alta de compromiso exige mapeo completo previo con huecos resueltos o waivers explícitos — es proceso, no promesa.

## Decisiones habilitadas

- Responder auditorías y cuestionarios de clientes con evidencia vigente.
- Absorber marcos nuevos por mapeo incremental.

## Decisiones bloqueadas

- Prohibido declarar cumplimiento sin mapeo verificado.
- Prohibida evidencia fabricada ad-hoc para auditorías.
- Prohibidos forks de cumplimiento por cliente.

## Reusable Pattern

Compromiso → mapeo a controles citables → evidencia continua + rituales con dueño: la máquina de cumplimiento que crece por mapeo, no por proyecto.

## Anti-Patterns

- El clásico "proyecto de certificación" que reescribe la realidad seis semanas antes.
- Controles de papel que nadie ejecuta (el calendario sin actas los delata).
- Tratar el cuestionario del cliente como molestia en vez de mapeo reutilizable.

## Knowledge Graph

- **ETS que consume**: ETS-009 (gobierno de datos, retención).
- **ESI que consume**: ESI-002/27; todas las series como fuente de controles citables.
- **DGP que originará**: el corpus de mapeos en el registro de gobierno (doc 18); runbook de incidentes en el DGP de operación.
- **ADR relacionados**: ADR de cumplimiento-por-mapeo (doc 26).
- **Módulos que reutilizarán este patrón**: todos aportan evidencias declaradas; ninguno mantiene cumplimiento propio.
