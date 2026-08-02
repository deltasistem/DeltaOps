# 18 — Governance Registry

> **DeltaOps — ESI-007 · v1.0** · El registro de gobierno: la vista única donde la postura de seguridad del sistema es consultable, no reconstruible.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

El registro de gobierno consolida — sin duplicar — lo que las declaraciones existentes ya contienen, más lo propio del gobierno:

| Sección | Contenido | Fuente |
|---|---|---|
| Componentes y rubros | Los seis rubros (doc 01 §3) de cada módulo/servicio/pieza | Derivado de los registros existentes (ESI-005/04, ESI-006/21) |
| Compromisos y mapeos | Requisito → control → evidencia por compromiso (doc 14) | Propio |
| Riesgos | Clasificación de riesgo por componente y los riesgos aceptados con dueño (doc 19) | Propio + derivado |
| Waivers y excepciones | Toda excepción de seguridad vigente: qué, por qué, dueño, caducidad | Propio (consolida los waivers de puerta ESI-002/17 en materia de seguridad) |
| Rituales | Calendario y actas de revisiones de acceso, proveedores, simulacros (doc 14 §2.3) | Propio |
| Decisiones | ADR de seguridad (doc 26) y decisiones de riesgo | Referencia al corpus de decisiones |

## 2. Reglas

1. **Derivar antes que duplicar**: lo que vive en registros existentes se referencia y agrega; el registro de gobierno no es una copia que envejece — sus vistas de componentes se generan de las declaraciones.
2. **Toda excepción caduca**: los waivers de seguridad tienen dueño y fecha sin excepción; el waiver vencido bloquea (mismo régimen ESI-002/17) y el inventario de waivers es insumo directo del score (doc 20).
3. **El riesgo aceptado es visible**: aceptar un riesgo (doc 19) es legítimo y explícito — queda registrado con dueño, justificación y revisión programada; el riesgo aceptado en silencio no existe como categoría.
4. **Dos audiencias**: la operación y gobierno de plataforma ven todo; el tenant empresarial ve el subconjunto que le aplica (sus evidencias, los compromisos que le cubren, el registro de soporte) — transparencia como producto (doc 27).
5. **El registro es la fuente de la auditoría externa**: los auditores navegan el registro; lo que no está o no se deriva, para efectos de auditoría no existe (el corolario del doc 14 §2.2).

## 3. Declaración (los seis rubros)

- **Clasificación**: interno (I); las vistas de tenant filtradas por murallas.
- **Riesgo**: alto (R2) — es el mapa del tesoro; su compromiso orienta ataques.
- **Permisos**: `GOBIERNO.REGISTRO.ADMINISTRAR`, `GOBIERNO.REGISTRO.CONSULTAR` (plataforma); vistas de tenant por capacidad empresarial.
- **Auditoría**: cambios de secciones propias auditados; consultas de auditores registradas (doc 13 §3).
- **Retención**: permanente y versionado.
- **Evidencias**: el registro es el índice de evidencias; se exporta por compromiso o por tenant.

## Impacto sobre la implementación

Parte del DGP de gobierno (doc 25): vistas derivadas de los registros existentes + las secciones propias (mapeos, waivers, rituales, riesgos aceptados).

## Dependencias

Docs 01, 13-14, 19-20, 26; ESI-002/17; ESI-005/04; ESI-006/21.

## Riesgos

- El registro como tablero decorativo sin consecuencias; mitigación: waivers que bloquean al vencer, rituales con actas exigidas por compromisos y el score alimentándose de él — el registro tiene dientes por construcción.

## Decisiones habilitadas

- Auditorías externas navegables sin proyectos de recolección.
- Gobierno de excepciones con caducidad real.

## Decisiones bloqueadas

- Prohibidos waivers de seguridad sin dueño y caducidad.
- Prohibidas copias manuales de declaraciones dentro del registro.
- Prohibido aceptar riesgos fuera del registro.

## Reusable Pattern

Registro derivado + secciones propias con dientes (waivers que caducan, rituales con acta, riesgos con revisión): el patrón de gobierno consultable para cualquier dominio futuro.

## Anti-Patterns

- La hoja de cálculo de riesgos del responsable, desconectada.
- Waivers renovados por inercia sin re-evaluación.
- El registro poblado solo antes de las auditorías.

## Knowledge Graph

- **ETS que consume**: ETS-009 (gobierno), ETS-010 (calidad exigible).
- **ESI que consume**: ESI-002/17; ESI-005/04; ESI-006/21.
- **DGP que originará**: el DGP de gobierno (registro + informes); vistas de tenant como capacidad empresarial.
- **ADR relacionados**: ADR de registro derivado (doc 26); ADR de excepciones con caducidad.
- **Módulos que reutilizarán este patrón**: todos aparecen en el registro por derivación; ninguno lo alimenta a mano.
