# 20 — Shared Configuration Model

> **DeltaOps — ESI-006 · v1.0** · La configuración por tenant de los servicios compartidos: mismo motor, mismos formularios, precedencias claras.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

La configuración de servicios usa íntegro el modelo de ESI-005/14: parámetros declarados con esquema, defaults completos, cambios auditados y no retroactivos, validación al escribir, sin variabilidad programática, seed asimétrico. Las fichas (docs 03-16) ya declararon sus catálogos; este documento fija las reglas comunes.

## 2. Reglas específicas del estrato

1. **Tres niveles de precedencia, declarados por parámetro**: plataforma (operación del servicio: proveedores, límites globales) → tenant (cuotas, canales, zonas de plantilla, metas) → usuario (preferencias de notificación, tableros personales). Cada parámetro declara su nivel; un parámetro no puede ser sobreescrito en un nivel no declarado.
2. **Los límites protegen el estrato**: cuotas y presupuestos (almacenamiento de adjuntos, concurrencia de exportes, inferencias de IA) son parámetros de nivel plataforma/tenant con denegación explícita al alcanzarse (error canónico, no degradación silenciosa) — un tenant no puede agotar un servicio compartido para los demás.
3. **La configuración de un servicio no configura módulos**: la obligatoriedad de evidencias en cierre de OT es parámetro del módulo OT (que consulta adjuntos por contrato), no de adjuntos. La regla de propiedad: configura quien posee la regla de negocio.
4. **Preferencias de usuario dentro del marco del tenant**: el usuario ajusta solo lo que el tenant permitió (doc 03 §preferencias, doc 15 §composición); la precedencia nunca invierte.

## Impacto sobre la implementación

Cero motores nuevos: entradas al motor de ETS-005 con el atributo de nivel; la UI de administración se deriva de declaraciones, ahora en tres vistas (plataforma/tenant/usuario).

## Dependencias

ETS-005; ESI-005/14; fichas docs 03-16; ESI-002/12 (seed).

## Riesgos

- Confusión de niveles (metas de negocio configuradas a nivel plataforma, límites operativos expuestos al tenant); mitigación: el nivel es parte de la declaración revisada en el DGP, y la UI derivada no ofrece lo no declarado.

## Decisiones habilitadas

- Administración de servicios coherente con la de módulos (una sola forma de configurar).
- Protección multi-tenant del estrato por cuotas declaradas.

## Decisiones bloqueadas

- Prohibidos parámetros sin nivel de precedencia declarado.
- Prohibido que servicios configuren reglas de negocio de módulos.
- Prohibidas degradaciones silenciosas al alcanzar límites.

## Reusable Pattern

El atributo de nivel (plataforma/tenant/usuario) sobre el formulario de parámetro de ESI-005/14: todo servicio futuro declara su catálogo con niveles y cuotas de protección.

## Anti-Patterns

- Preferencias de usuario almacenadas fuera del motor (tablas propias por servicio).
- Cuotas "blandas" que se ignoran en producción.
- Parámetros de plataforma editables por administradores de tenant.

## Knowledge Graph

- **ETS que consume**: ETS-005 (motor de configuración).
- **ESI que consume**: ESI-005/14; ESI-002/12.
- **DGP que originará**: los catálogos de parámetros de cada DGP-servicio; la vista de tres niveles en el DGP de administración.
- **ADR relacionados**: ADR de precedencia de tres niveles (§2.1); ADR de no-retroactividad (ESI-005/14).
- **Módulos que reutilizarán este patrón**: todos conviven con él como consumidores de servicios configurados; sus propios parámetros siguen en ESI-005/14.
