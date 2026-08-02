# 06 — Delegation Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de delegación: actuar por otro, con acotación, plazo y rastro doble — nunca suplantación.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los tres casos de delegación

| Caso | Ejemplo | Mecanismo |
|---|---|---|
| **Delegación entre usuarios** | El jefe de mantenimiento delega aprobaciones durante sus vacaciones | Delegación declarada: otorgante, receptor, subconjunto de permisos delegables, plazo obligatorio; el receptor actúa con **rastro doble** (actuó X por delegación de Y) |
| **Soporte de plataforma** | Operación DeltaOps accede a un tenant para diagnosticar | Acceso de soporte: sesión especial solicitada con motivo, acotada en plazo y alcance, **visible para el tenant** (registro consultable), auditoría reforzada |
| **Actuación de sistema** | Un trabajo programado ejecuta con contexto de sistema (ESI-003/22) | Ya normado: identidad de sistema imputable; esta serie lo integra al modelo (doc 10) |

## 2. Reglas

1. **Nunca suplantación**: en ningún caso alguien "se convierte" en otro; la identidad real siempre queda en el rastro (auditoría con actor real + en-nombre-de). El login-como-otro no existe en DeltaOps.
2. **Delegable ≠ todo**: cada permiso declara si es delegable (atributo del catálogo, doc 07); los administrativos de identidad y los de riesgo crítico no lo son por defecto — ampliar exige decisión registrada.
3. **Plazo obligatorio y revocación inmediata**: toda delegación caduca sola; el otorgante (o el administrador) la revoca en cualquier momento; sin delegaciones eternas por acumulación.
4. **La delegación no eleva**: el receptor obtiene la intersección (lo delegado ∩ lo que el otorgante realmente tiene); si al otorgante le retiran un permiso, la delegación lo pierde en cadena.
5. **El acceso de soporte es excepcional y medible**: frecuencia y duración por tenant son métricas del score (doc 20); el tenant empresarial puede exigir aprobación previa propia (capacidad).

## 3. Declaración (los seis rubros)

- **Clasificación**: delegaciones = interno con datos personales (P).
- **Riesgo**: alto (R2); el acceso de soporte, crítico (R1).
- **Permisos**: `IDENTIDAD.DELEGACIONES.OTORGAR` (rol con permisos delegables), `IDENTIDAD.DELEGACIONES.ADMINISTRAR` (tenant), `PLATAFORMA.SOPORTE.SOLICITAR` (operación DeltaOps).
- **Auditoría**: total, con rastro doble en cada acción delegada.
- **Retención**: delegaciones históricas por el plazo de auditoría del tenant.
- **Evidencias**: registro de delegaciones activas/históricas, registro de accesos de soporte visible al tenant.

## Impacto sobre la implementación

Parte del DGP-Identidad (delegación entre usuarios) y del DGP de operación de plataforma (acceso de soporte); el rastro doble entra al contrato de auditoría (doc 13).

## Dependencias

Docs 02, 07, 10, 13, 19-20; ESI-003/22; ESI-004/17.

## Riesgos

- Delegaciones en cascada opacas (X delega a Y, Y a Z); mitigación: la re-delegación está prohibida por defecto — lo delegado no es delegable; excepciones por decisión registrada.

## Decisiones habilitadas

- Continuidad operativa (vacaciones, ausencias) sin compartir credenciales.
- Soporte de plataforma con confianza demostrable al cliente.

## Decisiones bloqueadas

- Prohibida la suplantación en todas sus formas.
- Prohibida la re-delegación por defecto.
- Prohibido el acceso de soporte sin motivo, plazo y visibilidad al tenant.

## Reusable Pattern

Otorgante + receptor + subconjunto delegable + plazo + rastro doble: el contrato de toda actuación por-otro, humana o de soporte.

## Anti-Patterns

- Compartir contraseñas como "delegación" informal.
- El acceso de soporte permanente "para ir más rápido".
- Delegaciones sin plazo renovadas por inercia.

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles y ausencias reales), ETS-009 (imputabilidad).
- **ESI que consume**: ESI-003/22; ESI-004/17.
- **DGP que originará**: delegación en DGP-Identidad; acceso de soporte en DGP de operación.
- **ADR relacionados**: ADR de no-suplantación (doc 26); ADR de intersección de permisos.
- **Módulos que reutilizarán este patrón**: todos los flujos con aprobaciones (OT, Compras, SST) heredan delegación sin diseñarla.
