# 04 — Authorization Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de autorización consolidado: una sola pregunta, una sola evaluación, cuatro fuentes de verdad ya normadas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El modelo consolidado

La pregunta única: **¿puede esta cuenta, en este tenant, ejecutar esta acción sobre este recurso, ahora?** La respuesta compone cuatro verdades ya congeladas, en orden:

| Orden | Verdad | Fuente | Falla como |
|---|---|---|---|
| 1 | ¿El tenant tiene la funcionalidad? | Capacidades (ETS-005, ESI-005/05, ESI-006/17) | Funcionalidad inexistente |
| 2 | ¿La cuenta tiene el permiso? | Permisos `MODULO.RECURSO.ACCION` vía roles (doc 07) | Denegación de permiso |
| 3 | ¿El recurso es alcanzable? | Murallas de tenant (RLS, ESI-003/09) + acceso derivado/doble llave (ESI-006/19) | Inexistencia (sin fuga) |
| 4 | ¿Las reglas del negocio lo permiten ahora? | Policies e invariantes del módulo (ESI-005/09-11) | Error de negocio explícito |

Esta serie no añade una quinta verdad: **fija que son exactamente estas cuatro, en este orden, evaluadas por la plataforma** — y prepara la extensión por atributos (doc 08) sin romper el orden.

## 2. Reglas

1. **Evaluación única de plataforma**: las verdades 1-3 las evalúa el pipeline del Kernel (ESI-003/10-12); la 4 es del módulo. Ninguna pieza reimplementa la cadena ni la abrevia ("ya comprobé el permiso en el frontend").
2. **El orden es semántico**: fallar la 3 responde inexistencia (no revela qué había); fallar la 2 responde denegación (el recurso puede existir); confundir el orden fuga información — la batería de no-fuga (ESI-006/19 §3.5) verifica el contrato de error por capa.
3. **Denegación por defecto** en cada verdad: capacidad no habilitada, permiso no concedido, fila no visible, Policy no cumplida — todo silencio es "no".
4. **El frontend adapta, jamás autoriza**: ocultar botones es cortesía de UX derivada de las mismas declaraciones; la evaluación real ocurre siempre en servidor.
5. **Decisiones auditables**: las denegaciones de las verdades 1-3 son eventos de seguridad consultables (doc 13); los patrones de denegación alimentan el score (doc 20).

## 3. Declaración (los seis rubros)

- **Clasificación**: las reglas de autorización = interno (I); las decisiones registradas contienen datos personales (P).
- **Riesgo**: crítico (R1).
- **Permisos**: la administración de roles es del doc 07; la evaluación no tiene permiso — es el suelo.
- **Auditoría**: denegaciones siempre; concesiones según riesgo del recurso (declarado, doc 19).
- **Retención**: decisiones por el plazo de eventos de seguridad (doc 13).
- **Evidencias**: matriz efectiva rol→permisos por tenant (doc 07), informe de denegaciones anómalas.

## Impacto sobre la implementación

Cero piezas nuevas: consolidación normativa del pipeline existente + el contrato de error por capa como batería verificable de la puerta.

## Dependencias

ESI-003/09-12; ESI-005/05, /09-11, /16; ESI-006/19; docs 07-08, 13, 19-20.

## Riesgos

- Deriva de reimplementación (piezas que "optimizan" saltándose la cadena); mitigación: la revisión RS-02/SE (docs 23) lo caza y la puerta valida que los contratos declaren su patrón de autorización.

## Decisiones habilitadas

- Razonar y auditar la autorización completa con un modelo de cuatro verdades citable.
- Extensión por atributos (doc 08) sin rediseño.

## Decisiones bloqueadas

- Prohibida toda evaluación de autorización fuera del pipeline de plataforma.
- Prohibido invertir o abreviar el orden de las cuatro verdades.
- Prohibido responder denegación donde corresponde inexistencia.

## Reusable Pattern

Las cuatro verdades ordenadas con contrato de error por capa: el modelo mental único de autorización — onboarding, revisión y auditoría hablan este idioma.

## Anti-Patterns

- Autorización en frontend como única barrera.
- "Permisos técnicos" inventados fuera del catálogo para atajar la cadena.
- Mensajes de error que revelan la existencia de lo denegado.

## Knowledge Graph

- **ETS que consume**: ETS-005 (capacidades), ETS-009 (aislamiento).
- **ESI que consume**: ESI-003/09-12; ESI-005/05, /09-11, /16; ESI-006/19.
- **DGP que originará**: la batería de contrato de error por capa (DGP de plataforma); sin piezas nuevas.
- **ADR relacionados**: ADR de las cuatro verdades (doc 26); ADR de no-fuga por orden.
- **Módulos que reutilizarán este patrón**: todos — la verdad 4 es su única contribución; las demás son suelo de plataforma.
