# 02 — Identity Service

> **DeltaOps — ESI-007 · v1.0** · El servicio de identidad: la fuente única de quién existe en el sistema — personas, cuentas de servicio y sus vínculos con tenants.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

Pieza de plataforma (no del catálogo ESI-006: la identidad es prerequisito del estrato, no un servicio de producto). Es la fuente única de identidades y su ciclo de vida:

| Concepto | Definición |
|---|---|
| **Identidad** | La persona o sistema, única en la plataforma, independiente del tenant; con atributos mínimos verificados |
| **Cuenta** | El vínculo identidad↔tenant: estado (activa, suspendida, retirada), roles (doc 07), fecha de alta/baja; una identidad puede tener cuentas en varios tenants (el técnico contratista) |
| **Cuenta de servicio** | Identidad no humana (doc 10) con el mismo modelo de vínculo y ciclo |
| **Ciclo de vida** | Alta (invitación por administrador del tenant), activación, suspensión (reversible, inmediata), retiro (definitivo; la identidad histórica persiste para auditoría) |

## 2. Reglas

1. **Separación identidad/cuenta**: autenticarse es de la identidad (doc 03); autorizar es de la cuenta en el tenant activo (doc 04). Una identidad suspendida en el tenant A opera normal en el B.
2. **El retiro no borra la historia**: la identidad retirada deja de operar pero sus rastros (auditoría, autorías de eventos, fechas) permanecen íntegros e imputables — el derecho al olvido se atiende por el modelo de privacidad (doc 15), no truncando auditoría.
3. **Atributos mínimos**: la plataforma guarda lo necesario para operar e imputar (nombre, correo verificado, estado); los atributos operativos del negocio (especialidad del técnico, cuadrilla) son de los módulos, referenciando la cuenta.
4. **Administración federada por tenant**: el administrador del tenant gestiona sus cuentas (invitar, suspender, roles); jamás toca identidades de otros tenants ni la identidad global.
5. **Toda operación de identidad es auditada como evento de seguridad** (doc 13) — altas, bajas, suspensiones y cambios de rol son la materia prima de la revisión de accesos (doc 14).

## 3. Declaración (los seis rubros)

- **Clasificación**: datos de identidad = personales (doc 16, nivel P); credenciales = secreto (nivel S).
- **Riesgo**: crítico (doc 19, R1) — compromiso de identidad compromete todo lo demás.
- **Permisos**: `IDENTIDAD.CUENTAS.ADMINISTRAR` (tenant), `IDENTIDAD.PLATAFORMA.ADMINISTRAR` (operación DeltaOps, doc 06 gobierna su uso).
- **Auditoría**: total — toda operación, sin excepciones ni muestreo.
- **Retención**: cuentas retiradas conservan el mínimo imputable por el plazo de auditoría del tenant (ETS-009); datos personales según doc 15.
- **Evidencias**: listado de cuentas activas por tenant, historial de cambios de acceso, informe de revisión periódica — exportables para auditoría externa.

## Impacto sobre la implementación

DGP de identidad como pieza de plataforma previa a todo lo demás del programa de seguridad (doc 25); los flujos de invitación/activación son parte del producto de administración.

## Dependencias

ESI-003/10-11 (contexto de identidad del Kernel); ETS-009; docs 03-07, 10, 13, 15-16 de esta serie.

## Riesgos

- La identidad global como canal de fuga entre tenants (atributos visibles cruzados); mitigación: lo visible en un tenant es la cuenta, no la identidad; los atributos globales mínimos §2.3 y la batería de aislamiento lo prueban.

## Decisiones habilitadas

- Contratistas multi-tenant sin identidades duplicadas.
- Revisiones de acceso periódicas con evidencia mecánica.

## Decisiones bloqueadas

- Prohibidas identidades o cuentas fuera del servicio (usuarios "de prueba" en tablas de módulos).
- Prohibido borrar historia de identidad al retirar cuentas.
- Prohibida administración de cuentas cruzando tenants.

## Reusable Pattern

Identidad global + cuenta por tenant + ciclo declarado: el modelo de todo sujeto del sistema, humano o no (doc 10 lo instancia para sistemas).

## Anti-Patterns

- El "usuario compartido" de cuadrilla (imputabilidad destruida; la respuesta es identidad por persona y sesiones de dispositivo compartido, doc 05).
- Cuentas suspendidas por convención ("no le den trabajo") en vez de por estado.
- Atributos de negocio acumulándose en la identidad global.

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles del negocio), ETS-009 (retención).
- **ESI que consume**: ESI-003/10-11.
- **DGP que originará**: DGP-Identidad (primera pieza del programa, doc 25).
- **ADR relacionados**: ADR identidad/cuenta separadas (doc 26).
- **Módulos que reutilizarán este patrón**: todos referencian cuentas; ninguno almacena usuarios propios.
