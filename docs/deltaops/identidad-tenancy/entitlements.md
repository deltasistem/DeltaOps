# Entitlements — módulos por empresa (DGP-017)

Cada empresa contrata un subconjunto de **módulos** (`ten_tenants.modulos`). El
backend **impone** que solo se acceda a los módulos contratados.

## Catálogo de módulos

`referencia`, `activos`, `ordenes`, `inventario`, `planes`, `abastecimiento`,
`preventivo`, `correctivo`, `analytics`.

## Enforcement en el backend

El middleware `enforceEntitlements` (montado antes de las rutas de módulo)
resuelve el módulo a partir de la URL (`RUTA_A_MODULO` / `moduloDeRuta`) y, si el
módulo **no** está en `ten_tenants.modulos` de la empresa activa, responde
`403` (módulo no contratado). Rutas sin módulo (auth, admin, roles) no se ven
afectadas.

> Compatibilidad: cuando **no** hay contexto de identidad Enterprise en la
> sesión (login legacy), el resolver es «suave» y no bloquea, preservando el
> comportamiento existente.

## Endpoints

| Método | Ruta | Autorización |
|--------|------|--------------|
| `GET` | `/tenant/modules` | Autenticado. |
| `PATCH` | `/tenant/modules` | `SUPER_ADMIN`. |
| `PATCH` | `/admin/tenants/{id}/modules` | `SUPER_ADMIN`. |

La lista se **normaliza** (se descartan módulos desconocidos) antes de guardar.
Los cambios quedan **auditados**. La sesión (`GET /auth/session`) expone los
`modulos` habilitados para que la UI se adapte.
