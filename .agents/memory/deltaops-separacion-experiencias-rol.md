---
name: Separación de experiencias por rol (frontend deltaops)
description: Lecciones del diagnóstico que separó la consola global SUPER_ADMIN de la experiencia empresarial por rol.
---

# Separación de experiencias por rol

- La consola técnica pre-DGP-017 (`pages/console.tsx`, cliente legacy `/auth/me`) era el render fijo de `/`; el AppShell empresarial DGP-017 nunca estuvo cableado a la raíz. Regla: la landing debe decidirse SIEMPRE por el rol canónico de `/auth/session` vía dispatcher (`inicio.tsx`), nunca por superficies heredadas.
- **Why:** un TENANT_ADMIN aterrizaba en Uptime/Readiness/Info de sistema — la autorización backend estaba bien; el defecto era 100 % de routing/composición frontend.
- Guards de presentación deben usar `<Redirect>` real de wouter (URL final cambia, respeta base path), no `useEffect+setLocation` que deja la URL prohibida en la barra. El backend sigue siendo la única autoridad (403).
- **Trampa de TanStack Query:** `qc.clear()` + `setQueryData` en el mismo tick rompe la suscripción del observador — la query de sesión queda stale (re-login mostraba la identidad anterior). Regla: sembrar la sesión primero y purgar el resto por predicado (`purgarCacheExceptoSesion`); jamás `clear()` sobre la query de sesión. Aplica a login/logout/cambiarEmpresa.
- Logout debe navegar explícitamente a `/login` además de limpiar caches.
- `vite.config.ts` de los artefactos exige `PORT` por diseño (workflow lo inyecta); el build CI/manual es `PORT=<n> BASE_PATH=/<slug> pnpm --filter ... build` — aclararlo a revisores para evitar falsos FAIL de build.
- Rutas solo-SUPER_ADMIN centralizadas en `rbac.ts` (`RUTAS_SOLO_SUPER_ADMIN`); landing por rol en `landingOperacional(sesion)` — extender ahí, sin navegación paralela.
