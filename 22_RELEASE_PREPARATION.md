# 22_RELEASE_PREPARATION.md

> **DeltaOps — ESI-002 · v1.0** · Preparación de releases: del tronco verde al tenant sin sobresaltos.
> Sin código.

---

## 1. El ciclo de release (diseño)

```
main (verde) → corte: tag pre-release → despliegue a UAT → aceptación de negocio
            → tag final → promoción de la MISMA imagen a PROD (aprobación humana)
            → chequeo de humo + observación → release cerrado
```

- **Cadencia orientativa**: releases chicos y frecuentes (objetivo semanal o menor); el release grande es riesgo grande — la cadencia corta es la política de riesgo.
- **El corte no espera features**: lo que no llegó, va al siguiente — el tren sale a horario (evita ramas de release y "un commit más").

## 2. Checklist de preparación de release

1. **Tronco verde**: la puerta completa en verde en el commit del corte; sin excepciones acumuladas vencidas (ESI-001/08).
2. **Incremento de versión confirmado** (21): el propuesto automático revisado por el responsable del release; si hay MAYOR, expediente N/N-1 completo.
3. **Migraciones ensayadas**: las migraciones del release corridas en QA con volumen realista y en UAT (09 §2.3); plan de reversa escrito para las que muevan datos (expandir-migrar-contraer garantiza reversa barata).
4. **Notas de release generadas** desde los commits (ESI-001/10) y editadas para legibilidad: qué cambia para usuarios, qué cambia para operadores (variables nuevas del catálogo 07, pasos operativos).
5. **SBOM y escaneos del build adjuntos** (ESI-001/08); vulnerabilidades nuevas triadas.
6. **Aceptación UAT registrada**: quién aceptó y contra qué criterios (09 §riesgos); sin aceptación no hay tag final.
7. **Plan de despliegue y de rollback**: para el caso normal es el estándar (promoción + humo); lo excepcional (migración pesada, cambio de infraestructura) se escribe.

## 3. Despliegue y cierre

1. **Despliegue a PROD por el pipeline**, jamás manual (ESI-001/10 §pipeline paso 11); migración antes de promover.
2. **Chequeo de humo post-despliegue** + observación de paneles y alertas (ESI-001/09) durante la ventana definida.
3. **Rollback sin heroísmo**: ante señal seria, se revierte a la imagen anterior (compatible por N/N-1, 21 §regla 2) y se diagnostica con calma; revertir es éxito del proceso, no fracaso del equipo.
4. **Cierre**: el release queda registrado (tag, notas, SBOM, aceptación, incidencias de despliegue si hubo); lo aprendido va a retro (27).

## 4. Hotfixes

El hotfix sigue el MISMO camino acelerado: rama corta desde `main` → puerta completa → QA → UAT abreviado con dueño de negocio avisado → tag parche → PROD. La cadena existe precisamente para ser rápida; el atajo que la salta está prohibido (09 §2.2).

---

## Impacto sobre la implementación
El proceso queda definido para que el primer release del producto (post-Sprint 1) sea rutina y no evento; el pipeline de ESI-001/10 implementa los pasos mecánicos y este documento norma los humanos.

## Dependencias
21 (versión) · 09 (QA/UAT/PROD) · ESI-001/10 (pipeline y promoción) · ESI-001/08-09 (escaneos y observabilidad) · 07 (catálogo de variables para notas operativas).

## Riesgos
- Ventana de UAT convertida en cuello de botella → releases chicos hacen la aceptación corta; los criterios de aceptación por release se pactan al corte, no después.
- Rollback impracticable por migraciones destructivas → expandir-migrar-contraer es obligatorio justamente para esto (ETS-010/21); la fase contraer se difiere hasta que el release esté asentado.

## Decisiones habilitadas
Primer release gobernado, automatización de notas, registro de aceptaciones, política de ventanas de observación.

## Decisiones bloqueadas
Cadencia definitiva y responsables nominales del release — organizacional; despliegues progresivos (canary) — roadmap con ADR cuando la escala lo amerite.
