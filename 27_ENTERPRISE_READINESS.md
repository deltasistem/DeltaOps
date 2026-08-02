# 27 — Enterprise Readiness

> **DeltaOps — ESI-007 · v1.0** · La preparación empresarial: qué exige el cliente enterprise, qué lo satisface en el diseño y cómo se demuestra sin proyectos a medida.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El modelo

"Enterprise-ready" en DeltaOps no es una edición aparte: es el conjunto de **capacidades activables** + **evidencias exportables** + **umbrales de madurez** que permiten firmar con clientes exigentes sin forks. El mapa demanda→respuesta:

| Demanda enterprise típica | Respuesta de diseño | Norma |
|---|---|---|
| SSO corporativo | Federación por tenant, cuenta local vinculada | 03 |
| MFA obligatorio y políticas propias | Políticas de tenant sobre mínimos de plataforma | 03, 12 |
| Control de acceso fino y auditable | RBAC + separación de deberes + restricción de alcance + matriz efectiva exportable | 07-08 |
| "¿Quién de ustedes ve mis datos?" | Acceso de soporte visible, con aprobación previa opcional | 06 |
| Transparencia de postura | Vista de tenant del registro, score y evidencias | 18, 20 |
| Cumplimiento demostrable | Mapeos con evidencia continua; cuestionarios respondidos del corpus | 14 |
| Privacidad y derechos | Inventario, informes de derechos, encargo firmable | 15 |
| Retención y residencia propias | Configuración/capacidad declarada, sin forks | 14 §2.4, 20 (ESI-006) |
| API segura para sus sistemas | Cuentas de servicio, límites, firmas, contratos versionados | 09-10 |
| Notificación de incidentes con plazos | Proceso de incidentes con compromisos declarados | 14 §2.5 |

## 2. Reglas

1. **La madurez regula la firma** (doc 21 §2.2): compromisos enterprise exigen M3; la lista de qué se puede prometer en cada nivel es del registro de gobierno — ventas vende lo que la madurez respalda.
2. **Todo lo enterprise es capacidad o configuración**: cero forks, cero ramas por cliente (el principio de ESI-005/09 y ESI-006/11 elevado a norma comercial); lo que un cliente pida y no exista entra al producto por el proceso, o no se firma.
3. **El cuestionario de seguridad es un producto interno**: las respuestas se derivan del corpus (registro, mapeos, este documento) y se versionan; cada cuestionario respondido enriquece el corpus reutilizable (doc 14 anti-patrón invertido).
4. **La prueba de valor (PoC/piloto) usa el mismo sistema**: tenants de evaluación con las mismas murallas — jamás instancias "de demo" con seguridad relajada.
5. **Los compromisos firmados se registran** (doc 14 §1) y sus controles entran al calendario — la firma crea obligaciones vivas, no archivadas.

## 3. Declaración (los seis rubros)

- **Clasificación**: el mapa y las respuestas = interno (I); lo entregado a un cliente lleva su vista filtrada.
- **Riesgo**: R2 (compromisos mal calibrados dañan a la plataforma entera).
- **Permisos**: `GOBIERNO.READINESS.CONSULTAR` (plataforma y ventas técnicas).
- **Auditoría**: compromisos firmados y respuestas emitidas registrados.
- **Retención**: corpus permanente versionado.
- **Evidencias**: el mapa demanda→respuesta→evidencia vigente; historial de cuestionarios.

## Impacto sobre la implementación

Sin piezas nuevas: el mapa vive en el registro de gobierno; las capacidades enterprise ya están en los DGP correspondientes (doc 25 §2.4) como entregas incrementales.

## Dependencias

Docs 03, 06-10, 12, 14-15, 18, 20-21, 25; ESI-005/09; ESI-006/11 y /20.

## Riesgos

- El compromiso comercial que se adelanta al diseño ("firmen, ya lo construiremos"); mitigación: la regla §2.1-2.2 con el registro como árbitro — el proceso protege al negocio de sí mismo.

## Decisiones habilitadas

- Venta enterprise con lista de promesas respaldadas por nivel de madurez.
- Cuestionarios y auditorías de clientes con costo marginal decreciente.

## Decisiones bloqueadas

- Prohibidos forks o ramas por cliente.
- Prohibidos compromisos enterprise bajo M3.
- Prohibidas instancias de demo con seguridad relajada.

## Reusable Pattern

Demanda→capacidad activable→evidencia exportable, regulado por madurez: la máquina de readiness que convierte exigencia de clientes en producto, no en excepciones.

## Anti-Patterns

- La "edición enterprise" como código aparte.
- Responder cuestionarios desde cero cada vez.
- Prometer residencia/retención sin capacidad declarada detrás.

## Knowledge Graph

- **ETS que consume**: ETS-012 (mercado y expectativas), ETS-005 (capacidades).
- **ESI que consume**: ESI-005/09; ESI-006/11 y /20.
- **DGP que originará**: ninguno propio; consume entregas incrementales de los DGP del doc 25.
- **ADR relacionados**: ADR-SEC-01…20 como respaldo de cada respuesta del mapa.
- **Módulos que reutilizarán este patrón**: todos aportan capacidades y evidencias; ninguno negocia excepciones por cliente.
