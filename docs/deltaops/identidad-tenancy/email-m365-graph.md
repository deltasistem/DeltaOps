# Notificaciones por correo · Microsoft Graph (Mail.Send)

Este documento describe el **adaptador de correo oficial** de DeltaOps:
**Microsoft Graph API** con OAuth 2.0 *client_credentials* y el permiso de
**aplicación** `Mail.Send`. Sustituye por completo al antiguo adaptador SMTP
(`smtp.outlook.com` / STARTTLS / XOAUTH2 / nodemailer), que ha sido retirado.

> **No contiene secretos.** Nunca se documentan, registran ni commitean valores
> de `GRAPH_CLIENT_SECRET`, `access_token` ni cabeceras `Authorization`.

## 1. Arquitectura (Clean Architecture / Hexagonal)

Los módulos de negocio dependen **solo** del puerto `EmailNotificationPort`
(`src/deltaops/identity/email.ts`) y **nunca** conocen el proveedor concreto:

```
Dominio ─► NotificationPort / EmailNotificationPort (contrato congelado)
                     ▲
                     │  enqueueEmail() (outbox + idempotencia)
                     │
        ┌────────────┴───────────────┐
        │                            │
 FakeEmailProvider          M365GraphEmailProvider   ◄── adaptador concreto
   (dev/test)                (producción, Microsoft Graph)
```

- El puerto, `enqueueEmail`, el modelo de identidad/autorización/multitenancy y
  el corpus congelado **no cambian**. Esta migración solo reemplaza el
  **adaptador concreto**.
- La selección del proveedor se resuelve en
  `src/deltaops/identity/notification-provider.ts` según `NOTIFICATION_PROVIDER`.

## 2. OAuth 2.0 client_credentials

- **Token endpoint:** `https://login.microsoftonline.com/<GRAPH_TENANT_ID>/oauth2/v2.0/token`
- **grant_type:** `client_credentials`
- **scope:** `https://graph.microsoft.com/.default`
- **Token cacheado** en memoria con renovación automática (margen de 60 s antes
  de expirar). **Nunca** se pide un token por correo, **nunca** se persiste y
  **nunca** se registra.

## 3. Envío (sendMail)

```
POST https://graph.microsoft.com/v1.0/users/<GRAPH_SENDER>/sendMail
Authorization: Bearer <token>            (jamás en logs)
Content-Type: application/json
```

El cuerpo se construye desde el `EmailMessage` (contrato existente):

| EmailMessage             | Graph sendMail                          |
| ------------------------ | --------------------------------------- |
| `asunto`                 | `message.subject`                       |
| `cuerpo`                 | `message.body` (`contentType: HTML`)    |
| `destinatario`           | `message.toRecipients`                  |
| `metadata.cc`            | `message.ccRecipients` (si presente)    |
| `metadata.bcc`           | `message.bccRecipients` (si presente)   |
| `metadata.attachments`   | `message.attachments` (si presente)     |
| —                        | `saveToSentItems: true`                 |

CC/BCC y adjuntos se mapean **solo si vienen en `metadata`**, sin modificar el
contrato del puerto. Un **`202 Accepted`** significa que Graph aceptó el mensaje
(no garantiza la recepción por el destinatario).

## 4. Variables de entorno (Secrets)

Configuration First. Solo se verifica su **presencia**; los valores viven en el
secret manager, nunca en git.

| Variable                    | Obligatoria | Descripción                                        |
| --------------------------- | ----------- | -------------------------------------------------- |
| `GRAPH_TENANT_ID`           | sí          | Tenant de **Entra ID** (≠ tenant de DeltaOps)      |
| `GRAPH_CLIENT_ID`           | sí          | App Registration (client id)                       |
| `GRAPH_CLIENT_SECRET`       | sí          | Secreto de la App Registration                     |
| `GRAPH_SENDER`              | sí          | Buzón remitente autorizado para `Mail.Send`        |
| `GRAPH_OAUTH_TOKEN_ENDPOINT`| no          | Override de nube soberana                          |
| `GRAPH_OAUTH_SCOPE`         | no          | Default `https://graph.microsoft.com/.default`     |
| `GRAPH_BASE_URL`            | no          | Default `https://graph.microsoft.com/v1.0`         |
| `GRAPH_TIMEOUT_MS`          | no          | Default `15000`                                    |
| `GRAPH_MAX_REINTENTOS`      | no          | Default `2` (solo errores temporales)              |

> No se reutilizan las variables `M365_*` del antiguo SMTP ni se crean `SMTP_*`.

## 5. Selección de proveedor (`NOTIFICATION_PROVIDER`)

- `fake` → `FakeEmailProvider` (solo dev/test; explícito).
- `m365-graph` (alias `graph`) → `M365GraphEmailProvider` (producción).

**Fail fast:** en `production` con `m365-graph` y config incompleta, el arranque
**falla** (throw en `instalarProveedorNotificaciones`). `fake` **no es válido en
producción**. En dev/test, si Graph está mal configurado se hace *fallback* a
`fake` **logueado** (solo nombres de variables ausentes, jamás valores).

## 6. Buzón remitente (`GRAPH_SENDER`)

Debe ser un buzón real y con licencia adecuada en el tenant de Entra. El permiso
de aplicación `Mail.Send` debe estar **acotado** a ese buzón mediante RBAC de
Exchange (sección 10).

## 7. Seguridad y redacción de secretos

- `Authorization`, `access_token` y `client_secret` **nunca** aparecen en logs,
  errores, respuestas HTTP, docs, tests ni seeds (`redactarSecretos`).
- En fallo solo se reporta: etapa, `HTTP status` y **código de error de Graph**
  (`error.code`), nunca el cuerpo crudo.

## 8. Multitenancy (DeltaOps vs Entra)

El tenant de **Entra** (`GRAPH_TENANT_ID`) es el directorio que autentica la
aplicación; es **independiente** del tenant de **DeltaOps** (`message.tenantId`).
Graph solo transporta el mensaje: el tenant de DeltaOps, el `correlationId`, el
`idempotencyKey` y la metadata se conservan en la plantilla, el outbox
(`deltaops.ntf_email_outbox`) y la auditoría existentes.

## 9. Manejo de errores, reintentos e idempotencia

| Situación            | Clasificación | Acción                                             |
| -------------------- | ------------- | -------------------------------------------------- |
| `202 Accepted`       | éxito         | resuelve                                           |
| `401`                | auth          | error permanente; invalida token cacheado          |
| `403`                | permiso/RBAC  | error permanente (consentimiento/RBAC de Exchange) |
| `404`                | buzón         | error permanente (`GRAPH_SENDER` inexistente)      |
| `429`                | throttling    | **temporal** → reintento acotado con backoff       |
| `5xx`                | servicio      | **temporal** → reintento acotado con backoff       |
| timeout / red        | temporal      | **temporal** → reintento acotado con backoff       |

Los reintentos internos son **solo para errores temporales seguros** y acotados
por `GRAPH_MAX_REINTENTOS`. **No** existe un sistema de reintentos paralelo: si
el envío falla definitivamente, el provider **lanza** y `enqueueEmail` marca la
fila del outbox como `FAILED`. La idempotencia real es del outbox
(`UNIQUE(tenant, idempotencyKey)`); el provider nunca duplica.

## 10. Exchange Online · RBAC for Applications

Para el mínimo privilegio, el permiso de aplicación `Mail.Send` debe **acotarse
al buzón `GRAPH_SENDER`** mediante *RBAC for Applications* de Exchange Online
(en lugar de conceder acceso a todos los buzones del tenant):

1. Crear un **Management Scope** que seleccione únicamente el buzón `GRAPH_SENDER`.
2. Crear una **Service Principal** en Exchange para la App Registration
   (`New-ServicePrincipal` con el AppId/ObjectId de Entra).
3. Asignar el **Management Role** `Application Mail.Send` a esa service
   principal, **restringido** al scope anterior
   (`New-ManagementRoleAssignment ... -App <SP> -Role "Application Mail.Send"
   -RecipientRelativeWriteScope ...`).

> **No ejecutamos PowerShell desde este entorno** y **no podemos inspeccionar ni
> verificar** el estado del RBAC de Exchange Online / Entra desde aquí. Esta
> configuración la realiza el administrador del tenant. Si `sendMail` devuelve
> **403**, la causa habitual es **falta de consentimiento de admin** de `Mail.Send`
> o **RBAC de Exchange no acotado/ausente** para el buzón.

## 11. Smoke test real

```
pnpm --filter @workspace/api-server m365:graph:smoke [destino]
```

Ejecuta, con `fetch` real y los Secrets `GRAPH_*`:
`config → token → validación → conexión Graph → envío REAL → resultado`
(destino por defecto: `GRAPH_SENDER`). Reporta **PASS/FAIL/ACCEPTED por etapa**;
en fallo, etapa + `HTTP status` + código de error de Graph (redactado) +
diagnóstico + siguiente acción. **No imprime secretos.** El orquestador ejecuta
este smoke tras provisionar los Secrets.

## 12. Endpoint de estado (administración SaaS)

```
GET /api/deltaops/admin/notifications/provider-status   (SUPER_ADMIN)
```

Requiere `requireIdentity` + `requireSuperAdmin` (**nunca** el rol legacy
"admin"/TENANT_ADMIN, y **nunca** bajo platform-console). Devuelve el proveedor
activo (`fake` | `m365-graph`), si está configurado, y — para Graph — el
`graphBaseUrl` y el `scope`. **No** expone secretos, token ni el `sender`; ante
config incompleta solo lista los **nombres** de variables ausentes.

## 13. Fake vs Graph

- **Fake**: acumula los mensajes en memoria; ideal para dev/test y para las
  pruebas deterministas (sin Internet).
- **Graph**: entrega real vía Microsoft Graph; único proveedor de producción.
