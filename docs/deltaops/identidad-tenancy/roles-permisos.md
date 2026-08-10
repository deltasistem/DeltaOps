# Roles y permisos — RBAC como datos (DGP-017)

Los roles son **configuración/datos** (`idn_roles`), sembrados por empresa. El
catálogo canónico se define en `identity/rbac.ts`.

## Roles canónicos

| Rol canónico | Descripción | Rol legacy (módulos) |
|--------------|-------------|----------------------|
| `SUPER_ADMIN` | Administración global de la plataforma SaaS. | `admin` |
| `TENANT_ADMIN` | Administración total dentro de su empresa. | `admin` |
| `SUPERVISOR` | Gestión operativa completa. | `operador` |
| `PLANIFICADOR` | Planificación y gestión de trabajo. | `operador` |
| `TECNICO` | Ejecución operativa asignada. | `operador` |
| `CONSULTA` | Solo lectura. | `lector` |

## Mapeo canónico ↔ legacy

Los módulos de negocio existentes consumen tres roles legacy
(`admin` / `operador` / `lector`). El rol canónico de la membresía se **mapea**
al rol legacy en el espejo de usuario, de modo que la autorización de cada
módulo (kernel `AuthorizationRuntime` / `PermissionResolver`) sigue funcionando
sin cambios. También se aceptan roles legacy históricos
(`admin`, `operador`, `lector`, `platform_admin`) para compatibilidad.

## Autorización de las nuevas superficies

- `requireIdentity`: exige sesión válida y empresa operativa.
- `requireTenantAdmin`: `TENANT_ADMIN` o `SUPER_ADMIN`.
- `requireSuperAdmin`: solo `SUPER_ADMIN`.
- `enforceEntitlements`: verifica que el módulo de la ruta esté contratado por
  la empresa (ver `entitlements.md`).

No hay bypass: la autorización se evalúa en el backend en cada petición.
