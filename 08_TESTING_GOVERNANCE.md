# 08 — Testing Governance

> **DeltaOps — ESI-009 · v1.0** · El gobierno de pruebas: niveles con propósito, la pirámide como política económica y la prueba como especificación ejecutable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

La prueba es la especificación ejecutable del comportamiento declarado. ESI-004/25 fundó la estrategia para el módulo de referencia; este documento la eleva a gobierno transversal: qué niveles existen, qué le toca a cada uno y qué exige la entrega.

## 2. Niveles con propósito

| Nivel | Prueba | Propiedad clave |
|---|---|---|
| **Unitaria** | Dominio puro: reglas, invariantes, cálculos | Rápida, sin infraestructura, la mayoría absoluta |
| **De contrato** | Comandos/consultas contra sus contratos publicados (ESI-003); eventos y sus esquemas | Detecta rupturas N/N-1 antes que el consumidor |
| **De integración** | Módulo con su persistencia real y servicios compartidos | Verifica RLS, transacciones, `clave_idempotencia` |
| **De extremo a extremo** | Jornadas críticas de ETS-001 sobre el sistema desplegado | Pocas, valiosas, las únicas que cruzan superficie |

## 3. Reglas normativas

1. **La pirámide es política económica**: la mayoría unitarias, pocas E2E; el conjunto invertido (todo E2E) es lento, frágil y caro — un hallazgo de revisión (DR-03) y de score (doc 19).
2. **Todo comportamiento declarado tiene prueba en el nivel más bajo capaz de verificarlo**: la regla de dominio no se prueba vía navegador; el E2E no repite lo que la unitaria ya garantiza.
3. **Las críticas de seguridad y aislamiento son intocables**: las baterías de RLS/no-mezcla de tenants (ESI-005/26, ESI-007), permisos y auditoría corren en toda integración y **jamás se marcan como "flaky" ni se saltan** — son la evidencia de las promesas más caras del producto.
4. **Cobertura como piso, no como meta**: el DGP fija pisos por tipo de paquete (dominio alto, adaptadores menor); subir cobertura con pruebas sin aserciones reales es fraude detectable en revisión (DR-03).
5. **La prueba intermitente se cuarentena con dueño y plazo**: la cuarentena visible (doc 18) — no el reintento infinito ni el borrado silencioso; la intermitencia es un defecto, del test o del sistema.
6. **Datos de prueba sintéticos y deterministas**: nunca datos reales de clientes (ESI-007/16); el seed asimétrico (ESI-002/12) provee los escenarios; la prueba que depende del azar o del reloj sin control es defecto.
7. **Las pruebas son código de primera clase**: pasan revisión, respetan convenciones, se refactorizan; el test ilegible es deuda (doc 17).
8. **El contrato de PR declara sus pruebas** (rubro Pruebas, doc 05): qué niveles cubren el cambio y por qué bastan; "sin pruebas" exige justificación que la revisión juzga.

## Impacto sobre la implementación

Los pisos de cobertura, la mecánica de cuarentena y las baterías intocables se configuran en el pipeline (doc 09) según el DGP de entrega.

## Dependencias

ESI-002/12; ESI-003; ESI-004/25; ESI-005/26; ESI-007/16; docs 05-07, 09, 17-19.

## Riesgos

- Suites lentas que rompen la integración diaria; mitigación: pirámide económica, niveles por etapa del pipeline (doc 09 §2.3) y presupuesto de tiempo con métrica (doc 18).

## Decisiones habilitadas

- Refactorización agresiva con red de seguridad ejecutable.
- Rupturas de contrato detectadas por el productor, no por el cliente.

## Decisiones bloqueadas

- Prohibido saltar o cuarentenar baterías de seguridad/aislamiento.
- Prohibidos datos reales de clientes en pruebas.
- Prohibida la cuarentena sin dueño y plazo.

## Reusable Pattern

Niveles con propósito + pirámide económica + baterías intocables + cuarentena con dueño: el gobierno que hace de la suite un activo y no un peaje.

## Anti-Patterns

- La suite E2E de tres horas que todos rezan por que pase.
- Pruebas que afirman que el mock devuelve lo que el mock devuelve.
- Borrar el test rojo para liberar el viernes.

## Knowledge Graph

- **ETS que consume**: ETS-001 (jornadas críticas que definen los E2E).
- **ESI que consume**: ESI-002/12; ESI-003; ESI-004/25; ESI-005/26; ESI-007/16.
- **DGP que originará**: pisos, baterías y cuarentena en el DGP de entrega; niveles exigidos por módulo en su DGP.
- **ADR relacionados**: ADR de pirámide como política económica.
- **Módulos que reutilizarán este patrón**: todos; las baterías de aislamiento son universales.
