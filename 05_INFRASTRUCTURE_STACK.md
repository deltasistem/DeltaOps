# 05_INFRASTRUCTURE_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de infraestructura.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación principal |
|---|---|---|
| **Empaquetado** | **Docker (imágenes OCI)** | artefacto de despliegue único e inmutable por release; paridad dev/prod; estándar universal con tooling de seguridad maduro (escaneo, SBOM, 08) |
| **Orquestación local / entornos chicos** | **Docker Compose** | describe el sistema completo (web, workers, PostgreSQL, Redis, object storage local, proxy) en un manifiesto declarativo; suficiente para desarrollo, staging y despliegues de un solo nodo del MVP |
| **Proxy inverso / TLS** | **Caddy** | TLS automático (ACME) sin operación manual de certificados, configuración mínima legible; termina TLS y enruta al monolito — no hace lógica |
| **CDN** | **CDN estándar delante de los estáticos del frontend y descargas públicas firmadas** (proveedor sustituible) | la SPA/PWA es contenido estático versionado ideal para CDN; el API no se cachea en CDN (respuestas autenticadas por tenant) |
| **Object storage** | según 04: API S3; en desarrollo, una implementación S3-compatible libre corre en Compose | paridad dev/prod del flujo de archivos completo (URLs firmadas incluidas) |
| **Observabilidad (infra)** | según 09: colector OpenTelemetry + almacenes de métricas/logs/trazas corren como servicios del Compose de operación | la infraestructura emite; el stack de análisis es el de 09 |

## 2. Topología oficial del MVP

```
Internet → CDN (estáticos SPA) 
        → Caddy (TLS) → contenedor web (FastAPI: pipeline de comandos/consultas)
                       → contenedores worker (despachador, consumidores, jobs)
                       → PostgreSQL (primario + réplica de lectura cuando el volumen lo pida)
                       → Redis
                       → Object storage (S3 API)
```

- **Un solo artefacto de imagen para web y workers** (el rol lo decide el comando de arranque): un build, un release, cero divergencia.
- Los workers escalan por número de contenedores; el aislamiento de ritmo (ETS-011/22) se materializa como workers dedicados por familia de consumidores.
- Todo servicio con estado (PostgreSQL, object storage) vive fuera del ciclo de vida de los contenedores de aplicación (volúmenes/servicios gestionados).

## 3. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **Kubernetes en el MVP** | costo operativo desproporcionado para un monolito modular de un dígito de contenedores; Compose cubre el MVP; la migración futura a K8s (si la escala lo exige) usa las MISMAS imágenes OCI — roadmap (12), no re-trabajo |
| **Nginx** | excelente y descartado por margen fino: la gestión manual/scriptada de certificados y la configuración más verbosa pierden contra el TLS automático de Caddy; Nginx queda como sustituto directo documentado en el ADR si Caddy presentara límites |
| **Traefik** | orientado a entornos dinámicos multi-servicio (K8s/swarm); para un monolito tras un proxy, su descubrimiento dinámico es complejidad sin uso |
| **Serverless / FaaS** | el modelo de workers persistentes con cursores (despachador, consumidores) y transacciones largas del UoW encaja mal con funciones efímeras; además acopla a un proveedor (contra 01 §2.5) |
| **PaaS propietario como diseño** | válido como *hosting* del MVP si conviene, pero el diseño oficial es "contenedores + Compose" para no depender de ningún PaaS; el PaaS que no ejecute este diseño estándar se descarta |
| **VMs artesanales sin contenedores** | sin paridad dev/prod ni artefacto inmutable; el drift de configuración es deuda estructural |

## 4. Reglas de uso

1. **La imagen es inmutable y se construye una vez por release** (10); prohibido "arreglar dentro del contenedor".
2. **Toda configuración de despliegue entra por entorno/secretos** al arranque (ETS-012/16 §mundo de despliegue); las imágenes no contienen secretos ni endpoints.
3. **Paridad de Compose**: el Compose de desarrollo levanta el sistema completo (incluido object storage y observabilidad mínima); "en mi máquina funciona" debe significar "en producción también".
4. La CDN jamás cachea respuestas del API; el versionado de estáticos por hash hace el caché de la SPA trivialmente correcto.

---

## Impacto sobre la implementación
Define el artefacto (imagen OCI), la topología del MVP y el perímetro (Caddy+CDN); el esqueleto del proyecto incluirá el Compose completo desde el primer día.

## Dependencias
04 (servicios de datos que hospeda) · 09 (stack de observabilidad que corre encima) · 10 (CI/CD que construye y publica imágenes) · ETS-007 (topología lógica).

## Riesgos
- Compose quedándose corto antes de lo previsto (multi-nodo) → las imágenes OCI hacen la migración a K8s un cambio de orquestación, no de aplicación; la señal está en el roadmap.
- Drift entre Compose de dev y de producción → un solo archivo base con overrides mínimos por entorno, revisado como código.

## Decisiones habilitadas
Esqueleto con Compose, pipeline de build de imágenes (10), estrategia de entornos, hosting concreto del MVP.

## Decisiones bloqueadas
Proveedor de nube/hosting y CDN concretos — decisión comercial/operativa posterior; el diseño es portable por construcción.
