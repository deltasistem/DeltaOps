# 15 — Incident Response

> **DeltaOps — ESI-009 · v1.0** · La respuesta a incidentes: severidades con contrato, roles claros durante el fuego y la retrospectiva sin culpa como fábrica de mejoras.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

El incidente es la degradación no planificada del servicio o de sus promesas (disponibilidad, corrección, aislamiento, seguridad). Este documento norma el modelo de respuesta; los incidentes **de seguridad** siguen además su régimen propio ya congelado (ESI-007/19) — este modelo lo complementa, no lo sustituye.

## 2. Severidades con contrato

| Sev | Definición | Respuesta |
|---|---|---|
| **S1** | Servicio caído o promesa crítica rota (pérdida/mezcla de datos) para múltiples tenants | Inmediata, todos los medios, comunicación activa a afectados |
| **S2** | Degradación seria de capacidad principal o un tenant gravemente afectado | Inmediata en horario extendido, comunicación a afectados |
| **S3** | Degradación parcial con rodeo disponible | Horario laboral, prioridad sobre trabajo planificado |
| **S4** | Molestia menor sin impacto material | Entra al flujo normal como defecto |

La severidad la asigna quien responde y se ajusta con evidencia; la paridad con las escalas de la casa (R1-R4 de ESI-007) es deliberada: mismo lenguaje de gravedad.

## 3. Reglas normativas

1. **Roles explícitos desde el minuto uno**: un **conductor** (decide y coordina, no teclea), **resolutores** (manos en el sistema) y un **comunicador** (informa hacia afuera en términos honestos, ESI-008/13: sin jerga, sin promesas vacías). Una persona puede cubrir roles en incidentes chicos; los roles existen igual.
2. **Estabilizar antes que diagnosticar**: la primera decisión es el peldaño de reversa (doc 14 §3.4) o el kill switch (doc 12); la causa raíz espera a la calma.
3. **Línea de tiempo desde el inicio**: decisiones, acciones y observaciones con hora — el insumo de la retrospectiva; reconstruir de memoria produce ficción.
4. **Acceso de emergencia gobernado**: la intervención directa en producción durante S1/S2 usa el acceso de emergencia ya normado (ESI-007), con rastro completo y revisión posterior; la emergencia justifica velocidad, jamás anonimato.
5. **Comunicación proporcional y honesta**: los tenants afectados saben que se sabe, qué se hace y cuándo habrá novedades; el silencio durante el incidente cuesta más confianza que el incidente.
6. **Los mecanismos de emergencia se ensayan**: kill switches, reversa, acceso de emergencia y roles se ejercitan con simulacros periódicos (cadencia en el DGP) — el complemento del ensayo de reversa (doc 14 §3.5).
7. **Retrospectiva sin culpa, con acciones**: todo S1/S2 (y los S3 que enseñen) produce retrospectiva: línea de tiempo, causas (plural: casi nunca es una), qué barrera faltó y **acciones con dueño y plazo** que entran al flujo como trabajo real (doc 20). La retrospectiva que no produce cambios verificables es teatro; la que busca culpables produce silencio la próxima vez.
8. **Lo aprendido se promueve**: barreras faltantes → puertas (doc 07 §3.6), pruebas (doc 8), alertas o normas — el incidente como fábrica de estándar, el mismo ciclo de promoción de toda la casa.

## Impacto sobre la implementación

Los canales, la herramienta de gestión y la cadencia de simulacros se definen en el DGP de entrega; el régimen de seguridad de ESI-007/19 permanece intacto por encima.

## Dependencias

ESI-007/19 (incidentes de seguridad), acceso de emergencia ESI-007; ESI-008/13 (lenguaje honesto); docs 07-08, 12, 14, 18, 20.

## Riesgos

- La retrospectiva degenerando en trámite sin acciones reales; mitigación: acciones con dueño y plazo auditadas en el tablero (doc 18) — la retrospectiva se cierra cuando sus acciones cierran, no cuando termina la reunión.

## Decisiones habilitadas

- Respuesta rápida y ordenada sin héroes improvisados.
- Mejora sistemática del estándar alimentada por incidentes reales.

## Decisiones bloqueadas

- Prohibida la intervención en producción sin rastro, incluso en S1.
- Prohibido cerrar S1/S2 sin retrospectiva con acciones.
- Prohibida la búsqueda de culpables como método de retrospectiva.

## Reusable Pattern

Severidades contractuales + roles + estabilizar-primero + retrospectiva con acciones promovidas: el incidente convertido en insumo del estándar.

## Anti-Patterns

- Todos tecleando y nadie decidiendo.
- El diagnóstico en caliente mientras los tenants esperan.
- La retrospectiva de una línea: "error humano, se habló con la persona".

## Knowledge Graph

- **ETS que consume**: ETS-012 (las promesas de servicio que el incidente amenaza).
- **ESI que consume**: ESI-007/19 (régimen de seguridad, intacto); ESI-007 (acceso de emergencia); ESI-008/13.
- **DGP que originará**: canales, simulacros y plantilla de retrospectiva en el DGP de entrega.
- **ADR relacionados**: ADR de retrospectiva sin culpa; ADR de severidades S1-S4.
- **Módulos que reutilizarán este patrón**: todos; el módulo afectado aporta resolutores, el modelo es único.
