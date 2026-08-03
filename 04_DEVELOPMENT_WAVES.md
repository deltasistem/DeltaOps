# 04 — Development Waves

> **DeltaOps — DGP-000 · v1.0** · Las olas oficiales de desarrollo W0…W6: la división completa del programa de construcción, derivada de la hoja de ruta congelada.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

Las olas materializan las fases de la hoja de ruta oficial (ESI-010/27) como **unidades de planificación de construcción**: cada ola agrupa los DGP que entregan juntos un salto verificable del sistema. El orden es normativo; la composición interna de cada ola se detalla en docs 05-07.

## 2. Las olas oficiales

| Ola | Nombre | Contenido | Fase (ESI-010/27) |
|---|---|---|---|
| **W0** | **Plataforma de entrega** | Monorepo, puertas, pipeline, plantillas, entornos, seed asimétrico, tablero mínimo — la fábrica antes que las piezas (ESI-009/27 §3.1) | Fase 0 |
| **W1** | **Fundación** | Kernel (identidad, tenancy, RLS dos murallas, permisos, auditoría, `clave_idempotencia`, fechaNegocio), fundamento backend (ESI-003), chasis de experiencia (tokens, layouts, navegación), suelo de seguridad | Fase 1 |
| **W2** | **Módulo de referencia** | El módulo de referencia completo (ESI-004) de idea a operación interna: valida fábrica, fundación, chasis y compuertas con producción real interna | Fase 2 — Hito A |
| **W3** | **Corazón CMMS** | Los módulos del corazón del producto (orden interno de ESI-005/27): activos, órdenes de trabajo, mantenimiento preventivo y su séquito mínimo; servicios compartidos de Ola 1 (ESI-006/26) | Fase 3 — Hito B |
| **W4** | **Expansión operativa** | Segunda ola de módulos y servicios (ESI-006/26): inventario/almacenes, compras/proveedores, y los marcos de experiencia que la demanda real exija | Fase 4 — Hito C |
| **W5** | **Expansión analítica y de integración** | KPIs/reportería avanzada, exportes, IA de producto (ESI-006/13), integraciones externas contratadas | Fase 4 — Hito C |
| **W6** | **Escala** | Cobertura comercial plena del catálogo de capacidades, endurecimiento operativo, capacidad multi-región según ETS-012 | Fase 5 — Hito D |

## 3. Reglas de las olas

1. **La ola abre solo con su compuerta previa en verde**: W1 exige PR-01…10 (ESI-010/23); W2 exige fundación ejercitable; W3 exige Hito A; W4/W5 exigen Hito B y PF-05/06 por ola; W6 exige PF-07/08 — las compuertas son las ya normadas, sin duplicación.
2. **Dentro de la ola, los DGP se ordenan por la matriz de dependencias** (doc 16) y se paralelizan por la estrategia oficial (doc 09).
3. **La composición fina de W3…W6 se confirma al abrir cada ola** con decisión registrada: el programa fija el orden y los criterios; el detalle de módulos por ola respeta ESI-005/27 y ESI-006/26 y se ajusta solo por evidencia (doc 28).
4. **W4 y W5 pueden solaparse** si sus fronteras están contratadas (CP-06) y los equipos existen de verdad (doc 18) — el solape es una decisión de capacidad, no un default.

## Impacto sobre la implementación

Toda planificación de DGP se ancla a una ola; el registro (doc 12) clasifica cada DGP por su ola y la cadencia planifica dentro de ella.

## Dependencias

ESI-003; ESI-004; ESI-005/27; ESI-006/13, /26; ESI-009/27; ESI-010/23-24, /27; docs 05-09, 12, 16, 18, 28.

## Riesgos

- La tentación de adelantar módulos vendibles (W3) antes de validar la fábrica (W2); mitigación: la compuerta Hito A es normativa — el costo de retrabajo de saltarla ya está documentado como el anti-patrón central del programa.

## Decisiones habilitadas

- Planificación completa del programa en siete unidades gobernadas.
- Conversaciones comerciales ancladas a olas con compuertas demostrables.

## Decisiones bloqueadas

- Prohibido abrir una ola con la compuerta previa en rojo.
- Prohibido mover módulos entre olas sin decisión registrada.
- Prohibido el solape de olas sin fronteras contratadas y capacidad real.

## Reusable Pattern

Olas = fases de la hoja de ruta convertidas en unidades de planificación con compuerta de apertura: el programa entero legible en una tabla.

## Anti-Patterns

- La "ola comercial urgente" injertada fuera del orden.
- Abrir W4 para ocupar un equipo libre sin PF-05/06.
- Olas tan grandes que nunca cierran nada.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el corazón de W3); ETS-012 (la escala de W6).
- **ESI que consume**: ESI-005/27 y ESI-006/26 (órdenes internos); ESI-009/27; ESI-010/27 (fases).
- **DGP que originará**: todos los funcionales pertenecen a exactamente una ola.
- **ADR relacionados**: ADR de división oficial en olas W0…W6.
- **Módulos que reutilizarán este patrón**: cada módulo entra al programa por su ola.
