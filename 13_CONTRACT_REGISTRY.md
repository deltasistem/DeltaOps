# 13 — Contract Registry

> **DeltaOps — ESI-010 · v1.0** · El registro de contratos: el inventario de todos los contratos publicados — API, eventos, exportes, esquemas — con versión, estado N/N-1 y consumidores.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

El contrato es la moneda de las fronteras: comandos y consultas (ESI-003), eventos de dominio, exportes (ESI-006/09), interfaces de servicios compartidos. Sus regímenes están congelados (ESI-003; N/N-1 en ESI-009/11); este registro consolida el inventario: **qué contratos existen, en qué versión, con qué ventana y quiénes cuelgan de ellos**.

## 2. Contenido por entrada

1. **Identidad**: tipo (comando / consulta / evento / exporte / interfaz de servicio), dueño (módulo o servicio) y el documento que lo cataloga (los catálogos de ESI-003/ESI-005).
2. **Versión y estado**: publicado / N con N-1 vigente / deprecado con ventana / retirado — el ciclo del artefacto (doc 03).
3. **Consumidores**: derivados mecánicamente (doc 05 §2.4, doc 12 §3.2); para consumidores externos (integraciones de clientes), el registro de lo expuesto públicamente con su política declarada.
4. **Rupturas pendientes**: cambios incompatibles anunciados, su ventana y su plan de migración de consumidores.

## 3. Reglas del registro

1. **Contrato no registrado = contrato inexistente**: lo que un módulo expone sin entrada en los catálogos y este registro no es contrato — es fuga de frontera, hallazgo de puerta (la versión de inventario del régimen ESI-005/04).
2. **La ruptura se gestiona desde el registro**: la puerta de compatibilidad (ESI-009/07) compara contra la versión registrada; la ventana N/N-1 y su vencimiento son estados visibles — la contracción (retiro de N-1) solo procede con consumidores migrados o decisión registrada.
3. **El contrato externo es más lento por diseño**: lo consumido por clientes lleva ventanas más largas y comunicación formal (la honestidad de soporte de ESI-009/11 §2.6); el registro distingue interno de externo porque sus relojes difieren.
4. **La prueba de contrato cuelga del registro** (ESI-009/08): todo contrato registrado tiene su batería; el contrato sin prueba es un contrato de palabra.

## Impacto sobre la implementación

El inventario deriva de los catálogos congelados y el grafo del monorepo; la distinción interno/externo y las ventanas se declaran en los DGP dueños.

## Dependencias

ESI-003 (catálogos y regímenes); ESI-005/04; ESI-006/09; ESI-009/07-08, /11; docs 03, 05, 12.

## Riesgos

- El inventario tratado como formalidad mientras las rupturas se negocian por chat; mitigación: la puerta mecánica compara contra el registro — la ruptura no registrada no compila su camino a producción.

## Decisiones habilitadas

- Evolución de contratos con consumidores exactos y ventanas visibles.
- Compromisos externos gestionados con relojes propios y honestos.

## Decisiones bloqueadas

- Prohibidas interfaces expuestas fuera del registro.
- Prohibida la contracción con consumidores sin migrar salvo decisión.
- Prohibidos contratos publicados sin batería de pruebas.

## Reusable Pattern

Inventario de contratos con versión+ventana+consumidores mecánicos + puerta que compara contra él: el contrato como ciudadano registrado — no como acuerdo de pasillo.

## Anti-Patterns

- El endpoint "interno" que tres clientes ya usan.
- Romper y avisar después.
- La ventana N/N-1 eterna porque nadie migra a los consumidores.

## Knowledge Graph

- **ETS que consume**: ETS-012 (los compromisos externos y su reloj).
- **ESI que consume**: ESI-003; ESI-005/04; ESI-006/09; ESI-009/07-08, /11.
- **DGP que originará**: ninguno; las ventanas y políticas viven en los DGP dueños.
- **ADR relacionados**: ADR de registro de contratos con puerta de compatibilidad.
- **Módulos que reutilizarán este patrón**: todos publican y consumen por el registro.
