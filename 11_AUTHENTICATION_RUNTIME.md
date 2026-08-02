# 11 — Autenticación en Runtime

> **DeltaOps — ESI-003 · v1.0** · Verificar quién es el actor y a qué tenant pertenece, antes que cualquier otra cosa.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Alcance

La autenticación responde exactamente una pregunta: **¿quién es el portador de esta credencial y para qué tenant actúa?** No decide qué puede hacer (eso es autorización, doc 12). Este documento diseña el runtime; el modelo conceptual de identidad viene de ETS-006/ETS-011 y el esquema de persistencia de ETS-009/010.

## 2. Credenciales oficiales

| Credencial | Portador | Uso |
|---|---|---|
| **Sesión de usuario** | Humanos vía frontend | Token de sesión opaco gestionado por el backend (doc 14); el navegador lo porta en cookie segura |
| **Credencial de integración** | Sistemas externos (doc 24) | Token de larga vida por integración, con alcance limitado, rotable y revocable |
| **Actor-sistema** | Procesos internos (workers, trabajos) | No porta credencial de red: el contexto de sistema se construye internamente (doc 09, regla 3) |

**Decisión:** en el MVP la sesión es **opaca y con estado en el servidor**, no un token autocontenido tipo JWT de larga vida. **Por qué:** la revocación inmediata (baja de usuario, cambio de rol, cierre de sesión por admin) es un requisito de un EAM multi-tenant auditado; con tokens autocontenidos la revocación exige listas negras que reintroducen el estado sin sus beneficios. La federación (SSO corporativo) queda diseñada como frontera futura: se integra como *origen* de identidad, no como sustituto de la sesión.

## 3. Flujo en la petición

1. El middleware de autenticación (doc 10, paso 5) extrae la credencial de la cookie o cabecera estándar.
2. Resuelve la sesión contra el almacén de sesiones (doc 14): validez, expiración, revocación.
3. De la sesión salen **actor y tenant verificados**; ninguna otra fuente puede aportarlos (doc 09, regla 2).
4. Fallo de autenticación → error canónico 401 del catálogo, sin distinguir "no existe" de "credencial mala" (no dar pistas), con registro estructurado del intento.
5. Usuarios multi-tenant: la sesión pertenece a exactamente un tenant activo; cambiar de tenant crea una sesión nueva, nunca muta la existente.

## 4. Reglas normativas

1. **Verificación en el borde, una vez**: los casos de uso jamás re-autentican ni ven credenciales.
2. **Secretos de firma y sal** por gestión de secretos (ESI-002/08); rotación sin invalidar sesiones activas salvo emergencia.
3. **Contraseñas** con función de derivación moderna aprobada en ESI-001; prohibido cualquier esquema propio.
4. **Intentos fallidos** con limitación progresiva por actor y por origen; los umbrales son plano plataforma (doc 08).
5. **Todo evento de autenticación relevante se audita**: alta de sesión, cierre, revocación, fallos repetidos (ETS-006).

## Impacto sobre la implementación

El DGP de plataforma implementa el middleware, el almacén de sesiones y la credencial de integración. El módulo de administración de usuarios consumirá estos contratos, no los reimplementa.

## Dependencias

Docs 09, 10, 12, 14 y 24; ETS-006 (seguridad), ETS-009/010 (persistencia); ESI-002/08.

## Riesgos

- Presión futura por SSO que tiente a rehacer la autenticación; mitigación: frontera de origen de identidad ya prevista; la sesión interna no cambia.
- Limitación de intentos que bloquee operación legítima; mitigación: umbrales configurables y vía de desbloqueo administrada y auditada.

## Decisiones habilitadas

- Diseño del almacén de sesiones (doc 14) y de credenciales de integración (doc 24).
- Auditoría de seguridad uniforme sobre eventos de autenticación.

## Decisiones bloqueadas

- Prohibidos tokens autocontenidos de larga vida como sesión en el MVP.
- Prohibida criptografía propia en cualquier punto.
- Prohibido resolver actor o tenant desde payloads o parámetros.
