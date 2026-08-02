# 16 — Data Classification

> **DeltaOps — ESI-007 · v1.0** · La clasificación de datos: cuatro niveles, declarados por campo, con efectos mecánicos en todo el sistema.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los cuatro niveles

ESI-005/15 estableció que los módulos declaran clasificación; esta serie fija la escala única:

| Nivel | Nombre | Definición | Ejemplos |
|---|---|---|---|
| **O** | Operativo | Datos de negocio del tenant sin sensibilidad especial | Estados de OT, stocks, lecturas de horómetro |
| **I** | Interno | Datos cuya exposición daña la operación o la posición del tenant/plataforma | Costos, precios de compra, configuraciones, reglas de autorización |
| **P** | Personal | Datos de personas identificadas (doc 15 los gobierna) | Nombres, correos, autorías, sesiones |
| **S** | Secreto | Material cuya revelación compromete seguridad (doc 11 lo gobierna) | Credenciales, llaves, factores |

## 2. Reglas

1. **Declaración por campo en el diseño**: cada DGP declara el nivel de sus campos (el rubro primero de esta serie); lo no declarado es O por defecto **excepto** lo que los patrones detecten como P/S (nombres de campo y tipos conocidos disparan validación de puerta).
2. **Efectos mecánicos por nivel**: la clasificación no es etiqueta decorativa — cada nivel activa comportamientos ya normados: P → inventario y reglas de privacidad (doc 15), exclusión de IA/telemetría/índices; S → almacén de secretos obligatorio (doc 11), jamás en datos de negocio; I → categorías reforzadas disponibles (adjuntos ESI-006/04, KPIs restringidos, permisos dedicados); O → régimen general.
3. **El nivel viaja con el dato**: derivados, proyecciones, exportes, adjuntos y eventos heredan el nivel más alto de sus fuentes; degradar el nivel de un derivado exige decisión registrada (agregaciones que anonimizan, doc 15).
4. **Reclasificar es cambio normado**: subir nivel es inmediato (más protección); bajar exige el proceso (ESI-002/27) con análisis de dónde ya viajó el dato.
5. **La clasificación alimenta el riesgo**: el nivel de los datos de un componente es insumo directo de su clasificación de riesgo (doc 19) — componentes con S/P concentrado son críticos por definición.

## 3. Declaración (los seis rubros)

- **Clasificación**: el catálogo de clasificación mismo = interno (I).
- **Riesgo**: alto (R2) como función de gobierno.
- **Permisos**: `GOBIERNO.CLASIFICACION.ADMINISTRAR` (plataforma); la declaración por campo es de cada DGP.
- **Auditoría**: reclasificaciones auditadas con decisión citada.
- **Retención**: el catálogo es permanente y versionado.
- **Evidencias**: catálogo vigente por componente, informe de herencia (derivados y su nivel), hallazgos de detección de la puerta.

## Impacto sobre la implementación

La escala entra a las declaraciones existentes (registros ESI-005/04, ESI-006/21); las validaciones de patrón y de herencia se suman a la puerta; ninguna pieza de ejecución nueva.

## Dependencias

ESI-005/15; docs 11, 15, 19; ESI-002/17 y /27; ETS-009.

## Riesgos

- Sobre-clasificación defensiva (todo I "por si acaso") que degrada la utilidad; mitigación: los efectos mecánicos §2.2 tienen costo visible — clasificar de más encarece, y la revisión (doc 23) cuestiona en ambas direcciones.

## Decisiones habilitadas

- Efectos de protección uniformes y automáticos por nivel.
- Conversaciones de cumplimiento con vocabulario de cuatro letras.

## Decisiones bloqueadas

- Prohibidos niveles fuera de la escala O/I/P/S.
- Prohibido degradar nivel de derivados sin decisión registrada.
- Prohibido el nivel S en datos de negocio (los secretos viven en el almacén).

## Reusable Pattern

Cuatro niveles + efectos mecánicos + herencia hacia derivados: la clasificación que se aplica sola; todo componente nuevo declara y hereda sin diseño adicional.

## Anti-Patterns

- Clasificación en documento aparte que nadie consulta al construir.
- Escalas por módulo ("confidencial", "restringido", "muy secreto"…).
- Derivados sin herencia (el exporte O de datos I).

## Knowledge Graph

- **ETS que consume**: ETS-009 (clasificación y gobierno de datos).
- **ESI que consume**: ESI-002/17 y /27; ESI-005/15; ESI-006/04 y /08.
- **DGP que originará**: la sección de clasificación de todo DGP; validaciones en la puerta.
- **ADR relacionados**: ADR de escala O/I/P/S (doc 26); ADR de herencia de nivel.
- **Módulos que reutilizarán este patrón**: todos declaran por campo; los efectos se activan solos.
