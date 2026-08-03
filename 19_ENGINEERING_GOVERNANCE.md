# 19 — Engineering Governance

> **DeltaOps — ESI-010 · v1.0** · El gobierno de la ingeniería: quién decide qué, con qué instrumentos y con qué límites — la constitución operativa consolidada.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Cada serie creó su gobierno (proceso de decisiones, puertas, waivers, scores, cadencias). Este documento consolida **el mapa del poder de decisión**: qué se decide dónde, para que ninguna decisión quede sin dueño ni foro — y ninguna se tome en dos foros a la vez.

## 2. El mapa de decisión

| Ámbito | Se decide en | Instrumento |
|---|---|---|
| Qué construye el producto | Producto (ETS y su evolución) | Decisiones de producto; capacidades (doc 10) |
| Normas de ingeniería (arquitectura, plataformas, procesos) | El proceso de decisiones | ESI-002/27 + registro (doc 07) |
| Calibraciones locales (umbrales, cadencias, plantillas) | El DGP dueño | Rastro en el DGP (ESI-009/28 §2.4) |
| Prioridad del trabajo | La cadencia del equipo con producto | ESI-009/20; capacidad repartida declarada |
| Integrar un cambio | Las compuertas | Puertas + revisión (ESI-009/06-07, /24) |
| Liberar una versión | La promoción registrada | RC + decisión (ESI-009/25) |
| Excepciones temporales | El régimen de waivers | ESI-007/18; no-waiveables intactos |
| Emergencias | El conductor del incidente | ESI-009/15-16, con rastro |

## 3. Reglas normativas

1. **Ninguna decisión sin foro; ningún foro duplicado**: la decisión que no encaja en el mapa revela un hueco — se lleva al proceso, que decide también sobre el mapa (la autoreferencia gobernada).
2. **La autoridad es del foro, no del cargo**: el título no salta compuertas ni edita normas; la vía rápida legítima ya existe (hotfix, emergencia) y deja rastro — el "porque lo digo yo" es el anti-patrón constitucional.
3. **Todo poder tiene contrapeso visible**: las puertas limitan al autor; la revisión al generador; el proceso al arquitecto; los scores al proceso mismo; el registro de decisiones a la memoria selectiva — el diseño asume falibilidad en todos los niveles.
4. **La delegación es explícita**: lo que el proceso delega a los DGP (calibraciones) está enumerado (ESI-009/28 §2.4); lo no delegado se decide en el foro central — la zona gris se resuelve preguntando, no asumiendo.
5. **El gobierno se audita con sus instrumentos**: decisiones sin evidencia (doc 07 §2.5), waivers vencidos, compuertas saltadas — el tablero (doc 25) expone la salud del gobierno igual que la del código.

## Impacto sobre la implementación

Sin estructura nueva: el mapa consolida foros e instrumentos ya normados; su materialización es el uso disciplinado de los existentes.

## Dependencias

ESI-002/27; ESI-007/18; ESI-009/06-07, /15-16, /20, /24-25, /28; docs 07, 10, 25.

## Riesgos

- El gobierno formal conviviendo con un gobierno informal real ("las decisiones de verdad se toman en otra parte"); mitigación: la decisión fuera del libro no existe (doc 07 §2.4) y las compuertas no reconocen decisiones no registradas — el gobierno informal pierde su vía de ejecución.

## Decisiones habilitadas

- Toda pregunta "¿quién decide esto?" con respuesta en una tabla.
- Escalado organizacional sin renegociar el poder de decisión.

## Decisiones bloqueadas

- Prohibidas decisiones fuera de su foro del mapa.
- Prohibido saltar compuertas por autoridad de cargo.
- Prohibidos foros paralelos para decisiones ya mapeadas.

## Reusable Pattern

Mapa de decisión con foro único por ámbito + contrapesos visibles + delegación enumerada: la constitución operativa — el poder legible y auditable.

## Anti-Patterns

- La decisión de arquitectura tomada en la reunión ejecutiva.
- El comité nuevo para lo que el proceso ya resuelve.
- La calibración local que en realidad cambió una norma de la casa.

## Knowledge Graph

- **ETS que consume**: la frontera producto/ingeniería (qué vs. cómo).
- **ESI que consume**: ESI-002/27 (el foro central); ESI-007/18; ESI-009 (compuertas y cadencias).
- **DGP que originará**: ninguno; el mapa usa los foros existentes.
- **ADR relacionados**: ADR del mapa de decisión con foro único.
- **Módulos que reutilizarán este patrón**: todas sus decisiones encajan en el mapa.
