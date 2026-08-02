# 20 — Security Score

> **DeltaOps — ESI-007 · v1.0** · El score de seguridad: la postura del sistema medida con fuentes mecánicas — un número honesto por dimensión, no un trofeo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

Siguiendo el patrón del scorecard de módulos (ESI-005/24: dimensiones con fuentes mecánicas), el score de seguridad mide la postura con siete dimensiones:

| # | Dimensión | Fuente mecánica |
|---|---|---|
| D1 | **Identidad y acceso** | Cobertura MFA por rol (doc 03), cuentas sin uso, roles administrativos sin revisión al día, delegaciones vencidas activas |
| D2 | **Credenciales y secretos** | Edades vs. política (doc 12 §2.4), eternas con waiver, hallazgos de detección en código (doc 11 §2.1) |
| D3 | **Superficie** | Exposición vs. catálogo (doc 09 §2.4), límites configurados, anomalías de cuentas de servicio |
| D4 | **Evidencia y señales** | Alertas atendidas/emitidas (doc 13), edad de alertas abiertas, cobertura de señales por dominio |
| D5 | **Gobierno** | Waivers vigentes/vencidos (doc 18 §2.2), rituales cumplidos vs. calendario, riesgos aceptados con revisión al día |
| D6 | **Clasificación y privacidad** | Cobertura de declaración por campo (doc 16), derechos atendidos en plazo (doc 15), hallazgos de herencia |
| D7 | **Verificación** | Baterías de seguridad en verde (aislamiento, no-fuga, ZT), simulacros ejecutados vs. calendario (doc 22) |

## 2. Reglas

1. **Fuentes mecánicas primero** (ESI-005/24 §2.1): cada métrica declara su fuente; lo no medible mecánicamente entra como resultado de ritual con acta (D5), no como autoevaluación.
2. **El score no se negocia, se mejora**: las dimensiones bajan solas (waiver vencido, ritual omitido, alerta envejecida); suben solo por la acción que la métrica mide — sin ajustes editoriales.
3. **Score de plataforma y vista por tenant**: la postura de plataforma es una; el tenant empresarial ve la vista que le aplica (su cobertura MFA, sus cuentas, sus evidencias) como producto de transparencia (docs 18 §2.4, 27).
4. **El score dispara, no decora**: umbrales declarados por dimensión con consecuencias (D2 bajo → congelación de altas de integraciones hasta rotar; D5 bajo → revisión de gobierno adelantada); un score que no cambia comportamiento es teatro.
5. **Tendencia sobre foto**: la evaluación de gobierno mira la serie temporal (mejora/deterioro), no el valor absoluto de un día — el patrón de madurez (doc 21) lo consume así.

## 3. Declaración (los seis rubros)

- **Clasificación**: el score de plataforma = interno (I); vistas de tenant filtradas.
- **Riesgo**: R2 (orienta dónde atacar si se filtra; su integridad importa).
- **Permisos**: `GOBIERNO.SCORE.CONSULTAR` (plataforma); vista de tenant por capacidad empresarial.
- **Auditoría**: cambios de umbrales y fórmulas auditados; los valores se derivan, no se editan.
- **Retención**: series temporales permanentes.
- **Evidencias**: el score con desglose por dimensión y fuente — él mismo es evidencia para doc 14.

## Impacto sobre la implementación

Parte del DGP de gobierno: colector de métricas desde las fuentes declaradas + umbrales con consecuencias; sin agentes nuevos — las fuentes ya existen por diseño.

## Dependencias

Docs 03, 09, 11-16, 18, 21-22; ESI-005/24.

## Riesgos

- Goodhart (optimizar la métrica, no la postura: cerrar alertas sin atenderlas); mitigación: métricas por pares donde aplica (atendidas **y** reabiertas), actas exigibles y revisión humana (doc 23) sobre patrones sospechosos de mejora.

## Decisiones habilitadas

- Gobierno de seguridad por evidencia y tendencia.
- Transparencia de postura como diferenciador comercial (doc 27).

## Decisiones bloqueadas

- Prohibidos ajustes editoriales de valores del score.
- Prohibidas dimensiones sin fuente declarada.
- Prohibidos umbrales sin consecuencia definida.

## Reusable Pattern

Dimensiones con fuentes mecánicas + umbrales con consecuencias + tendencia sobre foto: el instrumento de postura, hermano del scorecard de módulos (ESI-005/24).

## Anti-Patterns

- El score único sin desglose (el promedio esconde el agujero).
- Métricas de esfuerzo (horas de seguridad) en vez de estado.
- Publicar el score y no ejecutar sus consecuencias.

## Knowledge Graph

- **ETS que consume**: ETS-010 (calidad medible).
- **ESI que consume**: ESI-005/24 (patrón de scorecard).
- **DGP que originará**: colector y umbrales en el DGP de gobierno.
- **ADR relacionados**: ADR de score con consecuencias (doc 26).
- **Módulos que reutilizarán este patrón**: aportan fuentes por sus declaraciones; ninguno calcula postura propia.
