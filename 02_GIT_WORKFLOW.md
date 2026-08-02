# 02 — Git Workflow

> **DeltaOps — ESI-009 · v1.0** · El flujo de trabajo sobre el repositorio: trunk-based con ramas cortas, integración diaria y la principal siempre liberable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

DeltaOps trabaja en **un monorepo** (ESI-002/02) con flujo **basado en tronco**: una rama principal única y liberable, ramas de trabajo cortas que nacen de ella y vuelven a ella. No hay ramas permanentes de desarrollo, integración o entorno: los entornos se alimentan de la principal por promoción de versiones (doc 10), no por ramas espejo.

## 2. Reglas normativas

1. **Una sola principal, protegida**: nadie escribe directo sobre ella; todo entra por pull request (doc 05) con puertas en verde (doc 07) y revisión (doc 06). Es la invariante del doc 01 §2.6 hecha mecánica.
2. **Ramas de trabajo cortas**: una rama por cambio, vida objetivo de días — no semanas; la rama que envejece se re-integra o se parte (doc 03 §2.3). La divergencia larga es deuda con interés compuesto.
3. **Integrar es responsabilidad del que diverge**: la rama de trabajo se actualiza desde la principal con frecuencia; los conflictos se resuelven en la rama, jamás "al final".
4. **Lo incompleto entra apagado, no espera afuera**: el trabajo grande se integra por partes tras toggles (doc 12) o por expandir-migrar-contraer, en vez de acumularse en ramas larguísimas — la integración continua es de código, no solo de builds.
5. **Historia lineal y legible en la principal**: cada cambio llega como unidad coherente (doc 04 §2.4); la principal cuenta la historia del producto, no la arqueología de cada rama.
6. **El repositorio es la única fuente**: todo lo que define el sistema — código, esquemas, documentos normativos, DGP — vive versionado en él; lo que no está en el repositorio no existe para el proceso.
7. **Identidad real en cada aporte**: commits y PR con autoría verificable; nada anónimo ni compartido — el rastro de auditoría (ESI-004/17) empieza en el repositorio.

## 3. Lo que este flujo excluye

- **GitFlow y variantes**: develop permanente, ramas de release largas y merges ceremoniosos contradicen el principio de integración diaria; solo las ramas efímeras de release del doc 10 §2.3 y la de hotfix (doc 16) existen, ambas de vida breve y gobernada.
- **Ramas por entorno** (`staging`, `prod`): los entornos reciben **versiones** (doc 11), no ramas; una rama por entorno invita a la deriva entre ellos.
- **Forks internos por equipo o cliente**: prohibidos por la misma razón que en producto (ESI-007/27) — una base, variación por configuración y toggles.

## Impacto sobre la implementación

La protección de la principal, las puertas de PR y la verificación de identidad se configuran en la plataforma de repositorio elegida según ESI-002; el flujo es exigible desde el primer commit.

## Dependencias

ESI-002/02 (monorepo); docs 03-05, 07, 10-12, 16 de esta serie.

## Riesgos

- Trunk-based sin disciplina de toggles genera principal inestable; mitigación: puertas obligatorias (doc 07) + gobierno de toggles (doc 12) + reparar-o-revertir como prioridad absoluta (doc 09 §2.5).

## Decisiones habilitadas

- Liberación en cualquier momento desde la principal.
- Trabajo paralelo de equipos sin coordinación de merges ceremoniosos.

## Decisiones bloqueadas

- Prohibidas ramas permanentes distintas de la principal.
- Prohibido el commit directo a la principal.
- Prohibidas ramas por entorno o por cliente.

## Reusable Pattern

Tronco único + ramas efímeras + integración diaria + incompleto-tras-toggle: el flujo que hace de la integración un no-evento.

## Anti-Patterns

- La rama de feature de seis semanas con "merge del terror" al final.
- Resolver conflictos en el PR el día de la liberación.
- El repositorio paralelo "temporal" donde vive el trabajo real.

## Knowledge Graph

- **ETS que consume**: ninguno directo; sostiene la cadencia de ETS-012.
- **ESI que consume**: ESI-002/02; ESI-004/17 (rastro); ESI-007/27 (sin forks).
- **DGP que originará**: la norma de flujo en el DGP de plataforma de entrega (doc 27).
- **ADR relacionados**: ADR de trunk-based sobre GitFlow; ADR de promoción por versiones.
- **Módulos que reutilizarán este patrón**: todos los equipos, un solo flujo.
