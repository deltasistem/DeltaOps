# Correo — puertos y proveedores (DGP-017)

El envío de correo está desacoplado tras un **puerto** (`EmailNotificationPort`)
con dos proveedores.

## Proveedores

- **Fake** (`FakeEmailProvider`): acumula los envíos en memoria; **no** sale a
  la red. Es el proveedor por defecto en desarrollo y pruebas: permite
  inspeccionar los correos generados sin infraestructura.
- **Microsoft Graph** (`M365GraphEmailProvider`): entrega real vía Microsoft
  Graph API (OAuth 2.0 client_credentials + permiso de aplicación `Mail.Send`).
  Es el **único proveedor de producción**. Se configura **exclusivamente** por
  Secrets `GRAPH_*`. Ver
  [email-m365-graph.md](./email-m365-graph.md) para el detalle completo.

> **Histórico:** el proveedor SMTP (`SmtpEmailProvider`/nodemailer/
> `smtp.outlook.com`) fue **retirado**. Ya no existen variables `SMTP_*`.

## Selección del proveedor

`NOTIFICATION_PROVIDER=fake | m365-graph` (default `fake` en dev/test). El
proveedor de producción es Microsoft Graph; en producción con `m365-graph` y
config incompleta el arranque falla (fail fast). Nunca se configuran
credenciales en código o git. Detalle en
[email-m365-graph.md](./email-m365-graph.md).

## Plantillas

Las plantillas están en español (`PLANTILLAS_ES`) e interpolan tokens
`{{...}}`. Todo valor se **escapa** (sin HTML ni saltos de línea inyectables)
para evitar inyección de contenido. La marca se toma del branding de la empresa.

Ver `configuracion.md` para el resumen completo de variables de entorno.
