# Experiencia de Identidad, Tenancy y SaaS (DGP-017)

Este documento describe la experiencia de **acceso, identidad, empresas (tenants)
y administración SaaS** de DeltaOps construida en `artifacts/deltaops`. Toda la
superficie se apoya **exclusivamente** en el Design System (`@workspace/design-system`,
tokens `--do-*`, DGP-005): no se introduce ningún sistema visual nuevo ni
librerías de gráficas. El backend de identidad (`identity.*`) es la **autoridad
de seguridad**; el frontend ofrece según el contexto de la sesión pero nunca
sustituye la validación del servidor.

> **Sin credenciales.** Este documento no contiene usuarios ni contraseñas. Las
> credenciales de la empresa demo (DELTA/DEMO) se aprovisionan por _seed_ del
> backend y/o variables de entorno del entorno de despliegue; consulta la
> configuración del `api-server`, no este documento.

## Arquitectura del cliente de identidad

- **Cliente dedicado** en `src/lib/identidad/` (independiente del cliente
  generado legacy), para no romper el login legacy ni sus pruebas.
  - `api.ts` — `identidadFetch` con `IdentidadError{status, code, datos}`. **No
    redirige** ante 401/409: los devuelve como error para que la UI decida.
  - `endpoints.ts` — una función tipada por cada operación del contrato
    congelado `identity.openapi.json` (33 operaciones).
  - `tipos.ts` — tipos que reflejan el contrato (roles, módulos, sesión, etc.).
  - `rbac.ts` — RBAC **de presentación**: capacidades y módulos visibles.
  - `branding.tsx` — `BrandingProvider` con tokens seguros.
  - `sesion.tsx` — `SesionProvider` (React Query), cambio de empresa y cierre de
    sesión seguros.
  - `guardas-offline.ts` — invalidación de colas offline por cambio de contexto.
  - `AppShell.tsx` — cáscara empresarial autenticada.
  - `AuthLayout.tsx` — envoltorio de las pantallas públicas de autenticación.
- `SesionProvider` se monta dentro de `QueryClientProvider` en `src/App.tsx`.

## Acceso (login) de producción

Ruta `/login`. Sustituye al login legacy manteniendo compatibilidad (ninguna
prueba existente lo referenciaba). Incluye:

- Logo oficial, correo, contraseña con **mostrar/ocultar** (componente
  `PasswordInput` del DS), botón con **estado de carga**.
- **Errores diferenciados y accesibles** (región `aria-live="assertive"`):
  - `401` → credenciales inválidas.
  - `403 USER_DISABLED` → usuario deshabilitado.
  - `403 TENANT_NOT_OPERATIONAL` → empresa no operativa.
  - fallo de red → sin conexión.
- **Sesión expirada:** el AppShell redirige a `/login?expirada=1` y la pantalla
  muestra un aviso de expiración.
- Enlace **¿Olvidaste tu contraseña?** hacia `/recuperar`.
- **Selección de empresa (409 `SELECT_TENANT`):** si el backend responde 409 con
  `membresias`, el login muestra un paso para elegir empresa y reintenta el
  `login` con el `tenantId` seleccionado.

### Decisión: sin casilla "Recordar sesión"

La sesión se gestiona mediante **cookie httpOnly** emitida por el backend. El
frontend **no puede** prolongar ni controlar de forma segura esa persistencia,
por lo que se **omite intencionalmente** una casilla de "recordarme": evitar una
falsa sensación de control de sesión desde el cliente. La duración de la sesión
es responsabilidad del backend.

## Recuperación, restablecimiento e invitaciones

- **`/recuperar`** — solicitud de recuperación. Respuesta **neutra
  (anti-enumeración)**: exista o no la cuenta, el mensaje es idéntico. Sólo un
  fallo de red se comunica de forma distinta.
- **`/restablecer?token=&tenantId=`** — valida el enlace, exige nueva contraseña
  con **confirmación** y **requisitos visibles** (≥8 caracteres, al menos una
  letra y un número). En éxito redirige a `/login`. Un token inválido/expirado se
  comunica de forma accesible.
- **`/invitacion?token=&tenantId=`** — el invitado define **nombre** y
  **contraseña**; al aceptar, su cuenta queda activa y se le lleva a `/login`.

## AppShell empresarial

- Encabezado con **empresa/tenant actual, usuario y rol**.
- **Menú de perfil** (`Dropdown`): _Mi perfil_, _Cambiar contraseña_,
  _Configuración de empresa_/_Usuarios_ (si el rol administra), _Administración
  SaaS_ (si es SUPER_ADMIN) y _Cerrar sesión_.
- **Selector de empresa** visible sólo con **más de una membresía**; realiza un
  **switch-tenant seguro**.
- **Navegación por entitlements:** se muestran **únicamente los módulos
  habilitados** en `session.modulos`. Ocultar botones es una ayuda de UX; el
  backend rechaza igualmente cualquier módulo no contratado.

### Cambio de empresa y cierre de sesión seguros

- `cambiarEmpresa(tenantId)` llama a `switch-tenant`, **limpia toda la caché**
  de React Query (`queryClient.clear()`), siembra la nueva sesión y **purga las
  colas offline de otros tenants**. Ningún permiso ni cola del tenant anterior se
  reutiliza.
- `cerrarSesion()` invoca `logout` y **limpia todo el estado local**.

## Branding por tenant (sólo tokens seguros)

`BrandingProvider` aplica el branding del tenant **exclusivamente** mediante
tokens seguros del DS:

- **Colores:** sólo se aceptan valores **HEX de 6 dígitos** (`#RRGGBB`), que se
  escriben en `--do-primario`/`--do-secundario`. Cualquier valor no conforme
  (p. ej. `red`, `url(...)`, `javascript:...`) se **ignora** (degradación a la
  identidad oficial). Nunca se inyecta CSS arbitrario.
- **Logos/favicon:** sólo URLs **http(s)** absolutas.
- Al cambiar de tenant o desmontar, los tokens se **restauran** para no filtrar
  branding entre empresas.
- **DELTA/DEMO** conservan **exactamente** la identidad oficial: no se aplica
  ningún token de color/logo personalizado aunque el branding aporte valores.

## Administración de usuarios (`/administracion/usuarios`, TENANT_ADMIN)

- Listar, **buscar y filtrar** por estado.
- **Crear** directamente o **invitar** por correo, con **rol inicial**.
- **Editar** nombre y rol; **activar/desactivar**; **forzar recuperación**.
- **Auditoría** por usuario en modal.
- Pestaña de **invitaciones**: reenviar y revocar.
- Si el rol no administra, se muestra un **aviso honesto** en lugar de la
  superficie (el backend también rechazaría con 403).

## Configuración del tenant (`/administracion/configuracion`, TENANT_ADMIN)

- **Regional:** idioma, zona horaria (IANA) y moneda.
- **Branding:** editor controlado con **vista previa**; sólo valores seguros.
- **Módulos:** de **sólo lectura** para TENANT_ADMIN (la habilitación la
  gestiona el SUPER_ADMIN).
- **Notificaciones:** listado de correos con su estado.
- **Auditoría** del tenant.

## Administración global SaaS (`/administracion/saas`, SUPER_ADMIN)

- Listado y **alta** de empresas (tenants).
- Cambio de **estado**: `ACTIVO`, `SUSPENDIDO`, `CERRADO` (según el contrato
  congelado; el estado cerrado es `CERRADO`).
- **Módulos** habilitados por empresa.
- **Notificaciones** por empresa.

## Guardas offline conscientes de identidad

Las colas offline se conservan por `deltaops:<modulo>:cola:<tenant>`. Un cambio
de **usuario** o de **tenant** **invalida** (purga) las colas incompatibles del
contexto anterior, de forma **compatible** con los módulos existentes (no se
reescriben): se registra el contexto activo en `deltaops:identidad:contexto` y,
al detectar un cambio, se purga el almacenamiento offline previo. La clave de
contexto está protegida frente a la purga.

## Accesibilidad y responsividad

- Campos con `label` asociado; errores en regiones `aria-live`.
- `aria-current="page"` en la navegación activa; roles semánticos del AppShell
  (`header`/`nav`/`main`) provistos por el DS.
- Layouts fluidos con tokens de espaciado y `grid`/`flex` responsivos.

## Pruebas

Cobertura dedicada (0 pruebas omitidas), integrada al suite existente:

- Contrato del cliente contra `identity.openapi.json` (rutas, métodos y campos
  requeridos) y mapeo de errores `{error, code?}` incluido `SELECT_TENANT`.
- Login: éxito, errores diferenciados, sesión expirada y `SELECT_TENANT`.
- Recuperación neutra, restablecer (token válido/ inválido, requisitos) e
  invitación (aceptar / inválida).
- AppShell: identidad visible, entitlements, aplicación de branding seguro
  (incluye DEMO oficial y rechazo de valores no HEX) y cambio de empresa seguro
  (limpia caché y purga colas).
- RBAC de presentación y módulos visibles.
- Guardas offline por cambio de contexto.
- Administración de usuarios, configuración del tenant y SaaS (con avisos por
  rol insuficiente).

Verificación: `pnpm typecheck` (deltaops y raíz) sin errores; suite completa en
verde; `PORT=5000 BASE_PATH=/deltaops pnpm build` correcto.
