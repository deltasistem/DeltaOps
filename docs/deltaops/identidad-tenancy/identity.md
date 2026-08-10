# Identidad (DGP-017)

Modelo formal de **identidad global** desacoplado de la tabla histórica
`deltaops.users` (que se conserva para compatibilidad con los módulos de negocio).

## Conceptos

- **Identidad** (`idn_identities`): persona única en toda la plataforma,
  identificada por correo (único, case-insensitive). Tiene estado
  (`ACTIVO` / `PENDIENTE` / `DESHABILITADO`) y un `password_hash` **bcrypt**
  (nunca texto plano). La identidad es **global**: no pertenece a un tenant.
- **Membresía** (`idn_memberships`): vínculo (identidad, empresa) con un **rol
  canónico** y un estado propio por empresa. Una identidad puede pertenecer a
  varias empresas con roles distintos.
- **Sesión**: al autenticarse, la sesión fija la identidad, la **empresa activa**
  y el rol efectivo. El cambio de empresa renueva la sesión.

## Espejo de usuario (compatibilidad)

Los módulos de negocio históricos leen `deltaops.users` por `deltaopsUserId`
para obtener `{rol, tenant}`. Para no modificar ninguna ruta de módulo, cada
sesión **proyecta** su (identidad, empresa activa, rol legacy efectivo) en una
fila de `deltaops.users`. `idn_*` es el sistema de registro; `deltaops.users`
es un espejo derivado. Ver `user-mirror.ts`.

## Seguridad

- Contraseñas con **bcrypt** (coste 12). Verificación constante.
- Tokens (invitación / recuperación) se guardan **hasheados** (SHA-256); el
  valor en claro solo viaja por correo, es de **un solo uso** y expira.
- Aislamiento entre empresas garantizado en la capa de aplicación (identidad
  global) y por **RLS** en tablas propias del tenant.

Ver también: `tenancy.md`, `roles-permisos.md`, `seguridad-multitenant.md`.
