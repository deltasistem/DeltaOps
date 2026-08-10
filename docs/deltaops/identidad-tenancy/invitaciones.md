# Invitaciones (DGP-017)

Flujo para incorporar usuarios a una empresa mediante un enlace con token de
**un solo uso** y expiración.

## Endpoints

| Método | Ruta | Autorización |
|--------|------|--------------|
| `GET` | `/auth/invitations` | `TENANT_ADMIN` |
| `POST` | `/auth/invitations` | `TENANT_ADMIN` |
| `POST` | `/auth/invitations/{id}/resend` | `TENANT_ADMIN` |
| `POST` | `/auth/invitations/{id}/revoke` | `TENANT_ADMIN` |
| `POST` | `/auth/invitations/accept` | Público (con token) |

## Ciclo de vida

1. **Crear**: el administrador indica correo y rol. Se genera una invitación
   `PENDIENTE` con token hasheado y se envía correo (`invitacion`).
2. **Reenviar**: genera un token nuevo y reenvía (el anterior deja de servir).
3. **Revocar**: marca la invitación como `REVOCADA`; su token deja de validar.
4. **Aceptar**: con el token en claro el invitado crea/confirma su identidad
   (nombre + contraseña) y su membresía queda `ACTIVA`. La invitación pasa a
   `ACEPTADA` y no puede reutilizarse.

## Seguridad

- El token viaja solo por correo; en base de datos se guarda **hasheado**.
- Validación por empresa: un token de la empresa A **no** valida en la empresa B.
- Una invitación aceptada, revocada o expirada **no** es reutilizable.
- Todas las transiciones quedan **auditadas**.
