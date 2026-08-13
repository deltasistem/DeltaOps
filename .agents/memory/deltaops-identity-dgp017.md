---
name: Identity & Tenancy DGP-017
description: Lecciones de la fundación SaaS — contexto por sesión inmutable, superficie única de auth, credenciales solo por env, epoch de autorización.
---

# Enterprise Identity, Tenancy & SaaS Foundation (DGP-017)

- **El contexto de autorización debe salir SIEMPRE de la sesión, nunca de estado mutable compartido**: proyectar identidad a una fila legacy única por email fue un CRÍTICO — dos sesiones concurrentes de la misma identidad en tenants A/B se contaminaban. Solución: fila espejo inmutable por par (identidad, tenant) con su id fijado en la sesión + epoch autoritativo (`idn_identities.auth_epoch`) validado en middleware (obsoleto ⇒ 401 AUTH_STALE). Política deliberada: una sola sesión vigente por identidad.
- **"Superficie única de auth" es literal**: el orden de montaje en app.ts puede hacer que rutas legacy sombreen las nuevas (login devolvía la forma vieja en smoke real pese a tests de integración verdes). Los tests de router aislado NO detectan sombreado — exigir e2e por HTTP contra la app COMPLETA.
- **Caminos "soft"/permisivos de autorización son MAYOR**: un resolver que "no bloquea si no hay contexto Enterprise" es un bypass. Guard estricto (identidad + membresía activa + tenant operativo + epoch) antes de todos los routers de módulo; entitlements con rechazo backend, no solo ocultar en UI.
- **Cero credenciales literales incluye seeds legacy y docs de instalación**: el reviewer las encontró en un seed de fase antigua y en INSTALACION.md. Política: helper único de credenciales por env (producción exige la var o lanza; dev usa default DERIVADO del nombre de la var, no secreto). Login demo actual: contraseñas derivadas `dev-<var>-0001!` salvo env definida.
- Tokens de recovery/invitación: hasheados, un solo uso, expirables, ligados a tenant; respuesta pública neutra anti-enumeración.
- Notificaciones: NotificationPort/EmailNotificationPort centralizados con outbox idempotente y plantillas ES; proveedor Fake para tests; SMTP real solo por env con import perezoso de nodemailer (dependencia opcional).
- Branding por tenant solo vía tokens seguros del DS (HEX validado, sin CSS arbitrario); DELTA/DEMO conserva identidad oficial.
- e2e con estado persistente: si la identidad ya existe de corridas previas con otro hash, el beforeAll debe forzar la contraseña desde la misma fuente env que el seed.

## Directiva M365 Mail (post-DGP-017)
- Adaptador M365 (XOAUTH2 client_credentials, smtp.outlook.com:587 STARTTLS) tras EmailNotificationPort; selección NOTIFICATION_PROVIDER=fake|m365; en producción config m365 inválida ⇒ throw (jamás fallback silencioso a fake).
- Lección de revisión: endpoints de estado/configuración GLOBAL deben ir en la superficie /admin Enterprise (SUPER_ADMIN canónico), nunca tras el guard de platform-console que acepta el rol legacy "admin" (= TENANT_ADMIN proyectado).
- Pendiente consciente: /platform/logs y /platform/queues (consola técnica pre-DGP-017) exponen metadatos cross-tenant bajo admin legacy; endurecerlas requeriría directiva expresa.
- Permisos Entra mínimos: SMTP.SendAsApp + Application Access Policy; sin Graph de lectura. Smoke real pendiente de M365_TENANT_ID/CLIENT_ID/CLIENT_SECRET/MAIL_FROM.

## Migración a Microsoft Graph (proveedor de correo definitivo)
- SMTP OAuth quedó BLOCKED (Exchange rechaza XOAUTH2 con 535 pese a SMTP.SendAsApp consentido); la Dirección migró a Graph: M365GraphEmailProvider (client_credentials scope graph.microsoft.com/.default, POST /users/{GRAPH_SENDER}/sendMail, 202=aceptado) tras el mismo EmailNotificationPort. Smoke real PASS con Secrets GRAPH_*.
- NOTIFICATION_PROVIDER=fake|m365-graph; fake en producción ⇒ throw; SMTP/nodemailer eliminados por completo (código, dep, external de build, docs con nota Histórico).
- Lección: los e2e de contrato de proveedor deben ser robustos al entorno (comparar contra proveedorSolicitado(process.env)), no listas literales — cambiar NOTIFICATION_PROVIDER rompió la suite.
- Secrets GRAPH_* independientes de M365_* (legacy SMTP, ya sin uso). Pendiente recomendado del lado Microsoft: Exchange RBAC for Applications acotando Mail.Send al buzón GRAPH_SENDER (documentado, no ejecutable desde aquí).

## Cierre PLATFORM-CONSOLE-ACL (DGP-022.1)
- **Lección transversal (durable):** las **fronteras de plataforma** deben decidir con el **rol canónico de sesión** (`esSuperAdmin(ctx.rolCanonico)` sobre la membresía sellada), jamás con el espejo legacy `deltaops.users.rol` — ahí `admin` es ambiguo (SUPER_ADMIN y TENANT_ADMIN colisionan porque el RBAC canónico mapea `TENANT_ADMIN → 'admin'`). El "pendiente consciente" de `/platform/*` bajo `admin` legacy era Broken Access Control cross-tenant real. El legacy `admin` sigue siendo válido SOLO para permisos de módulo intra-tenant, nunca como frontera de plataforma.
- **Caveat de montaje:** `platformConsoleRouter` se monta ANTES de `requireIdentityForModules`, así que su guard debe correr `requireIdentity` él mismo (no asumir `res.locals.identity` preexistente por orden de montaje).
- Endpoints liveness `/platform/health|ready|info|metrics` son PÚBLICOS por diseño (sin datos de tenant), fuera del ACL de consola; `/platform/attachments/:id` va por firma HMAC.
- **Regresión obligatoria:** conservar la matriz HTTP directa endpoint×rol (SUPER_ADMIN permitido / resto 403 / anónimo 401) como cobertura permanente — el defecto original era de API directa, no de UI.
