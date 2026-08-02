# 10_DOCKER_STRATEGY.md

> **DeltaOps — ESI-002 · v1.0** · Estrategia Docker: cómo se usan los contenedores en el día a día de ingeniería.
> Desarrolla ESI-001/05 para el trabajo diario. Sin Dockerfiles, sin YAML — diseño normativo.

---

## 1. Los tres usos oficiales de Docker

| Uso | Qué contiene | Quién lo consume |
|---|---|---|
| **Servicios de desarrollo** | PostgreSQL, Redis, object storage, stack de observabilidad — versiones FIJADAS idénticas a PROD | todo desarrollador, vía Compose (11) |
| **Imagen de aplicación** | el artefacto de release: backend (web+workers por rol de arranque) y el build estático del frontend | pipeline y entornos QA/UAT/PROD |
| **Ejecución de puertas** | Testcontainers levanta servicios efímeros para integración (ESI-001/07); CI construye y escanea la imagen | suites y pipeline |

**El código de aplicación NO corre en contenedor durante el desarrollo local**: corre nativo (procesos de uv/Vite) contra los servicios contenedorizados. Razón: ciclo de recarga instantáneo y depuración directa del IDE valen más que la simetría total; la paridad de verdad la garantizan los servicios fijados + la puerta de CI que sí prueba la imagen real.

## 2. Diseño de la imagen de aplicación (normativo)

1. **Una imagen por release** con el backend y los estáticos del frontend; el rol (web, despachador, consumidores, jobs) se decide por comando de arranque (ESI-001/05 §2).
2. **Multi-etapa**: etapa de build (dependencias, compilación de frontend, generación de contratos) separada de la etapa final mínima; la imagen final no contiene toolchain de build.
3. **Base mínima y fijada**: imagen base oficial slim con versión exacta; la actualización de base es PR revisado (Renovate la propone, ESI-001/10).
4. **Sin secretos, sin configuración de entorno, sin datos** (08); la imagen es la misma para QA/UAT/PROD byte a byte.
5. **Usuario no root, sistema de archivos de solo lectura** donde sea posible: los volúmenes de escritura son explícitos y pocos.
6. **Etiquetado**: la imagen se etiqueta con la versión SemVer y el hash de commit; `latest` no existe en producción — toda referencia es exacta.
7. **Escaneada y con SBOM** en cada build (Trivy + Syft, ESI-001/08).

## 3. Reglas de higiene diaria

1. **Versiones de servicios fijadas en el Compose**: subir la versión de PostgreSQL local es un PR que la sube para todos (y para CI) a la vez — jamás drift individual.
2. **Volúmenes locales desechables**: destruir y resembrar (12) es la operación normal; ningún desarrollador acumula estado precioso en volúmenes locales.
3. **Prohibido `exec` para arreglar**: el contenedor que necesita cirugía interna se reconstruye; lo mutado a mano no existe oficialmente (imagen inmutable, ESI-001/05 §regla 1).
4. **Recursos limitados en local**: el Compose declara límites razonables para que el entorno completo quepa en una máquina de desarrollo normal (05 §regla 4).

## 4. Alternativas descartadas (día a día)

| Alternativa | Razón |
|---|---|
| **Desarrollo dentro de contenedores (devcontainers) como único camino** | fricción de IDE/recarga sin ganancia decisiva dado el diseño del §1; queda como opción personal soportada si no exige cambios al repo |
| **Compose distinto por desarrollador** | drift estructural; hay UN Compose con overrides mínimos documentados (ESI-001/05 §riesgos) |
| **Imágenes separadas backend/frontend** | dos artefactos que versionar y promover para un producto que se libera junto; el CDN sirve los estáticos, la imagen los origina |

---

## Impacto sobre la implementación
El DGP de esqueleto materializará este diseño (Dockerfile multi-etapa, Compose fijado); las reglas de higiene rigen desde el primer día y la puerta escanea cada build.

## Dependencias
ESI-001/05 (topología e imagen única) · 11 (servicios locales) · 09 (entornos que consumen la imagen) · ESI-001/08 (escaneo/SBOM) · 12 (resembrado).

## Riesgos
- Drift local por versiones no fijadas → regla 1; el Compose es la única fuente de versiones de servicios.
- La app nativa local divergiendo de la imagen → la puerta SIEMPRE prueba la imagen real (integración+E2E); lo que pasa localmente pero falla en imagen es defecto detectado a tiempo.

## Decisiones habilitadas
Dockerfile y Compose reales (DGP), Testcontainers con las mismas versiones fijadas, política de actualización de bases por Renovate.

## Decisiones bloqueadas
Elección de imagen base exacta y detalles de multi-etapa — ADR ligero en el esqueleto.
