# 12 — Loading Strategy

> **DeltaOps — ESI-008 · v1.0** · La estrategia de carga: presupuestos declarados, esqueletos con forma y jamás una pantalla en blanco — la espera también se diseña.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La carga es un estado del contrato de pantalla (doc 05 §2.4) con tres regímenes:

| Régimen | Cuándo | Experiencia normada |
|---|---|---|
| **Instantáneo** | Bajo el umbral de percepción | Nada: sin parpadeos de esqueleto por cargas rápidas |
| **Breve** | Espera corta esperada | Esqueleto con la forma del layout destino (doc 07); las regiones llegan progresivamente |
| **Largo** | Operaciones declaradas costosas (exportes, informes) | Trabajo en segundo plano con progreso y notificación al terminar (ESI-006/09, /06) — la pantalla no se secuestra |

Los umbrales entre regímenes son tokens del sistema (doc 08), no criterio de cada pantalla.

## 2. Reglas

1. **Presupuesto de carga por pantalla**: el contrato declara la expectativa de sus consultas (doc 05, rubro Queries); la pantalla que excede su presupuesto en condiciones de referencia es hallazgo del score (doc 24) — la lentitud es medible, no anecdótica.
2. **Esqueleto con forma, no genérico**: el estado de carga refleja la estructura del layout (la tabla carga como tabla); prohibidos los spinners de página completa como estado por defecto — el esqueleto orienta, el spinner solo entretiene.
3. **Progresivo con prioridad declarada**: las regiones esenciales (doc 09 §2.3) cargan y se vuelven interactivas primero; lo secundario llega sin desplazar lo ya visible (estabilidad de layout: nada salta bajo el dedo del usuario).
4. **Lo largo nunca bloquea**: toda operación declarada costosa corre como trabajo (ESI-003/22) con progreso consultable y notificación de resultado (doc 15); cerrar la pantalla no cancela el trabajo — el patrón de exportes (ESI-006/09) es la referencia.
5. **La espera cuenta la verdad**: si algo falla durante la carga, se pasa al estado de error (doc 13) de esa región — jamás esqueleto infinito; si no hay datos, al estado vacío (doc 14) — la carga es transición, no destino.

## 3. Declaración (los ocho rubros)

- **Commands/Capacidades/Permisos/IA**: no aplican — estrategia transversal.
- **Queries**: la frescura y expectativa declaradas por pantalla gobiernan su régimen.
- **Servicios**: trabajos y notificaciones para el régimen largo (ESI-003/22, ESI-006/06).
- **Offline**: la carga desde datos locales sigue los mismos regímenes; la frescura visible es del doc 11.
- **KPIs**: tiempos por pantalla contra presupuesto (percentiles), estabilidad de layout, esqueletos que acabaron en error.

## Impacto sobre la implementación

Los esqueletos por layout y los umbrales-token entran al DGP de experiencia; los presupuestos por pantalla, al formulario de contrato (doc 27).

## Dependencias

Docs 05, 07-09, 11, 13-15; ESI-003/22; ESI-006/06, /09.

## Riesgos

- Presupuestos declarados y jamás medidos (aspiración sin instrumento); mitigación: el score los mide con fuentes mecánicas (doc 24 D-rendimiento) y el checklist exige la medición de referencia antes de producción.

## Decisiones habilitadas

- Conversaciones de rendimiento con números por pantalla, no sensaciones.
- Operaciones pesadas sin secuestrar la interfaz.

## Decisiones bloqueadas

- Prohibida la pantalla en blanco como estado de carga.
- Prohibido el esqueleto infinito (transición, no destino).
- Prohibido bloquear la interfaz por operaciones declaradas costosas.

## Reusable Pattern

Tres regímenes con umbrales-token + esqueletos por layout + presupuestos medidos: la espera como contrato — diseñada una vez, heredada por toda pantalla.

## Anti-Patterns

- El spinner global para todo.
- Contenido que salta al llegar lo secundario (el clic traicionado).
- "Optimizar" ocultando la lentitud con animaciones más largas.

## Knowledge Graph

- **ETS que consume**: ETS-011 (paciencia real del usuario operativo).
- **ESI que consume**: ESI-003/22 (trabajos); ESI-006/06, /09.
- **DGP que originará**: esqueletos y umbrales en el DGP de experiencia; presupuestos por pantalla en cada DGP.
- **ADR relacionados**: ADR de tres regímenes de carga.
- **Módulos que reutilizarán este patrón**: todos; el régimen largo obliga a los que exportan o calculan.
