# 13 — Audit Security (Eventos de Seguridad)

> **DeltaOps — ESI-007 · v1.0** · El registro de eventos de seguridad: la memoria imborrable de quién intentó qué, sobre la auditoría de negocio ya congelada.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo y reparto

La auditoría de negocio ya existe (ESI-004/17: quién cambió qué dato, imborrable, por tenant). Esta serie añade el **registro de eventos de seguridad** — la capa de intentos y posturas:

| Registro | Contenido | Norma |
|---|---|---|
| Auditoría de negocio (congelada) | Cambios de datos de negocio con actor y contexto | ESI-004/17; nada cambia |
| **Eventos de seguridad** | Autenticación (éxitos, fallos, bloqueos), sesiones (doc 05), denegaciones de autorización (doc 04), operaciones de identidad/roles/delegación (docs 02, 06-07), ciclo de secretos y credenciales (docs 11-12), accesos de soporte, anomalías de comportamiento (docs 09-10) | Este documento |

## 2. Reglas

1. **Mismo carácter imborrable**: los eventos de seguridad son solo-anexar, sin actualización ni borrado, con las garantías de la auditoría de negocio; su protección es de nivel plataforma (ni el administrador del tenant los altera).
2. **Rastro doble donde hay delegación** (doc 06 §2.1): actor real + en-nombre-de en todo evento; la imputabilidad no se pierde por actuar por otro.
3. **Dos audiencias, una fuente**: el tenant consulta sus eventos (transparencia: accesos de soporte, cambios de acceso, anomalías de sus cuentas); la operación de plataforma consulta lo transversal. Las murallas aplican al registro mismo.
4. **Señales, no solo registro**: patrones definidos (ráfagas de fallos, denegaciones sistemáticas, comportamiento anómalo de cuentas de servicio, resoluciones de secretos fuera de patrón) generan **alertas de seguridad** con dueño operativo y runbook — el registro que nadie mira no protege.
5. **Retención propia**: el plazo de eventos de seguridad es de plataforma (típicamente mayor que el operativo, según compromisos del doc 14); la retención de negocio (ETS-009) no lo gobierna.
6. **Sin datos sensibles dentro**: los eventos referencian, no copian (sin contraseñas intentadas, sin valores de secretos, sin cargas de datos personales más allá del identificador).

## 3. Declaración (los seis rubros)

- **Clasificación**: interno con datos personales (P); protección reforzada de plataforma.
- **Riesgo**: crítico (R1) — es la evidencia.
- **Permisos**: `SEGURIDAD.EVENTOS.CONSULTAR` (tenant: los suyos), `PLATAFORMA.SEGURIDAD.CONSULTAR` (operación); nadie tiene escritura: se emite por pipeline.
- **Auditoría**: el registro es la auditoría; los accesos de consulta al registro también se registran (quién miró la evidencia).
- **Retención**: plazo de seguridad de plataforma, congelado por compromiso (doc 14).
- **Evidencias**: el registro mismo + informes derivados (revisión de accesos, anomalías, accesos de soporte) exportables.

## Impacto sobre la implementación

El registro, sus emisores (ya definidos en docs 02-12) y el motor de señales entran al DGP de plataforma de seguridad; los módulos no emiten eventos de seguridad directamente — el pipeline lo hace por ellos.

## Dependencias

ESI-004/17; docs 02, 04-12, 14; ETS-009; ESI-003/10-12.

## Riesgos

- Ruido de señales que entierra lo real (fatiga de alertas); mitigación: catálogo de señales versionado con umbrales ajustables por evidencia y la métrica "alertas atendidas/emitidas" en el score (doc 20).

## Decisiones habilitadas

- Detección y respuesta con memoria completa (forense posible).
- Transparencia vendible: el tenant ve lo que pasa con sus accesos.

## Decisiones bloqueadas

- Prohibida la alteración de eventos de seguridad por cualquier rol.
- Prohibido copiar secretos o datos sensibles dentro de eventos.
- Prohibidas señales sin dueño operativo ni runbook.

## Reusable Pattern

Registro solo-anexar de dos audiencias + catálogo de señales con dueño: el patrón de evidencia viva; cada dominio nuevo (docs futuros) añade emisores y señales, no registros.

## Anti-Patterns

- El registro de seguridad como bitácora técnica más (mezclado con logs de aplicación).
- Consultas del registro sin registro (el auditor invisible).
- Alertas que se archivan sin atenderse hasta que "prescriben".

## Knowledge Graph

- **ETS que consume**: ETS-009 (retención, imputabilidad).
- **ESI que consume**: ESI-003/10-12; ESI-004/17.
- **DGP que originará**: registro y señales en el DGP de plataforma de seguridad.
- **ADR relacionados**: ADR de registro dual negocio/seguridad (doc 26); ADR de señales con dueño.
- **Módulos que reutilizarán este patrón**: todos emiten indirectamente vía pipeline; ninguno escribe eventos de seguridad.
