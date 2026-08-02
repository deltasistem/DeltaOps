# 28 — Evolución de Shared Services

> **DeltaOps — ESI-006 · v1.0** · Cómo cambia el estrato compartido sin romper a nadie: contratos con muchos dependientes, altas, bajas y devoluciones.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

La evolución de servicios hereda íntegro el régimen de módulos (ESI-005/28): expandir-migrar-contraer, N/N-1 en todo lo publicado, datos con historia intocable, cambios de definición versionados. La diferencia es de **radio**: un contrato de servicio tiene a todo el sistema como dependiente potencial.

## 2. Reglas específicas del estrato

1. **El radio se mide antes de cambiar**: todo cambio de contrato publicado parte de la fila del servicio en la matriz observada (doc 22 §2.4) — la lista real de consumidores, no la de diseño. El plan de migración cubre la fila completa.
2. **Los contratos de marca evolucionan como contratos publicados**: cambiar qué exige una marca (doc 18 §2.2) es N/N-1 con todos los módulos marcantes como dependientes; es el cambio de mayor radio del sistema y se trata con esa seriedad.
3. **Alta de servicio**: por el proceso de admisión (doc 01 §3 + doc 02 §2.1); nace en M0 con DGP en la ola que su demanda justifique (doc 26 §3.1).
4. **Baja de servicio**: solo con fila vacía en la matriz observada; el régimen de retiro de ESI-005/28 §2.4 aplica (anuncio, período, datos preservados según retención). Un servicio con consumidores no se retira: se migra primero a su sucesor.
5. **Devolución al módulo**: el caso M2-estancado (doc 23 §2.2) — la funcionalidad vuelve al único módulo consumidor como pieza interna; los contratos públicos se retiran con el régimen §2.4; la decisión queda registrada.
6. **División y fusión de servicios**: siguen el patrón de módulos (ESI-005/28 §2.5, corte por contratos publicados); la matriz y el registro se actualizan en la misma operación.
7. **Versiones del catálogo**: el catálogo (doc 02) se versiona como documento normativo; cada alta/baja/fusión produce versión nueva con su decisión citada.

## Impacto sobre la implementación

Los DGP-Servicio incluyen su plan de evolución (qué es publicado, qué radio tiene); la telemetría de consumo por versión (ESI-005/28) cubre también los contratos del estrato.

## Dependencias

ESI-005/28; docs 01-02, 18, 21-23 y 26; ESI-002/27.

## Riesgos

- Parálisis por radio ("no cambiamos nada porque todo depende"); mitigación: expandir-migrar-contraer hace todo cambio posible con orden — el costo del radio se paga en calendario, no en valentía; los waivers de calendario los decide el portafolio.

## Decisiones habilitadas

- Evolución del estrato con radio conocido y migraciones planificables.
- Salidas dignas: retiro, devolución y fusión como operaciones normadas.

## Decisiones bloqueadas

- Prohibido cambiar contratos publicados sin recorrer la fila observada.
- Prohibido retirar servicios con consumidores activos.
- Prohibidas altas/bajas del catálogo fuera del proceso versionado.

## Reusable Pattern

Radio-por-matriz + N/N-1 heredado + salidas normadas (retiro/devolución/fusión): el ciclo de vida completo de toda pieza del estrato, citable por los DGP.

## Anti-Patterns

- El "cambio interno" que era contrato observable (rompe consumidores sin aviso).
- Retiros anunciados por correo sin período N/N-1 real.
- Servicios zombis: sin consumidores, sin retiro, consumiendo operación.

## Knowledge Graph

- **ETS que consume**: ETS-008 (contratos), ETS-010 (disciplina de cambio).
- **ESI que consume**: ESI-002/27; ESI-005/28.
- **DGP que originará**: la sección de evolución en cada DGP-Servicio; el proceso de versión del catálogo en el DGP de plataforma.
- **ADR relacionados**: ADR de radio-por-matriz (§2.1); ADR de devolución al módulo (doc 23 §2.2).
- **Módulos que reutilizarán este patrón**: todos como dependientes protegidos por N/N-1; sus propias evoluciones siguen ESI-005/28.

---

**Fin de la serie ESI-006.**
