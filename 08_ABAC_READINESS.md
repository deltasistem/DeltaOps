# 08 — ABAC Readiness

> **DeltaOps — ESI-007 · v1.0** · Preparación para autorización por atributos: qué se diseña hoy para que el ABAC de mañana sea extensión, no reescritura.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La postura

DeltaOps v1 es RBAC (doc 07) + las cuatro verdades (doc 04). El ABAC completo (reglas sobre atributos de sujeto, recurso, acción y entorno) **no se construye ahora**: su costo de gobierno solo se justifica con demanda empresarial concreta (restricciones por planta, por horario, por ubicación). Este documento fija la **preparación**: las decisiones baratas hoy que evitan la reescritura cara mañana.

## 2. Las cinco preparaciones

1. **El punto de decisión ya es único** (doc 04 §2.1): el ABAC se enchufa como refinamiento de la verdad 2-3 en el pipeline, no como sistema paralelo — la preparación más importante ya está congelada.
2. **Atributos con dueño declarado**: los candidatos a atributos de autorización (planta/sede de la cuenta, turno, ubicación del recurso) ya viven en módulos con dueño; la preparación es marcarlos en el catálogo de datos (doc 16) como "atribuible a autorización" — sin duplicarlos en identidad.
3. **Contratos de denegación estables**: el contrato de error por capa (doc 04 §2.2) absorbe reglas nuevas sin cambiar semántica para clientes — una denegación ABAC es una denegación de la verdad correspondiente.
4. **Las Policies de módulo no se disfrazan de ABAC**: la regla parametrizable de negocio ("aprobar hasta X") sigue siendo Policy (ESI-005/09); el ABAC futuro es de acceso, no de negocio. La frontera se mantiene para que la llegada del ABAC no aspire las Policies.
5. **Restricción de alcance como precursor acotado**: la única semántica pre-ABAC admitida en v1 es la **restricción de alcance por asignación** (rol limitado a una sede/planta), modelada como atributo de la asignación (doc 07) y evaluada como filtro adicional de la verdad 3 — cubre la demanda real mayoritaria sin motor de reglas.

## 3. Criterio de activación

El ABAC completo se diseña (serie/ADR futuro) cuando: (a) ≥2 clientes empresariales lo exijan contractualmente con casos concretos; (b) la restricción de alcance §2.5 demuestre insuficiencia documentada; (c) el score de seguridad (doc 20) esté en nivel estable — no se añade complejidad de autorización sobre una base inestable.

## 4. Declaración (los seis rubros)

- **Clasificación**: N/A (documento de postura); los atributos marcados heredan la suya (doc 16).
- **Riesgo**: la restricción de alcance es R2; el resto, decisión futura.
- **Permisos**: la restricción de alcance se administra con `IDENTIDAD.ASIGNACIONES.ADMINISTRAR` (doc 07).
- **Auditoría**: restricciones de alcance auditadas como toda asignación.
- **Retención**: la de asignaciones (doc 07).
- **Evidencias**: inventario de restricciones de alcance activas por tenant.

## Impacto sobre la implementación

Solo la restricción de alcance §2.5 entra al DGP-Identidad; el marcado de atributos entra al catálogo de datos; el resto es norma de espera.

## Dependencias

Docs 04, 07, 16, 20; ESI-005/09; ESI-002/27 (decisión futura).

## Riesgos

- Construir el motor ABAC "porque es lo moderno" sin demanda; mitigación: el criterio de activación §3 es triple y bloqueante — la decisión exige el proceso de ESI-002/27 con los tres satisfechos.

## Decisiones habilitadas

- Vender restricción por sede/planta hoy sin motor de reglas.
- Adoptar ABAC mañana como extensión del pipeline, no reescritura.

## Decisiones bloqueadas

- Prohibido el motor ABAC en v1 fuera del criterio §3.
- Prohibido modelar reglas de negocio como atributos de acceso.
- Prohibidas restricciones de alcance fuera de la asignación declarada.

## Reusable Pattern

"Preparación sin construcción": punto de decisión único + atributos marcados + precursor acotado + criterio de activación triple — el patrón para toda capacidad empresarial anticipada pero no demandada.

## Anti-Patterns

- El motor de reglas genérico esperando reglas.
- Atributos de autorización copiados a identidad "para tenerlos cerca".
- Resolver con ABAC lo que una Policy de módulo ya resuelve.

## Knowledge Graph

- **ETS que consume**: ETS-001 (estructura real: sedes, plantas, turnos).
- **ESI que consume**: ESI-002/27; ESI-005/09.
- **DGP que originará**: restricción de alcance en DGP-Identidad; nada más hasta el criterio §3.
- **ADR relacionados**: ADR de postura ABAC-readiness (doc 26).
- **Módulos que reutilizarán este patrón**: los que posean atributos marcados (Activos: ubicaciones; identidad: sedes de cuenta) sin cambiar nada hoy.
