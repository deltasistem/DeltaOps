# 08_SECURITY_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de seguridad de ingeniería.
> Complementa la seguridad de producto (ETS-006/010/011: murallas, RLS, auditoría) con la seguridad del proceso de construcción.
> Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación |
|---|---|---|
| **Auditoría de dependencias (Python)** | **pip-audit + lockfile de uv** | detecta CVEs contra la base de datos oficial de avisos; el lockfile hace el resultado determinista |
| **Auditoría de dependencias (JS)** | **npm/pnpm audit + revisión de licencias** | mismo principio para el frontend; el árbol bloqueado por lockfile |
| **Escaneo de imágenes/contenedores** | **Trivy** | escanea imágenes OCI (05), sistemas de archivos y lockfiles con una sola herramienta libre; detecta CVEs del SO base y de librerías |
| **Detección de secretos** | **Gitleaks** (en pre-commit y CI, incluida la historia) | el secreto committeado es el incidente más barato de prevenir y el más caro de limpiar; complementa la regla del Charter (secretos solo por entorno, ETS-012/16) |
| **SAST** | **Semgrep** (reglas estándar + reglas propias del proyecto) | análisis estático rápido y programable: además de vulnerabilidades genéricas, permite codificar reglas DeltaOps (imports prohibidos, patrones vetados como capturas silenciosas — ETS-012/15 §regla 6) |
| **DAST** | **OWASP ZAP** (baseline scan contra entorno de staging, programado) | prueba dinámica del perímetro real (API autenticada) sin acceso al código; complementa SAST donde el estático no llega |
| **SBOM** | **Syft** (generación de SBOM por release, formato CycloneDX) | inventario exacto de componentes por release — requisito creciente de clientes enterprise del segmento de DeltaOps; con Trivy, permite responder "¿nos afecta este CVE?" en minutos |

## 2. Integración al proceso (el cuándo)

| Momento | Qué corre |
|---|---|
| Pre-commit | Gitleaks (rápido, sobre el diff) |
| Cada PR | pip-audit/npm audit + Semgrep + Gitleaks (puerta de merge, 10) |
| Cada build de imagen | Trivy sobre la imagen + Syft genera SBOM adjunta al release |
| Programado (semanal) | ZAP baseline contra staging; re-escaneo Trivy de imágenes en producción (CVEs nuevos sobre binarios viejos) |
| Cada release | SBOM publicada con el artefacto; excepciones de vulnerabilidades documentadas con vencimiento |

## 3. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **Snyk / plataformas comerciales** | capacidad equivalente para este alcance con costo por asiento y dependencia de SaaS propietario (01 §2.5); las piezas libres elegidas cubren el ciclo completo |
| **SonarQube como SAST central** | valioso en calidad de código, pero pesado de operar para el tamaño de equipo; Semgrep + lint (06) + revisión cubren el objetivo; reevaluable en roadmap |
| **Bandit** | Semgrep cubre sus reglas Python y agrega las reglas propias multi-lenguaje; una herramienta menos |
| **truffleHog** | Gitleaks equivalente con mejor mantenimiento actual y modo pre-commit ligero |
| **Dependabot/Renovate como única defensa** | la actualización automatizada de dependencias se adopta (Renovate, ver 10) pero es complemento: no detecta lo ya desplegado ni genera SBOM |

## 4. Reglas de uso

1. **Vulnerabilidad crítica/alta en dependencia directa bloquea el merge**; las excepciones exigen expediente con vencimiento (nunca silencio) — espejo del archivo de excepciones arquitectónicas (ETS-011/23).
2. **Las reglas Semgrep propias son parte del repo** y evolucionan con los patrones: cada prohibición de ETS-012 que sea expresable estáticamente, se expresa.
3. **Ningún secreto en código, imágenes ni logs** — la tríada Gitleaks (código) + regla de entorno (ETS-012/16) + revisión de logs (09) lo cubre por capas.
4. La seguridad de producto (RLS, permisos, auditoría) se prueba en la pirámide (07: matrices de autorización y tenant) — este stack cubre el proceso, no sustituye esas matrices.

---

## Impacto sobre la implementación
La cadena de construcción queda vigilada de punta a punta (código → dependencias → imagen → perímetro), con puertas automáticas en CI y expediente obligatorio para toda excepción.

## Dependencias
06 (hooks y lint) · 05 (imágenes que se escanean) · 10 (CI que orquesta las puertas) · ETS-006/13 (clasificación que el DAST y las reglas respetan).

## Riesgos
- Fatiga de alertas por CVEs irrelevantes → triage con criterio de explotabilidad y excepciones con vencimiento; la puerta bloquea solo directo+crítico/alto.
- Reglas Semgrep propias sin mantenimiento → viven junto a las plantillas y se actualizan en el mismo PR que ellas (como los generadores, 06).

## Decisiones habilitadas
Puertas de seguridad en CI, SBOM por release, respuesta rápida a CVEs, reglas estáticas de arquitectura.

## Decisiones bloqueadas
Proceso de gestión de vulnerabilidades en producción (SLAs de parcheo) — ESI de operación.
