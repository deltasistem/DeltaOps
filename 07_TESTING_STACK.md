# 07_TESTING_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de pruebas: herramientas para la pirámide de ETS-011/25 y ETS-012/25.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales (por nivel de la pirámide)

| Nivel (ETS-012/25) | Herramienta oficial | Justificación |
|---|---|---|
| **Unit — dominio, motores, Policies, casos de uso (backend)** | **pytest** (+ hypothesis para motores con espacios de entrada grandes) | estándar Python absoluto; fixtures componibles para fakes; parametrización nativa = tablas de casos de ETS-012/05 §3; hypothesis genera los bordes que las tablas manuales olvidan |
| **Unit — componentes y lógica (frontend)** | **Vitest + Testing Library** | nativo del ecosistema Vite (03); Testing Library fuerza pruebas por comportamiento visible, no por internos — alineado con "se prueba el contrato" (ETS-012/25 §regla 5) |
| **Contract — puertos fake vs real** | **pytest con suites parametrizadas por implementación** | la MISMA suite corre contra fake y adaptador real (ETS-012/08 §3) — pytest lo expresa naturalmente con parametrización de fixtures |
| **Contract — API (frontera HTTP)** | **Schemathesis sobre el OpenAPI generado** | verifica que la implementación cumple el contrato publicado (ETS-008), generando casos desde el esquema — API First verificado mecánicamente |
| **Integration — módulo con base real** | **pytest + Testcontainers** (PostgreSQL/Redis/object storage efímeros) | cada corrida levanta infraestructura real desechable: el UoW, RLS y el outbox se prueban contra PostgreSQL de verdad, no contra un simulacro |
| **E2E — flujos U críticos** | **Playwright** | estándar actual; multi-navegador; trazas y grabaciones para diagnóstico; soporta el modo offline/PWA que los flujos móviles del MVP exigen |
| **Performance** | **k6** para carga sobre el API (presupuestos ETS-004/11); **pytest-benchmark** para motores calientes | los presupuestos de latencia son requisitos verificables (Charter §3.7); k6 scriptea escenarios por operación del catálogo y corre en CI programado |
| **Security testing** | según 08 (SAST/DAST/deps) — se integra a esta pirámide en CI | separación de responsabilidades: 08 elige, 10 orquesta |

## 2. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **unittest (stdlib)** | verboso, sin fixtures componibles ni parametrización rica; pytest es el estándar de facto |
| **Jest** | en un proyecto Vite, Vitest ofrece la misma API sin doble pipeline de transformación; Jest pierde por fricción |
| **Cypress** | Playwright lo supera en velocidad, multi-navegador y soporte de contextos (multi-tenant en paralelo); comunidad E2E migrando |
| **Selenium** | generación anterior; mantenimiento de drivers y flakiness estructural |
| **Mocks de base de datos (sqlite "compatible", fakes de SQL)** | prohibidos para integración: RLS, particiones y transacciones del diseño físico (ETS-010) solo se prueban contra PostgreSQL real — Testcontainers lo hace barato |
| **Locust** | válido; k6 gana por escenarios como código versionable, métricas integrables al stack de observabilidad (09) y umbrales declarativos que fallan CI |
| **Pact (contratos consumidor-productor)** | útil entre servicios independientes; en el monolito modular con OpenAPI único y cliente generado, Schemathesis + generación cubren el riesgo con una herramienta menos |

## 3. Reglas de uso

1. **La velocidad es un requisito**: unit backend completo < 1 minuto en máquina de desarrollo (ETS-012/25 §regla 2); las suites que lo violen se optimizan o se degradan a integración.
2. **Testcontainers solo en integración**: si una prueba de dominio/caso de uso pide un contenedor, la pieza está mal cortada — se corrige la pieza (regla de oro 10).
3. **Los E2E son pocos y de flujo U** (ETS-012/25 §regla 8): la lista de flujos E2E es un documento gobernado, no un cajón que crece.
4. **La intermitencia es bug de máxima prioridad** (ETS-012/25 §regla 3): la prueba intermitente se arregla o se elimina el mismo día.

---

## Impacto sobre la implementación
Cada plantilla de prueba de ETS-012 tiene ahora su herramienta; el esqueleto inicial entregará las suites transversales (matrices) montadas sobre pytest parametrizado desde el primer módulo.

## Dependencias
02/03 (stacks a probar) · 04 (PostgreSQL real vía Testcontainers) · 08 (security testing) · 10 (orquestación en CI) · ETS-011/25 y ETS-012/25 (la estrategia que esto instrumenta).

## Riesgos
- Testcontainers lentos degradando el ciclo → integración corre en CI y bajo demanda local; el ciclo diario es unit en memoria.
- E2E creciendo por ansiedad → regla 3: lista gobernada con presupuesto.

## Decisiones habilitadas
Suites transversales ejecutables, verificación de contrato API en CI, presupuestos de rendimiento como umbrales k6.

## Decisiones bloqueadas
Configuración de cada herramienta y estructura de fixtures — ESI de patrones/esqueleto.
