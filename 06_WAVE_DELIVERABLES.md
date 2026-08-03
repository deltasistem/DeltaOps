# 06 — Wave Deliverables

> **DeltaOps — DGP-000 · v1.0** · Los entregables oficiales por ola: las piezas concretas que cada ola produce, cada una con su norma de origen y su evidencia de terminado.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Regla de formulación

Un entregable es una pieza **nombrable, operable y con evidencia** — no una actividad. Cada entregable cita la norma que lo define; su "terminado" es el DoD de la casa (ESI-009/22) más los criterios del DGP que lo produce.

## 2. Entregables por ola

**W0 — Plataforma de entrega**
1. Monorepo estructurado con fronteras verificables (ESI-009/03; ESI-010/05).
2. Pipeline de PR con puertas mecánicas y QC (ESI-009/07, /24).
3. Plantillas: PR de nueve rubros, DGP, decisión (ESI-009/05; ESI-002/27).
4. Cadena de entornos con seed asimétrico (ESI-009/08-09).
5. Tren de liberación mínimo con versionado y reversa (ESI-009/10-14).
6. Tablero mínimo con métricas derivándose (ESI-010/25; ESI-009/18).
7. Registros inicializados: construcción, contratos, decisiones (docs 12, 14; ESI-010/07, /13).

**W1 — Fundación**
1. Kernel operable: identidad, tenancy con RLS dos murallas, permisos, auditoría, idempotencia, fechaNegocio (ESI-003; ESI-007).
2. Baterías intocables de aislamiento en el pipeline (ESI-007; CP-09).
3. Registro técnico de módulos y capacidades funcionando (ESI-004/04).
4. Chasis de experiencia: tokens, layouts, navegación, posturas (ESI-008).
5. Fundamento backend: convenciones de contrato, eventos, errores (ESI-003).
6. Suelo de seguridad: gestión de secretos, cabeceras, autenticación endurecida (ESI-007/25 fase temprana).

**W2 — Módulo de referencia**
1. El módulo de referencia completo en producción interna (ESI-004).
2. El molde documentado: su DGP como plantilla viva de construcción de módulos.
3. Hallazgos de fábrica promovidos a puertas/pruebas (CP-12).
4. Evidencia de Hito A: PF-01/02 con enlaces (ESI-010/24).

**W3 — Corazón CMMS**
1. Módulos del corazón operando (orden ESI-005/27): activos, órdenes de trabajo, preventivo.
2. Servicios compartidos de Ola 1 (ESI-006/26): los que el corazón exige.
3. Operación productiva completa: soporte, incidentes, reversa ensayada (ESI-009/15, /27 §3.2).
4. Evidencia de Hito B: PF-03/04; primer tenant productivo.

**W4 — Expansión operativa**
1. Módulos de cadena de suministro con sus contratos cruzados registrados.
2. Flujos inter-módulo operando por contratos (CP-06; ESI-010/13).
3. Marcos de experiencia agregados por demanda real (ESI-008/27 §3.2).
4. Evidencia PF-05/06 de la ola.

**W5 — Expansión analítica y de integración**
1. KPIs y reportería sobre contratos de lectura (ESI-006).
2. Exportes bajo su régimen (ESI-006/09).
3. IA de producto bajo régimen congelado (ESI-006/13; ESI-008/22).
4. Primera integración externa con contrato externo y su reloj (ESI-010/13 §3.3).

**W6 — Escala**
1. Cobertura total del catálogo de capacidades (ESI-010/10 sin divergencia).
2. Endurecimiento operativo: umbrales de escala, on-call sostenible (PF-08).
3. Evidencia de Hito D: PF-07/08.

## 3. Régimen

1. La lista es normativa en composición; el detalle fino de cada entregable vive en el DGP que lo produce.
2. Agregar o quitar entregables de una ola es decisión registrada (doc 28), no ajuste silencioso.

## Impacto sobre la implementación

Los DGP funcionales se derivan de esta lista: cada entregable mapea a uno o más DGP en el registro (doc 12).

## Dependencias

ESI-002…010 (normas de origen citadas); docs 04-05, 12, 16, 28.

## Riesgos

- Entregables formulados como actividades ("configurar pipeline") sin evidencia de operables; mitigación: la regla §1 — pieza nombrable con DoD y evidencia, verificada en AG (doc 23).

## Decisiones habilitadas

- Derivación directa de la cartera de DGP desde entregables.
- Cierre de olas contra listas concretas, no impresiones.

## Decisiones bloqueadas

- Prohibidos entregables sin norma de origen.
- Prohibido modificar la composición sin decisión registrada.
- Prohibido dar por entregado sin evidencia de operable.

## Reusable Pattern

Entregable = pieza nombrable + norma de origen + evidencia de terminado: la ola como lista de piezas verificables, no como período de actividad.

## Anti-Patterns

- El entregable "avance en X" sin estado operable.
- La pieza construida que ninguna norma pidió.
- Entregables intercambiados entre olas por conveniencia sin decisión.

## Knowledge Graph

- **ETS que consume**: los que cada entregable materializa vía su norma.
- **ESI que consume**: ESI-002…010 (cada entregable cita su origen).
- **DGP que originará**: uno o más por entregable, mapeados en el registro.
- **ADR relacionados**: ADR de composición de entregables por ola.
- **Módulos que reutilizarán este patrón**: sus entregas siguen la misma regla de formulación.
