# 12_TECHNOLOGY_ROADMAP.md

> **DeltaOps — ESI-001 · v1.0** · Roadmap tecnológico: qué entra ahora, qué está preparado, qué espera su señal, qué quedó descartado.
> Cierra la serie ESI-001. Sin código.

---

## 1. Tecnologías del MVP (entran ahora)

| Plano | Stack |
|---|---|
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, uv |
| Identidad | OIDC/OAuth 2.1 + JWT (proveedor tras puerto) |
| Frontend | React 18+, TypeScript estricto, Vite, TanStack Query/Router, Tailwind, shadcn/ui, RHF, Zod, i18next, PWA (Workbox + IndexedDB) |
| Datos | PostgreSQL 16+, Redis 7+, object storage S3-compatible |
| Infra | Docker/OCI, Compose, Caddy, CDN para estáticos |
| Calidad | pytest (+hypothesis), Vitest+Testing Library, Playwright, Testcontainers, Schemathesis, k6 |
| Seguridad | pip-audit/npm audit, Trivy, Gitleaks, Semgrep, ZAP, Syft (SBOM) |
| Observabilidad | OpenTelemetry, Collector, Prometheus, Grafana, Loki, Tempo/Jaeger |
| Entrega | GitHub Actions, SemVer, Conventional Commits, Renovate |

## 2. Tecnologías preparadas (diseño listo, activación cuando la señal llegue)

| Tecnología | Señal que la activa | Por qué el diseño ya la soporta |
|---|---|---|
| **Réplicas de lectura PostgreSQL** | presupuestos de consulta/exportación bajo presión (ETS-011/27) | CQRS ya separa lecturas; los lectores conmutan a réplica sin cambio de módulo |
| **Kubernetes** | multi-nodo real o requisitos de disponibilidad superiores | mismas imágenes OCI; solo cambia orquestación (ADR-012) |
| **Broker de eventos dedicado (Kafka/Rabbit)** | volumen del flujo de eventos supera lo razonable en PostgreSQL (ADR-011) | contrato de consumidores (cursores, sobres, bandejas) es estable; cambia el transporte tras la plataforma |
| **Motor de búsqueda dedicado (OpenSearch)** | relevancia/volumen exceden PostgreSQL full-text | puerto ÍndiceDeBúsqueda ya aísla (ETS-012/19); reconstrucción por replay puebla el motor nuevo |
| **App móvil nativa (React Native)** | requisitos de hardware (escáner industrial, background sync agresivo) que la PWA no cubra | el API y la cola de comandos idempotentes no cambian; es un canal más (igualdad de canales) |
| **Runners CI propios** | límites/costos de runners gestionados | cambio de configuración de Actions, no de pipeline |
| **Sentry (u OTLP equivalente) para errores de frontend** | volumen de usuarios que amerite agregación dedicada | se suma como destino del colector/SDK sin tocar diseño |

## 3. Tecnologías futuras (evaluación cuando el producto lo pida)

- **Extracción de módulos a servicios** — la válvula mayor, ya diseñada (ETS-011/28 §extracción); su señal es organizacional (equipos) tanto como técnica.
- **Data warehouse dedicado para BI** — hoy los marts NP (ETS-009/20) viven en PostgreSQL; un warehouse entra cuando el volumen analítico moleste al operacional.
- **Edge/geodistribución** — si la latencia por geografía de tenants lo exige; la CDN ya cubre estáticos.
- **Proveedores de IA adicionales / modelos propios** — el puerto ProveedorDeIA (ETS-011/21) admite N proveedores; la evaluación es por capacidad, costo y residencia de datos.

## 4. Tecnologías descartadas (con su razón, condensada de 02-10)

| Descartada | Razón |
|---|---|
| Node/TS backend, Java/Spring, C#/.NET, Go, Django, Flask | 02 §2 — ecosistema IA, ceremonia, DDD pobre, ActiveRecord, sin contrato-primero |
| Angular, Vue, Svelte, Next/SSR, Redux, Formik, CSS-in-JS, Cypress, Selenium, Jest | 03/07 §2 — comunidad, SSR sin beneficio, duplicación de estado, rendimiento, generación anterior |
| MySQL/MariaDB, MongoDB principal, SQLite prod, Memcached, binarios en BD | 04 §4 — RLS innegociable, diseño relacional congelado, alcance |
| Kubernetes-en-MVP, serverless, Nginx, Traefik, VMs artesanales | 05 §3 — costo operativo, workers persistentes, TLS manual, drift |
| Jenkins, GitFlow, CalVer, SonarQube central, Snyk, ELK, SaaS de observabilidad | 06-10 — operación, ceremonia, señal de compatibilidad, costo/lock-in |

Un descarte no es eterno: re-abrirlo exige ADR nuevo que supersede (11 §0) con evidencia de que la razón original ya no aplica.

## 5. Gobierno del roadmap

- El roadmap se revisa por hito de producto o cuando una señal del §2 se dispara — no por calendario de modas.
- Toda promoción de §2/§3 al stack activo pasa por ADR + actualización de este documento.
- Las fechas EOL de las versiones adoptadas se rastrean (01 §4); la actualización de versión mayor es trabajo planificado con entrada propia aquí.

---

## Impacto sobre la implementación
El equipo sabe qué usar hoy, qué está a un ADR de distancia y qué no discutir de nuevo sin evidencia; las "tecnologías preparadas" confirman que el diseño congelado ya absorbe el crecimiento previsto sin re-arquitectura.

## Dependencias
01-11 (toda la serie) · ETS-011/28 (evolución del producto) · ENGINEERING_CHARTER §5 (congelamiento).

## Riesgos
- Activar tecnologías preparadas por entusiasmo sin señal → cada fila del §2 tiene su señal medible; sin señal, no hay ADR.
- Roadmap desactualizado tras ADRs nuevos → regla del §5: el ADR que promueve actualiza este documento en el mismo cambio.

## Decisiones habilitadas
ESI siguientes: traducción oficial de patrones al stack, esqueleto del proyecto, estándares de código, plan de construcción del MVP.

## Decisiones bloqueadas
Todo lo listado en §2/§3 hasta su señal y ADR; y cualquier tecnología nueva fuera de este proceso.
