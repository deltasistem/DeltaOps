# 17 — Wizard Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de asistentes: procesos con pasos como paréntesis gobernado — progreso visible, borrador siempre, un solo comando al final.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Cuándo es un asistente

Un asistente (layout L4, doc 07) existe cuando una tarea exige decisiones secuenciales dependientes que no caben en un formulario (doc 19). Criterio: **≥3 pasos con dependencia real entre ellos**; menos que eso es un formulario con secciones; una tarea modal (doc 16) si es mínima.

## 2. Reglas

1. **El asistente es un paréntesis** (doc 03 §2.5): se abre desde una pantalla, se cierra volviendo a ella; no es destino del árbol de navegación ni tiene ruta propia compartible — lo compartible es el resultado.
2. **Progreso honesto**: pasos visibles con nombre, posición actual, y navegación hacia atrás sin perder lo hecho; los pasos condicionales aparecen/desaparecen sin renumerar la sensación de avance ("paso 7 de 4" está prohibido por absurdo).
3. **Borrador desde el primer campo**: el trabajo del asistente sobrevive a cierres, sesiones y desconexiones (doc 13 §2.4); retomar es explícito ("tienes un alta a medias"). El borrador es local a la cuenta y contexto (jamás cruza tenant, doc 06 §2.2).
4. **Validación por paso, verdad al final**: cada paso valida lo suyo al avanzar (errores en el lugar, doc 13); pero el **comando es uno y al final** — el asistente compone la intención completa y la dispara con una `clave_idempotencia`; los pasos no van dejando mutaciones parciales por el camino (la transaccionalidad del pipeline, ESI-003).
5. **El resumen antes del compromiso**: el paso final muestra lo que se va a hacer en términos operativos; confirmar dispara; el resultado lleva al recurso creado (enlace profundo) — el asistente que termina en el vacío desorienta.
6. **Salida digna en cualquier paso**: cancelar pregunta por el borrador (guardar/descartar); el asistente kilométrico sin salida es secuestro.

## 3. Declaración (los ocho rubros)

- **Commands**: el comando final único (con su permiso y condiciones); pasos sin comandos propios.
- **Queries**: las que alimentan opciones por paso (catálogos, disponibilidad).
- **Capacidades/Permisos**: los del comando final se verifican al entrar (no al final tras veinte minutos: la habilitación honesta del doc 05 §2.3).
- **Servicios**: borradores (persistencia local/configuración), adjuntos si el flujo los pide (ESI-006/04).
- **Offline**: el asistente cuyo comando encola funciona offline completo (borrador local + encolado final, doc 11); el que exige verdad online lo declara y su disparador lo dice.
- **KPIs**: tasa de finalización, paso de mayor abandono, borradores retomados.
- **IA**: opcional para prellenar pasos con sugerencias marcadas y editables (doc 22); jamás avanza pasos sola.

## Impacto sobre la implementación

El marco (progreso, borradores, composición de intención, resumen) entra al DGP de experiencia; cada asistente concreto se declara en el DGP de su módulo con su contrato.

## Dependencias

Docs 03, 05-07, 11, 13, 16, 19, 22; ESI-003; ESI-006/04.

## Riesgos

- Asistentes usados para esconder formularios mal diseñados (partir en pasos lo que era una pantalla confusa); mitigación: el criterio de ≥3 pasos dependientes en revisión (doc 25) y el KPI de abandono delatando la fricción artificial.

## Decisiones habilitadas

- Procesos complejos (alta de activo con jerarquía, recepción de compra) completables por usuarios no expertos.
- Capturas largas de campo resistentes a interrupciones.

## Decisiones bloqueadas

- Prohibidas mutaciones parciales por paso (un comando, al final).
- Prohibidos asistentes sin borrador persistente.
- Prohibido verificar permisos solo al final.

## Reusable Pattern

Paréntesis + borrador + composición de intención + comando único: el asistente como transacción de experiencia — la versión UX de la atomicidad del pipeline.

## Anti-Patterns

- El paso 1 que ya creó el recurso "en borrador" en el servidor (mutación disfrazada).
- Pasos de una sola pregunta que alargan sin motivo.
- El botón "siguiente" que valida todo lo anterior otra vez con errores en pasos ya cerrados.

## Knowledge Graph

- **ETS que consume**: ETS-011 (interrupciones de campo).
- **ESI que consume**: ESI-003 (atomicidad, idempotencia); ESI-006/04.
- **DGP que originará**: el marco de asistentes en el DGP de experiencia; asistentes concretos por DGP de módulo.
- **ADR relacionados**: ADR de comando único al final.
- **Módulos que reutilizarán este patrón**: todos los flujos de alta/proceso complejo.
