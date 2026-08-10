# Configuración y variables de entorno (DGP-017)

## Variables de entorno

### Base de datos
- `DATABASE_URL` — cadena de conexión PostgreSQL (ya usada por la plataforma).

### Correo SMTP (opcional; sin ellas se usa el proveedor Fake)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Ver `email.md` para el detalle.

### Seed del administrador de plataforma (`scripts/seed-deltaops.ts`)
- `DELTAOPS_ADMIN_PASSWORD` — **obligatoria en producción** (contraseña de
  arranque del admin de plataforma). En desarrollo hay un valor por defecto solo
  dentro del seed.

### Seed DEMO (`artifacts/api-server/src/seed/seed-delta-demo.ts`)
Contraseñas de los usuarios de prueba por rol. **Solo por entorno**; el seed usa
un valor por defecto de desarrollo únicamente si no están definidas. No figuran
en esta documentación.

- `DEMO_ADMIN_PASSWORD`
- `DEMO_SUPERVISOR_PASSWORD`
- `DEMO_PLANIFICADOR_PASSWORD`
- `DEMO_TECNICO_PASSWORD`
- `DEMO_CONSULTA_PASSWORD`

> Nunca se documentan ni versionan credenciales reales. Los defaults de
> desarrollo viven exclusivamente en el código de seed.

## Configuración por empresa

Cada empresa tiene configuración regional (`idioma`, `zona_horaria`, `moneda`),
preferencias (`configuracion` jsonb), branding (`branding` jsonb) y módulos
contratados (`modulos` jsonb). Ver `tenancy.md`, `branding.md`, `entitlements.md`.

## Seeds y migraciones

- Migración `0033_identity_tenancy.sql`: tablas de identidad/tenancy/roles/
  invitaciones/recuperación/correo + RLS. Idempotente.
- `pnpm --filter @workspace/scripts run seed:deltaops`: crea el admin de
  plataforma, la empresa principal `deltaops` y su identidad `SUPER_ADMIN`.
- `pnpm --filter @workspace/api-server run seed:demo`: siembra la empresa DEMO
  (branding DELTA/DEMO), roles del sistema y usuarios de prueba por rol.

## Compatibilidad

Los inicios de sesión históricos siguen funcionando: al autenticar una identidad
sin membresías Enterprise se aplica una **promoción** que preserva el rol legacy,
y el espejo de usuario mantiene intactas las rutas de los módulos de negocio.
