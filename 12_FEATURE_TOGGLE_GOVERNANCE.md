# 12 — Feature Toggle Governance

> **DeltaOps — ESI-009 · v1.0** · El gobierno de toggles: catálogo cerrado de tipos, dueño y caducidad obligatorios, y el toggle como instrumento — no como sistema de configuración paralelo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El toggle desacopla **integrar** de **liberar funcionalidad**: permite el tronco único (doc 02 §2.4), la liberación gradual y el apagado instantáneo (doc 14). Es pólvora útil: sin gobierno, produce un sistema con 2^n estados que nadie probó. Este documento lo gobierna.

## 2. Catálogo de tipos

| Tipo | Propósito | Vida | Quién lo mueve |
|---|---|---|---|
| **De liberación** | Ocultar funcionalidad incompleta integrada | Corta: muere al liberar al 100% | Entrega |
| **De experimento** | Comparar variantes con medición | La del experimento | Producto, con medición |
| **Operacional** | Degradar o apagar capacidades bajo estrés (kill switch) | Larga, documentada | Operación |
| **De plan/tenant** | Capacidades por plan comercial | Permanente | **No es toggle**: es configuración de negocio (ESI-006/20) y capacidades ETS-005 — viven en su plataforma, no aquí |

## 3. Reglas normativas

1. **Todo toggle declara dueño, propósito, tipo y caducidad** al nacer — el régimen de los waivers (ESI-007/18): nada anónimo ni eterno. El toggle vencido aparece en el tablero de higiene (doc 18) y su retiro es deuda de primera prioridad (doc 17).
2. **El toggle de liberación muere**: al llegar al 100%, el retiro del toggle y del código muerto entra al plan del equipo; el toggle de liberación con seis meses es deuda declarada en rojo.
3. **Estados probados**: las combinaciones activas relevantes se prueban (doc 08); la explosión combinatoria se contiene manteniendo pocos toggles vivos — la métrica de toggles activos (doc 18) tiene umbral.
4. **El toggle no decide semántica de negocio**: reglas de dominio, permisos y planes viven en sus plataformas congeladas (ESI-005, ESI-006/20, ETS-005); el toggle solo controla **exposición y encendido**, jamás lógica de negocio por rama.
5. **Cambiar un toggle en producción es un cambio registrado**: quién, cuál, cuándo, por qué — con el rastro de auditoría de la casa; el kill switch operacional además se ensaya (doc 15 §2.6).
6. **Por defecto, apagado**: la funcionalidad nueva nace oculta y se enciende por decisión gradual (doc 13 §2.3); el encendido accidental por defecto es la clase de error que esta regla elimina.

## Impacto sobre la implementación

El registro de toggles (dueño, tipo, caducidad, estado por entorno) forma parte de la plataforma de entrega; su mecánica de evaluación respeta la configuración por capas ya congelada (ESI-006/20).

## Dependencias

ETS-005; ESI-005; ESI-006/20; ESI-007/18 (régimen dueño+caducidad); docs 02, 08, 13-15, 17-18.

## Riesgos

- El toggle como sistema de configuración paralelo no gobernado; mitigación: la frontera dura §3.4 (semántica en sus plataformas) y el umbral de toggles vivos con tablero.

## Decisiones habilitadas

- Integración diaria de trabajo incompleto sin ramas largas.
- Apagado quirúrgico de funcionalidad defectuosa sin reversa completa.

## Decisiones bloqueadas

- Prohibidos toggles sin dueño, tipo y caducidad.
- Prohibida lógica de negocio condicionada por toggle.
- Prohibidos toggles de plan/tenant fuera de la configuración de negocio.

## Reusable Pattern

Catálogo de tipos + dueño y caducidad + frontera con la configuración de negocio: el toggle como instrumento gobernado y mortal — nunca como arquitectura.

## Anti-Patterns

- El toggle de tres años que nadie se atreve a tocar.
- If/else de reglas de negocio distintas por toggle.
- Encender al 100% de un golpe en viernes.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidades: la frontera con lo comercial).
- **ESI que consume**: ESI-005; ESI-006/20; ESI-007/18 (régimen de vida gobernada).
- **DGP que originará**: el registro de toggles y sus umbrales en el DGP de entrega.
- **ADR relacionados**: ADR de toggle sin semántica de negocio; ADR de caducidad obligatoria.
- **Módulos que reutilizarán este patrón**: todos liberan funcionalidad nueva tras toggle de liberación.
