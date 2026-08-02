# 24 — Relación con los Futuros DGP

> **DeltaOps — ESI-004 · v1.0** · Cómo los DeltaOps Generation Packages consumen el módulo de referencia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El módulo de referencia como contrato de los DGP

ESI-002/20 define los DGP (DeltaOps Generation Packages) como instrucciones de construcción gobernadas. Esta serie les entrega su pieza central: **el patrón ejecutable de módulo**. La relación es de tres tiempos:

| Tiempo | DGP | Relación con esta serie |
|---|---|---|
| 1 | DGP del Kernel y de plataforma (ESI-003) | Construyen lo que el módulo de referencia necesita |
| 2 | **DGP del módulo de referencia** | Implementa esta serie literalmente: 28 documentos → tareas |
| 3 | DGP de módulos de negocio (Activos, Inventario…) | Construyen "como referencia": mismo patrón, dominio real de sus ETS |

## 2. Cómo cita un DGP de negocio a esta serie

1. **Por sección Reusable Pattern**: cada documento de esta serie declara qué se copia; el DGP referencia "ESI-004/05 §Reusable Pattern" y añade solo las instancias de su dominio (qué comandos, qué invariantes).
2. **Por formularios**: las tablas de definición (comando 05 §1, consulta 06 §1, Policy 09 §1, evento 14 §1, proyección 15 §1) son los formularios que el DGP rellena por cada pieza de su alcance.
3. **Por baterías**: las pruebas patrón (19 §2.5) son dependencias directas; el DGP no las rediseña, las instancia.
4. **Por criterios negativos**: el catálogo de anti-patterns (doc 23) entra en los criterios de aceptación de todo DGP.
5. **Por checklist**: el doc 21 es la sección de cierre obligatoria de todo DGP de módulo.

## 3. Reglas de frontera (herencia de ESI-002/20, instanciadas)

1. Un DGP de negocio **no puede contradecir esta serie**: si el dominio real no cabe en el patrón, la discrepancia se eleva al proceso de cambio de reglas (ESI-002/27) — que puede evolucionar el patrón (doc 28) — antes de construir distinto.
2. Un DGP no re-explica el patrón: **cita**. Un DGP que copia párrafos de esta serie está desactualizado desde el día dos (ESI-002/23: citar, no repetir).
3. Las decisiones que esta serie deja abiertas por diseño (cuántos agregados, qué eventos, qué proyecciones necesita el dominio real) son exactamente las **decisiones delegadas** que el DGP debe tomar y documentar.
4. El agente (humano o IA) que ejecuta un DGP trabaja con el módulo de referencia abierto al lado: es la respuesta por defecto a "¿cómo se hace X aquí?".

## Impacto sobre la implementación

Define el formato de consumo que hace a los DGP cortos y precisos: formularios + citas + baterías, no prosa. El primer DGP de negocio valida este formato.

## Dependencias

ESI-002/20, /23 y /27; docs 01-23 (lo citable); ETS-002…005 (los dominios reales que vendrán).

## Riesgos

- DGP que citan sin leer, produciendo cumplimiento superficial; mitigación: los criterios de aceptación exigen evidencia (pruebas patrón pasando), no declaraciones.

## Decisiones habilitadas

- Redactar el DGP del módulo de referencia como traducción directa de esta serie.
- Formato estándar de DGP de módulo: alcance + formularios + citas + checklist.

## Decisiones bloqueadas

- Prohibido un DGP de módulo que contradiga el patrón sin cambio de regla previo.
- Prohibido copiar prosa del patrón en DGP.
- Prohibido ejecutar DGP de negocio antes de que el módulo de referencia esté terminado y validado (doc 25).

## Reusable Pattern

Este documento entero es el meta-patrón: define cómo se consume el patrón. Los cinco mecanismos de cita del §2 son la estructura de todo DGP de módulo.

## Anti-Patterns

- DGP enciclopédicos que duplican la serie en vez de citarla.
- Construir módulos de negocio "inspirados en" el patrón en lugar de conformes al patrón.
- Delegar al agente decisiones que el DGP debía tomar (alcance, catálogos) o viceversa (detalles que el patrón ya fija).
