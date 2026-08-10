# Recuperación de contraseña (DGP-017)

Flujo seguro con token de **un solo uso**, expiración y **anti-enumeración**.

## Endpoints

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/auth/password/forgot` | Público. Respuesta **siempre neutra** (202). |
| `POST` | `/auth/password/reset` | Público (con token). Restablece la contraseña. |
| `POST` | `/auth/password/change` | Autenticado. Cambia la propia contraseña. |

## `forgot` — anti-enumeración

Devuelve **siempre** `202` con un mensaje neutro
(«Si el correo existe, enviaremos instrucciones»), exista o no la cuenta. Así no
se revela qué correos están registrados. Si el correo existe, se genera un token
y se envía el enlace (`recuperacion`). Los tokens previos pendientes se invalidan.

## `reset` — un solo uso

1. Valida el token (hasheado, no expirado, `PENDIENTE`) en la empresa indicada.
2. Lo **consume** (marca `USADO`) de forma atómica: un segundo intento falla.
3. Actualiza el `password_hash` (bcrypt).

Un token expirado, ya usado o de otra empresa es rechazado
(`400 TOKEN_INVALID` / `TOKEN_USED`).

## `change` — cambio autenticado

Requiere la contraseña actual correcta. Tras el cambio se notifica al usuario
por correo (`cambio-password`).
