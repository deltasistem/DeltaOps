# Seguridad multi-tenant (DGP-017)

Invariantes de aislamiento y su verificación por pruebas automatizadas.

## Invariantes

1. **Aislamiento de datos**: una empresa A no puede leer ni modificar datos de B
   (usuarios, invitaciones, tokens, notificaciones, auditoría).
2. **Tokens acotados por empresa**: un token de invitación o de recuperación de A
   no valida bajo la empresa B.
3. **Un solo uso**: invitaciones y tokens de recuperación no son reutilizables
   (aceptado/usado/revocado/expirado ⇒ rechazado).
4. **Cambio de empresa**: renueva `authVersion`; la autorización previa deja de
   ser válida y el rol se recalcula según la empresa destino.
5. **Empresa no operativa**: `SUSPENDIDO`/`CERRADO` bloquea login y toda petición
   autenticada (`403 TENANT_NOT_OPERATIONAL`).
6. **Usuario deshabilitado**: no puede iniciar sesión en la empresa donde su
   membresía está deshabilitada.
7. **Anti-enumeración**: `forgot` responde siempre de forma neutra.
8. **Entitlements**: no se accede a módulos no contratados (enforcement backend).

## Mecanismos

- **RLS** en tablas propias del tenant sobre `app.tenant_id` (fijado por
  transacción con `withTenant`).
- Identidad **global** sin RLS; el aislamiento se aplica filtrando por
  `identity_id`/`tenant_id` en la capa de aplicación.
- **Auditoría** en `deltaops.platform_audit` (servicio `identity`), aislada por
  empresa.
- Contraseñas y tokens **hasheados** (bcrypt / SHA-256).

## Pruebas

- Unitarias: RBAC, criptografía, entitlements, plantillas de correo.
- Integración (PostgreSQL real): login y promoción de rol, empresa no operativa,
  usuario deshabilitado, cambio de empresa, aislamiento de usuarios/correos/
  auditoría, tokens de invitación y recuperación (un solo uso + aislamiento por
  empresa), idempotencia de notificaciones, anti-enumeración.

Ejecutar: `pnpm --filter @workspace/api-server test` (0 pruebas omitidas).
