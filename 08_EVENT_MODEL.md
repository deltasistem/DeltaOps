# 08 — Modelo de Eventos

> **DeltaOps — ESI-005 · v1.0** · El estándar de eventos de dominio en módulos de negocio: el idioma común entre módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Todo evento sigue ESI-004/14: hecho pasado del dominio, emitido por el agregado, carga mínima estable, versión desde el día uno, sobre de plataforma interno, outbox transaccional. Invariante.

## 2. Lo que añade el estándar para dominios reales

1. **Los eventos son la única colaboración entre módulos** (doc 04 §2.3): el catálogo de eventos publicado de un módulo es su contrato hacia los demás. Publicar un evento es una decisión de contrato, no un detalle interno — se cataloga (ETS-008) y se versiona con compatibilidad N/N-1 (ESI-002/21).
2. **Eventos internos vs publicados**: un módulo puede tener eventos que solo consumen sus propias proyecciones (internos, evolución libre dentro del módulo) y eventos publicados para otros módulos (contrato estable). La declaración distingue ambos; ascender un evento interno a publicado es un cambio de contrato deliberado.
3. **Carga mínima con disciplina reforzada**: los consumidores de otros módulos enriquecen consultando el plano de lectura del emisor (patrón de ESI-004/14 §enriquecimiento), no exigiendo cargas gordas. Un evento que engorda para servir a un consumidor concreto es AP-06.
4. **Sin coreografías implícitas largas**: cadenas de más de dos saltos de eventos entre módulos (A emite → B reacciona y emite → C reacciona…) se documentan como flujo de negocio en el expediente de los módulos implicados; las que codifican un proceso con estado pertenecen al motor de procesos del dominio correspondiente, no a coreografía accidental.
5. **Todo consumo es idempotente y tolera reordenación** dentro de las garantías de la bandeja (ESI-003/21); el estándar no admite consumidores que asuman orden global.

## Impacto sobre la implementación

El grafo real de eventos entre módulos (declarado en doc 04) se convierte en el mapa de integración interna del producto; los DGP coordinan sus catálogos de eventos publicados al inicio, no al final.

## Dependencias

ESI-004/14-15; ESI-003/21; ETS-008; ESI-002/21; docs 04 y 19.

## Riesgos

- Contratos de evento definidos tarde, bloqueando DGP dependientes; mitigación: los eventos publicados se catalogan en la fase de diseño del DGP (formulario temprano), y los DGP declaran dependencias entre sí sobre esos catálogos.

## Decisiones habilitadas

- Construir módulos consumidores contra catálogos de eventos antes de que el emisor termine (contrato primero, fakes de por medio).
- Mapa de flujos de negocio derivable de las declaraciones.

## Decisiones bloqueadas

- Prohibido consumir eventos no publicados de otro módulo.
- Prohibido romper compatibilidad de eventos publicados sin ciclo N/N-1.
- Prohibidos consumidores dependientes de orden global.

## Reusable Pattern

La distinción interno/publicado §2.2 y el formulario de evento (ESI-004/14 §1) ampliado con el campo "audiencia"; el catálogo de eventos publicados es entregable temprano de todo DGP.

## Anti-Patterns

- Eventos-orden dirigidos a un consumidor concreto (AP-06).
- "Event sourcing accidental": reconstruir estado de negocio ajeno acumulando eventos de otro módulo.
- Cargas útiles que copian el agregado entero.

## Knowledge Graph

- **ETS que consume**: ETS-008 (catálogo y versionado), ETS-002 (flujos de negocio).
- **ESI que consume**: ESI-004/14; ESI-003/21; ESI-002/21.
- **DGP que originará**: la sección "catálogo de eventos publicados/consumidos" de cada DGP-módulo, con dependencias entre DGP.
- **ADR relacionados**: ADR de outbox transaccional (ETS-009/ESI-003/20).
- **Módulos que reutilizarán este patrón**: todos; OT↔Inventario y Compras↔Inventario son las parejas de mayor tráfico esperado.
