# 16_ENGINEERING_TOOLS.md

> **DeltaOps — ESI-002 · v1.0** · Herramientas obligatorias y scripts oficiales: el vocabulario de comandos de la plataforma.
> Sin código, sin scripts físicos — diseño del catálogo.

---

## 1. Herramientas obligatorias (consolidado de ESI-001)

| Categoría | Herramienta | Norma |
|---|---|---|
| Runtime y paquetes | Python 3.12+/uv · Node LTS/gestor JS del esqueleto | versiones fijadas en el repo; el bootstrap las verifica |
| Calidad | Ruff · verificador de tipos · Prettier · ESLint · import-linter/boundaries | configuración única en el repo |
| Pruebas | pytest · Vitest · Playwright · Testcontainers · Schemathesis · k6 | por nivel (ESI-001/07) |
| Seguridad | Gitleaks · pip-audit/npm audit · Semgrep · Trivy · Syft | peldaños de 14 y puerta |
| Contenedores | Docker · Compose | 10/11 |
| Entrega | Git · GitHub Actions · Renovate | 04 · ESI-001/10 |
| Observabilidad local | stack OTel/Grafana | 11 |

Ninguna herramienta adicional se vuelve obligatoria sin pasar por gobierno (27) y sin entrar a esta tabla por PR.

## 2. Los scripts oficiales (el vocabulario)

Existe un **punto de entrada único de comandos** (un runner de tareas del repo, definido en el esqueleto) con el catálogo oficial. Diseño del catálogo:

| Comando (nombre conceptual) | Qué hace |
|---|---|
| `bootstrap` | la secuencia de 05 completa e idempotente |
| `arriba` / `abajo [--limpio]` | sistema local completo (11) |
| `estado` | salud, migraciones pendientes, frescura de seed, versiones |
| `pruebas <unit|contrato|integracion|e2e|todo>` | suites por nivel con los presupuestos de ETS-012/25 |
| `verificar` | el peldaño 3 de 14: formato+lint+tipos+imports — "lo que verá la puerta" |
| `generar <tipo> <nombre>` | generadores de piezas (19) |
| `contratos` | regenera OpenAPI + tipos de frontera + validadores |
| `migrar [nueva|aplicar|estado]` | ciclo Alembic gobernado |
| `datos <sembrar|resembrar|escenario <n>>` | 12 |
| `rendimiento` | escenarios k6 locales contra el sistema local |

## 3. Reglas del catálogo

1. **Cobertura total**: toda actividad recurrente tiene comando; la actividad que requiere pasos manuales documentados en un chat es un defecto de catálogo.
2. **Nombres en español, memorizables, estables**: el comando es interfaz pública de la plataforma; renombrar exige alias de transición.
3. **Autodescriptivo**: el punto de entrada sin argumentos lista el catálogo con descripciones de una línea — la ayuda vive en la herramienta, no solo en la guía.
4. **Los mismos comandos en CI**: la puerta invoca los MISMOS comandos que el desarrollador usa localmente — cero divergencia entre "local pasa" y "CI corre otra cosa".
5. **Salida honesta**: todo comando termina con veredicto claro y código de salida correcto; el comando que "más o menos funcionó" es un bug.
6. **Los scripts son código de plataforma**: viven en la zona `platform/`, con revisión, dueño y (donde amerite) pruebas.

## 4. Qué NO existe

- Scripts personales sueltos commiteados fuera del catálogo ("mi script que arregla X") — se oficializan o no entran.
- Documentos con listas de comandos copiables que dupliquen el catálogo — la guía (28) referencia comandos, no los duplica.

---

## Impacto sobre la implementación
El runner de tareas y el catálogo completo son entregables del esqueleto; CI se construye invocando este mismo vocabulario (regla 4), y el onboarding lo enseña como la interfaz de la plataforma.

## Dependencias
05/11/12 (comandos que materializa) · 14 (peldaño 3) · 19 (generar) · ESI-001/06-10 (herramientas que orquesta).

## Riesgos
- Catálogo creciendo sin poda → revisión periódica (27); el comando sin uso se retira.
- Divergencia CI/local → regla 4 verificada en revisión de cambios al pipeline: si CI necesita algo nuevo, primero se agrega al catálogo.

## Decisiones habilitadas
Elección del runner de tareas concreto (ADR ligero del esqueleto), sintaxis definitiva, integración con la puerta.

## Decisiones bloqueadas
Escritura física de los scripts — DGP.
