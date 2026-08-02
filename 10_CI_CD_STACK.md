# 10_CI_CD_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de CI/CD: la puerta de calidad de ETS-012/28 hecha máquina.
> Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación |
|---|---|---|
| **Plataforma CI/CD** | **GitHub Actions** | integración nativa con el flujo de PRs; ecosistema de acciones maduro; runners gestionados suficientes para el MVP; el pipeline vive como código en el repo (Documentation as Code) |
| **Estrategia de ramas** | **Tronco protegido + ramas cortas por pieza + PR obligatorio** | Charter §8: ningún merge sin puerta; ramas de vida corta (días, no semanas) para integración continua real |
| **Versionado** | **SemVer para el producto; Conventional Commits para los mensajes** | mayor.menor.parche comunica compatibilidad (N/N-1, ETS-008/17); los commits convencionales permiten generar notas de release y decidir el incremento automáticamente |
| **Releases** | **Release por tag inmutable**: build único de imagen OCI (05) + SBOM (08) + notas generadas; la MISMA imagen promociona dev → staging → producción | "se construye una vez, se promociona siempre": lo probado es lo desplegado, byte a byte |
| **Actualización de dependencias** | **Renovate** con PRs automáticos agrupados | dependencias frescas por goteo continuo en vez de big-bangs anuales; cada PR de Renovate pasa la puerta completa como cualquier otro |
| **Entornos** | **desarrollo (efímero por PR cuando aplique) → staging (permanente, espejo de prod) → producción**; despliegue por Compose (05) accionado desde Actions | staging es donde corre DAST (08), E2E completo (07) y ensayos de migración (ETS-010/21) |

## 2. El pipeline oficial (orden de la puerta, ETS-012/25 §3 y 28)

```
PR abierto:
  1. formato + lint + tipos (06)                      [minutos 0-2]
  2. verificación de dependencias arquitectónicas      [R1-R5, M1-M5]
  3. regeneración de contratos (diff = fallo)          [API First]
  4. unit: dominio + casos de uso (fakes primero)      [< 1 min objetivo]
  5. seguridad de PR: Semgrep + audit + Gitleaks (08)
  6. suites transversales (matrices)                   [autorización, config, idempotencia, tenant]
  7. integración: Testcontainers (07)
  8. build de imagen + Trivy
merge a tronco:
  9. E2E (Playwright) contra entorno efímero/staging
 10. despliegue automático a staging
tag de release:
 11. imagen promocionada + SBOM + notas → aprobación de despliegue → producción
programado:
 12. k6 (presupuestos), ZAP baseline, re-escaneo Trivy, Renovate
```

Todo rojo bloquea (Charter §10); no existen merges con "pendientes".

## 3. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **GitLab CI / Bitbucket** | equivalentes; GitHub Actions gana por ubicación del repo y ecosistema; no hay razón técnica para operar una segunda plataforma |
| **Jenkins** | poder máximo con costo de operación máximo (servidor propio, plugins, seguridad); injustificable frente a runners gestionados para este tamaño |
| **CircleCI/otros SaaS CI** | capacidad similar con un proveedor más que gestionar; sin ventaja diferencial |
| **GitFlow con ramas release/develop** | ceremonial y contrario a integración continua de tronco; los releases se marcan con tags, no con ramas permanentes |
| **CalVer** | SemVer comunica compatibilidad, que es lo que el gobierno N/N-1 necesita señalizar |
| **Despliegue continuo directo a producción (sin aprobación)** | deseable a futuro con más madurez de suites; el MVP mantiene aprobación humana del paso a producción — la automatización llega hasta staging |

## 4. Reglas de uso

1. **El pipeline es código revisado**: cambios al pipeline pasan PR como todo lo demás; nadie edita la puerta por fuera.
2. **Los pasos 1-8 deben ser rápidos** (< 15 min total objetivo): la puerta lenta invita a PRs gigantes — el tamaño de PR chico (Charter §12) depende de una puerta ágil.
3. **Ninguna credencial en el repo**: secretos de despliegue en el almacén de secretos de la plataforma CI, inyectados por entorno (08 §regla 3).
4. **La migración de base de datos corre ANTES de promover la imagen** (expandir-migrar-contraer, ETS-012/27): el pipeline ordena migración → despliegue, jamás al revés, y ensaya en staging primero.

---

## Impacto sobre la implementación
El proceso del Charter §8 (Análisis→…→Producción) queda instrumentado: la mitad mecánica del checklist de PR (ETS-012/28) corre como pasos 1-8, y el release es un artefacto único trazable del commit a producción.

## Dependencias
05 (imágenes y Compose) · 06 (herramientas que ejecuta) · 07 (suites) · 08 (puertas de seguridad) · 09 (observabilidad del despliegue) · ETS-012/25 y 28.

## Riesgos
- Puerta creciendo hasta volverse lenta → presupuesto de 15 min con métrica; lo lento se mueve a programado o se optimiza.
- Dependencia de runners gestionados (límites/costos) → runners propios son un cambio de configuración documentado en el ADR, no de diseño.

## Decisiones habilitadas
Esqueleto con pipeline funcionando desde el primer commit, releases trazables, promoción por entornos, Renovate.

## Decisiones bloqueadas
Aprobadores concretos, calendario de releases y SLAs de despliegue — decisión operativa/organizacional posterior.
