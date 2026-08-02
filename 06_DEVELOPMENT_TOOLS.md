# 06_DEVELOPMENT_TOOLS.md

> **DeltaOps — ESI-001 · v1.0** · Herramientas oficiales de desarrollo.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación principal |
|---|---|---|
| **IDE** | **Libre elección individual** (VS Code como referencia documentada); la verdad del estilo vive en las herramientas de línea de comandos, no en el IDE | el Charter exige automatización verificable en CI (§3.9): cualquier IDE que respete las herramientas oficiales es válido; se documenta configuración de referencia para VS Code por ser la mayoritaria |
| **Control de versiones** | **Git, con tronco protegido y PRs obligatorios** | universal; el flujo exacto (ramas cortas por pieza, PR chico, merge con puerta ETS-012/28) se detalla en 10 |
| **Formato (Python)** | **Ruff format** | un formateador determinista, sin debates de estilo; integrado con el linter |
| **Lint (Python)** | **Ruff** | velocidad (todo el repo en segundos), reglas de imports que ayudan a vigilar fronteras, un solo binario para format+lint |
| **Tipos (Python)** | **Verificación estática estricta en kernel/dominio/aplicación** (mypy o pyright — se fija en el ADR del esqueleto con benchmark propio) | los contratos del Kernel son tipos; la Regla de Dependencia se apoya en firmas verificadas |
| **Formato/Lint (TypeScript)** | **Prettier + ESLint (config typescript-strict)** | estándar del ecosistema React elegido (03); reglas de imports para fronteras del frontend |
| **Verificación de dependencias arquitectónicas** | **Herramienta de reglas de imports por capas** (import-linter en Python; ESLint boundaries en TS) | R1-R5 y M1-M5 (ETS-011/23) verificadas mecánicamente en CI — requisito no negociable de ETS-012/23 §regla 6 |
| **Debug** | depurador nativo del IDE + trazas locales del stack de observabilidad (09) corriendo en Compose | el diagnóstico por traza/correlación es el MISMO en dev y producción — se aprende una sola herramienta de diagnóstico |
| **Productividad / generación** | generadores propios del proyecto: esqueleto de pieza desde plantilla (ETS-012), tipos de frontera desde OpenAPI, validadores desde contratos | la plantilla ejecutable elimina la deriva; "crear un caso de uso" es un comando, no una copia manual |
| **Hooks locales** | hooks de pre-commit con formato+lint rápidos | el fallo barato ocurre en el segundo del commit, no en el minuto del CI; CI sigue siendo la única puerta oficial |

## 2. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **IDE único impuesto** | costo de imposición sin beneficio: la calidad se verifica en CI, no en el editor; imponer IDE es cultura de vigilancia, no de ingeniería |
| **Black + isort + Flake8 + pylint** | pila histórica de 3-4 herramientas que Ruff reemplaza con paridad de reglas y velocidad superior; menos configuración que mantener |
| **Biome (TS)** | prometedor, pero el ecosistema de plugins ESLint (boundaries, a11y, TanStack) aún es necesario para las reglas que el proyecto exige |
| **Monorepo tools pesados (Nx, Bazel)** | un backend + un frontend no ameritan un orquestador de builds; los scripts del manifiesto bastan; revisar si el roadmap multiplica artefactos |
| **GitFlow** | ceremonial para un equipo chico con release continuo; tronco + ramas cortas es el estándar actual y encaja con el proceso del Charter §8 |

## 3. Reglas de uso

1. **CI es el árbitro, el IDE es preferencia**: ninguna regla de calidad vive solo en el editor; todo lo exigible corre en línea de comandos (Charter §3.9).
2. **Formato no se discute**: el formateador oficial gana todo debate de estilo por definición; los PRs jamás contienen diffs de re-formato mezclados con cambios (ETS-012/26 §regla 2).
3. **Los generadores son la vía normal de crear piezas**: crear a mano lo que el generador produce es fuente de deriva; si la plantilla queda corta, se mejora la plantilla (gobierno de ETS-012).

---

## Impacto sobre la implementación
Fija el tooling diario; el esqueleto inicial del proyecto (ESI posterior) entregará estas herramientas configuradas y los generadores de plantillas funcionando desde el primer commit.

## Dependencias
02/03 (lenguajes elegidos) · 10 (CI que ejecuta todo esto como puerta) · ETS-011/23 y ETS-012/23 (reglas de dependencia a verificar).

## Riesgos
- Reglas de lint acumulándose sin criterio → el set de reglas es ADR versionado; agregar reglas ruidosas exige justificación.
- Generadores abandonados frente a plantillas que evolucionan → el generador es parte del repo y se actualiza en el MISMO PR que cambia una plantilla.

## Decisiones habilitadas
Esqueleto del proyecto con tooling completo, hooks, generadores de piezas, configuración de referencia de IDE.

## Decisiones bloqueadas
Elección final mypy vs pyright (ADR con benchmark en el esqueleto) y sets exactos de reglas — primeros ADRs de implementación.
