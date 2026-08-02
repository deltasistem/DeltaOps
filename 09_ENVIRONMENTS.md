# 09_ENVIRONMENTS.md

> **DeltaOps — ESI-002 · v1.0** · Entornos oficiales: DEV, QA, UAT, PROD — el mismo artefacto, promoción sin sorpresas.
> Sin código, sin configuración.

---

## 1. Los cuatro entornos oficiales

| Entorno | Propósito | Datos | Quién lo usa |
|---|---|---|---|
| **DEV** | desarrollo diario; local por defecto (Compose completo, 11), efímero por PR cuando aplique | datos sembrados (12), reseteables sin duelo | desarrolladores humanos e IA |
| **QA** | verificación continua: E2E, DAST, ensayos de migración, exploración de calidad | datos sintéticos gestionados; jamás datos reales | equipo de ingeniería, suites automatizadas |
| **UAT** | validación de negocio previa a release: aceptación por usuarios/interesados con release candidato | datos realistas ANONIMIZADOS o sintéticos ricos; jamás PII real | interesados de negocio + ingeniería |
| **PROD** | los tenants reales | datos reales, murallas de ETS-010, respaldo y PITR (ESI-001/04) | clientes; acceso operativo mínimo y registrado |

Nota de mapeo: el "staging" de ESI-001/10 se desdobla oficialmente en **QA** (verificación técnica continua) y **UAT** (aceptación de negocio por release). El pipeline despliega a QA en cada merge y a UAT solo release candidatos etiquetados.

## 2. Reglas de promoción

1. **Un solo artefacto**: la MISMA imagen OCI construida una vez recorre QA → UAT → PROD (ESI-001/10); lo que cambia por entorno es solo entorno y secretos (07/08).
2. **Orden inviolable**: nada llega a PROD sin haber pasado por QA y UAT; el "hotfix directo" también recorre la cadena — la cadena es rápida precisamente para que saltarla nunca se justifique.
3. **Migraciones antes de promover**, ensayadas en QA con volumen realista y en UAT como ensayo general (ESI-001/10 §regla 4; expandir-migrar-contraer ETS-010/21).
4. **Paridad decreciente controlada**: QA/UAT corren la topología completa de PROD (proxy, workers, réplica si existe); las diferencias permitidas están escritas y son pocas (tamaño, no forma).
5. **PROD no es un entorno de prueba**: la verificación en PROD se limita a chequeos de humo post-despliegue y observabilidad (ESI-001/09); experimentar en PROD está prohibido.

## 3. Datos por entorno (regla dura)

- **PII real solo en PROD.** QA y UAT usan datos sintéticos o anonimizados de forma irreversible (12); el "copiar prod a UAT para probar" está prohibido sin pasar por anonimización oficial.
- Cada entorno tiene sus propios secretos (08 §regla 5); las cadenas de conexión de PROD no existen fuera de PROD y su pipeline.

## 4. Identidad y acceso

| Entorno | Acceso de desarrolladores |
|---|---|
| DEV | total (es suyo) |
| QA | despliegue por pipeline; acceso de diagnóstico amplio |
| UAT | despliegue por pipeline; acceso de diagnóstico justificado |
| PROD | solo roles operativos designados, nominal, registrado; el diagnóstico va primero por observabilidad (09 de ESI-001), no por consola |

---

## Impacto sobre la implementación
El pipeline (ESI-001/10) se concreta con cuatro destinos y dos puertas humanas (release a UAT, aprobación a PROD); los manifiestos por entorno (bajo DGP) solo difieren en entorno/secretos, jamás en forma.

## Dependencias
ESI-001/05 y 10 (imagen única, Compose, pipeline) · 07/08 (configuración y secretos por entorno) · 12 (datos y anonimización) · ETS-010 (murallas y migraciones).

## Riesgos
- UAT degradándose a "otro QA" → dueño de negocio para UAT y criterio de aceptación por release (22); si nadie acepta en UAT, UAT no cumplió su función.
- Deriva de paridad (QA sin workers, UAT sin réplica) → regla 4: la lista de diferencias permitidas es corta, escrita y revisada.

## Decisiones habilitadas
Diseño del pipeline con cuatro destinos, política de datos sintéticos (12), calendario de release con paso UAT (22).

## Decisiones bloqueadas
Hosting concreto de cada entorno (ESI-001/05 dejó el proveedor abierto) y dimensionamiento — decisión operativa al desplegar.
