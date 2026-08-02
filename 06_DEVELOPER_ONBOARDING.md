# 06_DEVELOPER_ONBOARDING.md

> **DeltaOps — ESI-002 · v1.0** · Onboarding de desarrolladores: de la bienvenida a la primera pieza mergeada.
> Sin código.

---

## 1. Objetivo medible

Un desarrollador nuevo (humano) debe: **día 1** — entorno corriendo (bootstrap, 05) y lectura de orientación; **semana 1** — primera pieza real mergeada por la puerta completa. Si esto no ocurre, el defecto es del onboarding, no de la persona. Para agentes IA, el equivalente está en 17.

## 2. El itinerario oficial

### Día 1 — Entorno y mapa
1. Acceso al repositorio y ejecución del bootstrap (05) hasta LISTO.
2. Lectura mínima obligatoria (en este orden):
   - ENGINEERING_CHARTER (la constitución — §1 a §13),
   - la Guía del Entorno de Ingeniería (28),
   - ETS-012/01 (las 10 reglas de oro del blueprint),
   - este itinerario.
3. Recorrido guiado del sistema corriendo: una traza de un comando de punta a punta en la observabilidad local (11) — se aprende el diagnóstico antes que el código.

### Días 2-3 — El patrón por dentro
4. Lectura dirigida de UNA pieza ejemplar de cada tipo (caso de uso, consulta, consumidor, pantalla) con su prueba — el módulo de referencia del esqueleto sirve de aula.
5. Ejercicio guiado: generar una pieza de práctica con el generador (19), completarla siguiendo la plantilla, correr la suite, abrir un PR de práctica y pasarlo por la puerta (sin merge).

### Semana 1 — Primera pieza real
6. Asignación de una pieza real chica del backlog, con mentor asignado.
7. PR real: plantilla, revisión, puerta, merge. La retro del primer PR alimenta este itinerario (qué faltó, qué sobró).

## 3. Reglas del onboarding

1. **El itinerario es un documento del repo** y se actualiza con cada retro de onboarding; el onboarding desactualizado es deuda de plataforma.
2. **Mentor obligatorio la primera semana**: una persona nombrada responde preguntas y revisa el primer PR real.
3. **La lectura mínima es mínima de verdad**: cuatro documentos, no cuarenta — el resto de ETS/ESI se consulta bajo demanda con el mapa de 28; prohibido exigir la lectura completa del corpus como prerrequisito.
4. **Toda pregunta cuya respuesta no estaba escrita genera una mejora**: la respuesta se escribe donde debió estar (guía, plantilla, ADR) — el conocimiento tribal se extingue por sistema.
5. **El acceso sigue mínimo privilegio** (08): el desarrollador nuevo recibe acceso a DEV; QA/UAT/PROD según rol y necesidad, jamás por defecto.

## 4. Señales de éxito

| Métrica | Objetivo |
|---|---|
| Tiempo clon→LISTO | < 1 día (objetivo: horas) |
| Tiempo hasta primer PR real mergeado | < 1 semana |
| Preguntas repetidas entre onboardings | tendencia a cero (regla 4) |

---

## Impacto sobre la implementación
El módulo de referencia del esqueleto y la pieza de práctica del generador son entregables del DGP de esqueleto; el itinerario se publica en la zona de guías (03) desde el Sprint 1.

## Dependencias
05 (bootstrap) · 28 (guía del entorno) · 18/19 (plantillas y generadores para el ejercicio) · 17 (equivalente IA) · 08 (accesos).

## Riesgos
- Onboarding delegado al azar del mentor → el itinerario escrito es el guion; el mentor acompaña, no improvisa el contenido.
- Lectura mínima creciendo por acumulación → regla 3 con presupuesto fijo de cuatro documentos; agregar uno exige quitar otro.

## Decisiones habilitadas
Incorporación escalable de equipo, onboarding de agentes IA (17), métricas de salud de plataforma (27).

## Decisiones bloqueadas
Contenido definitivo del módulo de referencia — se fija con el esqueleto; políticas de acceso nominales — organizacional.
