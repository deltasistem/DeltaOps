# 22 — Golden Path

> **DeltaOps — ESI-004 · v1.0** · El camino dorado: la secuencia oficial para construir cualquier funcionalidad, demostrada de punta a punta.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Qué es

El Golden Path es la secuencia normada de pasos para llevar una funcionalidad desde la intención hasta mergeada — usando solo el camino oficial: generadores, plantillas, contratos y puerta. El módulo de referencia lo recorre entero una vez; los DGP lo repiten siempre.

## 2. La secuencia oficial

| Paso | Acción | Herramienta oficial |
|---|---|---|
| 1 | Ubicar la regla: ¿agregado, Policy, servicio, consulta? | Taxonomía doc 11 §2.3 + tabla doc 07 §2 |
| 2 | Catalogar lo nuevo: permisos, capacidades, eventos, errores | Catálogos (ETS-002/006/008, ESI-003/04) por ciclo de producto |
| 3 | Generar la pieza con su prueba | `generar` (ESI-002/16 y /19) con la plantilla T correspondiente |
| 4 | Escribir el dominio: invariantes, transición, evento | Nivel dominio, pruebas de tabla primero |
| 5 | Completar la orquestación del caso de uso | Patrón doc 10 (cargar-preguntar-ordenar-registrar) |
| 6 | Migración y seed si hay datos nuevos | Capítulos del módulo (ETS-010, ESI-002/12) |
| 7 | Adaptar contratos y borde | Contratos ETS-008 regenerados; el borde solo traduce |
| 8 | Actualizar declaración y expediente | Docs 03 y 20, en el mismo PR |
| 9 | Verificar en local | `verificar` (peldaño local, ESI-002/14) |
| 10 | PR pequeño con plantilla; revisión humana; puerta en verde; squash | ESI-002/04 y /14 |

El paso 3 es el corazón: **crear a mano lo que el generador sabe crear está prohibido para agentes IA y desaconsejado para humanos** (ESI-002/19).

## 2b. El recorrido del ejemplar

El módulo de referencia documenta su propia construcción como bitácora del Golden Path (parte del expediente, doc 20): cada pieza anotada con el paso y la plantilla usados. Esa bitácora es el material de onboarding práctico (ESI-002/06, semana 1).

## 3. Reglas

1. El Golden Path es **el camino por defecto**; desviarse exige anotarlo en el PR con porqué — y si la desviación se repite, el camino se corrige (ESI-002/28), no se normaliza la excepción.
2. Los pasos no se reordenan: catalogar después de codificar produce los arranques rotos que el doc 03 §3.2 prohíbe.
3. Un paso 10 rechazado vuelve al paso que corresponda; no hay "arreglos en caliente" fuera del PR.

## Impacto sobre la implementación

Es la columna vertebral de todo DGP: sus tareas se expresan como recorridos del Golden Path sobre piezas concretas. El primer recorrido completo válido es el propio módulo de referencia.

## Dependencias

Docs 03, 07, 10, 11, 20 y 21; ESI-002/04, /12, /14, /16, /19 y /25; ETS-008/010.

## Riesgos

- El camino percibido como burocracia si las herramientas fallan; mitigación: la fricción del camino es defecto de plataforma de primera clase (ESI-002/01) y se arregla con prioridad.

## Decisiones habilitadas

- DGP expresables como secuencias verificables de pasos conocidos.
- Onboarding práctico sobre la bitácora del ejemplar.

## Decisiones bloqueadas

- Prohibido a los agentes IA crear a mano piezas generables.
- Prohibido normalizar desviaciones repetidas sin corregir el camino.

## Reusable Pattern

Los DGP futuros usan la tabla §2 como plantilla de tareas: cada funcionalidad es una instancia de la secuencia. La bitácora §2b es el formato de evidencia.

## Anti-Patterns

- "Primero lo hago funcionar, después lo adapto al patrón".
- Saltarse el generador porque "es más rápido a mano".
- PRs gigantes que recorren el camino diez veces en un solo viaje (ESI-002/04: PR chico).
