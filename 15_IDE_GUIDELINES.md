# 15_IDE_GUIDELINES.md

> **DeltaOps — ESI-002 · v1.0** · Configuración del IDE: libertad de editor, uniformidad de resultado.
> Sin código, sin configuración física.

---

## 1. Postura oficial (de ESI-001/06)

El IDE es **elección personal**; la calidad se verifica en línea de comandos y CI, jamás solo en el editor. Lo que la plataforma norma no es *qué editor* sino *qué debe poder hacer el editor elegido*:

| Capacidad exigida | Con qué (stack ESI-001) |
|---|---|
| Formato al guardar | Ruff format (Python), Prettier (TS) — la MISMA configuración del repo |
| Diagnósticos de tipos en vivo | el verificador oficial de tipos leyendo la configuración del repo |
| Lint en vivo | Ruff / ESLint con las reglas del repo |
| Depuración | contra los procesos locales nativos (10 §1) con puntos de interrupción |
| Ejecución de pruebas | correr una prueba individual desde el editor |

Si el editor elegido no puede con la tabla, el problema es del editor elegido.

## 2. Configuración de referencia: VS Code

El repositorio incluye (bajo DGP) la **configuración de referencia compartida** para VS Code: extensiones recomendadas (Python/Ruff, ESLint, Prettier, Playwright), ajustes de formato-al-guardar apuntando a las herramientas del repo, y configuraciones de depuración para web, workers y pruebas. Reglas:

1. **La configuración compartida es mínima**: solo lo que garantiza la tabla del §1; las preferencias personales (tema, atajos) jamás se commitean.
2. **La configuración del repo es la única fuente de reglas**: la configuración del IDE apunta a las herramientas y configuraciones del repositorio; prohibido duplicar reglas de formato/lint dentro de ajustes del editor.
3. **Otros IDEs son bienvenidos** (PyCharm, vim/neovim, etc.) bajo la misma regla: se configuran contra las herramientas del repo; sus archivos de configuración personales van ignorados por Git salvo que el equipo decida mantener una segunda referencia con dueño.

## 3. Asistentes IA en el editor

Los asistentes de código en el IDE están permitidos y sus reglas viven en 17 (marcado `asistido_ia`, revisión humana, prohibiciones). El IDE no exime de nada: la pieza asistida pasa por los mismos peldaños (14).

## 4. Anti-patrones prohibidos

- "Funciona en mi IDE": reglas que solo existen en el editor de alguien — todo lo normativo corre por línea de comandos (Charter §3.9).
- Formateadores del IDE distintos del oficial "porque me gusta más" — el diff de re-formato ajeno contamina PRs (ETS-012/26 §regla 2).
- Configuración compartida creciendo con preferencias personales — regla 1 del §2.

---

## Impacto sobre la implementación
El DGP de esqueleto entrega la configuración de referencia de VS Code y las configuraciones de depuración; el onboarding (06) deja el editor del nuevo integrante cumpliendo la tabla del §1 en el día 1.

## Dependencias
ESI-001/06 (decisión IDE-agnóstica y herramientas) · 14 (peldaño 1 de la escalera) · 17 (asistentes IA) · 05 (bootstrap deja las herramientas listas).

## Riesgos
- Deriva silenciosa de quien usa editor sin diagnósticos en vivo → los peldaños 2-4 (14) atrapan todo igual; el costo lo paga quien eligió trabajar a ciegas, no el repo.
- Configuración de referencia desactualizada → tiene dueño (27) y se prueba en cada onboarding real.

## Decisiones habilitadas
Configuración de referencia física, configuraciones de depuración, guía de editor en el onboarding.

## Decisiones bloqueadas
Mantener referencias oficiales para más IDEs — solo si alguien las adopta como dueño (regla 3 del §2).
