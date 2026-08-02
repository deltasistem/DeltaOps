# 18 — Observabilidad en el Módulo de Referencia

> **DeltaOps — ESI-004 · v1.0** · Lo que el módulo mide de sí mismo — encima de todo lo que la plataforma ya mide gratis.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Lo que llega gratis

Por construcción (ESI-003/17), sin una línea del módulo: latencia y resultados de sus rutas, duración de sus transacciones, eventos despachados/consumidos de sus bandejas, edad de bandeja del consumidor, trazas completas del pipeline con la correlación cruzando el evento. La primera lección del ejemplar es **cuánto no hay que instrumentar**.

## 2. Las métricas propias del módulo (catálogo completo)

| Métrica | Tipo | Por qué existe |
|---|---|---|
| `referencia_activaciones_total` (etiqueta: resultado) | Contador | El hito de negocio del módulo; segmentado por éxito/denegación-policy/transición-ilegal/conflicto |
| `referencia_elementos_activos` (por tenant opaco) | Medidor | La señal de producto: uso real de la capacidad (ESI-003/17 §2.5) |
| `referencia_proyeccion_divergencias_total` | Contador | La salud de la proyección (doc 15); su alerta tiene respuesta escrita: reconstruir |

**Tres métricas.** Cardinalidad controlada: resultado (4 valores), tenant opaco; jamás identificadores de elemento (eso es traza/log).

## 3. Qué demuestra

1. **El criterio de métrica propia**: hito de negocio, señal de producto, salud de pieza propia. Todo lo demás ya está medido o pertenece a trazas.
2. **Toda alerta con respuesta** (ESI-003/17 regla 5): el ejemplar define una sola alerta (divergencia > 0) con su respuesta operativa documentada (doc 20).
3. **Nombres conforme a convención** (ESI-003/26): prefijo del módulo, español, unidades implícitas en el tipo.
4. **La prueba de observabilidad existe**: la batería E2E verifica que la activación incrementa el contador y que la traza contiene los tramos declarados — la observabilidad es funcionalidad, se prueba como tal.

## Impacto sobre la implementación

El puerto de observabilidad del Kernel se usa aquí por primera vez desde un módulo; la plantilla T01 trae el punto de métrica del hito principal marcado.

## Dependencias

ESI-003/17 (runtime) y /26 (convenciones); docs 15, 16 y 20; ESI-002/28 (señal→respuesta).

## Riesgos

- Módulos futuros midiendo todo lo medible "porque es fácil"; mitigación: el criterio §3.1 en el checklist de revisión y el coste de cardinalidad como argumento técnico.

## Decisiones habilitadas

- Tableros por módulo con estructura uniforme (hito, uso, salud).
- Pruebas de observabilidad como parte del patrón E2E.

## Decisiones bloqueadas

- Prohibido duplicar métricas que la plataforma ya emite.
- Prohibidas etiquetas de cardinalidad alta en métricas de módulo.
- Prohibidas alertas sin respuesta escrita.

## Reusable Pattern

Los DGP futuros copian: la tríada de métricas propias (hito de negocio / señal de producto / salud de piezas propias) como plantilla de decisión, el formato del catálogo §2, y la prueba de observabilidad §3.4.

## Anti-Patterns

- Instrumentación manual de latencias que las trazas ya capturan.
- Métricas con identificadores de recurso como etiquetas.
- Tableros por módulo sin dueño ni alertas accionables.
