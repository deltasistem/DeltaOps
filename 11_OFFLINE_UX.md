# 11 — Offline UX

> **DeltaOps — ESI-008 · v1.0** · La experiencia offline: la intermitencia como estado normal — claridad de qué hay, qué se puede y qué está pendiente, sin mentir jamás.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Base congelada

ESI-005/18 fijó la mecánica: aptitud offline declarada por módulo, comandos que encolan con `clave_idempotencia`, sincronización con resolución de conflictos definida. Este documento norma **cómo se vive** esa mecánica.

## 2. Reglas

1. **Estado de conexión honesto y visible**: el shell muestra el estado (conectado / sin conexión / sincronizando) de forma persistente y discreta (doc 02 §2.4); los cambios de estado se anuncian sin bloquear. La aplicación jamás simula estar al día: los datos muestran su frescura cuando dejó de ser reciente ("visto hace 3 h" es información, no adorno).
2. **Aptitud por pantalla, del contrato**: cada pantalla declara plena / lectura / no disponible (doc 05); la no disponible offline lo explica al llegar (qué falta y por qué), nunca falla en silencio ni muestra esqueletos eternos (doc 12).
3. **Encolar se siente como avanzar**: el comando encolado confirma de inmediato con marca de "pendiente de sincronizar" en el recurso afectado; la cola es consultable (cuántos, cuáles, desde cuándo) desde el indicador del shell. El usuario de campo termina su jornada con la certeza de qué viajó y qué espera.
4. **Los conflictos se resuelven en términos de la tarea**: cuando la sincronización detecta conflicto (la política de ESI-005/18 decide), la experiencia lo presenta como decisión operativa ("la OT fue cerrada por otro mientras trabajabas; tu avance quedó registrado como…"), jamás como error técnico ni pérdida silenciosa.
5. **Lo crítico de campo se precarga**: el subconjunto offline del workspace de campo (doc 04 §3) se sincroniza proactivamente (mis tareas, activos implicados, catálogos necesarios); el técnico no "descarga" — su día ya está en el dispositivo al salir de cobertura.
6. **Sin conexión no hay menos verdad**: permisos y habilitaciones evaluados con el último estado sincronizado; las acciones cuya verdad no puede garantizarse offline (cambiar de tenant, doc 06 §3) se declaran online-only en el contrato — deshabilitadas con motivo, no rotas.

## 3. Declaración (los ocho rubros)

- **Commands**: los de gestión de cola (reintentar, descartar con confirmación) — la mutación de negocio es de cada pantalla.
- **Queries**: estado de conexión, cola pendiente, frescura por recurso, subconjunto precargado.
- **Capacidades**: la aptitud offline sigue la declarada por módulo (ESI-005/18).
- **Servicios**: sincronización (mecánica congelada), notificaciones locales de resultado.
- **Permisos**: los del último estado sincronizado; sin permisos propios.
- **Offline**: este documento ES el rubro; su contrato es la referencia.
- **KPIs**: comandos encolados por jornada, edad máxima de cola, conflictos por cien sincronizaciones.
- **IA**: ninguna offline (ESI-006/13 exige servicio); las entradas de IA se declaran online-only.

## Impacto sobre la implementación

Los patrones (indicador, cola consultable, marcas de pendiente, presentación de conflictos, precarga) son piezas del DGP de experiencia consumidas por las pantallas de campo.

## Dependencias

Docs 02, 04-06, 12; ESI-005/18; ESI-006/13; ETS-011.

## Riesgos

- La ilusión de sincronizado (mostrar datos viejos como actuales) que destruye la confianza del campo; mitigación: frescura visible §2.1 y la batería de honestidad offline en el checklist (doc 25).

## Decisiones habilitadas

- Jornadas de campo completas sin cobertura con confianza total.
- Soporte que responde "qué pasó con mi registro" mirando la cola.

## Decisiones bloqueadas

- Prohibido simular conexión o frescura.
- Prohibida la pérdida silenciosa en conflictos.
- Prohibidas pantallas sin aptitud offline declarada.

## Reusable Pattern

Estado honesto + cola visible + conflictos operativos + precarga de jornada: la gramática offline única que toda pantalla de campo instancia.

## Anti-Patterns

- El botón que falla al pulsar porque "no había red" (se sabía antes).
- La sincronización como pantalla de carga bloqueante al recuperar señal.
- Resolver conflictos siempre a favor del último en llegar sin decirlo.

## Knowledge Graph

- **ETS que consume**: ETS-011 (intermitencia como norma).
- **ESI que consume**: ESI-005/18 (mecánica congelada); ESI-006/13.
- **DGP que originará**: patrones offline en el DGP de experiencia.
- **ADR relacionados**: ADR de honestidad de frescura; ADR de conflictos en términos de tarea.
- **Módulos que reutilizarán este patrón**: todos los de aptitud offline; los demás heredan el indicador y la degradación.
