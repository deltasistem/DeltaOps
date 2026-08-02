# 14_CODE_QUALITY.md

> **DeltaOps — ESI-002 · v1.0** · Calidad del código antes del commit: el fallo barato ocurre temprano.
> Sin código, sin configuración.

---

## 1. La escalera de verificación (cada peldaño más caro que el anterior)

| Peldaño | Cuándo | Qué corre | Presupuesto |
|---|---|---|---|
| 1. El editor | al escribir | formato al guardar, diagnósticos de tipos y lint en vivo (15) | instantáneo |
| 2. Pre-commit | al commitear | formato + lint del diff, Gitleaks, mensajes convencionales (04) | segundos |
| 3. Local a demanda | antes del PR | `pruebas unit` + tipos completos + reglas de imports (16) | < 2 min |
| 4. La puerta (CI) | en el PR | el pipeline completo de ESI-001/10 §2 | < 15 min |

La regla de oro: **nada llega al peldaño 4 que pudo fallar en el 2** — el CI rojo por formato es tiempo de máquina y de humanos tirado.

## 2. Reglas de pre-commit

1. **Los hooks oficiales son obligatorios** y los instala el bootstrap (05 §2.8); trabajar sin hooks es posible técnicamente e inaceptable culturalmente — y la puerta lo detecta igual.
2. **Los hooks son rápidos por contrato** (< 10 segundos sobre el diff): el hook lento se optimiza o baja de peldaño; el hook que estorba será saltado, y un hook saltable protege nada.
3. **Los hooks no reescriben en silencio más que formato**: correcciones automáticas de formato sí; cambios semánticos automáticos jamás.
4. **El bypass (`--no-verify`) no está prohibido técnicamente pero deja rastro**: la puerta re-verifica todo; el bypass habitual es tema de retro, no de policía.

## 3. Qué es "calidad antes del commit" además de herramientas

1. **Autorrevisión con el checklist** (25): el autor lee su propio diff completo antes de abrir PR — el 80% de los hallazgos de revisión son evitables por autorrevisión.
2. **La pieza se termina**: código + prueba + documentación de la pieza en el mismo commit lógico (Definition of Done del Charter §9); el "luego le agrego la prueba" no existe.
3. **Tamaño**: si el diff no se puede autorrevisar en 15 minutos, es demasiado grande — se divide (04 §3.2).
4. **Los TODO tienen dueño y expediente**: el TODO anónimo sin issue asociado falla revisión; el código no es un backlog.

## 4. Métricas de salud (para 27, no para personas)

- Tasa de PRs rechazados por la puerta por causas del peldaño 1-2 (objetivo: ≈ 0).
- Duración de la puerta (presupuesto 15 min, ESI-001/10).
- Tiempo entre apertura de PR y merge (fluidez del proceso, no productividad individual).

Las métricas evalúan la plataforma, jamás a los individuos — la métrica usada como látigo se corrompe y corrompe (Goodhart).

---

## Impacto sobre la implementación
Los hooks, la suite rápida local y el checklist de autorrevisión quedan definidos; el esqueleto los entrega funcionando y el onboarding (06) los enseña como el ritmo normal de trabajo.

## Dependencias
ESI-001/06 (herramientas de formato/lint/tipos) · ESI-001/10 (la puerta) · 04 (commits/PRs) · 05 (instalación de hooks) · 25 (checklist) · 15 (editor).

## Riesgos
- Hooks engordando hasta ser saltados → presupuesto de 10 segundos con medición; lo que no cabe, baja de peldaño.
- Métricas de salud derivando a evaluación individual → regla explícita del §4; el gobierno (27) la custodia.

## Decisiones habilitadas
Configuración concreta de hooks (DGP), checklist de autorrevisión (25), tablero de salud de plataforma (27).

## Decisiones bloqueadas
Set exacto de reglas de lint y hooks — ADR ligero del esqueleto (ESI-001/06 §riesgos).
