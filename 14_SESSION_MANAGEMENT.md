# 14 — Gestión de Sesiones

> **DeltaOps — ESI-003 · v1.0** · Sesiones opacas con estado en el servidor: revocables, auditables, aburridas a propósito.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Modelo oficial

Consecuencia directa de la decisión de doc 11: la sesión es **un registro con estado en el servidor identificado por un token opaco** de alta entropía. El cliente porta solo el token; todo lo demás (actor, tenant, expiraciones, metadatos) vive en el almacén de sesiones.

| Atributo de la sesión | Contenido |
|---|---|
| Identificador opaco | Aleatorio criptográfico; sin estructura, sin información embebida |
| Actor y tenant | Verificados en el alta (doc 11) |
| Expiración absoluta | Vida máxima total de la sesión |
| Expiración por inactividad | Ventana deslizante renovada con el uso |
| Metadatos de auditoría | Origen, agente, fecha de alta y último uso |
| Estado | Activa / cerrada / revocada, con motivo |

## 2. Almacén de sesiones

**Decisión:** el almacén de sesiones del MVP es **PostgreSQL**, el mismo motor del sistema (ESI-001), en tablas de plataforma (fuera del esquema de dominio, según ETS-010). **Por qué:** el volumen de sesiones de un EAM B2B es modesto, PostgreSQL ya está operado, respaldado y observado, y evita introducir una pieza de infraestructura nueva (Redis) solo para esto. La interfaz es un puerto del Kernel: si el rendimiento lo exigiera, el cambio de implementación no toca módulos (ESI-002/13: toda dependencia nueva exige ADR).

## 3. Ciclo de vida

1. **Alta** tras autenticación exitosa: token nuevo siempre (jamás se reutiliza), cookie segura, HttpOnly, SameSite estricta.
2. **Uso**: cada petición valida estado y expiraciones y desliza la ventana de inactividad. La foto de permisos NO vive en la sesión (doc 13, regla de resolución por petición).
3. **Renovación de token** ante elevación de privilegio o cambio de credencial: rotación con invalidación del anterior.
4. **Cierre** por el usuario, **revocación** por administrador (individual o todas las del actor) y **expiración**: los tres terminan en el mismo estado terminal, con motivo distinto y auditoría (ETS-006).
5. **Poda**: un trabajo de background (doc 22) elimina sesiones terminadas tras el plazo de retención del plano plataforma (doc 08).

## 4. Reglas normativas

1. **Una sesión, un tenant** (doc 11): cambiar de tenant = sesión nueva.
2. **Límites de concurrencia** de sesiones por actor configurables por plano plataforma; el exceso cierra la más antigua con auditoría.
3. **Nada sensible en el cliente**: prohibido almacenar en el navegador cualquier dato de sesión más allá del token opaco.
4. **Revocación efectiva inmediata**: la validación consulta el estado en cada petición; no hay ventana de gracia.
5. **Las credenciales de integración no son sesiones** (doc 11): tienen su propio ciclo en doc 24; este documento cubre solo humanos.

## Impacto sobre la implementación

El DGP de plataforma implementa el puerto de sesiones, su adaptador PostgreSQL, la rotación y la poda. Las tablas entran en el capítulo de migraciones de plataforma (ETS-010).

## Dependencias

Docs 08, 11, 13 y 22; ETS-006 (auditoría), ETS-009/010 (persistencia); ESI-001 (motor único).

## Riesgos

- Carga de validación por petición sobre la BD; mitigación: consulta puntual indexada por token; si midiera mal, caché de segundos con revocación por evento — cambio interno al puerto.
- Fijación de sesión; mitigación: token nuevo en el alta y rotación en elevación (regla del ciclo 3).

## Decisiones habilitadas

- Panel de administración de sesiones activas por tenant (módulo de administración).
- Métricas de sesiones activas como señal operativa (doc 17).

## Decisiones bloqueadas

- Prohibido introducir un almacén dedicado (Redis) sin ADR y medición previa.
- Prohibidos tokens con estructura o datos embebidos.
- Prohibida la validación de sesión con caché de larga duración.
