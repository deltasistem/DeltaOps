# 28 — Evolución del Modelo de Seguridad

> **DeltaOps — ESI-007 · v1.0** · Cómo evoluciona el programa de seguridad: amenazas que cambian, marcos que llegan, escalas que se extienden — sin erosionar lo congelado.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

La evolución hereda el régimen general (ESI-005/28, ESI-006/28): expandir-migrar-contraer, N/N-1 en lo publicado, decisiones por el proceso (ESI-002/27). Lo propio de seguridad: el cambio puede venir de fuera (amenazas, marcos, incidentes) y a veces con urgencia — el modelo debe absorber ambas velocidades.

## 2. Las dos velocidades

| Velocidad | Disparador | Régimen |
|---|---|---|
| **Programada** | Marcos nuevos, madurez creciente, criterio ABAC (doc 08 §3), extensiones de escalas | Proceso completo: decisión registrada, análisis de citantes (doc 24 §4.2), migración N/N-1 |
| **De respuesta** | Incidente, vulnerabilidad divulgada, credencial expuesta, amenaza activa | Runbook primero (contener, rotar, revocar — docs 12-13), decisión después: la respuesta ejecuta lo ya normado con urgencia; el cambio normativo que el incidente revele sigue el proceso, alimentado por el post-mortem (doc 14 §2.5) |

**La urgencia no crea norma**: los atajos de un incidente (accesos ampliados, controles suspendidos) son excepciones registradas con caducidad corta (doc 18 §2.2) que se revierten al cerrar — el incidente que deja controles relajados fue dos incidentes.

## 3. Reglas de evolución por dominio

1. **Escalas (O/I/P/S, R1-R4) son estables por diseño**: extender con un nivel nuevo es posible por proceso; redefinir niveles existentes tiene radio total y se evita — mejor un nivel nuevo que un significado cambiado.
2. **Los seis rubros solo crecen con radio analizado**: añadir un rubro obliga a todo componente; el costo se paga una vez y se declara en la decisión.
3. **Criptografía y protocolos por estándar vigente**: las menciones normativas ("estándar vigente de plataforma", docs 03, 09, 11) son indirecciones deliberadas — actualizar el estándar es decisión de plataforma con migración planificada, sin tocar esta serie.
4. **El checklist y las revisiones evolucionan por promoción**: hallazgos repetidos → SC/SR nuevos (docs 22-23); la mejora del programa viene de su propia operación.
5. **Los compromisos limitan la contracción**: retirar un control mapeado a un compromiso vigente (doc 14) exige sustituto o renegociación — la evidencia prometida no desaparece.
6. **El score y la madurez absorben la evolución**: dimensiones y criterios se versionan; las series temporales anotan el cambio de definición (el patrón de KPIs, ESI-006/16 §2.4).

## 4. Declaración (los seis rubros)

- **Clasificación**: planes de evolución = interno (I).
- **Riesgo**: R2; los cambios que toca son del nivel del dominio tocado.
- **Permisos**: el proceso de decisión de plataforma.
- **Auditoría**: toda evolución por decisión registrada; las excepciones de incidente con caducidad.
- **Retención**: historial normativo permanente.
- **Evidencias**: registro de cambios normativos con radios analizados; post-mortems con acciones cerradas.

## Impacto sobre la implementación

Los runbooks de respuesta y el proceso post-mortem entran al DGP de operación; el resto es régimen normativo sobre los procesos existentes.

## Dependencias

ESI-002/27; ESI-005/28; ESI-006/28; docs 08, 12-14, 18, 22-24.

## Riesgos

- Erosión por acumulación de excepciones pequeñas ("solo esta vez"); mitigación: toda excepción con caducidad en el registro y el score contándolas (doc 20 D5) — la erosión es visible antes de ser estructural.

## Decisiones habilitadas

- Respuesta a incidentes rápida sin crear deuda normativa.
- Adopción de marcos y estándares nuevos por mapeo e indirección.

## Decisiones bloqueadas

- Prohibido que atajos de incidente sobrevivan al cierre del incidente.
- Prohibido redefinir niveles de escalas existentes (extender, no mutar).
- Prohibido retirar controles comprometidos sin sustituto.

## Reusable Pattern

Dos velocidades (programada/de respuesta) + excepciones con caducidad + indirección de estándares: el ciclo de vida del programa — evoluciona sin erosionarse.

## Anti-Patterns

- El "modo emergencia" permanente tras un susto.
- Actualizar criptografía editando normas en vez de la indirección.
- Post-mortems con culpables en vez de acciones.

## Knowledge Graph

- **ETS que consume**: ETS-009/010 (gobierno y calidad).
- **ESI que consume**: ESI-002/27; ESI-005/28; ESI-006/28.
- **DGP que originará**: runbooks de respuesta y post-mortem en el DGP de operación.
- **ADR relacionados**: ADR de dos velocidades (doc 26 §2 régimen); ADR-SEC-12 (rotación refleja).
- **Módulos que reutilizarán este patrón**: todos evolucionan bajo este régimen en materia de seguridad.

---

**Fin de la serie ESI-007.**
