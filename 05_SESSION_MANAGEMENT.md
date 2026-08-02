# 05 — Session Management

> **DeltaOps — ESI-007 · v1.0** · El modelo de sesiones: el portador vivo de la identidad autenticada, con caducidad, revocación y contexto de tenant.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La sesión es el resultado de autenticarse (doc 03) y el sujeto de toda petición (ESI-003/10):

| Concepto | Definición |
|---|---|
| **Sesión** | Identidad + método de autenticación usado + fuerza alcanzada (con/sin MFA) + dispositivo + tenant activo + caducidades |
| **Tenant activo** | Una sesión opera sobre un tenant a la vez; el cambio de tenant es explícito, auditado y re-evalúa la cuenta (doc 02) |
| **Caducidad doble** | Inactividad (corta, configurable por tenant dentro de mínimos) y absoluta (obligatoria; la sesión eterna no existe) |
| **Sesión de dispositivo compartido** | Variante de planta (doc 03): sesión del dispositivo + re-identificación por operario por acción imputable |
| **Sesión offline** | El paquete descargado y la cola de comandos (ESI-005/18) viven bajo una sesión con caducidad propia; expirar exige re-autenticar antes de sincronizar — sin perder la cola |

## 2. Reglas

1. **Revocación inmediata y central**: suspender una cuenta o cerrar sesiones remotamente (robo de dispositivo) invalida en la siguiente petición; ninguna pieza cachea la validez de sesión más allá del margen declarado por plataforma.
2. **La fuerza viaja con la sesión**: el step-up (doc 03 §2.1) eleva la fuerza de la sesión temporalmente; las acciones declaran la fuerza que exigen y la evaluación la compara — sin estados paralelos por pantalla.
3. **Inventario visible**: el usuario ve sus sesiones activas (dispositivo, último uso) y cierra las que no reconoce; el administrador del tenant ve y cierra las de sus cuentas — ambas operaciones auditadas.
4. **El transporte es del estándar de plaraforma**: portadores opacos gestionados por el Kernel; prohibido que módulos o clientes fabriquen, alarguen o transformen credenciales de sesión.
5. **Eventos de seguridad**: creación, cierre, revocación, cambio de tenant, expiraciones anómalas — todo al registro del doc 13.

## 3. Declaración (los seis rubros)

- **Clasificación**: datos de sesión = interno con datos personales (P); portadores = secreto (S).
- **Riesgo**: crítico (R1).
- **Permisos**: `IDENTIDAD.SESIONES.CONSULTAR` (propias: implícito; del tenant: administrador), `IDENTIDAD.SESIONES.REVOCAR`.
- **Auditoría**: total sobre el ciclo de sesión.
- **Retención**: metadatos de sesión por el plazo de eventos de seguridad; portadores muertos no se retienen.
- **Evidencias**: inventario de sesiones por tenant, informe de revocaciones, distribución de caducidades configuradas.

## Impacto sobre la implementación

Parte del DGP-Identidad; la sesión offline y la de dispositivo compartido se diseñan con los DGP de módulos de campo (aptitud offline ya normada).

## Dependencias

Docs 02-03, 13; ESI-003/10; ESI-005/18; ETS-012.

## Riesgos

- El margen de caché de validez como ventana de revocación; mitigación: margen único de plataforma, corto y declarado; las acciones de riesgo alto verifican sin margen (consulta directa).

## Decisiones habilitadas

- Respuesta operativa a robo/pérdida de dispositivos de campo.
- Multi-tenancy de usuarios con contexto explícito y auditado.

## Decisiones bloqueadas

- Prohibidas sesiones sin caducidad absoluta.
- Prohibido cachear validez fuera del margen de plataforma.
- Prohibida manipulación de portadores fuera del Kernel.

## Reusable Pattern

Sesión con fuerza + tenant activo + caducidad doble + revocación central: el contrato de contexto para toda superficie presente y futura (web, móvil, API — doc 09 la instancia para sistemas).

## Anti-Patterns

- "Recordarme para siempre" sin caducidad absoluta.
- El cambio de tenant implícito (por URL o por defecto silencioso).
- Sesiones de planta usadas como identidad del supervisor para aprobar.

## Knowledge Graph

- **ETS que consume**: ETS-009 (mínimos), ETS-012 (campo).
- **ESI que consume**: ESI-003/10; ESI-005/18.
- **DGP que originará**: parte del DGP-Identidad; requisitos de sesión en DGP de clientes (web/móvil).
- **ADR relacionados**: ADR de caducidad doble (doc 26); ADR de fuerza en sesión.
- **Módulos que reutilizarán este patrón**: todos operan bajo sesión; ninguno la gestiona.
