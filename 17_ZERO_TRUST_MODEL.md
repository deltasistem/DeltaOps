# 17 — Zero Trust Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de confianza cero: ninguna petición se fía de dónde viene — toda actuación se verifica, siempre, en el punto de decisión.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La postura

Confianza cero en DeltaOps no es un producto: es la consecuencia de decisiones ya congeladas, nombrada y completada. El principio: **la red no otorga confianza; la identidad verificada y la evaluación por petición, sí.**

| Principio ZT | Cómo lo cumple DeltaOps |
|---|---|
| Verificar explícitamente | Toda petición porta identidad (doc 09 §2.1) y recorre las cuatro verdades (doc 04) — sin "zonas internas confiables" |
| Mínimo privilegio | RBAC aditivo con evidencia de uso (doc 07 §2.6), cuentas de servicio de alcance mínimo (doc 10 §2.2), restricción de alcance (doc 08 §2.5) |
| Asumir la brecha | Dos murallas (ESI-003/09), rotación reflejo (doc 12 §2.3), señales con dueño (doc 13 §2.4), radio de revocación conocido (docs 11-12) |

## 2. Reglas

1. **El cliente es no confiable por definición**: web, móvil y sistemas externos son emisores de peticiones a verificar; nada que el cliente afirme (roles, tenant, fuerza de sesión) se acepta sin verificación de servidor (doc 04 §2.4).
2. **Las piezas internas también se autentican**: servicios compartidos y módulos actúan con identidad de pieza (doc 11 §1: resolución por identidad) o con la identidad del solicitante (ESI-006/19 §3.2) — la llamada interna anónima no existe; la red interna no es una zona de confianza.
3. **Sin acceso permanente elevado**: la operación de plataforma trabaja con acceso mínimo cotidiano y elevación temporal auditada para lo excepcional (el patrón del acceso de soporte, doc 06, aplicado a la propia operación); las cuentas eternas con poder total son el objetivo favorito y no existen.
4. **La verificación es por petición, la confianza no se hereda**: haber podido antes no autoriza ahora (revocación inmediata, doc 05 §2.1); haber entrado no autoriza a moverse (cada recurso re-evalúa).
5. **Los datos se protegen como si la red estuviera comprometida**: cifrado en tránsito siempre (doc 09 §2.5), en reposo por estándar de plataforma, secretos solo en el almacén (doc 11) — la brecha de red no debe regalar nada legible.

## 3. Declaración (los seis rubros)

- **Clasificación**: N/A (postura); sus controles heredan las suyas.
- **Riesgo**: la postura gobierna R1 completo.
- **Permisos**: los de sus controles constituyentes; la elevación temporal de operación exige su permiso dedicado y auditoría reforzada.
- **Auditoría**: la de los controles; la elevación temporal, con motivo y plazo como el acceso de soporte.
- **Retención**: la de eventos de seguridad.
- **Evidencias**: verificación de los principios por batería (peticiones internas anónimas = cero; accesos permanentes elevados = cero), informe de elevaciones.

## Impacto sobre la implementación

Sin piezas nuevas: la elevación temporal de operación entra al DGP de operación de plataforma; las baterías de verificación ZT se suman al checklist (doc 22).

## Dependencias

Docs 04-06, 09-13; ESI-003/09-10; ESI-006/19.

## Riesgos

- La postura declarada divergiendo de la práctica (la llamada interna "rápida" sin identidad); mitigación: las baterías §3 son mecánicas y el hallazgo es de bloqueo en revisión (doc 23).

## Decisiones habilitadas

- Postura ZT nombrable ante clientes empresariales con evidencia por principio.
- Operación de plataforma sin cuentas doradas.

## Decisiones bloqueadas

- Prohibidas zonas de confianza por red o por origen.
- Prohibidas llamadas internas sin identidad.
- Prohibido el acceso permanente elevado de operación.

## Reusable Pattern

Verificar explícito + mínimo privilegio + asumir brecha, mapeados a controles citables: la postura como composición verificable, no como eslogan.

## Anti-Patterns

- "Estamos detrás del firewall" como argumento de diseño.
- La lista blanca de IPs como sustituto de identidad.
- ZT declarado en ventas y desmentido en runbooks.

## Knowledge Graph

- **ETS que consume**: ETS-009 (protección), ETS-011 (fronteras).
- **ESI que consume**: ESI-003/09-10; ESI-006/19.
- **DGP que originará**: elevación temporal en DGP de operación; baterías ZT en el checklist.
- **ADR relacionados**: ADR de no-confianza interna (doc 26).
- **Módulos que reutilizarán este patrón**: todos operan bajo la postura sin diseñarla.
