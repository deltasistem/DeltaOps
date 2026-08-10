# Administración de usuarios (DGP-017)

Superficie para administradores de empresa (`TENANT_ADMIN` / `SUPER_ADMIN`).
Todas las operaciones están **auditadas** y **aisladas por empresa**.

## Endpoints

| Método | Ruta | Efecto |
|--------|------|--------|
| `GET` | `/users?q=&estado=` | Lista usuarios de la empresa (filtro por texto/estado). |
| `POST` | `/users` | Crea/invita usuario; envía invitación por correo. |
| `PATCH` | `/users/{id}` | Cambia nombre y/o rol de la membresía. |
| `POST` | `/users/{id}/activate` | Habilita al usuario en la empresa. |
| `POST` | `/users/{id}/deactivate` | Deshabilita al usuario en la empresa. |
| `POST` | `/users/{id}/force-recovery` | Fuerza recuperación de contraseña. |
| `GET` | `/users/{id}/audit` | Auditoría del usuario en la empresa. |

## Reglas

- Un usuario deshabilitado en una empresa **no puede iniciar sesión** en esa
  empresa (login rechazado), aunque siga activo en otras.
- El rol se cambia a nivel de **membresía** (por empresa), nunca global.
- La activación/desactivación notifica al usuario por correo
  (`cuenta-habilitada` / `cuenta-deshabilitada`).
- El aislamiento impide listar, modificar o auditar usuarios de otra empresa.

Ver `invitaciones.md` y `password-recovery.md`.
