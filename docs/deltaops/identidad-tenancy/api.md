# API de Identidad, Tenancy y SaaS (DGP-017)

Contract-first con **Zod** (validación en cada endpoint) y **OpenAPI 3**
determinista con **drift test** (`identity.openapi.json`). Todas las rutas
cuelgan de `/api/deltaops`. `operationId` con prefijo `identity.*`.

Regenerar el contrato: `pnpm --filter @workspace/api-server run openapi:identity`.
El test `openapi.test.ts` falla si el JSON comprometido no coincide o si alguna
ruta del router no está en el contrato.

## Autenticación

| Método | Ruta | Auth | Cuerpo → Respuesta |
|--------|------|------|--------------------|
| POST | `/auth/login` | Público | `{email,password,tenantId?}` → `SessionResponse` (o `409 SELECT_TENANT` con membresías) |
| POST | `/auth/logout` | Sesión | — → `204` |
| GET | `/auth/session` | Sesión | — → `SessionResponse` |
| POST | `/auth/switch-tenant` | Sesión | `{tenantId}` → `SessionResponse` |
| POST | `/auth/password/change` | Sesión | `{actual,nueva}` → `204` |
| POST | `/auth/password/forgot` | Público | `{email,tenantId?}` → `202` (neutro) |
| POST | `/auth/password/reset` | Token | `{tenantId,token,password}` → `204` |

`SessionResponse` incluye: `identityId`, `email`, `nombre`, `tenant`
(`id,codigo,nombre,estado,idioma,zonaHoraria,moneda,branding`), `rol`,
`capacidades[]`, `permisos[]`, `modulos[]`, `membresias[]`.

## Invitaciones

| Método | Ruta | Auth | Cuerpo → Respuesta |
|--------|------|------|--------------------|
| GET | `/auth/invitations` | TENANT_ADMIN | → `Invitacion[]` |
| POST | `/auth/invitations` | TENANT_ADMIN | `{email,rol}` → `201 Invitacion` |
| POST | `/auth/invitations/{id}/resend` | TENANT_ADMIN | → `Invitacion` |
| POST | `/auth/invitations/{id}/revoke` | TENANT_ADMIN | → `204` |
| POST | `/auth/invitations/accept` | Token | `{tenantId,token,nombre,password}` → `201` |

## Usuarios

| Método | Ruta | Auth | Cuerpo → Respuesta |
|--------|------|------|--------------------|
| GET | `/users?q=&estado=` | TENANT_ADMIN | → `Usuario[]` |
| POST | `/users` | TENANT_ADMIN | `{email,nombre,rol}` → `201` |
| PATCH | `/users/{id}` | TENANT_ADMIN | `{nombre?,rol?}` → `204` |
| POST | `/users/{id}/activate` | TENANT_ADMIN | → `204` |
| POST | `/users/{id}/deactivate` | TENANT_ADMIN | → `204` |
| POST | `/users/{id}/force-recovery` | TENANT_ADMIN | → `202` |
| GET | `/users/{id}/audit` | TENANT_ADMIN | → `AuditoriaEvento[]` |

## Roles

| Método | Ruta | Auth | Respuesta |
|--------|------|------|-----------|
| GET | `/roles` | Sesión | `Rol[]` (catálogo canónico) |

## Empresa (tenant)

| Método | Ruta | Auth | Cuerpo → Respuesta |
|--------|------|------|--------------------|
| GET | `/tenant/config` | TENANT_ADMIN | → config |
| PATCH | `/tenant/config` | TENANT_ADMIN | `ActualizarConfigBody` → config |
| GET | `/tenant/branding` | Sesión | → branding |
| PATCH | `/tenant/branding` | TENANT_ADMIN | `ActualizarBrandingBody` → branding |
| GET | `/tenant/modules` | Sesión | → `{modulos[]}` |
| PATCH | `/tenant/modules` | SUPER_ADMIN | `{modulos[]}` → `{modulos[]}` |
| GET | `/tenant/audit` | TENANT_ADMIN | → `AuditoriaEvento[]` |

## Notificaciones

| Método | Ruta | Auth | Respuesta |
|--------|------|------|-----------|
| GET | `/notifications` | TENANT_ADMIN | `Notificacion[]` |

## Admin SaaS

| Método | Ruta | Auth | Cuerpo → Respuesta |
|--------|------|------|--------------------|
| GET | `/admin/tenants` | SUPER_ADMIN | → `Tenant[]` |
| POST | `/admin/tenants` | SUPER_ADMIN | `CrearTenantBody` → `201 Tenant` |
| POST | `/admin/tenants/{id}/status` | SUPER_ADMIN | `{estado}` → `Tenant` |
| PATCH | `/admin/tenants/{id}/modules` | SUPER_ADMIN | `{modulos[]}` → `{modulos[]}` |
| GET | `/admin/tenants/{id}/notifications` | SUPER_ADMIN | → `Notificacion[]` |

## Códigos de error

`400` validación, `401` no autenticado / credenciales, `403` sin permiso o
empresa no operativa (`TENANT_NOT_OPERATIONAL`), `404` no encontrado,
`409 SELECT_TENANT` (login multi-empresa). Cuerpo de error: `{error, code?}`.
