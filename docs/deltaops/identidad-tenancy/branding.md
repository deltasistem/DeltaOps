# Branding por empresa (DGP-017)

Cada empresa define su **marca** en `ten_tenants.branding` (jsonb). La marca se
usa en la interfaz y en las **plantillas de correo**.

## Tokens de branding

| Token | Descripción |
|-------|-------------|
| `nombre` | Nombre de la empresa (marca). |
| `nombreApp` | Nombre de la aplicación mostrado. |
| `logoUrl` | URL del logotipo. |
| `colorPrimario` | Color primario (hex). |
| `colorSecundario` | Color secundario (hex). |

## Endpoints

| Método | Ruta | Autorización |
|--------|------|--------------|
| `GET` | `/tenant/branding` | Autenticado (lo consume la UI). |
| `PATCH` | `/tenant/branding` | `TENANT_ADMIN`. |

## Seguridad

El `PATCH` acepta **solo tokens seguros** (validados por Zod). No se permite HTML
ni contenido arbitrario; entradas inválidas se rechazan con
`400 BRANDING_INVALID`. Los cambios quedan **auditados**.

> El branding oficial de la empresa DEMO (DELTA/DEMO) se conserva tal cual en el
> seed; ver `configuracion.md`.
