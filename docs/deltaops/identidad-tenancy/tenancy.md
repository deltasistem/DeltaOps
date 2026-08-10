# Tenancy / Multi-empresa (DGP-017)

Cada **empresa** (tenant) es una entidad de primera clase en `ten_tenants`.

## Modelo `ten_tenants`

| Campo | Descripción |
|-------|-------------|
| `tenant_id` | Identificador estable de la empresa (clave lógica). |
| `codigo` | Código corto legible. |
| `nombre_comercial` / `razon_social` / `id_tributaria` | Datos de la empresa. |
| `estado` | `ACTIVO`, `SUSPENDIDO` o `CERRADO`. |
| `idioma` / `zona_horaria` / `moneda` | Configuración regional. |
| `branding` (jsonb) | Marca por empresa (ver `branding.md`). |
| `configuracion` (jsonb) | Preferencias por empresa. |
| `modulos` (jsonb) | Módulos contratados (ver `entitlements.md`). |

## Estados y su efecto

- **ACTIVO**: operación normal.
- **SUSPENDIDO / CERRADO**: el login y toda operación autenticada se rechazan
  con `403 TENANT_NOT_OPERATIONAL`. Se aplica tanto en el login como en cada
  petición autenticada (resolver de identidad).

## Empresa activa y cambio de empresa

La sesión mantiene una **empresa activa**. Un usuario con varias membresías
puede cambiar de empresa con `POST /auth/switch-tenant`, que:

1. Verifica que exista membresía activa en la empresa destino.
2. Verifica que la empresa destino esté operativa.
3. **Renueva** la sesión (nueva `authVersion`) invalidando la autorización previa.
4. Reproyecta el espejo de usuario con el rol de la nueva empresa.

## Aislamiento

- Tablas propias del tenant (`ten_tenants`, `idn_roles`, `idn_invitations`,
  `idn_password_resets`, `ntf_email_outbox`) tienen **RLS** sobre `app.tenant_id`.
- Las tablas de identidad global (`idn_identities`, `idn_memberships`) no tienen
  RLS; el aislamiento se aplica filtrando por `identity_id` / `tenant_id`.

Ver `seguridad-multitenant.md` para el detalle de invariantes y pruebas.
