# 14 — Empty States

> **DeltaOps — ESI-008 · v1.0** · Los estados vacíos: el vacío como orientación — cada "no hay nada" explica por qué y qué hacer, distinguiendo sus cuatro causas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Las cuatro causas del vacío

El vacío no es uno; confundirlos desorienta. Toda pantalla distingue:

| Causa | Situación | Presentación normada |
|---|---|---|
| **Primera vez** | El recurso aún no existe en este tenant (adopción) | Orientación: qué es esto, por qué sirve, la acción de crear el primero (si hay permiso) o a quién corresponde |
| **Sin resultados** | Hay datos, pero el filtro/búsqueda no encuentra | Decirlo ("nada coincide con estos filtros"), mostrar los filtros activos y ofrecer limpiarlos — jamás parecer "no hay nada" absoluto |
| **Todo al día** | El vacío es éxito (sin pendientes, sin excepciones) | Celebrarlo con sobriedad: "sin OT vencidas"; el vacío bueno se ve distinto del vacío neutro |
| **Sin acceso a ver** | El alcance/permiso filtra todo (ESI-007/04) | El contrato de no-fuga decide el texto; nunca insinuar cuánto existe fuera del alcance |

## 2. Reglas

1. **El vacío es un estado del contrato** (doc 05 §2.4): toda pantalla con colecciones declara sus vacíos por causa; el marco de tabla/lista (doc 20) los presenta — la pantalla aporta los textos operativos, no la estructura.
2. **Accionable cuando se puede**: si el usuario puede resolver el vacío (crear, importar, limpiar filtros, pedir acceso), la acción está en el vacío mismo; si no puede, el texto lo orienta a quién sí — el vacío mudo está prohibido.
3. **La primera vez es parte de la adopción**: los vacíos de primera vez de cada módulo son contenido diseñado en su DGP (qué explica, a qué invita), coherentes con la puesta en marcha del tenant (seed asimétrico: producción nace vacía, ESI-002/12) — el primer día del cliente es una sucesión de vacíos bien diseñados o de páginas desconcertantes.
4. **Sin resultados protege del pánico**: el estado muestra qué filtros están recortando (chips visibles del doc 20) para que "no aparece" se resuelva sin llamar a soporte.
5. **Los tableros no fingen**: un tablero (doc 18) con módulos sin datos muestra sus widgets en vacío honesto por causa, no gráficas en cero que parecen desplome.

## 3. Declaración (los ocho rubros)

- **Commands**: solo los que el vacío ofrece (crear primero, limpiar filtros) — ya declarados por la pantalla.
- **Queries**: la distinción primera-vez / sin-resultados exige saber si la colección total es vacía (consulta de existencia dentro del alcance, respetando no-fuga).
- **Capacidades/Permisos**: las acciones del vacío obedecen las verdades; el vacío sin permiso de crear no muestra "crear".
- **Servicios**: ninguno propio.
- **Offline**: el vacío offline distingue "no hay" de "no se ha sincronizado" (frescura, doc 11 §2.1) — la cuarta mentira posible.
- **KPIs**: vacíos de primera vez que convirtieron (adopción), sin-resultados seguidos de limpiar filtros.
- **IA**: opcional en primera vez como guía de arranque, marcada (doc 22).

## Impacto sobre la implementación

La estructura de vacíos por causa entra a los marcos de colección del DGP de experiencia; los textos por pantalla se declaran en cada DGP de módulo.

## Dependencias

Docs 05, 11, 18, 20, 22; ESI-002/12; ESI-007/04.

## Riesgos

- Vacíos genéricos idénticos en todo el producto ("no hay elementos") que desaprovechan la adopción; mitigación: el checklist exige los cuatro vacíos declarados por pantalla de colección y la revisión lee los textos.

## Decisiones habilitadas

- Onboarding del tenant guiado por los propios vacíos.
- Menos tickets de "no me aparece" (filtros visibles y limpiables).

## Decisiones bloqueadas

- Prohibido el vacío mudo sin explicación ni salida.
- Prohibido confundir sin-resultados con primera-vez.
- Prohibido insinuar datos fuera de alcance en vacíos de acceso.

## Reusable Pattern

Cuatro causas + acción en el vacío + honestidad offline: la taxonomía del vacío que convierte el "no hay nada" en orientación.

## Anti-Patterns

- La ilustración simpática sin texto útil.
- "No hay resultados" cuando en realidad no hay permiso.
- El tablero de demo con datos falsos para no verse vacío.

## Knowledge Graph

- **ETS que consume**: ETS-012 (adopción como batalla real).
- **ESI que consume**: ESI-002/12 (seed asimétrico); ESI-007/04 (no-fuga).
- **DGP que originará**: estructura de vacíos en marcos del DGP de experiencia; textos por DGP de módulo.
- **ADR relacionados**: ADR de vacíos por causa.
- **Módulos que reutilizarán este patrón**: todos declaran sus cuatro vacíos por pantalla de colección.
