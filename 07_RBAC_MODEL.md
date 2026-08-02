# 07 — RBAC Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de roles: cómo los permisos catalogados se agrupan, se asignan y se gobiernan por tenant.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

El catálogo de permisos ya existe (`MODULO.RECURSO.ACCION`, ESI-005/16; patrones del estrato, ESI-006/19). El RBAC define la capa de asignación:

| Concepto | Definición |
|---|---|
| **Rol** | Conjunto nombrado de permisos con propósito de negocio ("Jefe de Mantenimiento", "Almacenista", "Auditor Externo") |
| **Rol plantilla** | Del producto: roles estándar por módulo/plan, versionados, alineados con ETS-001; el tenant los adopta y ajusta |
| **Rol de tenant** | Derivado o creado por el tenant dentro de su administración; siempre composición de permisos catalogados |
| **Asignación** | Cuenta ↔ roles (múltiples, aditivos); con vigencia opcional (roles temporales con caducidad) |

## 2. Reglas

1. **Solo permisos catalogados**: los roles componen el catálogo; jamás introducen permisos nuevos ni lógica (un rol no es una Policy).
2. **Aditivo puro**: los permisos efectivos son la unión de los roles; no existen permisos negativos ni roles "que quitan" — la resta se logra no asignando (la evaluación sigue siendo denegación por defecto, doc 04).
3. **Separación de deberes declarable**: pares de permisos declarados incompatibles (solicitar compra / aprobarla al mismo monto) que la asignación valida — la incompatibilidad es del catálogo (producto), la activación es del tenant (parametrizable por Policies del módulo donde el negocio lo exige).
4. **Roles plantilla versionados N/N-1**: el producto evoluciona plantillas sin tocar los roles adoptados; el tenant migra con aviso (mismo régimen que todo contrato publicado).
5. **Atributos de gobierno por rol**: delegabilidad de sus permisos (doc 06), exigencia de MFA (doc 03), nivel de revisión (los roles administrativos entran a revisión de accesos con más frecuencia, doc 14).
6. **Mínimo privilegio como práctica medible**: cuentas con roles administrativos sin uso reciente y permisos concedidos jamás ejercidos son métricas del score (doc 20) — la limpieza tiene evidencia, no opinión.

## 3. Declaración (los seis rubros)

- **Clasificación**: definiciones de rol = interno (I); asignaciones = interno con datos personales (P).
- **Riesgo**: alto (R2); la administración de roles, crítico (R1).
- **Permisos**: `IDENTIDAD.ROLES.ADMINISTRAR`, `IDENTIDAD.ASIGNACIONES.ADMINISTRAR` (tenant).
- **Auditoría**: total sobre cambios de roles y asignaciones (materia prima de la revisión de accesos).
- **Retención**: historial de asignaciones por el plazo de auditoría del tenant.
- **Evidencias**: matriz efectiva cuenta→roles→permisos por tenant, informe de separación de deberes, informe de mínimo privilegio.

## Impacto sobre la implementación

Parte del DGP-Identidad; los roles plantilla se entregan con cada DGP-módulo (los define su diseño de producto sobre ETS-001); la validación de incompatibilidades es declarativa.

## Dependencias

ESI-005/16; ESI-006/19; ETS-001; docs 02, 04, 06, 14, 20.

## Riesgos

- Explosión de roles por tenant (un rol por persona); mitigación: plantillas buenas, métricas de proliferación en el score y roles temporales para lo puntual — el anti-patrón es visible, no prohibible.

## Decisiones habilitadas

- Administración de acceso comprensible para el negocio (roles con nombres reales).
- Separación de deberes exigible por clientes con cumplimiento estricto.

## Decisiones bloqueadas

- Prohibidos permisos negativos y roles sustractivos.
- Prohibidos roles con permisos fuera del catálogo.
- Prohibidas asignaciones administrativas sin auditoría ni revisión.

## Reusable Pattern

Plantillas del producto + roles del tenant + asignación aditiva con vigencia + incompatibilidades declaradas: la capa RBAC completa; el doc 08 la extiende sin sustituirla.

## Anti-Patterns

- El rol "Superusuario" asignado por comodidad y nunca revisado.
- Clonar roles en vez de asignar múltiples (deriva de copias).
- Modelar reglas de negocio como roles ("Aprobador hasta 5000" — eso es una Policy del módulo).

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles reales del negocio).
- **ESI que consume**: ESI-005/16; ESI-006/19.
- **DGP que originará**: RBAC en DGP-Identidad; roles plantilla en cada DGP-módulo.
- **ADR relacionados**: ADR de RBAC aditivo puro (doc 26); ADR de separación de deberes declarativa.
- **Módulos que reutilizarán este patrón**: todos entregan plantillas; ninguno implementa asignación.
