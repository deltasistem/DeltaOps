# 19_GENERATOR_STRATEGY.md

> **DeltaOps — ESI-002 · v1.0** · Estrategia de generadores: la plantilla hecha comando.
> Sin código, sin scripts — diseño normativo.

---

## 1. Principio: generar es la vía normal de crear

Toda pieza del catálogo de plantillas (18) se crea con `generar <tipo> <módulo> <nombre>` (16). Crear a mano lo que el generador produce está desaconsejado para humanos y **prohibido para agentes IA** (17 §3.5). Razón: el generador aplica las convenciones de nombre, ruta (03), estructura, prueba espejo y registro — los cinco lugares donde la mano humana (o la memoria de un modelo) deriva.

## 2. Contrato de todo generador

1. **Entrada mínima**: tipo de pieza, módulo destino y nombre en lenguaje ubicuo español; todo lo demás se deriva (rutas, archivos, nombres de prueba, registros).
2. **Salida completa**: la pieza + su prueba + su registro (en catálogos internos del módulo) + recordatorio de pasos no automatizables (p. ej. "completa la tabla de casos de la prueba"). La pieza generada **compila y su prueba corre** (en rojo esperado donde falte lógica) — el generador jamás entrega ruinas.
3. **Determinista e idempotente**: mismo comando, mismo resultado; re-ejecutar sobre una pieza existente falla con claridad, no sobreescribe.
4. **Fiel a su plantilla por construcción**: el generador lee la plantilla del repo (18); no tiene una segunda copia interna de la forma — una sola fuente de forma.
5. **Rápido**: segundos; el generador lento se evita, y lo evitado no estandariza.

## 3. Generadores especiales (más allá de piezas)

| Generador | Qué produce |
|---|---|
| `generar modulo` | esqueleto completo de módulo (T09): capas, registros, capítulo de seed vacío, entrada en las reglas de imports |
| `contratos` (16) | regeneración OpenAPI → tipos frontend → validadores; el ÚNICO escritor de `packages/contracts` |
| `generar migracion` | migración Alembic desde la plantilla T08 con las secciones expandir/migrar/contraer explícitas |
| `generar adr` | ADR numerado siguiendo la serie (ESI-001/11) |

## 4. Gobierno

1. **Generador y plantilla cambian en el mismo PR** (18 §4.2); el generador desalineado de su plantilla es defecto de máxima prioridad de plataforma — produce deriva en serie.
2. **Los generadores tienen pruebas**: generan en un espacio temporal y verifican que lo generado compila, pasa lint/tipos y su estructura coincide con la plantilla — corren en la puerta cuando `platform/` cambia.
3. **Cobertura del catálogo completa**: toda plantilla T01-T15 tiene generador o una razón escrita de por qué no (p. ej. T13 descripción de PR la instancia la plataforma de Git directamente).
4. **La salida del generador es punto de partida, no excusa**: la pieza generada incompleta que se mergea "porque la generó la herramienta" falla revisión igual — el generador da forma, el autor da contenido.

---

## Impacto sobre la implementación
El esqueleto entrega los generadores del catálogo funcionando sobre el runner de tareas (16); los DGP ordenarán "genera T01 crear_orden_trabajo en ordenes y completa según la plantilla" — la instrucción mínima con resultado máximo.

## Dependencias
18 (plantillas como única fuente de forma) · 16 (comando `generar`) · 03 (rutas deterministas) · 17 (obligatorio para IA) · ESI-001/06 (estrategia de generación).

## Riesgos
- Generadores sin mantenimiento tras cambios de plantilla → regla 1 del §4 + pruebas de generadores en la puerta.
- Sobre-generación (piezas creadas "por si acaso") → el generador crea bajo demanda de una tarea real; la pieza huérfana sin caso de uso se elimina en revisión.

## Decisiones habilitadas
Construcción en serie de piezas bajo DGP, velocidad de agentes IA sin deriva, verificación estructural automática.

## Decisiones bloqueadas
Implementación física de los generadores y elección de su motor de plantillas — esqueleto (DGP), con ADR ligero.
