# 09 — CI Pipeline Model

> **DeltaOps — ESI-009 · v1.0** · El modelo de pipeline de integración continua: etapas normadas, retroalimentación en minutos y reparar-o-revertir como ley.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El pipeline es el modelo de verificación en movimiento, no una herramienta: define **qué se verifica, en qué orden y con qué presupuesto**, y cualquier plataforma de CI deberá implementarlo. Sin YAML, sin vendor: el mismo desacople herramienta/modelo de toda la serie.

## 2. Reglas normativas

1. **Tres contextos de ejecución**:
   - **De PR**: puertas estáticas (doc 07) + pruebas unitarias y de contrato del área afectada — presupuesto de minutos; es el ciclo de trabajo del autor.
   - **De integración**: al entrar a la principal, la verificación completa — todas las suites incluidas las de integración y las baterías intocables (doc 08 §3.3).
   - **Programado**: lo caro y lo lento — E2E completos, análisis profundos de dependencias, verificaciones de deriva — con cadencia diaria.
2. **Afectado primero**: en el monorepo (ESI-002/02), el contexto de PR verifica lo afectado por el cambio según el grafo de dependencias de paquetes; la verificación total pertenece a la integración — la economía del pipeline es la economía del grafo.
3. **Reproducible y hermético**: la misma revisión produce el mismo resultado; dependencias fijadas, sin estado compartido entre ejecuciones, sin acceso a producción — el pipeline que "a veces falla" no es evidencia de nada.
4. **Un solo camino de construcción**: el artefacto que se libera se construye en el pipeline, una vez, y se **promueve** entre entornos (doc 10 §2.2); prohibido reconstruir por entorno y prohibido liberar artefactos construidos en máquinas personales.
5. **Principal roja = todo se detiene**: la rotura de la integración es la prioridad absoluta del equipo responsable — se repara en el acto o se revierte el cambio culpable (doc 04 §2.7); el tiempo en rojo es métrica de primera clase (doc 18).
6. **El pipeline emite evidencia, no solo veredicto**: resultados de puertas, pruebas y construcción quedan asociados a la revisión y alimentan el rubro Evidencias del contrato de entrega — el pipeline es el notario del proceso.
7. **Presupuestos con métrica**: cada contexto tiene presupuesto de duración en el DGP; superarlo dispara optimización o reubicación de verificaciones, no resignación.

## Impacto sobre la implementación

El DGP de entrega materializa los tres contextos y sus presupuestos en la plataforma elegida; el grafo de afectación sale de la estructura del monorepo ya congelada.

## Dependencias

ESI-002/02; docs 04, 07-08, 10, 18.

## Riesgos

- El pipeline degradándose en lentitud aceptada ("siempre fue así"); mitigación: presupuestos con métrica (§2.7) y el score (doc 19) castigando la retroalimentación lenta.

## Decisiones habilitadas

- Selección de plataforma de CI como decisión tardía y reversible.
- Escalado de equipos sin degradar el ciclo de retroalimentación.

## Decisiones bloqueadas

- Prohibido liberar artefactos no construidos por el pipeline.
- Prohibido convivir con la principal roja.
- Prohibidas verificaciones con acceso a producción o datos reales.

## Reusable Pattern

Tres contextos + afectado-primero + un solo camino de construcción + reparar-o-revertir: el pipeline como modelo normado, independiente de la herramienta.

## Anti-Patterns

- El build que solo funciona en la máquina de quien libera.
- Reintentar el pipeline hasta que pase como práctica normal.
- Verificarlo todo en cada PR hasta que nadie espera el resultado.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-002/02 (grafo del monorepo como base de afectación).
- **DGP que originará**: contextos, presupuestos y configuración en el DGP de entrega.
- **ADR relacionados**: ADR de construcción única con promoción; ADR de afectado-primero.
- **Módulos que reutilizarán este patrón**: todos; su lugar en el grafo define qué se verifica por PR.
