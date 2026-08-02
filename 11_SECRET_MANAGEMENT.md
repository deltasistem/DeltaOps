# 11 — Secret Management

> **DeltaOps — ESI-007 · v1.0** · La gestión de secretos: dónde viven las llaves del sistema, quién las toca y cómo se demuestra que nadie más.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

Un **secreto** es todo material cuya revelación compromete seguridad: credenciales de integración, llaves de firma (webhooks, portadores), llaves de cifrado, credenciales de infraestructura. El modelo:

| Concepto | Definición |
|---|---|
| **Almacén único** | Los secretos viven en el mecanismo de gestión de plataforma — jamás en código, repositorio, configuración plana, variables visibles ni documentos |
| **Referencia, no valor** | Las piezas del sistema (chasis de integraciones, Kernel) referencian secretos por nombre lógico; el valor se resuelve en tiempo de ejecución con la identidad de la pieza |
| **Acceso por identidad** | Cada secreto declara qué piezas pueden resolverlo; el acceso queda registrado (qué pieza, cuándo) |
| **Ciclo del secreto** | Alta, rotación (doc 12), revocación, retiro — cada transición auditada |

## 2. Reglas

1. **Cero secretos fuera del almacén**: la puerta de calidad incluye detección mecánica de secretos en código y configuración (patrones conocidos) como validación bloqueante; el hallazgo dispara rotación inmediata, no solo limpieza.
2. **Los secretos de tenant son del tenant**: las credenciales que el tenant registra (sus sistemas, ESI-006/14) se gestionan con el mismo almacén, aisladas por las murallas — visibles solo como metadatos (nombre, edad, última rotación) incluso para su administrador; el valor no se re-muestra jamás tras el alta.
3. **Separación de ambientes absoluta**: los secretos de producción no existen en desarrollo ni pruebas; los ambientes de prueba usan secretos propios de alcance de prueba (ESI-002 seed).
4. **Cifrado en reposo y tránsito por estándar de plataforma** para el almacén mismo; las llaves maestras siguen la jerarquía del proveedor de infraestructura con acceso de operación mínimo y auditado.
5. **Exposición mínima en ejecución**: las piezas reciben el secreto resuelto solo en memoria de trabajo; prohibido re-registrarlo (bitácoras, errores, telemetría) — los formatos de error canónicos ya lo excluyen por diseño.

## 3. Declaración (los seis rubros)

- **Clasificación**: secreto (S) — el nivel existe por este dominio (doc 16).
- **Riesgo**: crítico (R1).
- **Permisos**: `PLATAFORMA.SECRETOS.ADMINISTRAR` (operación, mínimo y auditado); `INTEGRACIONES.CREDENCIALES.REGISTRAR` (tenant, alta sin re-lectura).
- **Auditoría**: total — alta, resolución, rotación, revocación, retiro, con identidad de pieza.
- **Retención**: secretos retirados no se retienen; su historial de ciclo sí (plazo de eventos de seguridad).
- **Evidencias**: inventario de secretos con edades y accesos, informe de detección en código (cero hallazgos como norma), registro de rotaciones.

## Impacto sobre la implementación

El almacén y la resolución por identidad entran al DGP de plataforma de seguridad; la detección mecánica se suma a la puerta (ESI-002/17); el chasis de integraciones migra su gestión de credenciales aquí por diseño (ya previsto).

## Dependencias

Docs 10, 12-13, 16; ESI-002/17; ESI-006/14; ETS-009.

## Riesgos

- El secreto "temporal" en configuración durante un incidente; mitigación: el camino de emergencia legítimo es el alta exprés en el almacén (diseñada para ser tan rápida como el atajo) — el atajo no tiene ventaja.

## Decisiones habilitadas

- Rotaciones y revocaciones quirúrgicas con radio conocido (quién resuelve qué).
- Postura demostrable ante clientes: sus credenciales ni se re-muestran ni viajan.

## Decisiones bloqueadas

- Prohibidos secretos en código, repositorios, configuración plana o documentos.
- Prohibida la re-lectura de valores tras el alta.
- Prohibidos secretos de producción fuera de producción.

## Reusable Pattern

Almacén único + referencia por nombre lógico + acceso por identidad registrado + detección mecánica en puerta: el contrato de todo material sensible presente y futuro.

## Anti-Patterns

- El documento compartido "llaves del equipo".
- Secretos en variables de entorno visibles en paneles.
- Rotación pospuesta indefinidamente porque "algo se puede romper" (doc 12 la hace rutina).

## Knowledge Graph

- **ETS que consume**: ETS-009 (protección de datos), ETS-011 (credenciales de frontera).
- **ESI que consume**: ESI-002/17; ESI-006/14.
- **DGP que originará**: almacén y resolución en el DGP de plataforma de seguridad.
- **ADR relacionados**: ADR de referencia-no-valor (doc 26); ADR de no-re-lectura.
- **Módulos que reutilizarán este patrón**: ninguno gestiona secretos; los que integran (vía chasis) los referencian sin verlos.
