# 09 — Parallel Development

> **DeltaOps — DGP-000 · v1.0** · La estrategia oficial de desarrollo paralelo: qué se construye a la vez, bajo qué condiciones y con qué mecanismos anti-colisión.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. La regla constitutiva

El paralelismo es legal **solo entre frentes cuyas superficies de contacto están contratadas** (CP-06): contratos publicados (ESI-010/13), fronteras del monorepo verificadas por puerta (ESI-010/05) y dependencias declaradas en el registro. El paralelismo sin fronteras no es velocidad: es integración diferida con interés compuesto.

## 2. Los ejes de paralelización

| Eje | Qué corre en paralelo | Condición |
|---|---|---|
| **Entre módulos** | DGP de módulos distintos dentro de una ola (p. ej. activos ∥ preventivo en W3) | Sin contratos cruzados pendientes entre ambos, o contratos publicados |
| **Entre capas de un DGP** | Contrato publicado → backend y frontend del mismo incremento en paralelo | CP-02 cumplido: el contrato es el punto de encuentro |
| **Entre olas (preparación)** | Especificación y contratación de la ola siguiente durante la actual | Dependencia de contrato (doc 07 §3.2); solo etapas 1-3 del ciclo |
| **W4 ∥ W5** | Expansión operativa y analítica simultáneas | Doc 07: fronteras contratadas + capacidad real |
| **Producto ∥ fábrica** | Mejoras de plataforma de entrega junto a construcción de producto | La fábrica cambia por su propio flujo sin frenar los trenes (ESI-009/09) |

**Componentes identificados como paralelizables por diseño** (fronteras ya congeladas): módulos entre sí (ESI-005/04), servicios compartidos entre sí (ESI-006), chasis de experiencia vs. Kernel (contratos de tokens/layouts), baterías de pruebas y documentación de cualquier frente (CP-11: alto apalancamiento IA).

## 3. Mecanismos anti-colisión (todos existentes)

1. **La puerta de arquitectura** bloquea el acoplamiento ilegal en cada PR (ESI-009/07) — la colisión estructural no llega a main.
2. **N/N-1** protege a los consumidores durante la evolución de contratos compartidos (ESI-009/11) — nadie espera a nadie para integrar.
3. **Ramas cortas + integración frecuente** (ESI-009/03): el paralelismo se liquida a diario contra main, no trimestralmente en una rama de integración.
4. **El registro de construcción** (doc 12) expone qué DGP tocan qué contratos: dos DGP editando el mismo contrato es un conflicto de planificación que se resuelve antes de construir — serializando o partiendo el contrato por decisión.
5. **Los toggles de entrega** (ESI-009/12) permiten integrar incompleto sin exponer — el paralelismo no exige sincronizar liberaciones.

## 4. Límites del paralelismo

1. **El camino crítico manda** (doc 08 §2.1): el paralelismo usa la capacidad restante.
2. **Más frentes que equipos reales es teatro** (doc 18): un equipo partido entre tres DGP no es paralelismo, es conmutación con pérdida.
3. **El Kernel no se paraleliza contra sí mismo**: W1 concentra — su superficie es demasiado fundacional para frentes múltiples simultáneos sobre las mismas piezas.

## Impacto sobre la implementación

La planificación de cadencia abre frentes paralelos solo contra esta estrategia; el registro valida contratos y dependencias antes de autorizar DGP simultáneos.

## Dependencias

ESI-005/04; ESI-006; ESI-009/03, /07, /09, /11-12; ESI-010/05, /13; docs 07-08, 12, 18, 20.

## Riesgos

- La integración diferida disfrazada de paralelismo (ramas largas "para no molestarse"); mitigación: la integración frecuente es norma congelada (ESI-009/03) y las métricas de flujo la exponen (ESI-009/18).

## Decisiones habilitadas

- Máximo paralelismo legal con colisiones prevenidas por diseño.
- Preparación anticipada de olas que acorta el programa sin riesgo.

## Decisiones bloqueadas

- Prohibido el paralelismo sobre superficies sin contratar.
- Prohibidos dos DGP simultáneos editando el mismo contrato sin decisión.
- Prohibido partir equipos hasta el paralelismo ficticio.

## Reusable Pattern

Paralelismo = fronteras contratadas + integración frecuente + registro que expone contactos: la simultaneidad como propiedad diseñada, no como apuesta.

## Anti-Patterns

- La rama de integración de tres meses donde "se junta todo".
- Dos equipos descubriendo en producción que editaban el mismo contrato.
- Paralelizar el Kernel para "terminarlo más rápido".

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-005/04 y ESI-006 (fronteras por diseño); ESI-009 (mecanismos anti-colisión).
- **DGP que originará**: los DGP declaran sus contactos para habilitar paralelismo.
- **ADR relacionados**: ADR de paralelismo por fronteras contratadas.
- **Módulos que reutilizarán este patrón**: todos se construyen en paralelo bajo estas condiciones.
