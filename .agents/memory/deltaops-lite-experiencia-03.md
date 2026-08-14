---
name: Experiencia operacional LITE-03
description: Lecciones de la implementación frontend de navegación por proceso, Home accionable, centro de costos y fixes de sesión/login.
---

# DELTAOPS LITE-03 — Experiencia operacional, navegación y UX/UI

## Redirección dura en 401 de clientes de contenido rompe el aterrizaje post-login
Los clientes HTTP de módulos hacían `window.location.assign(login)` ante cualquier 401; un 401 transitorio de la cookie recién emitida (consultas de contenido al montar la Home/AppShell) abortaba la navegación post-login.
**Regla:** las consultas de presentación degradan sin redirigir (opción `toleraNoAutorizado`, default = comportamiento previo; el 401 se sigue lanzando). La ÚNICA autoridad de redirección a /login es `useSesion`.

## Carrera setQueryData→setLocation: el dispatcher lee sesión vieja
`qc.setQueryData(sesión)` + `setLocation('/')` en el mismo tick: React Query notifica observadores en diferido, así que el dispatcher montado lee `sesion:null` (estado settled tras logout) y rebota a /login — solo falla en el SEGUNDO login del mismo contexto (el primero está `pending` y espera).
**Fix:** `SesionProvider` lee la sesión con `useSyncExternalStore` sobre `qc.getQueryCache()` (snapshot síncrono de `getQueryData`); `useQuery` se conserva para fetch/loading. Jamás confiar en que un observador vea un `setQueryData` del mismo tick.

## UI honesta con catálogos vacíos
Selector/filtro de centro de costos se OMITE si el catálogo real está vacío (nada de opciones ficticias); acciones aún no implementadas se muestran deshabilitadas con texto honesto, nunca simuladas.

## Harness E2E con inputs React controlados
Rellenar `.value` directo no dispara eventos React → formularios "vacíos" y falsos negativos. Exigir tipeo con eventos de teclado reales. Además, ediciones con HMR masivo mientras un tester navega pueden viciar la pestaña: reiniciar el dev server antes de veredictos finales.

## GAPs documentados (fase posterior)
Filtrado por centro de costos 100% cliente (read model sin filtro servidor; con paginación server-side filtraría solo la página cargada). Tenant demo sin centros de costos (GAP de datos).
