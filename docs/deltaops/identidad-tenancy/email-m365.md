# Integración Microsoft 365 / SMTP OAuth — Notificaciones por correo

> Extensión de la plataforma de correo de DGP-017. **Microsoft 365 es
> ÚNICAMENTE un proveedor de infraestructura de envío de correo.** No es fuente
> de verdad de usuarios, roles, permisos, tenants ni membresías de DeltaOps. No
> hay login con Entra ID, ni importación de usuarios/grupos/roles, ni Microsoft
> Graph. El modelo de identidad/autorización/tenancy de DGP-017 permanece
> intacto y autónomo.

## 1. Arquitectura

El dominio y los módulos de negocio solo conocen el puerto; el proveedor
concreto es un adaptador reemplazable:

```
DeltaOps Template  →  Notification Service (enqueueEmail)
                        →  EmailNotificationPort
                             →  Proveedor concreto (Fake | Microsoft 365 | futuro)
                                  →  Exchange Online  →  Destinatario
```

- **Puerto**: `EmailNotificationPort` (`src/deltaops/identity/email.ts`). NO se
  modificó. Contrato: `send(message: EmailMessage): Promise<void>`.
- **Mensaje** (`EmailMessage`): conserva todas las capacidades existentes —
  `tenantId`, `idempotencyKey`, `tipo`, `destinatario`, `asunto`, `cuerpo`,
  `idioma`, `branding`, `metadata`. Las **plantillas siguen siendo de DeltaOps**
  (`renderPlantilla`); Microsoft 365 nunca contiene lógica de plantillas.
- **Adaptador M365** (`src/deltaops/identity/m365-email.ts`):
  `M365EmailProvider` + `M365OAuthClient`.
- **Selección de proveedor** (`src/deltaops/identity/notification-provider.ts`):
  `resolverProveedorNotificaciones` / `instalarProveedorNotificaciones`.
- **Cola / idempotencia**: `enqueueEmail` persiste en
  `deltaops.ntf_email_outbox` con `UNIQUE(tenant_id, idempotency_key)`. Si el
  proveedor lanza, la fila se marca `FAILED` con el motivo; **el error del
  proveedor NUNCA se propaga a los módulos** (el dominio no se rompe).

### Regla de dependencia (Clean Architecture)

El dominio depende de la abstracción (`EmailNotificationPort`), nunca de M365.
El adaptador M365 depende del puerto, no al revés. Sustituir M365 por otro
proveedor es cambiar una implementación detrás del mismo puerto.

## 2. Autenticación: OAuth 2.0 (Modern Auth)

- Flujo **client_credentials** (app-only, sin usuario interactivo).
- Token endpoint:
  `https://login.microsoftonline.com/<M365_TENANT_ID>/oauth2/v2.0/token`
- Scope: `https://outlook.office365.com/.default`
- Envío: **SMTP AUTH XOAUTH2** sobre `smtp.outlook.com:587` con **STARTTLS**.
- **Nunca** se usa la contraseña del buzón como mecanismo permanente.
- El `access_token` se **cachea** con su expiración (`expires_in`) y un margen
  de seguridad de 60 s; se **renueva** automáticamente al vencer o ante un error
  temporal que sugiera token caducado.

## 3. Variables de entorno (Configuration First)

Todas por entorno seguro; **cero secretos en código, tests, seed, docs, logs,
respuestas HTTP, UI o `.env` versionado**.

| Variable | Oblig. | Descripción | Default |
|---|---|---|---|
| `NOTIFICATION_PROVIDER` | no | `fake` \| `m365` | `fake` |
| `M365_MAIL_ENABLED` | no | `true` activa m365 si `NOTIFICATION_PROVIDER` no está | `false` |
| `M365_TENANT_ID` | sí (m365) | Tenant de **Entra ID** (≠ tenant DeltaOps) | — |
| `M365_CLIENT_ID` | sí (m365) | Client id de la App Registration | — |
| `M365_CLIENT_SECRET` | sí (m365) | Secreto de la App Registration (secret manager) | — |
| `M365_MAIL_FROM` | sí (m365) | Buzón/remitente autorizado (SMTP AUTH ON) | — |
| `M365_SMTP_HOST` | no | Host SMTP | `smtp.outlook.com` |
| `M365_SMTP_PORT` | no | Puerto SMTP | `587` |
| `M365_SMTP_SECURE` | no | `true` = TLS implícito; `false` = STARTTLS | `false` |
| `M365_OAUTH_TOKEN_ENDPOINT` | no | Override (soberanía de nube) | derivado del tenant |
| `M365_OAUTH_SCOPE` | no | Scope OAuth | `https://outlook.office365.com/.default` |
| `M365_TIMEOUT_MS` | no | Timeout por operación de red | `15000` |
| `M365_MAX_REINTENTOS` | no | Reintentos ante error temporal | `2` |

En **producción**, si `NOTIFICATION_PROVIDER=m365` y la configuración es
inválida/incompleta, el **arranque FALLA** de forma explícita (sin fallback
silencioso a fake). El fallback a fake ocurre **solo en dev/test** y siempre se
**loguea** (registrando los NOMBRES de las variables faltantes, nunca sus
valores).

## 4. Permisos de Entra ID (mínimo privilegio)

La App Registration requiere **exclusivamente** el permiso para enviar correo
como aplicación:

- **`Office 365 Exchange Online → SMTP.SendAsApp`** (permiso de aplicación).
  - *Justificación*: es el permiso mínimo que habilita SMTP AUTH con OAuth
    (XOAUTH2) para **enviar** correo desde el buzón indicado. No concede lectura.
- **Consentimiento de administrador** para ese permiso de aplicación.
- **Restricción de ámbito recomendada**: aplicar una *Application Access
  Policy* de Exchange Online que limite la app **al buzón de envío**
  (`M365_MAIL_FROM`), impidiendo el envío desde cualquier otro buzón.

**Prohibido** (no se solicitan ni se usan):

- `Mail.Read`, `Mail.ReadWrite`, `Mail.Send` de **Microsoft Graph** (no usamos
  Graph para enviar; usamos SMTP AUTH XOAUTH2).
- Cualquier permiso de Calendar, Contacts, OneDrive, SharePoint, Teams,
  `User.Read*`, `Directory.Read*`, `Group.Read*`.
- Microsoft Graph para lectura de usuarios/grupos ni para autorización de
  DeltaOps.

## 5. Configuración de Exchange Online

1. **Habilitar SMTP AUTH** en el buzón remitente (`M365_MAIL_FROM`):
   `Set-CASMailbox -Identity <buzón> -SmtpClientAuthenticationDisabled $false`
   (y verificar que el *tenant-wide default* no lo bloquee).
2. **App Registration** en Entra ID: crear la app, generar *client secret*,
   añadir el permiso de aplicación `SMTP.SendAsApp` y otorgar consentimiento de
   administrador.
3. **Application Access Policy** (recomendado) para restringir la app al buzón
   de envío.
4. Proveer `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`,
   `M365_MAIL_FROM` por el secret manager del entorno.

## 6. Seguridad

- Secretos solo por entorno seguro; nunca en repositorio ni logs.
- **Redacción de logs**: `redactarSecretos()` oculta `secret`, `token`,
  `password`, `authorization`, `client_secret`, `access_token`. El proveedor
  solo registra metadatos de diagnóstico (tenant, tipo, intento, si el error es
  temporal, mensaje de error) — nunca el token ni el secreto.
- El endpoint de estado y el smoke test **no exponen** secretos: solo reportan
  PASS/FAIL y nombres de variables ausentes.
- STARTTLS forzado (`requireTLS`) cuando `M365_SMTP_SECURE=false`.

## 7. Multitenancy (preparado para SaaS)

- El tenant de **Microsoft 365** (`M365_TENANT_ID`) es **independiente** del
  tenant de **DeltaOps** (`message.tenantId`). No hay nada hardcodeado para
  DELTA.
- Hoy la configuración M365 es un **default global** por entorno. El contrato
  ya admite una futura resolución **por tenant DeltaOps**: basta introducir un
  resolver de `ConfigM365` por `tenantId` que caiga al default global — sin
  tocar el puerto ni los módulos. **No** se construyó consola de administración
  de correo por tenant (fuera de alcance).

## 8. Pruebas

Deterministas, **sin Internet ni Microsoft** (token endpoint y transporte SMTP
mockeados) — `src/deltaops/identity/__tests__/m365-email.test.ts`:

- Fake provider intacto.
- Configuración válida / inválida (variables faltantes, puerto/correo inválidos).
- Token: obtención (grant+scope), caché, expiración, renovación, error de auth
  (sin exponer cuerpo), timeout.
- Construcción del mensaje: XOAUTH2, STARTTLS (secure=false, port 587),
  from/to/subject/text.
- Error temporal → reintento acotado; error permanente → sin reintento, propaga.
- Idempotencia: garantizada por `enqueueEmail` (`UNIQUE(tenant, idempotencyKey)`).
- Aislamiento por tenant; selección de proveedor; no fallback silencioso en
  producción; no exposición de secretos en logs.

## 9. Prueba de conexión / smoke test

- **Endpoint** (SUPER_ADMIN, superficie SaaS de identidad):
  `GET /api/deltaops/admin/notifications/provider-status` — protegido con
  `requireIdentity + requireSuperAdmin` (contexto Enterprise estricto; NO acepta
  el rol legacy "admin"/TENANT_ADMIN, ya que expone configuración GLOBAL).
  Reporta el proveedor configurado y, para m365, la validez de configuración
  (sin secretos; solo nombres de variables faltantes). No dispara envío.
- **CLI**: `tsx artifacts/api-server/scripts/m365-smoke.ts [destino]` — ejecuta
  las etapas reales configuración → OAuth → SMTP → correo de prueba y reporta
  SOLO PASS/FAIL por etapa. Requiere `M365_*` en el entorno.

## 10. Cambiar de Fake a Microsoft 365

1. Definir las variables `M365_*` en el entorno seguro.
2. `NOTIFICATION_PROVIDER=m365` (o `M365_MAIL_ENABLED=true`).
3. Reiniciar el servicio. En producción, config inválida ⇒ arranque falla.
4. Verificar con el endpoint de estado y/o el smoke test.

Para volver a Fake: `NOTIFICATION_PROVIDER=fake` (o quitar la variable) y
reiniciar.

## 11. Sustituir Microsoft 365 por otro proveedor

1. Implementar una clase que cumpla `EmailNotificationPort` (`send`).
2. Añadir su rama en `resolverProveedorNotificaciones`
   (`notification-provider.ts`) bajo un nuevo valor de `NOTIFICATION_PROVIDER`.
3. Ningún módulo de negocio cambia: dependen solo del puerto.

## 12. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| Arranque falla en prod | `m365` con config incompleta | Completar `M365_*`; ver nombres en el error |
| OAuth `401`/`invalid_client` | client id/secret o consentimiento | Revisar App Registration y consentimiento admin |
| SMTP falla tras OAuth OK | SMTP AUTH deshabilitado en el buzón | Habilitar SMTP AUTH en `M365_MAIL_FROM` |
| `nodemailer no está instalado` | dependencia ausente | Instalar `nodemailer` (ya declarada) |
| Envíos marcados `FAILED` en outbox | error del proveedor | Revisar `error` de la fila; el dominio no se rompe |
| Reintentos infinitos | — | No ocurre: reintentos acotados por `M365_MAX_REINTENTOS` |

## 13. Configuración por entorno

- **Development**: Fake por defecto. Tests no dependen de Microsoft.
- **Staging**: activable con variables seguras (`NOTIFICATION_PROVIDER=m365`).
- **Production**: M365 vía secrets del entorno; sin fallback silencioso.
