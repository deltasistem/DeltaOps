# 20 — Sprint Governance

> **DeltaOps — ESI-009 · v1.0** · El gobierno de la cadencia: el ciclo como ritmo de decisión y aprendizaje — no como fecha de entrega — y las ceremonias mínimas con propósito.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La entrega es continua (docs 02, 10): el cambio viaja a producción cuando está listo, no cuando termina el ciclo. El ciclo (sprint) existe para otra cosa: **ritmo de priorización, compromiso y aprendizaje**. Confundir el ciclo con un contenedor de liberación reintroduce el release trimestral por la puerta de atrás.

## 2. Reglas normativas

1. **Duración fija y corta**: el DGP fija la duración (semanas, no meses), igual para todos los equipos — la sincronía barata que permite coordinar dependencias sin reuniones extraordinarias.
2. **El ciclo compromete intención, no promesa ciega**: entra trabajo **listo** (doc 21) hasta la capacidad real observada (la velocidad histórica del equipo, no la deseada); el ciclo crónicamente sobrecargado es un defecto de gobierno, no de esfuerzo.
3. **La capacidad se reparte declaradamente**: funcionalidad + pago de deuda (doc 17 §2.4) + acciones de retrospectiva (doc 15 §2.7) + margen para lo no planificado (S3, revisiones, soporte); el plan que asigna el 100% a funcionalidad es ficción con calendario.
4. **Ceremonias mínimas con propósito**: planificación (qué entra y por qué), sincronización ligera (impedimentos, no reporte de estado — el tablero ya informa), revisión del incremento (lo entregado, con evidencia) y retrospectiva del proceso. Toda ceremonia adicional justifica su existencia o se poda (doc 28).
5. **La retrospectiva de ciclo lee el espejo**: métricas (doc 18) y score (doc 19) del período, franjas en intervención, y produce **acciones con dueño** que entran al siguiente ciclo como trabajo real — el mismo contrato que la retrospectiva de incidente.
6. **El trabajo no planificado se registra, no se esconde**: lo urgente que entra a mitad de ciclo desplaza visiblemente algo (la capacidad no se estira); el desplazamiento silencioso es la mentira que erosiona el compromiso.
7. **El ciclo no gobierna la liberación**: lo terminado se libera en el siguiente tren (doc 10 §2.8), esté donde esté el calendario del ciclo; "esperar al fin del sprint para liberar" no existe.

## Impacto sobre la implementación

Duración, formato de ceremonias y reparto de capacidad se fijan en el DGP de entrega; la herramienta de gestión materializa el registro del trabajo.

## Dependencias

Docs 10, 15, 17-19, 21-22, 28.

## Riesgos

- La cadencia degenerando en teatro de estimación y reporte; mitigación: ceremonias con propósito auditado (§2.4), la sincronización sin reporte de estado y la poda por evidencia con E1/E8 (doc 19 §3.6).

## Decisiones habilitadas

- Coordinación entre equipos por sincronía de calendario sin burocracia.
- Aprendizaje del proceso con ritmo garantizado.

## Decisiones bloqueadas

- Prohibido atar la liberación al calendario del ciclo.
- Prohibido el ciclo sin presupuesto de deuda y margen.
- Prohibido admitir trabajo que no cumple la definición de listo (doc 21).

## Reusable Pattern

Ciclo = ritmo de decisión y aprendizaje, no contenedor de entrega + capacidad repartida declaradamente: la cadencia que sirve al flujo continuo en vez de estorbarlo.

## Anti-Patterns

- El "sprint" de seis semanas con release al final.
- La sincronización diaria de 45 minutos de reporte al jefe.
- Comprometer por presión lo que la velocidad histórica desmiente.

## Knowledge Graph

- **ETS que consume**: ETS-012 (la cadencia de producto que el ritmo sostiene).
- **ESI que consume**: ninguno directo nuevo; opera sobre los regímenes de esta serie.
- **DGP que originará**: duración, ceremonias y reparto de capacidad en el DGP de entrega.
- **ADR relacionados**: ADR de entrega continua con cadencia de decisión.
- **Módulos que reutilizarán este patrón**: todos los equipos comparten duración y ritmo.
