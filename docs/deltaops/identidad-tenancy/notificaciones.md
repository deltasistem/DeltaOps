# Notificaciones (DGP-017)

Plataforma **centralizada** de notificaciones por correo. Todo el envío pasa por
un **outbox** transaccional (`ntf_email_outbox`) con **idempotencia** y auditoría.

## Bandeja / outbox

Cada correo se registra con: `tipo`, `destinatario`, `asunto`, `estado`
(`PENDING` / `SENT` / `FAILED`), intentos, marcas de tiempo y una
`idempotency_key`. La clave de idempotencia evita **reenviar** duplicados: un
segundo `enqueue` con la misma `(tenant, idempotency_key)` devuelve el mismo
registro sin volver a enviar.

## Endpoints

| Método | Ruta | Autorización |
|--------|------|--------------|
| `GET` | `/notifications` | `TENANT_ADMIN` — buzón de la empresa. |
| `GET` | `/admin/tenants/{id}/notifications` | `SUPER_ADMIN` — buzón de cualquier empresa. |

## Tipos implementados (Etapa 1)

`bienvenida`, `invitacion`, `recuperacion`, `cambio-password`,
`cuenta-deshabilitada`, `cuenta-habilitada`, `seguridad`.

> Se dejan declarados (sin implementar) tipos para negocio futuro
> (`ot-asignada`, `ot-por-vencer`, `sla-riesgo`, …). Renderizarlos sin plantilla
> falla de forma explícita.

## Aislamiento

Los correos de una empresa **no** aparecen en el buzón de otra. `ntf_email_outbox`
tiene RLS por `app.tenant_id`.

Ver `email.md` (puertos y proveedores) y `branding.md` (marca en plantillas).
