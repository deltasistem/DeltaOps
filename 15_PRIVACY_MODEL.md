# 15 — Privacy Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de privacidad: datos personales con propósito, minimización y derechos atendibles — compatible con la auditoría imborrable.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

DeltaOps trata datos personales acotados: los de las cuentas (doc 02) y los rastros de actuación (autorías, auditoría, eventos). El tenant es responsable del tratamiento de los datos de su personal; DeltaOps es el encargado que procesa por él. El modelo:

| Concepto | Definición |
|---|---|
| **Inventario de datos personales** | Derivado del catálogo de clasificación (doc 16, nivel P): qué campos, dónde, con qué propósito declarado |
| **Minimización** | Solo lo operativo e imputable (doc 02 §2.3); los módulos referencian cuentas, no copian atributos personales |
| **Derechos** | Acceso (qué datos hay de una persona: informe derivado del inventario), rectificación (por administración del tenant), supresión (ver §2.2) |
| **Encargo** | Los compromisos DeltaOps↔tenant (plazos, sub-encargados, residencia si aplica) son parte del modelo de cumplimiento (doc 14 §2.4) |

## 2. Reglas

1. **Propósito declarado por campo P**: todo campo personal del inventario declara para qué existe; el campo sin propósito se elimina — la minimización es mecánica, no aspiracional.
2. **Supresión compatible con imputabilidad**: el derecho de supresión se atiende por **desvinculación**: los atributos personales de la identidad retirada se suprimen o anonimizan; el identificador imputable persiste en auditoría y eventos (obligación legal y de seguridad prevalente, doc 02 §2.2). La auditoría imborrable no porta atributos personales más allá del identificador (doc 13 §2.6) precisamente para que esto funcione.
3. **Los datos personales no viajan a donde no deben**: exclusión declarada en IA (ESI-006/13 §2.2), enmascaramiento en telemetría y bitácoras técnicas, ausencia en índices de búsqueda salvo lo declarado (ESI-006/08 §2.1).
4. **Informes de derechos como consultas normales**: el informe de acceso de una persona es una consulta derivada del inventario con permiso administrativo del tenant y rastro (quién lo pidió, para quién) — no una excavación artesanal.
5. **Retención personal por categoría**: los plazos de datos personales (activos, retirados, candidatos históricos) se declaran en el inventario y la retención los ejecuta (ETS-009); la excepción es siempre hacia menos retención de atributos, nunca menos imputabilidad.

## 3. Declaración (los seis rubros)

- **Clasificación**: define y gobierna el nivel P (doc 16).
- **Riesgo**: alto (R2); brechas de datos personales escalan por el proceso de incidentes (doc 14 §2.5).
- **Permisos**: `GOBIERNO.PRIVACIDAD.INFORMES` (tenant, administrativo); el inventario lo administra plataforma.
- **Auditoría**: informes de derechos, supresiones y rectificaciones auditados con rastro.
- **Retención**: la del inventario por categoría; los informes emitidos, plazo corto declarado.
- **Evidencias**: inventario vigente con propósitos, registro de derechos atendidos con tiempos, mapa de flujos (dónde viven y a dónde no van).

## Impacto sobre la implementación

El inventario es una vista del catálogo de clasificación (doc 16) — una fuente; la desvinculación entra al ciclo de retiro del DGP-Identidad; los informes de derechos son consultas del DGP de gobierno.

## Dependencias

Docs 02, 13-14, 16; ESI-006/08 y /13; ETS-009.

## Riesgos

- Atributos personales colándose en módulos por conveniencia (el nombre del técnico copiado en la OT); mitigación: la referencia a cuenta es la norma (doc 02 §2.3), la clasificación P en campos de módulo dispara revisión (doc 23) y el inventario los detecta.

## Decisiones habilitadas

- Atender derechos de personas con tiempos y evidencia.
- Contratos de encargo firmables sin inventarios ad-hoc.

## Decisiones bloqueadas

- Prohibidos campos personales sin propósito declarado.
- Prohibida la supresión que destruya imputabilidad de auditoría.
- Prohibido copiar atributos personales entre piezas (referenciar siempre).

## Reusable Pattern

Inventario derivado de clasificación + propósito por campo + supresión por desvinculación: privacidad operable sobre las piezas existentes, sin sistema paralelo.

## Anti-Patterns

- El "inventario de datos" en hoja de cálculo divergente del sistema.
- Anonimización cosmética (datos re-identificables triviales).
- Retener todo "por si el cliente lo pide" contra la minimización.

## Knowledge Graph

- **ETS que consume**: ETS-009 (retención y gobierno).
- **ESI que consume**: ESI-006/08 y /13; docs 02, 13-14, 16 de esta serie.
- **DGP que originará**: desvinculación en DGP-Identidad; informes de derechos en DGP de gobierno.
- **ADR relacionados**: ADR de supresión-por-desvinculación (doc 26).
- **Módulos que reutilizarán este patrón**: todos referencian cuentas; sus campos P declarados entran al inventario automáticamente.
