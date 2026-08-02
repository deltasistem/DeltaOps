# 03 — Authentication Model

> **DeltaOps — ESI-007 · v1.0** · El modelo de autenticación: cómo una identidad demuestra ser quien dice ser, con fuerza proporcional al riesgo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La autenticación es de la **identidad** (doc 02 §2.1) y produce una **sesión** (doc 05). El modelo es multi-método con política por tenant:

| Método | Naturaleza | Norma |
|---|---|---|
| Contraseña | Base; con política de calidad y almacenamiento irrecuperable (estándar vigente de derivación) | Siempre disponible; nunca suficiente sola para acciones de riesgo alto |
| Segundo factor (MFA) | Aplicación TOTP como estándar; obligatoriedad configurable por tenant y **obligatoria para roles administrativos** | La política del tenant no puede rebajar el mínimo de plataforma |
| Federación empresarial (SSO) | El tenant delega en su proveedor de identidad corporativo (protocolo estándar de federación); DeltaOps consume la aserción, la cuenta sigue siendo local | Capacidad de tenant empresarial; la identidad federada se vincula, no se duplica |
| Dispositivo de campo | Sesiones de dispositivo compartido con re-identificación ligera por operario (PIN personal) para imputabilidad en planta | Diseñado con offline (ESI-005/18); nunca para roles administrativos |

## 2. Reglas

1. **Autenticación adaptativa por riesgo**: las acciones marcadas de riesgo alto (doc 19) pueden exigir re-autenticación o factor adicional aunque la sesión sea válida (step-up declarado por acción, no por pantalla).
2. **Los fallos son datos de seguridad**: intentos fallidos, bloqueos progresivos y patrones anómalos se registran como eventos de seguridad (doc 13) y alimentan la postura (doc 20); el bloqueo es progresivo y reversible por administración, nunca silencioso.
3. **Recuperación con la misma fuerza**: el flujo de recuperación de acceso nunca es más débil que el de acceso (el clásico agujero); con MFA activo, la recuperación exige verificación reforzada definida por política.
4. **Sin autenticación propia por pieza**: ningún módulo, servicio o API implementa autenticación; todos consumen la sesión de plataforma (ESI-003/10). La federación tampoco la implementan los tenants "a su manera": es el mecanismo único de plataforma configurado por tenant.
5. **Credenciales según doc 12**: caducidad, rotación y revocación siguen el ciclo de vida único.

## 3. Declaración (los seis rubros)

- **Clasificación**: credenciales y factores = secreto (S); eventos de autenticación = interno con datos personales (P).
- **Riesgo**: crítico (R1).
- **Permisos**: `IDENTIDAD.POLITICA_AUTENTICACION.ADMINISTRAR` (tenant, dentro de mínimos de plataforma).
- **Auditoría**: total sobre altas/cambios de método, activaciones MFA, federación; los intentos según política de retención de eventos de seguridad.
- **Retención**: eventos de autenticación por el plazo de seguridad (doc 13); credenciales muertas no se retienen.
- **Evidencias**: cobertura MFA por rol, configuración de federación, informe de bloqueos — para revisión y clientes (doc 27).

## Impacto sobre la implementación

Parte del DGP-Identidad; la federación y el dispositivo de campo son capacidades separables por tenant; el step-up entra como atributo declarativo de comandos de riesgo alto.

## Dependencias

Docs 02, 05, 12-13, 19; ESI-003/10; ESI-005/18; ETS-012 (realidad de planta).

## Riesgos

- Fricción de MFA empujando a los tenants a apagarlo; mitigación: mínimos de plataforma no rebajables §1 y diseño de factores de baja fricción; la cobertura MFA es métrica del score (doc 20), visible al tenant.

## Decisiones habilitadas

- Venta empresarial con SSO corporativo sin duplicar identidades.
- Imputabilidad individual en dispositivos compartidos de planta.

## Decisiones bloqueadas

- Prohibida autenticación implementada por módulos o servicios.
- Prohibidas recuperaciones más débiles que el acceso.
- Prohibido rebajar mínimos de plataforma por política de tenant.

## Reusable Pattern

Métodos por catálogo + política por tenant sobre mínimos de plataforma + step-up declarado por acción: el modelo para incorporar cualquier método futuro (llaves de hardware, biometría de dispositivo) sin rediseño.

## Anti-Patterns

- El PIN de planta usado como contraseña de escritorio.
- Step-up por pantalla ("esta página pide MFA") en vez de por acción declarada.
- Registros de intentos fallidos con las contraseñas intentadas dentro.

## Knowledge Graph

- **ETS que consume**: ETS-009 (mínimos de seguridad), ETS-012 (operación de campo).
- **ESI que consume**: ESI-003/10; ESI-005/18.
- **DGP que originará**: parte del DGP-Identidad; capacidades de federación y campo por tenant.
- **ADR relacionados**: ADR de step-up declarativo (doc 26); ADR de sesión de dispositivo compartido.
- **Módulos que reutilizarán este patrón**: todos consumen sesiones; los comandos de riesgo alto declaran step-up.
