# 02_MONOREPO_ARCHITECTURE.md

> **DeltaOps — ESI-002 · v1.0** · Arquitectura del monorepo: un producto, un repositorio, una historia.
> Sin código, sin estructuras físicas.

---

## 1. Decisión: monorepo único

DeltaOps se construye en **un solo repositorio Git** que contiene backend, frontend, contratos, infraestructura declarativa, plantillas, generadores y documentación de ingeniería.

**Justificación**:
- El monolito modular (ETS-007) es UN producto desplegado como UN release: partirlo en repos multiplicaría versionado cruzado sin beneficio.
- Los contratos OpenAPI generados por el backend alimentan la generación de tipos del frontend (ESI-001/03 §regla 1): en un monorepo, contrato y consumidor cambian en el MISMO PR — la incompatibilidad es imposible de mergear.
- Las plantillas y generadores (ETS-012) gobiernan a todos los planos: deben evolucionar atómicamente con las piezas que generan.
- La puerta de CI (ESI-001/10) verifica el sistema completo por PR: una sola puerta, una sola verdad.

## 2. Anatomía lógica del monorepo

| Zona | Contenido | Regla |
|---|---|---|
| **Aplicaciones** | las unidades desplegables: el backend (web + workers, una sola aplicación con roles de arranque) y el frontend (SPA/PWA) | una aplicación = un artefacto de despliegue |
| **Paquetes compartidos** | contratos generados (tipos de frontera), utilidades transversales aprobadas | compartir requiere ADR: lo compartido es contrato, no conveniencia |
| **Plataforma** | plantillas, generadores, reglas de verificación arquitectónica, suites transversales | evoluciona con gobierno de ETS-012 |
| **Infraestructura declarativa** | manifiestos de Compose y pipeline (como código, cuando el DGP los cree) | revisados como cualquier código |
| **Documentación** | ADRs, guías de ingeniería, decisiones vivas | Documentation as Code |

## 3. Reglas de compartición (las importantes)

1. **El backend no importa del frontend ni viceversa, jamás**: el único puente es el contrato OpenAPI generado — artefacto, no import.
2. **Los paquetes compartidos no contienen dominio**: el dominio vive dentro de los módulos del backend (ETS-011); lo compartible es infraestructura de tipos y utilidades sin estado.
3. **Prohibido el paquete `common` cajón de sastre**: cada paquete compartido tiene propósito único y dueño; el paquete que acumula miscelánea se divide o se elimina.
4. **Dependencias entre zonas son un grafo dirigido sin ciclos**, verificado mecánicamente igual que R1-R5/M1-M5 (ESI-001/06).

## 4. Un solo versionado

El monorepo tiene **una sola versión de producto** (SemVer, ESI-001/10): no hay versiones independientes por paquete interno. Los paquetes internos no se publican a registries: se consumen por ruta de workspace. Esto elimina la gestión de compatibilidad interna — todo commit es un estado coherente del sistema completo.

## 5. Alternativas descartadas

| Alternativa | Razón |
|---|---|
| **Multi-repo (backend/frontend separados)** | versionado cruzado de contratos, PRs coordinados a mano, dos puertas de CI divergentes — costo permanente sin beneficio para un producto |
| **Monorepo con versionado por paquete (changesets)** | útil para librerías publicadas; DeltaOps no publica librerías — una versión de producto basta |
| **Submódulos Git** | lo peor de ambos mundos: fricción de multi-repo dentro de un repo |

---

## Impacto sobre la implementación
El esqueleto físico (bajo DGP) creará exactamente estas zonas; toda pieza nueva nace en la zona que le corresponde, y el grafo de dependencias entre zonas se verifica en la puerta.

## Dependencias
ETS-007/011 (monolito modular que se hospeda) · ESI-001/02-03 (las dos aplicaciones) · 03 (estructura física detallada) · ESI-001/06 (verificación de fronteras).

## Riesgos
- Paquetes compartidos creciendo como acoplamiento encubierto → regla 3 + ADR obligatorio por paquete nuevo.
- Monorepo lento con los años (clones, CI) → señales y remedios (caché de CI, clones parciales) se registran en 28.

## Decisiones habilitadas
Estructura física del repositorio (03), convenciones de carpetas, pipeline único de CI, generación contrato→tipos en un PR.

## Decisiones bloqueadas
Publicación de paquetes a registries externos y versionado por paquete — requieren ADR que supersede si el roadmap lo exigiera.
