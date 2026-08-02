# 05 — Screen Contract

> **DeltaOps — ESI-008 · v1.0** · El contrato de pantalla: los ocho rubros que toda pantalla declara antes de existir — la unidad declarativa de la experiencia.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los ocho rubros

Toda pantalla de DeltaOps se define por su declaración, no por su apariencia. Los ocho rubros obligatorios:

| Rubro | Qué declara | Norma fuente |
|---|---|---|
| **Commands** | Los comandos del Kernel que la pantalla puede disparar, con su condición de habilitación y si exigen confirmación o step-up (ESI-007/03) | ESI-003 (pipeline), ESI-005/06 |
| **Queries** | Las consultas que alimentan la pantalla (proyecciones/read models citados) y su frescura esperada | ESI-005/07, /12 |
| **Capacidades** | Las capacidades (ETS-005) sin las cuales la pantalla no aparece | ETS-005 |
| **Servicios** | Los servicios compartidos consumidos (adjuntos, notificaciones, búsqueda, exportes…) | ESI-006 |
| **Permisos** | Los permisos `MODULO.RECURSO.ACCION` por elemento accionable; lectura y acción diferenciadas | ESI-005/16, ESI-007/04 |
| **Offline** | Aptitud offline de la pantalla: plena / lectura / no disponible, y qué comandos encolan (ESI-005/18) | ESI-005/18, doc 11 |
| **KPIs** | Los indicadores mostrados con su definición del catálogo (jamás cálculos propios) | ESI-005/13, ESI-006/16 |
| **IA** | Presencia de IA: ninguna / sugerencias / asistencia, siempre marcada y opcional | ESI-006/13, doc 22 |

## 2. Reglas

1. **La declaración precede al diseño**: el formulario de los ocho rubros se rellena en el DGP antes de cualquier trabajo visual; una pantalla cuyo contrato no cierra (comando sin permiso declarado, KPI sin definición) no avanza.
2. **La pantalla solo muestra lo que declara**: elementos accionables sin comando declarado o datos sin consulta citada son hallazgo de bloqueo en revisión (doc 25) — el contrato es exhaustivo, no orientativo.
3. **Habilitación honesta**: cada acción declara sus condiciones (permiso, estado del recurso, conexión); la acción imposible se muestra deshabilitada con motivo consultable o se oculta, según el patrón de la pantalla — pero jamás falla al pulsarla por algo que se sabía antes.
4. **Los estados son parte del contrato**: toda pantalla declara sus estados de carga (doc 12), error (doc 13), vacío (doc 14) y offline (doc 11); la pantalla "feliz" sin estados diseñados está incompleta.
5. **Una pantalla, una responsabilidad**: la pantalla que necesita declarar comandos de tres módulos distintos es probablemente tres pantallas o un tablero (doc 18); el contrato inflado es el síntoma.

## 3. Declaración (los ocho rubros)

Este documento define el formulario; el contrato del formulario mismo:

- **Commands / Queries / Capacidades / Servicios / Permisos / Offline / KPIs / IA**: los declara cada pantalla concreta en su DGP; el formulario vive en la plantilla de DGP (doc 27) y su completitud se valida mecánicamente en la puerta (ESI-002/17).

## Impacto sobre la implementación

El formulario de contrato de pantalla entra a la plantilla única de DGP; la puerta valida completitud y consistencia (permisos citados existen, KPIs citados existen).

## Dependencias

ETS-005; ESI-002/17; ESI-003; ESI-005/06-07, /13, /16, /18; ESI-006/13, /16; ESI-007/03-04; docs 11-14, 18, 22, 27.

## Riesgos

- Contratos rellenados por trámite después de diseñar (la declaración como acta de lo hecho); mitigación: el orden del DGP exige contrato antes que diseño (doc 27) y la revisión compara ambos (doc 25).

## Decisiones habilitadas

- Pantallas verificables contra su declaración (la base del checklist doc 25).
- Análisis de impacto: qué pantallas tocan un comando/permiso/KPI que cambia.

## Decisiones bloqueadas

- Prohibidas pantallas sin los ocho rubros completos.
- Prohibidos elementos accionables fuera del contrato.
- Prohibidos KPIs calculados en pantalla (solo catálogo citado).

## Reusable Pattern

El contrato de ocho rubros como unidad declarativa: la pantalla se trata como un componente más del sistema declarativo — registrable, verificable, con radio de impacto conocido.

## Anti-Patterns

- El contrato "vivo" que se edita para legalizar lo ya construido.
- Pantallas espejo con contratos divergentes (misma función, declaraciones distintas).
- Declarar "IA: ninguna" y colar sugerencias sin marcar.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidades como rubro).
- **ESI que consume**: ESI-002/17; ESI-003; ESI-005/06-07, /13, /16, /18; ESI-006/13, /16; ESI-007/03-04.
- **DGP que originará**: el formulario en la plantilla de DGP; contratos por pantalla en cada DGP de módulo.
- **ADR relacionados**: ADR de contrato de pantalla de ocho rubros.
- **Módulos que reutilizarán este patrón**: todos declaran cada pantalla así; sin excepciones.
