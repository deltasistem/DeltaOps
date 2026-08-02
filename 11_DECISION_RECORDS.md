# 11_DECISION_RECORDS.md

> **DeltaOps — ESI-001 · v1.0** · Registro oficial de decisiones tecnológicas (ADRs) de esta serie.
> Formato: Contexto · Decisión · Consecuencias · Alternativas. Sin código.

---

## 0. Formato y gobierno de ADRs

- Todo ADR es **inmutable una vez aceptado**: cambiar de opinión = ADR nuevo que **supersede** al anterior (Append Only también en las decisiones).
- Estados: Propuesto → Aceptado → (Supersedido por ADR-nnn).
- Los ADRs futuros de implementación vivirán en el repositorio junto al código (Documentation as Code) con este mismo formato.
- Los ADR-001…015 siguientes quedan **Aceptados** con la aprobación de este ESI-001.

---

## ADR-001 — Python como lenguaje de backend
**Contexto**: monolito modular con dominio rico, IA integrada (ETS-011/21) y equipo por formar. **Decisión**: Python 3.12+. **Consecuencias**: ecosistema IA/datos nativo; disciplina de tipos estricta obligatoria (06); rendimiento suficiente con async + workers (los presupuestos ETS-004/11 mandan, no el benchmark abstracto). **Alternativas**: Node/TS (divide ecosistema IA), Java/C# (ceremonia), Go (DDD pobre) — ver 02 §2.

## ADR-002 — FastAPI como framework HTTP
**Contexto**: API First con catálogo ETS-008; adaptadores delgados. **Decisión**: FastAPI. **Consecuencias**: OpenAPI generado de tipos; el framework queda confinado a adaptadores/arranque. **Alternativas**: Django (ActiveRecord contra Clean Architecture), Flask (sin contrato-primero).

## ADR-003 — SQLAlchemy 2 + Alembic
**Contexto**: UoW explícito, RLS, mapeo agregado↔tablas (ETS-010/012). **Decisión**: SQLAlchemy Core+ORM y Alembic. **Consecuencias**: control transaccional total; migraciones revisables. **Alternativas**: ORMs active-record (violan Dependency Rule), SQL artesanal total (costo sin beneficio).

## ADR-004 — Pydantic v2 para fronteras
**Contexto**: capa 1 de validación generada del contrato (ETS-012/13). **Decisión**: Pydantic v2. **Consecuencias**: validación de forma declarativa y serialización canónica; tipos de dominio permanecen puros (Kernel propio). **Alternativas**: marshmallow (menor rendimiento/ecosistema), validación manual (prohibida).

## ADR-005 — OIDC/OAuth 2.1 + JWT para identidad
**Contexto**: multi-canal (web, móvil offline, integraciones) y multi-tenant. **Decisión**: OIDC con tokens firmados; proveedor tras puerto de identidad. **Consecuencias**: verificación sin estado en el pipeline (ETS-011/14); proveedor sustituible. **Alternativas**: sesiones de servidor (rompen offline/integraciones), esquema propietario (jamás se inventa criptografía de identidad).

## ADR-006 — React + TypeScript + Vite
**Contexto**: SPA/PWA multi-pantalla (ETS-004), contratos tipados. **Decisión**: React 18+, TS estricto, Vite. **Consecuencias**: ecosistema shadcn/TanStack disponible; tipos de frontera generados. **Alternativas**: Angular/Vue/Svelte (comunidad menor para el ecosistema elegido), Next/SSR (sin beneficio tras login).

## ADR-007 — TanStack Query/Router, Tailwind, shadcn/ui, RHF, Zod
**Contexto**: CQRS en el cliente, formularios densos, accesibilidad U-criterios. **Decisión**: el conjunto listado en 03. **Consecuencias**: estado de servidor unificado, componentes poseídos, validación espejo del contrato. **Alternativas**: Redux (duplica verdad del servidor), Formik (rendimiento), CSS-in-JS (runtime).

## ADR-008 — PWA offline con cola de comandos (sin app nativa en MVP)
**Contexto**: Offline First (ETS-002) con presupuesto de MVP. **Decisión**: PWA + service worker + IndexedDB, cola de comandos idempotentes del catálogo. **Consecuencias**: una base de código; igualdad de canales literal; app nativa queda como opción de roadmap sin cambio de API. **Alternativas**: React Native/nativa (segunda base de código prematura).

## ADR-009 — PostgreSQL 16+ como única base de verdad
**Contexto**: ETS-010 diseñó sobre RLS, esquemas, particiones, outbox transaccional. **Decisión**: PostgreSQL. **Consecuencias**: el diseño físico se implementa tal cual; réplicas para lectura pesada. **Alternativas**: MySQL (sin RLS equivalente), documental (contra el diseño congelado).

## ADR-010 — Redis solo-efímero y object storage S3-compatible
**Contexto**: caché/ritmo y binarios fuera del Core (ETS-011/18/22). **Decisión**: Redis 7+ (jamás fuente de verdad) y API S3 con proveedor sustituible. **Consecuencias**: pérdida de Redis = degradación, no corrección; binarios portables. **Alternativas**: Memcached (menos estructuras), binarios en BD (prohibido).

## ADR-011 — Outbox sobre PostgreSQL sin broker dedicado en MVP
**Contexto**: at-least-once con orden por agregado (ETS-011/10) a volúmenes NP de MVP. **Decisión**: despachador y cursores sobre PostgreSQL. **Consecuencias**: una pieza operativa menos; contrato de consumidores estable si un broker llega después. **Alternativas**: Kafka/Rabbit ahora (costo operativo prematuro; roadmap).

## ADR-012 — Docker + Compose + Caddy; sin Kubernetes en MVP
**Contexto**: monolito modular, un dígito de contenedores. **Decisión**: imágenes OCI, Compose, Caddy con TLS automático. **Consecuencias**: paridad dev/prod; migración futura a K8s con las mismas imágenes. **Alternativas**: K8s (costo desproporcionado), serverless (choca con workers/cursores), Nginx (TLS manual).

## ADR-013 — OpenTelemetry + Prometheus/Grafana/Loki/Tempo
**Contexto**: observabilidad diseñada (ETS-011/27) y sustituibilidad. **Decisión**: emisión OTLP única, colector como frontera, stack libre de análisis. **Consecuencias**: destinos intercambiables sin tocar código. **Alternativas**: SaaS observabilidad (costo/lock-in), ELK (sobredimensionado para logs de solo-anomalías).

## ADR-014 — pytest/Vitest/Playwright/Testcontainers/Schemathesis/k6
**Contexto**: pirámide y matrices de ETS-012/25 necesitan instrumentos. **Decisión**: el conjunto de 07. **Consecuencias**: cada plantilla de prueba tiene herramienta; integración contra PostgreSQL real. **Alternativas**: Jest/Cypress/Selenium/mocks de BD — ver 07 §2.

## ADR-015 — GitHub Actions + SemVer + Conventional Commits + Renovate
**Contexto**: la puerta ETS-012/28 debe ser máquina. **Decisión**: el conjunto de 10, imagen única promocionada. **Consecuencias**: release trazable commit→producción; notas generadas. **Alternativas**: Jenkins (operación), GitFlow (ceremonia), CalVer (no comunica compatibilidad).

---

## Impacto sobre la implementación
Quince decisiones quedan registradas, numeradas y citables; todo ADR futuro de implementación continúa esta serie con el mismo formato y gobierno.

## Dependencias
01-10 (los análisis que estos ADRs condensan) · ENGINEERING_CHARTER §4-5 (autoridad y congelamiento).

## Riesgos
- ADRs editados en vez de supersedidos → regla de inmutabilidad; el diff de un ADR aceptado falla revisión.
- Decisiones tomadas sin ADR "por chicas" → umbral claro: toda dependencia nueva de producción exige al menos ADR ligero.

## Decisiones habilitadas
Serie ADR-016+ para implementación; trazabilidad de toda tecnología a su justificación.

## Decisiones bloqueadas
Ninguna adicional: este documento registra, no decide.
