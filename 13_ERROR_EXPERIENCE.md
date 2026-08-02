# 13 — Error Experience

> **DeltaOps — ESI-008 · v1.0** · La experiencia de error: contenido, en términos de la tarea, con salida siempre — el error como momento de confianza, no de abandono.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Taxonomía de superficie

Los contratos de error del sistema ya existen (pipeline ESI-003, capas de autorización ESI-007/04, no-fuga ESI-007/09). Este documento norma su **traducción a experiencia**:

| Clase | Origen | Presentación normada |
|---|---|---|
| **De validación** | El comando rechaza datos (Policies, ESI-005/09) | En el lugar: junto al campo (doc 19), en el idioma de la tarea, con cómo corregir |
| **De regla de negocio** | La operación es inválida en este estado | Diálogo o panel contextual explicando la regla ("la OT no puede cerrarse con tareas abiertas"), con la acción alternativa si existe |
| **De autorización** | Denegación o inexistencia (ESI-007/04) | Exactamente lo que el contrato de no-fuga dicte; sin detalles internos; con a quién pedir acceso si aplica |
| **De sistema** | Fallo técnico ajeno al usuario | Contenido en su región (§2.1), disculpa breve, reintento disponible, referencia de soporte; jamás jerga ni volcados |
| **De conexión** | Sin red / timeout | El régimen offline (doc 11); si la acción era online-only, ya estaba deshabilitada con motivo |

## 2. Reglas

1. **Contención por región**: el error de una región (un panel, una tabla) se muestra en esa región; el resto de la pantalla y el shell siguen vivos (doc 02 §2.5). La pantalla entera de error queda para cuando nada de ella puede servir.
2. **Todo error tiene salida**: reintentar, corregir, volver, o pedir ayuda — el error sin acción posible está prohibido; el callejón sin salida es fallo de diseño, no del usuario.
3. **El idioma es el de la tarea**: los mensajes traducen el contrato técnico a lo operativo, del catálogo de contenido (doc 10 §2.5); códigos y referencias técnicas van en "detalles" plegados y en la referencia de soporte, no en el titular.
4. **Nada se pierde por un error**: el trabajo del usuario (formularios, selecciones) sobrevive a cualquier error, incluido el de sistema (doc 19 §2.5); "vuelva a escribirlo" es la traición máxima.
5. **Los errores se miden**: cada presentación de error de sistema emite telemetría (sin datos sensibles, ESI-007/13 §2.6); las pantallas con más errores por sesión suben al score (doc 24) — el error frecuente es un defecto, no un destino.
6. **La referencia de soporte cierra el círculo**: los errores de sistema muestran una referencia citable que el soporte puede correlacionar con la telemetría — "me salió un error" se convierte en algo investigable.

## 3. Declaración (los ocho rubros)

- **Commands**: reintento (re-disparo idempotente con la misma `clave_idempotencia` donde aplique).
- **Queries**: ninguna propia; el estado de error es de la región que falló.
- **Capacidades/Permisos**: la clase de autorización obedece su contrato congelado; sin rubros propios.
- **Servicios**: telemetría; notificaciones si el fallo llegó de un trabajo en segundo plano (doc 12 §2.4).
- **Offline**: la clase de conexión delega en el doc 11.
- **KPIs**: errores de sistema por sesión y por pantalla, tasa de reintento exitoso, callejones detectados.
- **IA**: opcional como explicador ("qué significa esto"), marcada y sin inventar causas (doc 22).

## Impacto sobre la implementación

El mapa clase→presentación y los componentes de error por región entran al DGP de experiencia; el catálogo de mensajes operativos se puebla por DGP de módulo.

## Dependencias

Docs 02, 10-12, 14, 19, 22, 24; ESI-003; ESI-005/09; ESI-007/04, /09, /13.

## Riesgos

- Mensajes genéricos ("algo salió mal") por pereza de catálogo; mitigación: la revisión de experiencia exige mensaje operativo por cada regla de negocio expuesta, y el genérico solo es legítimo en la clase de sistema.

## Decisiones habilitadas

- Confianza del usuario operativo: el error explica y deja avanzar.
- Soporte eficiente por referencia correlacionable.

## Decisiones bloqueadas

- Prohibidos errores sin salida accionable.
- Prohibida la pérdida de trabajo del usuario por errores.
- Prohibido revelar interiores técnicos en superficie (no-fuga).

## Reusable Pattern

Taxonomía de cinco clases + contención por región + salida garantizada + referencia de soporte: la gramática de error única que toda pantalla instancia sin inventar.

## Anti-Patterns

- El error modal que tapa la pantalla por un fallo periférico.
- Culpar al usuario con tono técnico ("input inválido").
- Tragarse el error y dejar el botón "sin hacer nada".

## Knowledge Graph

- **ETS que consume**: ETS-011 (usuarios bajo presión, sin paciencia técnica).
- **ESI que consume**: ESI-003 (contratos de error); ESI-005/09; ESI-007/04, /09, /13.
- **DGP que originará**: componentes y mapa de errores en el DGP de experiencia; mensajes por DGP de módulo.
- **ADR relacionados**: ADR de contención por región; ADR de referencia de soporte.
- **Módulos que reutilizarán este patrón**: todos traducen sus reglas al catálogo; ninguno inventa presentación de error.
