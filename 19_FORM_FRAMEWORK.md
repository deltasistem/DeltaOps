# 19 — Form Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de formularios: capturar sin fricción y sin perder nada — validación en el lugar, borrador implícito y el comando como única verdad.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

El formulario es la superficie de un comando (o de la edición de un recurso). Sus elementos provienen de un **catálogo cerrado de controles** (texto, número con unidad, fecha/hora con `fechaNegocio` donde aplique, selección de catálogo, búsqueda de referencia, adjuntos, firma, captura de campo) — cada control normado una vez con su comportamiento, accesibilidad (doc 10) y variante por postura (doc 09).

## 2. Reglas

1. **El formulario refleja el comando, no la tabla**: los campos son los de la intención del comando declarado (doc 05); los internos del agregado no se exponen porque existan. El formulario con cuarenta campos es un contrato mal partido o un asistente reprimido (doc 17).
2. **Validación en tres tiempos honestos**: formato al salir del campo (en el lugar, sin gritar mientras se escribe); coherencia al enviar; y las **reglas de negocio son del comando** — el formulario anticipa lo anticipable (doc 05 §2.3: lo imposible se deshabilita antes), pero la verdad final es del pipeline y su error se presenta por el doc 13. Prohibido duplicar reglas de negocio en la superficie: anticipar sí, decidir no.
3. **Nada se pierde, jamás**: borrador implícito continuo (local, por contexto); recuperación tras cierre, expiración de sesión (doc 10 §2.4) o error de sistema (doc 13 §2.4); el envío offline encola con confirmación (doc 11 §2.3).
4. **Cada campo se gana su lugar**: obligatorio solo lo que el comando exige; valores por defecto sensatos declarados (configuración del tenant, ESI-006/20); lo opcional-avanzado plegado. El costo de captura es la métrica de campo más real (ETS-011: cada segundo de guantes cuenta).
5. **Edición con las mismas garantías**: editar un recurso usa el mismo marco con concurrencia honesta — si otro cambió el recurso mientras editabas, el conflicto se presenta en términos de la tarea (qué cambió, qué quieres conservar), nunca sobrescritura silenciosa (el espejo online del conflicto offline, doc 11 §2.4).
6. **Unidades y formatos del sistema**: números con unidad explícita (la tonelada confundida con kilo es un accidente industrial), fechas con `fechaNegocio` vs. registro diferenciadas donde el dominio lo exige (ESI-003) — controles normados, no convenciones locales.

## 3. Declaración (los ocho rubros)

- **Commands**: el comando del formulario (uno por formulario como norma), con confirmación/step-up si lo declara.
- **Queries**: catálogos y referencias que alimentan controles de selección.
- **Capacidades/Permisos**: los del comando; el formulario sin permiso no se abre (habilitación honesta aguas arriba).
- **Servicios**: adjuntos (ESI-006/04), configuración (defaults por tenant).
- **Offline**: apto si su comando encola (borrador local + `clave_idempotencia`); sus referencias usan catálogos sincronizados.
- **KPIs**: tiempo de captura por formulario, tasa de error de validación por campo (detector de mal diseño), borradores recuperados.
- **IA**: prellenado sugerido marcado y editable (doc 22); la IA propone, el usuario dispone, el comando decide.

## Impacto sobre la implementación

El catálogo de controles con posturas y accesibilidad es entregable central del DGP de experiencia; cada formulario se declara en el DGP de su módulo citando su comando.

## Dependencias

Docs 05, 09-11, 13, 17, 22; ESI-003 (`fechaNegocio`, idempotencia); ESI-005/09; ESI-006/04, /20.

## Riesgos

- Reglas de negocio duplicadas en superficie que divergen del comando (la validación que miente); mitigación: la regla §2.2 es de bloqueo en revisión — la superficie anticipa citando, jamás decide por su cuenta.

## Decisiones habilitadas

- Captura de campo rápida y a prueba de interrupciones.
- Formularios nuevos por composición de controles normados.

## Decisiones bloqueadas

- Prohibido duplicar reglas de negocio en la superficie.
- Prohibida la pérdida de captura por cualquier causa.
- Prohibidos controles fuera del catálogo sin evolución del estándar.

## Reusable Pattern

Catálogo de controles + validación de tres tiempos + borrador implícito + un comando: el formulario como superficie fiel del contrato — captura sin traición.

## Anti-Patterns

- El formulario-tabla que expone el agregado entero.
- Validar todo solo al enviar (la lista roja de veinte errores).
- El "guardar" que a veces guarda distinto según la pantalla.

## Knowledge Graph

- **ETS que consume**: ETS-011 (costo real de captura en campo).
- **ESI que consume**: ESI-003; ESI-005/09; ESI-006/04, /20.
- **DGP que originará**: catálogo de controles en el DGP de experiencia; formularios por DGP de módulo.
- **ADR relacionados**: ADR de anticipar-sin-decidir; ADR de borrador implícito universal.
- **Módulos que reutilizarán este patrón**: todos; ningún formulario artesanal.
