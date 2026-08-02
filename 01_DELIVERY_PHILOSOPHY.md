# 01 — Delivery Philosophy

> **DeltaOps — ESI-009 · v1.0** · La filosofía de entrega: el cambio como unidad gobernada — pequeño, declarado, verificado y reversible.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Las series previas congelaron **qué** se construye (ETS), **sobre qué** (ESI-001…003), **cómo se estructura** (ESI-004…008). ESI-009 norma **cómo viaja un cambio** desde la intención hasta producción: construcción, revisión, prueba, liberación y operación. No elige herramientas ni implementa pipelines: define el modelo que cualquier herramienta deberá satisfacer — la misma indirección que los tokens (ESI-008/08) o el stack (ESI-001).

## 2. Principios normativos

1. **El cambio es la unidad de gobierno, no el proyecto**: todo lo que llega a producción entra como un cambio identificable, con autor, intención declarada y rastro completo — el equivalente de entrega del comando con `clave_idempotencia`: nada anónimo, nada sin rastro.
2. **Pequeño y frecuente le gana a grande y ceremonioso**: el riesgo crece más que linealmente con el tamaño del cambio; el estándar empuja hacia cambios chicos integrados a diario, y la ceremonia es proporcional al riesgo real, no al calendario.
3. **Toda entrega declara su contrato**: Objetivo, ETS relacionados, ESI relacionados, DGP relacionados, Riesgos, Evidencias, Pruebas, Rollback y Observabilidad — el **contrato de entrega de nueve rubros**, hermano del contrato de pantalla (ESI-008/05): la declaración precede a la liberación.
4. **Verificación mecánica primero, juicio humano después**: lo que una puerta puede verificar no se le pide a un revisor (ESI-002/17); el humano se reserva para diseño, semántica y riesgo — el patrón EC/XR (ESI-008/25) aplicado al código.
5. **Reversible por diseño**: ningún cambio entra sin camino de vuelta declarado; "no se puede revertir" es una decisión excepcional registrada, no un descubrimiento durante el incidente.
6. **La rama principal siempre es liberable**: la integración continua no es una herramienta sino esta invariante; todo lo que la rompa se repara o se revierte antes que cualquier otra cosa.
7. **Lo que se libera se observa**: la entrega no termina al desplegar sino al confirmar en producción las señales declaradas en Observabilidad — el ciclo se cierra con evidencia, no con esperanza.
8. **El proceso también evoluciona por evidencia**: métricas (doc 18) y score (doc 19) juzgan al proceso mismo; la ceremonia que no previene defectos se poda (doc 28).

## 3. El mapa de la serie

Flujo del cambio: git y ramas (02-03), commits y PR (04-05), revisión (06), puertas y pruebas (07-08), CI (09), liberación (10-13), reversa e incidentes (14-16), deuda (17), medición (18-19), cadencia y definiciones (20-23), checklists (24-25), cierre (26-28).

## Impacto sobre la implementación

Todo equipo opera bajo este modelo desde el primer DGP; las herramientas concretas se seleccionan después contra estas normas, nunca al revés.

## Dependencias

ENGINEERING_CHARTER.md; ESI-002 (puerta y proceso de decisiones); ESI-008/05, /25 (patrón contrato + checklist).

## Riesgos

- El modelo degenerando en burocracia que frena la entrega; mitigación: el principio 2 (proporcionalidad al riesgo) y el score del proceso (doc 19) que castiga la ceremonia sin efecto.

## Decisiones habilitadas

- Selección de herramientas de CI/CD como decisión reversible contra un modelo estable.
- Auditoría de cualquier cambio en producción hasta su intención original.

## Decisiones bloqueadas

- Prohibido liberar cambios sin el contrato de nueve rubros.
- Prohibido el cambio directo a producción fuera del flujo (salvo hotfix gobernado, doc 16).
- Prohibida la rama principal rota como estado tolerado.

## Reusable Pattern

Contrato declarado + verificación mecánica + reversibilidad + observación: el ciclo de entrega gobernada — el mismo esqueleto de gobierno de toda la casa, aplicado al flujo del cambio.

## Anti-Patterns

- El release trimestral heroico con congelamiento de código.
- La ceremonia idéntica para el typo y para la migración de datos.
- Herramientas primero, modelo después ("lo que la herramienta permita será el proceso").

## Knowledge Graph

- **ETS que consume**: ETS-012 (cadencia de mercado que la entrega debe sostener).
- **ESI que consume**: ESI-002/17, /27; ESI-008/05, /25 (patrones de contrato y checklist).
- **DGP que originará**: el contrato de entrega en todo DGP; el modelo como norma transversal.
- **ADR relacionados**: ADR de entrega como cambio gobernado; ADR de indirección de herramientas.
- **Módulos que reutilizarán este patrón**: todos entregan por este flujo sin excepción.
