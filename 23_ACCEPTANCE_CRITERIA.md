# 23 — Acceptance Criteria

> **DeltaOps — ESI-009 · v1.0** · Los criterios de aceptación: el contrato de comportamiento del trabajo — observables, acotados y escritos antes de construir.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El criterio de aceptación define **qué comportamiento observable hace correcto al trabajo**: es el contrato entre quien pide y quien construye, escrito antes de construir (DoR-02, doc 21) y verificado con evidencia al terminar (DoD-01, doc 22). Cierra la brecha donde viven los malentendidos caros.

## 2. Reglas normativas

1. **Observables desde afuera**: el criterio describe comportamiento del sistema, no implementación — "al cerrar la OT con repuestos, el stock queda descontado y el movimiento auditado", no "se llama al servicio de stock". El criterio que nombra clases es diseño disfrazado.
2. **Forma dado/cuando/entonces como estándar**: contexto, acción, resultado verificable; otras formas se admiten si mantienen la verificabilidad — la forma sirve a la precisión, no al ritual.
3. **Los caminos tristes son obligatorios**: todo conjunto de criterios cubre además del flujo feliz: el error esperado, el borde (vacío, límite, concurrencia cuando aplica) y el acceso denegado (permisos, ESI-005/16) cuando la operación es protegida — el optimismo de solo-felices es el hueco clásico (DR-02, doc 06).
4. **Anclados a las normas, sin repetirlas**: el criterio cita el contrato, KPI o regla congelada que invoca ("según el catálogo de KPIs, ESI-006/16") en vez de redefinirlo — "citar, no repetir" también aquí; el criterio que contradice una norma congelada es un defecto del criterio.
5. **Cada criterio se mapea a verificación**: prueba automatizada en el nivel adecuado (doc 08 §3.2) o verificación explícita documentada; el criterio inverificable se reescribe hasta que se pueda verificar.
6. **Acotados y completos**: lo que los criterios no cubren no está comprometido; descubrir un comportamiento necesario a mitad de camino ajusta los criterios con rastro (doc 21 §3.4) — el alcance crece por decisión, no por deriva.
7. **En lenguaje del dominio**: los términos son los del glosario del producto (OT, activo, plan — ETS-002/003); el criterio en jerga técnica excluye a quien debe validarlo.

## Impacto sobre la implementación

La plantilla de criterios y su mapeo a pruebas se materializan en la herramienta de gestión; la trazabilidad criterio→prueba→evidencia alimenta DoD-01.

## Dependencias

Docs 06, 08, 21-22; ETS-002/003 (glosario); ESI-005/16; ESI-006/16.

## Riesgos

- Criterios exhaustivos hasta la parálisis (especificar cada píxel); mitigación: los criterios definen comportamiento, las normas congeladas ya definen el resto (superficie ESI-008, contratos ESI-003) — el criterio solo dice lo nuevo.

## Decisiones habilitadas

- Validación objetiva de terminado sin negociación retroactiva.
- Pruebas derivadas directamente del contrato de comportamiento.

## Decisiones bloqueadas

- Prohibido construir sin criterios escritos y verificables.
- Prohibidos conjuntos de criterios sin caminos tristes.
- Prohibidos criterios que contradicen o redefinen normas congeladas.

## Reusable Pattern

Comportamiento observable + dado/cuando/entonces + caminos tristes obligatorios + mapeo a verificación: el contrato de comportamiento que las pruebas ejecutan y la aceptación firma.

## Anti-Patterns

- "Que funcione bien" como criterio.
- Criterios escritos después de construir, calcados de lo construido.
- El criterio-diseño que dicta clases y tablas.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el lenguaje de dominio de los criterios).
- **ESI que consume**: ESI-003; ESI-005/16; ESI-006/16; ESI-008 (las normas que los criterios citan sin repetir).
- **DGP que originará**: plantilla y trazabilidad criterio→prueba en la herramienta de gestión.
- **ADR relacionados**: ADR de criterios observables con caminos tristes.
- **Módulos que reutilizarán este patrón**: todo trabajo funcional de todo módulo lleva criterios así.
