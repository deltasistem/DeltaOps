# Correo — puertos y proveedores (DGP-017)

El envío de correo está desacoplado tras un **puerto** (`EmailNotificationPort`)
con dos proveedores.

## Proveedores

- **Fake** (`FakeEmailProvider`): acumula los envíos en memoria; **no** sale a
  la red. Es el proveedor por defecto en desarrollo y pruebas: permite
  inspeccionar los correos generados sin infraestructura.
- **SMTP** (`SmtpEmailProvider`): entrega real. Carga `nodemailer` de forma
  **perezosa** (dependencia opcional; instálela solo en despliegues con SMTP).
  Se configura **exclusivamente** por variables de entorno (ver abajo).

## Selección del proveedor

Si están definidas las variables SMTP, se usa el proveedor SMTP; en caso
contrario, el proveedor Fake. Nunca se configuran credenciales en código o git.

## Variables de entorno (SMTP)

| Variable | Descripción |
|----------|-------------|
| `SMTP_HOST` | Host del servidor SMTP. |
| `SMTP_PORT` | Puerto (p. ej. 587). |
| `SMTP_SECURE` | `true` para TLS implícito. |
| `SMTP_USER` | Usuario de autenticación. |
| `SMTP_PASS` | Contraseña de autenticación. |
| `SMTP_FROM` | Remitente por defecto. |

## Plantillas

Las plantillas están en español (`PLANTILLAS_ES`) e interpolan tokens
`{{...}}`. Todo valor se **escapa** (sin HTML ni saltos de línea inyectables)
para evitar inyección de contenido. La marca se toma del branding de la empresa.

Ver `configuracion.md` para el resumen completo de variables de entorno.
