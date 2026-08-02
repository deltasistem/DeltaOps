# 01 — Concepto de Business Module

> **DeltaOps — ESI-005 · v1.0** · Qué es un módulo de negocio en DeltaOps y qué lo distingue del módulo de referencia y de la plataforma.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Definición

Un **Business Module** es la unidad de entrega de valor de DeltaOps: implementa un dominio de negocio real (Activos, Órdenes de Trabajo, Inventario, Compras, Combustible, SST) siguiendo **exactamente** el patrón demostrado por el módulo de referencia (ESI-004), sobre la plataforma congelada (ESI-003), dentro de los contextos delimitados de ETS-003.

| Capa | Qué es | Quién la norma |
|---|---|---|
| Plataforma | Kernel, UoW, RLS, outbox, middleware | ESI-003 (congelada) |
| Patrón | Cómo se construye un módulo | ESI-004 (el ejemplar) |
| **Módulo de negocio** | Un dominio real construido conforme al patrón | **Esta serie (el estándar)** |

## 2. Propiedades obligatorias

1. **Un contexto delimitado, un módulo**: el mapa de módulos es el de ETS-003; ningún módulo abarca dos contextos ni un contexto se parte sin decisión de arquitectura.
2. **Autonomía**: el módulo funciona con sus vecinos apagados; toda colaboración es por eventos o por contratos publicados, jamás por imports (AP-05, ESI-004/23).
3. **Conformidad, no inspiración**: donde el patrón fija forma (anatomía, pipeline, denegaciones, pruebas patrón), el módulo la adopta tal cual; su libertad está en el contenido del dominio (qué agregados, qué reglas, qué eventos).
4. **Completo por definición**: un módulo incluye dominio, aplicación, adaptadores, borde, declaración, seed, pruebas de cuatro niveles, expediente documental, métricas e indicadores. No existen "módulos solo API" ni "módulos solo datos".
5. **Multitenant y auditado por construcción**: hereda las dos murallas (ETS-009) y la auditoría declarativa (ESI-004/17) sin código propio.

## 3. Qué NO es un módulo de negocio

- No es una carpeta de pantallas: la UI consume módulos, no los define.
- No es un microservicio: vive en el monolito modular (ESI-003/01); la frontera es lógica, no de red.
- No es plataforma: si dos módulos necesitan la misma pieza técnica, esa pieza sube a plataforma por el proceso de cambio (ESI-002/27), no se copia.

## Impacto sobre la implementación

Esta serie es el contrato de entrada de todo DGP de módulo de negocio: define el estándar; el DGP lo instancia por dominio.

## Dependencias

ETS-003 (contextos), ETS-009; ESI-003/01; ESI-004/01-02 y /24; ESI-002/27.

## Riesgos

- Leer el estándar como burocracia y construir "módulos inspirados"; mitigación: los criterios de aceptación y el scorecard (docs 24-25) hacen la conformidad medible, no opinable.

## Decisiones habilitadas

- Arrancar DGP de módulos de negocio con una definición común de "módulo".
- Comparar módulos entre sí (madurez, scorecard) porque comparten estándar.

## Decisiones bloqueadas

- Prohibidos módulos que abarquen más de un contexto delimitado.
- Prohibidos módulos parciales (sin pruebas, sin seed, sin expediente).
- Prohibido resolver necesidades técnicas comunes dentro de un módulo.

## Reusable Pattern

La tabla de capas §1 y las cinco propiedades §2 son la definición citable de módulo; todo DGP la referencia en su primera página.

## Anti-Patterns

- Módulos-pantalla organizados por vistas de UI.
- "Módulo común/compartido" cajón de sastre entre dominios.
- Partir contextos por conveniencia de equipos (ley de Conway invertida).

## Knowledge Graph

- **ETS que consume**: ETS-001 (visión), ETS-003 (contextos y mapa de módulos), ETS-009 (multitenancy).
- **ESI que consume**: ESI-003/01 (arquitectura), ESI-004/01-02 (patrón), ESI-002/27 (gobierno).
- **DGP que originará**: la cabecera conceptual de todo DGP-módulo (DGP-Activos, DGP-OT, DGP-Inventario, DGP-Compras, DGP-Combustible, DGP-SST).
- **ADR relacionados**: ADR de monolito modular (ESI-001) y de mapa de contextos (ETS-003).
- **Módulos que reutilizarán este patrón**: todos los módulos de negocio, sin excepción.
